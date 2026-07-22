import { request } from "node:http";
import { request as httpsRequest } from "node:https";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import type { Credential } from "../types/credential.js";
import type {
  CheckinResult,
  CheckinSource,
  CheckinStatusResponse,
  DailyCheckinResponse,
} from "../types/checkin.js";
import { refreshAccessToken } from "./proxy.js";
import * as store from "./credential-store.js";
import { appendCheckinHistory } from "./checkin-history-store.js";

const STATUS_PATH = "/v2/billing/meter/checkin-activity-status";
const CHECKIN_PATH = "/v2/billing/meter/daily-checkin";

function buildHeaders(credential: Credential): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (credential.type === "api-key" && credential.key) {
    headers["Authorization"] = `Bearer ${credential.key}`;
  } else if (credential.type === "local-file" && credential.accessToken) {
    headers["Authorization"] = `Bearer ${credential.accessToken}`;
    if (credential.uid) {
      headers["X-User-Id"] = credential.uid;
    }
    headers["X-Domain"] = config.codebuddy.domain;
  }

  return headers;
}

function hasAuth(credential: Credential): boolean {
  if (credential.type === "api-key") return !!credential.key;
  return !!credential.accessToken;
}

/** POST 空 JSON body，返回 HTTP 状态码与解析后的 JSON */
function postEmptyJson(
  path: string,
  credential: Credential
): Promise<{ statusCode: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const baseUrl = config.codebuddy.baseUrl;
    const url = new URL(path, baseUrl);
    const isHttps = url.protocol === "https:";
    const headers = buildHeaders(credential);
    const reqBody = "{}";

    const req = (isHttps ? httpsRequest : request)(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: "POST",
        headers,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf-8");
        });
        res.on("end", () => {
          const statusCode = res.statusCode ?? 0;
          try {
            const data = body ? JSON.parse(body) : {};
            resolve({ statusCode, data });
          } catch {
            reject(
              new Error(`签到接口响应解析失败 (${path}): ${body.slice(0, 200)}`)
            );
          }
        });
        res.on("error", reject);
      }
    );

    req.on("error", reject);
    req.write(reqBody);
    req.end();
  });
}

export async function getCheckinStatus(
  credential: Credential
): Promise<CheckinStatusResponse> {
  const { statusCode, data } = await postEmptyJson(STATUS_PATH, credential);
  if (statusCode === 401 || statusCode === 403) {
    const err = new Error(`签到状态查询认证失败 (${statusCode})`);
    (err as Error & { authError?: boolean }).authError = true;
    throw err;
  }
  const resp = data as CheckinStatusResponse;
  if (resp.code !== 0 || !resp.data) {
    throw new Error(`签到状态查询失败: ${resp.msg || JSON.stringify(data)}`);
  }
  return resp;
}

export async function doDailyCheckin(
  credential: Credential
): Promise<DailyCheckinResponse> {
  const { statusCode, data } = await postEmptyJson(CHECKIN_PATH, credential);
  if (statusCode === 401 || statusCode === 403) {
    const err = new Error(`签到认证失败 (${statusCode})`);
    (err as Error & { authError?: boolean }).authError = true;
    throw err;
  }
  const resp = data as DailyCheckinResponse;
  if (resp.code !== 0 || !resp.data) {
    throw new Error(`签到失败: ${resp.msg || JSON.stringify(data)}`);
  }
  return resp;
}

async function tryRefresh(credential: Credential): Promise<Credential> {
  if (credential.type !== "local-file" || !credential.accessToken) {
    throw new Error("当前凭证类型不支持 token 刷新，请重新登录桌面端");
  }
  logger.warn({ credentialId: credential.id }, "签到认证失败，尝试刷新 token");
  const tokens = await refreshAccessToken(credential);
  store.updateCredentialToken(
    credential.id,
    tokens.accessToken,
    tokens.refreshToken
  );
  return {
    ...credential,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}

function isAuthError(err: unknown): boolean {
  return !!(err as { authError?: boolean })?.authError;
}

/** 完整签到流程核心：查状态 → 未签则签 → 再校验；401 时刷新重试一次。
 *  仅负责执行与返回结果，不写历史；历史由外层 runCheckin 统一记录。 */
async function runCheckinCore(
  credential: Credential,
  retried = false
): Promise<CheckinResult> {
  const executedAt = new Date().toISOString();

  if (!hasAuth(credential)) {
    return {
      success: false,
      skipped: true,
      reason: "凭证缺少 accessToken/key",
      executedAt,
      credentialId: credential.id,
      credentialName: credential.name,
    };
  }

  try {
    const status = await getCheckinStatus(credential);
    const data = status.data;

    if (!data.active) {
      logger.info({ credentialId: credential.id }, "签到活动未开启，跳过");
      return {
        success: true,
        skipped: true,
        reason: "活动未开启",
        todayCheckedIn: data.today_checked_in,
        streakDays: data.streak_days,
        totalCredits: data.total_credits,
        executedAt,
        credentialId: credential.id,
        credentialName: credential.name,
      };
    }

    if (data.today_checked_in) {
      logger.info(
        {
          credentialId: credential.id,
          streakDays: data.streak_days,
          totalCredits: data.total_credits,
        },
        "今日已签到，跳过"
      );
      return {
        success: true,
        skipped: true,
        reason: "今日已签到",
        todayCheckedIn: true,
        streakDays: data.streak_days,
        totalCredits: data.total_credits,
        executedAt,
        credentialId: credential.id,
        credentialName: credential.name,
      };
    }

    logger.info({ credentialId: credential.id }, "开始执行每日签到");
    const checkin = await doDailyCheckin(credential);

    let after: CheckinStatusResponse | null = null;
    try {
      after = await getCheckinStatus(credential);
    } catch (verifyErr) {
      logger.warn({ err: verifyErr }, "签到后状态复核失败，仍以签到响应为准");
    }

    const result: CheckinResult = {
      success: true,
      skipped: false,
      reason: "签到成功",
      credit: checkin.data.credit,
      streakDays: after?.data.streak_days ?? checkin.data.streak_days,
      totalCredits: after?.data.total_credits,
      todayCheckedIn: after?.data.today_checked_in ?? true,
      executedAt,
      credentialId: credential.id,
      credentialName: credential.name,
    };

    logger.info(
      {
        credit: result.credit,
        streakDays: result.streakDays,
        totalCredits: result.totalCredits,
      },
      "每日签到成功"
    );
    return result;
  } catch (err) {
    if (!retried && isAuthError(err)) {
      try {
        const refreshed = await tryRefresh(credential);
        return runCheckinCore(refreshed, true);
      } catch (refreshErr) {
        logger.error({ err: refreshErr }, "签到 token 刷新失败");
        return {
          success: false,
          skipped: false,
          reason: `token 刷新失败: ${(refreshErr as Error).message}`,
          executedAt,
          credentialId: credential.id,
          credentialName: credential.name,
        };
      }
    }

    logger.error({ err }, "签到流程失败");
    return {
      success: false,
      skipped: false,
      reason: (err as Error).message,
      executedAt,
      credentialId: credential.id,
      credentialName: credential.name,
    };
  }
}

/** 完整签到流程：执行 core 并将最终结果写入历史（单点记录，递归重试不重复写）。 */
export async function runCheckin(
  credential: Credential,
  source: CheckinSource = "manual"
): Promise<CheckinResult> {
  const result = await runCheckinCore(credential);
  appendCheckinHistory(result, source);
  return result;
}

/** 使用当前活跃凭证执行签到 */
export async function runCheckinWithActive(
  source: CheckinSource = "manual"
): Promise<CheckinResult> {
  const credential = store.getActive();
  if (!credential) {
    const result: CheckinResult = {
      success: false,
      skipped: true,
      reason: "无活跃凭证",
      executedAt: new Date().toISOString(),
    };
    appendCheckinHistory(result, source);
    return result;
  }
  return runCheckin(credential, source);
}
