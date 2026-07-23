import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { logger } from "../utils/logger.js";
import type { UsageEntry, UsageStatsSnapshot } from "../types/stats.js";

/** 数据文件路径，与 credential-store 共用 data 目录 */
const DATA_DIR =
  process.env.DATA_DIR || join(process.cwd(), "data");
const STATS_FILE = join(DATA_DIR, "usage-stats.json");

/** 持久化间隔（ms） */
const PERSIST_INTERVAL = 30_000;

/** 内存统计 Map：key = `${credentialId}:${model}` */
const stats = new Map<string, UsageEntry>();

/** 上次更新时间戳 */
let updatedAt = new Date().toISOString();

/** 定时器句柄 */
let persistTimer: ReturnType<typeof setInterval> | null = null;

// ========== Token 估算 ==========

/**
 * 启发式算法估算文本 token 数
 * - 中文字符（含 CJK 统一表意文字）：≈ 1 token / 1.8 字符
 * - 其他字符：≈ 1 token / 4 字符
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let chinese = 0;
  let other = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) {
      chinese++;
    } else {
      other++;
    }
  }
  return Math.max(1, Math.ceil(chinese / 1.8 + other / 4));
}

// ========== 持久化 ==========

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function writeToFile(): void {
  try {
    ensureDataDir();
    const entries: Record<string, UsageEntry> = {};
    for (const [key, entry] of stats.entries()) {
      entries[key] = entry;
    }
    const snapshot: UsageStatsSnapshot = {
      entries,
      updatedAt,
    };
    writeFileSync(STATS_FILE, JSON.stringify(snapshot, null, 2), "utf-8");
  } catch (err) {
    logger.error({ err }, "写入使用统计文件失败");
  }
}

// ========== 加载 ==========

export function loadStats(): void {
  try {
    if (!existsSync(STATS_FILE)) {
      logger.info("使用统计文件不存在，从零开始");
      return;
    }
    const raw = readFileSync(STATS_FILE, "utf-8");
    const snapshot: UsageStatsSnapshot = JSON.parse(raw);
    for (const [key, entry] of Object.entries(snapshot.entries)) {
      stats.set(key, entry);
    }
    updatedAt = snapshot.updatedAt || new Date().toISOString();
    logger.info(
      { count: stats.size, updatedAt },
      "使用统计已从文件恢复"
    );
  } catch (err) {
    logger.warn({ err }, "使用统计文件解析失败，从零开始");
  }
}

// ========== 定时器 ==========

export function startPersistTimer(): void {
  if (persistTimer) return;
  persistTimer = setInterval(writeToFile, PERSIST_INTERVAL);
  logger.info({ interval: PERSIST_INTERVAL }, "使用统计定时持久化已启动");
}

export function stopPersistTimer(): void {
  if (persistTimer) {
    clearInterval(persistTimer);
    persistTimer = null;
    // 退出前最后一次写入
    writeToFile();
  }
}

// ========== 记录 ==========

/**
 * 记录一次成功的 AI 调用统计
 * @param credentialId - 凭证 ID
 * @param credentialName - 凭证名称（冗余存储，防止凭证被删除后无法显示）
 * @param model - 使用的模型
 * @param promptTokens - 估算的 prompt token
 * @param completionTokens - 估算的 completion token
 */
export function recordUsage(
  credentialId: string,
  credentialName: string,
  model: string,
  promptTokens: number,
  completionTokens: number
): void {
  const key = `${credentialId}:${model}`;
  const existing = stats.get(key);

  if (existing) {
    existing.callCount += 1;
    existing.promptTokens += promptTokens;
    existing.completionTokens += completionTokens;
    existing.credentialName = credentialName; // 保持名称最新
  } else {
    stats.set(key, {
      credentialId,
      credentialName,
      model,
      callCount: 1,
      promptTokens,
      completionTokens,
    });
  }

  updatedAt = new Date().toISOString();
}

// ========== 查询 ==========

/** 获取所有统计条目（转为数组） */
export function getStats(): UsageEntry[] {
  return Array.from(stats.values());
}
