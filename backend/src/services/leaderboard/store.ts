import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../../utils/logger.js";
import type { LeaderboardState, LeaderboardHistoryEntry } from "./types.js";
import type { SelectionOutput } from "./select.js";

const STATE_PATH = join(process.cwd(), "data", "economy-alias.json");
const HISTORY_CAP = 30;

/** 读取经济别名持久化状态；缺失/损坏返回 null（路由据此回退） */
export function loadAlias(): LeaderboardState | null {
  try {
    if (!existsSync(STATE_PATH)) return null;
    return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as LeaderboardState;
  } catch (e) {
    logger.warn({ err: e }, "读取经济别名状态失败");
    return null;
  }
}

/** 写入筛选结果（含历史滚动），返回最新状态 */
export function saveAlias(result: SelectionOutput): LeaderboardState {
  const prev = loadAlias();
  const now = new Date().toISOString();
  const entry: LeaderboardHistoryEntry = {
    updatedAt: now,
    selectedModelId: result.selectedModelId,
    tier: result.tier,
    reason: result.reason,
    usedSources: result.usedSources,
  };
  const history = [entry, ...(prev?.history ?? [])].slice(0, HISTORY_CAP);
  const state: LeaderboardState = {
    selectedModelId: result.selectedModelId,
    scores: result.scores,
    usedSources: result.usedSources,
    tier: result.tier,
    reason: result.reason,
    modelRanking: result.modelRanking,
    updatedAt: now,
    history,
  };
  try {
    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    logger.info({ selectedModelId: state.selectedModelId }, "经济别名状态已写入");
  } catch (e) {
    logger.error({ err: e }, "写入经济别名状态失败");
  }
  return state;
}
