import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { logger } from "../utils/logger.js";
import { getCheckinHistoryStorePath, generateId } from "../utils/env.js";
import type {
  CheckinHistoryRecord,
  CheckinHistoryStore,
  CheckinResult,
  CheckinSource,
} from "../types/checkin.js";

/** 保留最近 N 条，超出丢弃最旧 */
const MAX_HISTORY = 500;

let store: CheckinHistoryStore = { records: [] };

/** 从 JSON 文件加载签到历史 */
export function loadCheckinHistoryStore(): void {
  const filePath = getCheckinHistoryStorePath();
  if (existsSync(filePath)) {
    try {
      const raw = readFileSync(filePath, "utf-8");
      store = JSON.parse(raw) as CheckinHistoryStore;
      if (!Array.isArray(store.records)) {
        store = { records: [] };
      }
      logger.info(`从 ${filePath} 加载了 ${store.records.length} 条签到历史`);
    } catch (err) {
      logger.warn({ err }, "签到历史文件解析失败，使用空存储");
      store = { records: [] };
    }
  }
}

function persist(): void {
  const filePath = getCheckinHistoryStorePath();
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
}

/**
 * 追加一条签到历史（最新在前）。
 * 写盘失败只记日志，不抛出，避免拖垮签到主流程。
 */
export function appendCheckinHistory(
  result: CheckinResult,
  source: CheckinSource = "manual"
): CheckinHistoryRecord | null {
  try {
    const record: CheckinHistoryRecord = {
      id: generateId(),
      source,
      success: result.success,
      skipped: result.skipped,
      reason: result.reason,
      credit: result.credit,
      streakDays: result.streakDays,
      totalCredits: result.totalCredits,
      todayCheckedIn: result.todayCheckedIn,
      executedAt: result.executedAt,
      credentialId: result.credentialId,
      credentialName: result.credentialName,
    };
    store.records.unshift(record);
    if (store.records.length > MAX_HISTORY) {
      store.records.length = MAX_HISTORY;
    }
    persist();
    return record;
  } catch (err) {
    logger.error({ err }, "写入签到历史失败");
    return null;
  }
}

/** 返回历史列表浅拷贝（已按最新在前） */
export function listCheckinHistory(): CheckinHistoryRecord[] {
  return store.records.slice();
}
