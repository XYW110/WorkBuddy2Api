import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../../utils/logger.js";
import { config } from "../../config.js";
import type { FetchResult, LeaderboardSourceConfig } from "./types.js";

const RAW_DIR = join(process.cwd(), "data", "leaderboard", "raw");
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** 抓单源：带超时 + 容错；无论成败都尽量存原始快照，便于回放/排障 */
export async function fetchSource(
  src: LeaderboardSourceConfig
): Promise<FetchResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.leaderboard.fetchTimeoutMs);
  try {
    logger.info({ source: src.name, url: src.url }, "抓取排行榜源开始");
    const res = await fetch(src.url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/json,*/*;q=0.8",
      },
    });
    const html = await res.text();
    if (!res.ok) {
      logger.warn({ source: src.name, status: res.status }, "抓取排行榜源返回非 200");
      return { source: src.name, ok: false, error: `HTTP ${res.status}`, status: res.status };
    }
    // 存原始快照（按日期覆盖，保留当日最新）
    try {
      mkdirSync(RAW_DIR, { recursive: true });
      const date = new Date().toISOString().slice(0, 10);
      writeFileSync(join(RAW_DIR, `${src.name}-${date}.html`), html);
    } catch (e) {
      logger.warn({ err: e, source: src.name }, "原始快照写入失败（不影响主流程）");
    }
    logger.info({ source: src.name, bytes: html.length }, "抓取排行榜源成功");
    return { source: src.name, ok: true, html, status: res.status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn({ source: src.name, err: msg }, "抓取排行榜源失败");
    return { source: src.name, ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/** 并发抓取所有启用源；单源失败不影响其他源 */
export async function fetchAllSources(): Promise<FetchResult[]> {
  const enabled = config.leaderboard.sources.filter((s) => s.enabled);
  if (enabled.length === 0) {
    logger.warn("没有启用的排行榜源");
    return [];
  }
  return Promise.all(enabled.map(fetchSource));
}
