import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import * as credentials from "./credential-store.js";
import { MODELS, type ModelDef } from "../model-catalog.js";

/** 缓存文件路径：按天有效 */
const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");
const CACHE_FILE = join(DATA_DIR, "models-cache.json");

const FETCH_TIMEOUT_MS = 10_000;

/**
 * 上游 /v3/config 对 User-Agent 敏感：UA 必须是 WorkBuddy 客户端标识，
 * 否则上游走「精简分支」只返回 productFeatures、不含 models（实测 CodeBuddy/*
 * 与缺省 UA 都会触发此问题）。UA 版本号取自 Reqable 抓包确认的真实客户端。
 */
const UPSTREAM_USER_AGENT =
  "WorkBuddy/5.2.3 WorkBuddy/5.2.3 CLI/2.106.4";

/** 内存缓存：当天有效 */
let memCache: { date: string; models: ModelDef[] } | null = null;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** vendor 代码 → 可读厂商名（对齐 model-catalog 注释：e=智谱, f=第三方, j=腾讯混元） */
const VENDOR_MAP: Record<string, string> = {
  e: "zhipu",
  j: "hunyuan",
  tencent: "tencent",
  f: "third-party",
};

function mapVendor(vendor?: string): string {
  if (!vendor) return "codebuddy";
  return VENDOR_MAP[vendor] ?? vendor;
}

// ========== 认证 Header ==========

/** 从可用凭证构造上游认证 Header（与 proxy.ts 一致，但不推进 round-robin） */
function buildAuthHeaders(
  cred: ReturnType<typeof credentials.getById>
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!cred) return headers;
  if (cred.type === "api-key" && cred.key) {
    headers["Authorization"] = `Bearer ${cred.key}`;
  } else if (cred.type === "local-file" && cred.accessToken) {
    headers["Authorization"] = `Bearer ${cred.accessToken}`;
    if (cred.uid) headers["X-User-Id"] = cred.uid;
    headers["X-Domain"] = config.codebuddy.domain;
  }
  return headers;
}

/** 取第一个可用凭证（不推进 rrIndex，避免影响 AI 调用轮询） */
function pickUsableCredential() {
  const usable = credentials
    .getAll()
    .find(
      (c) =>
        (c.type === "api-key" && !!c.key) ||
        (c.type === "local-file" && !!c.accessToken)
    );
  return usable;
}

// ========== 上游拉取 ==========

/**
 * 调用上游 GET /v3/config 获取模型列表。
 * 返回 ModelDef[] 或 null（失败/无凭证/解析失败）。
 */
export async function fetchUpstreamModels(): Promise<ModelDef[] | null> {
  const cred = pickUsableCredential();
  if (!cred) {
    logger.warn("无可用凭证，跳过模型列表动态拉取");
    return null;
  }

  const baseUrl = config.codebuddy.baseUrl;
  const url = new URL("/v3/config", baseUrl);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  try {
    logger.info({ credentialName: cred.name }, "拉取上游模型列表 /v3/config");
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": UPSTREAM_USER_AGENT,
        "X-Product": "SaaS",
        ...buildAuthHeaders(cred),
      },
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "/v3/config 返回非 200");
      return null;
    }
    const raw = (await res.json()) as unknown;
    // 校验业务码（响应包 { code, msg, data }）
    if (raw && typeof raw === "object" && "code" in raw) {
      const code = (raw as Record<string, unknown>).code;
      if (code !== 0) {
        logger.warn({ code }, "/v3/config 业务码非 0");
        return null;
      }
    }
    const parsed = parseModelsFromConfig(raw);
    if (!parsed) {
      // 打出顶层 keys 便于排障
      const keys =
        raw && typeof raw === "object"
          ? Object.keys(raw as Record<string, unknown>)
          : [];
      logger.warn({ keys }, "/v3/config 未解析出模型列表，回退静态");
      return null;
    }
    logger.info({ count: parsed.length }, "上游模型列表拉取成功");
    return parsed;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn({ err: msg }, "/v3/config 拉取失败");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 防御式解析 /v3/config 响应，按优先级尝试已知路径。
 * 任一路径返回「含 id 的对象数组」即视为模型列表。
 */
export function parseModelsFromConfig(raw: unknown): ModelDef[] | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;

  const candidates: unknown[] = [
    root.modelList,
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>).modelList
      : undefined,
    root.models,
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>).models
      : undefined,
    root.model_config,
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>).model_config
      : undefined,
  ];

  for (const c of candidates) {
    const arr = extractModelArray(c);
    if (arr) return arr;
  }
  return null;
}

/** 从未知值中提取「含 id 字符串的对象数组」 */
function extractModelArray(value: unknown): ModelDef[] | null {
  if (!Array.isArray(value)) {
    // model_config 可能是 { list: [...] } 形式
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      if (Array.isArray(obj.list)) return extractModelArray(obj.list);
      if (Array.isArray(obj.models)) return extractModelArray(obj.models);
    }
    return null;
  }
  const models: ModelDef[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : undefined;
    if (!id) continue;

    const num = (v: unknown): number | undefined => {
      if (typeof v === "number" && !isNaN(v)) return v;
      if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)))
        return Number(v);
      return undefined;
    };
    const bool = (v: unknown): boolean | undefined => {
      if (typeof v === "boolean") return v;
      if (v === 1 || v === "1" || v === "true") return true;
      if (v === 0 || v === "0" || v === "false") return false;
      return undefined;
    };

    models.push({
      id,
      name: typeof o.name === "string" ? o.name : id,
      owned_by: mapVendor(
        typeof o.vendor === "string" ? o.vendor : undefined
      ),
      credits: typeof o.credits === "string" ? o.credits : "",
      descriptionZh:
        typeof o.descriptionZh === "string" ? o.descriptionZh : undefined,
      maxAllowedSize: num(o.maxAllowedSize),
      maxInputTokens: num(o.maxInputTokens),
      maxOutputTokens: num(o.maxOutputTokens),
      supportsImages: bool(o.supportsImages),
      supportsToolCall: bool(o.supportsToolCall),
      supportsReasoning: bool(o.supportsReasoning),
      isDefault: bool(o.isDefault),
      tags: Array.isArray(o.tags)
        ? o.tags.filter((t) => typeof t === "string")
        : undefined,
    });
  }
  return models.length > 0 ? models : null;
}

// ========== 倍率合并 ==========

/** 用静态 MODELS 兜底动态模型中缺失的字段（上游优先，静态仅补缺） */
function mergeCredits(dynamic: ModelDef[]): ModelDef[] {
  const staticMap = new Map(MODELS.map((m) => [m.id, m]));
  return dynamic.map((m) => {
    const s = staticMap.get(m.id);
    if (!s) return m;
    // 上游（动态）字段优先；静态仅在前者缺失时兜底
    return {
      id: m.id,
      name: m.name || s.name,
      owned_by: m.owned_by || s.owned_by,
      credits: m.credits || s.credits,
      descriptionZh: m.descriptionZh ?? s.descriptionZh,
      maxAllowedSize: m.maxAllowedSize ?? s.maxAllowedSize,
      maxInputTokens: m.maxInputTokens ?? s.maxInputTokens,
      maxOutputTokens: m.maxOutputTokens ?? s.maxOutputTokens,
      supportsImages: m.supportsImages ?? s.supportsImages,
      supportsToolCall: m.supportsToolCall ?? s.supportsToolCall,
      supportsReasoning: m.supportsReasoning ?? s.supportsReasoning,
      isDefault: m.isDefault ?? s.isDefault,
      tags: m.tags ?? s.tags,
    };
  });
}

// ========== 文件缓存 ==========

interface ModelCacheFile {
  date: string;
  models: ModelDef[];
}

function loadFileCache(): ModelDef[] | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const raw = readFileSync(CACHE_FILE, "utf-8");
    const cache = JSON.parse(raw) as ModelCacheFile;
    if (cache.date === todayStr() && Array.isArray(cache.models)) {
      logger.info({ count: cache.models.length }, "模型缓存命中（文件）");
      return cache.models;
    }
  } catch (e) {
    logger.warn({ err: e }, "模型缓存文件读取失败");
  }
  return null;
}

function saveFileCache(models: ModelDef[]): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const cache: ModelCacheFile = { date: todayStr(), models };
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  } catch (e) {
    logger.warn({ err: e }, "模型缓存写入失败");
  }
}

// ========== 主入口 ==========

/**
 * 获取模型列表：内存缓存 → 文件缓存（当天）→ 上游拉取 → 静态兜底。
 */
export function getModels(): ModelDef[] {
  const today = todayStr();

  // 1. 内存缓存
  if (memCache && memCache.date === today) {
    return memCache.models;
  }

  // 2. 文件缓存（同步读取，立即返回，避免阻塞请求）
  const fileModels = loadFileCache();
  if (fileModels) {
    memCache = { date: today, models: fileModels };
    return fileModels;
  }

  // 3. 内存/文件都未命中：同步返回静态兜底，异步触发拉取刷新
  logger.info("模型缓存未命中，先返回静态列表并触发后台拉取");
  refreshModelsInBackground();
  return mergeCredits(MODELS);
}

/** 后台异步拉取并刷新缓存（不阻塞请求） */
export function refreshModelsInBackground(): void {
  const today = todayStr();
  fetchUpstreamModels()
    .then((models) => {
      if (models && models.length > 0) {
        const merged = mergeCredits(models);
        memCache = { date: today, models: merged };
        saveFileCache(merged);
        logger.info({ count: merged.length }, "模型列表已刷新并缓存");
      } else {
        // 拉取失败：用静态兜底写入缓存，避免频繁重试
        const fallback = mergeCredits(MODELS);
        memCache = { date: today, models: fallback };
        saveFileCache(fallback);
      }
    })
    .catch((e) => {
      logger.error({ err: e }, "后台刷新模型列表异常");
    });
}
