import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../../utils/logger.js";
import { config } from "../../config.js";
import { fetchAllSources } from "./fetch.js";
import { parseHtml } from "./parse.js";
import { selectBestModel } from "./select.js";
import { loadAlias, saveAlias } from "./store.js";
import type { RankEntry, LeaderboardSourceConfig, LeaderboardState } from "./types.js";

const LAST_ENTRIES_PATH = join(process.cwd(), "data", "leaderboard", "last-entries.json");
const SNAPSHOT_PATH = join(process.cwd(), "data", "leaderboard", "snapshot.json");

function loadJson<T>(p: string): T | null {
  try {
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf-8")) as T;
  } catch {
    return null;
  }
}

function saveLastEntries(entries: RankEntry[]): void {
  try {
    mkdirSync(join(process.cwd(), "data", "leaderboard"), { recursive: true });
    writeFileSync(LAST_ENTRIES_PATH, JSON.stringify(entries));
  } catch (e) {
    logger.warn({ err: e }, "缓存上次条目失败");
  }
}

/**
 * 每日排行榜筛选主流程：抓取 → 解析 → 筛选 → 持久化。
 * - 全部源失败时回退 last-entries.json，再回退 snapshot.json（人工/上次导入）。
 * - 仍无数据也能跑（免费档恒选免费模型）。
 */
export async function runLeaderboard(): Promise<LeaderboardState> {
  const results = await fetchAllSources();
  const okResults = results.filter((r) => r.ok && r.html);

  let entries: RankEntry[] = [];
  for (const r of okResults) {
    const src: LeaderboardSourceConfig | undefined = config.leaderboard.sources.find(
      (s) => s.name === r.source
    );
    if (!src) continue;
    entries.push(...parseHtml(src, r.html!));
  }

  if (entries.length === 0) {
    logger.warn("所有源抓取/解析失败，尝试回退缓存");
    entries = loadJson<RankEntry[]>(LAST_ENTRIES_PATH) ?? [];
    if (entries.length === 0) {
      entries = loadJson<RankEntry[]>(SNAPSHOT_PATH) ?? [];
      if (entries.length === 0) {
        logger.warn("无可用排行榜数据，按默认规则筛选（免费档/倍率最小）");
      }
    }
  } else {
    saveLastEntries(entries);
  }

  const selection = selectBestModel(entries);
  const state = saveAlias(selection);
  logger.info(
    {
      selected: state.selectedModelId,
      tier: state.tier,
      usedSources: state.usedSources,
      entryCount: entries.length,
    },
    "经济别名每日筛选完成"
  );
  return state;
}

export { loadAlias } from "./store.js";
