import { request } from "node:http";
import { request as httpsRequest } from "node:https";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import type { Credential } from "../types/credential.js";
import type { CodeBuddyChatRequest } from "../types/codebuddy.js";

/** 向上游 CodeBuddy API 发送流式请求，通过 callback 逐行返回 SSE data */
export function streamRequest(
  credential: Credential,
  body: CodeBuddyChatRequest,
  onData: (line: string) => void,
  onEnd: () => void,
  onError: (err: Error) => void,
  onAuthError?: () => void
): void {
  const baseUrl = config.codebuddy.baseUrl;
  const url = new URL("/v2/chat/completions", baseUrl);
  const isHttps = url.protocol === "https:";

  const reqBody = JSON.stringify(body);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };

  // 注入认证 Header
  if (credential.type === "api-key" && credential.key) {
    headers["Authorization"] = `Bearer ${credential.key}`;
  } else if (credential.type === "local-file" && credential.accessToken) {
    headers["Authorization"] = `Bearer ${credential.accessToken}`;
    if (credential.uid) {
      headers["X-User-Id"] = credential.uid;
    }
    headers["X-Domain"] = config.codebuddy.domain;
  }

  logger.info(
    { model: body.model, credentialType: credential.type },
    "向上游发送流式请求"
  );

  const req = (isHttps ? httpsRequest : request)(
    {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: "POST",
      headers,
    },
    (res) => {
      // 检测认证失败（401/403），触发 onAuthError 回调
      if (onAuthError && (res.statusCode === 401 || res.statusCode === 403)) {
        onAuthError();
        onError(new Error(`上游认证失败 (${res.statusCode})`));
        return;
      }

      let buffer = "";
      let ended = false;

      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf-8");
        // 按行分割，处理完整的 SSE data 行
        const lines = buffer.split("\n");
        // 最后一个可能不完整，保留
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const dataStr = trimmed.slice(6);
            if (dataStr === "[DONE]") {
              ended = true;
              onEnd();
              return;
            }
            onData(dataStr);
          }
        }
      });

      res.on("end", () => {
        if (ended) return; // 避免 [DONE] 触发后重复调用 onEnd
        // 处理剩余 buffer
        const line = buffer.trim();
        if (line.startsWith("data: ") && line.slice(6) !== "[DONE]") {
          onData(line.slice(6));
        }
        onEnd();
      });

      res.on("error", onError);
    }
  );

  req.on("error", onError);
  req.write(reqBody);
  req.end();
}

/** 向上游查询凭证的积分额度，返回原始响应 JSON */
export function queryQuota(credential: Credential): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const baseUrl = config.codebuddy.baseUrl;
    // 真实额度端点（从 Reqable 抓包确认）
    const url = new URL("/v2/billing/meter/get-user-resource", baseUrl);
    const isHttps = url.protocol === "https:";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // 注入认证 Header
    if (credential.type === "api-key" && credential.key) {
      headers["Authorization"] = `Bearer ${credential.key}`;
    } else if (credential.type === "local-file" && credential.accessToken) {
      headers["Authorization"] = `Bearer ${credential.accessToken}`;
      if (credential.uid) {
        headers["X-User-Id"] = credential.uid;
      }
      headers["X-Domain"] = config.codebuddy.domain;
    }

    // 上游真实请求体（从 Reqable 抓包确认）
    const now = new Date();
    const reqBody = JSON.stringify({
      PageNumber: 1,
      PageSize: 100,
      ProductCode: "p_tcaca",
      Status: [0, 3],
      PackageStartTimeRangeBegin: "2024-12-01 21:25:00",
      PackageStartTimeRangeEnd: formatDateTime(now),
    });

    logger.info({ credentialType: credential.type }, "查询凭证额度");

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
          try {
            const data = JSON.parse(body);
            resolve(data);
          } catch {
            reject(new Error(`额度查询响应解析失败: ${body.slice(0, 200)}`));
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

/** Token 刷新响应结构 */
interface RefreshResponse {
  code: number;
  msg: string;
  data: {
    accessToken: string;
    expiresIn: number;
    refreshToken: string;
    refreshExpiresIn: number;
    tokenType: string;
    domain: string;
  };
}

/** 用 refreshToken 向上游换取新的 accessToken */
export function refreshAccessToken(
  credential: Credential
): Promise<{ accessToken: string; refreshToken: string }> {
  return new Promise((resolve, reject) => {
    // 必须有 accessToken（作为 Authorization）和 refreshToken（作为 X-Refresh-Token）
    if (!credential.accessToken) {
      return reject(new Error("缺少 accessToken，无法刷新"));
    }
    // 如果本地文件中没有 refreshToken，尝试用 accessToken 本身续期
    const refreshTokenVal = credential.refreshToken || credential.accessToken;

    const baseUrl = config.codebuddy.baseUrl;
    const url = new URL("/v2/plugin/auth/token/refresh", baseUrl);
    const isHttps = url.protocol === "https:";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${credential.accessToken}`,
      "X-Refresh-Token": refreshTokenVal,
      "X-Auth-Refresh-Source": "plugin",
      "X-Product": "SaaS",
      "X-Domain": config.codebuddy.domain,
    };
    if (credential.uid) {
      headers["X-User-Id"] = credential.uid;
    }

    logger.info("尝试刷新 accessToken");

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
        res.on("data", (chunk: Buffer) => (body += chunk.toString("utf-8")));
        res.on("end", () => {
          try {
            const data: RefreshResponse = JSON.parse(body);
            if (data.code !== 0 || !data.data?.accessToken) {
              return reject(
                new Error(`Token 刷新失败: ${data.msg || body.slice(0, 200)}`)
              );
            }
            logger.info("accessToken 刷新成功");
            resolve({
              accessToken: data.data.accessToken,
              refreshToken: data.data.refreshToken,
            });
          } catch (err) {
            reject(new Error(`Token 刷新响应解析失败: ${body.slice(0, 200)}`));
          }
        });
        res.on("error", reject);
      }
    );

    req.on("error", reject);
    req.write("{}");
    req.end();
  });
}

/** 格式化 Date 为 "YYYY-MM-DD HH:MM:SS" 格式（上游要求的时间格式） */
function formatDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
