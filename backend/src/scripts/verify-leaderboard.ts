import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHtml } from "../services/leaderboard/parse.js";
import { selectBestModel } from "../services/leaderboard/select.js";
import type { LeaderboardSourceConfig } from "../services/leaderboard/types.js";

const PROBE = join(process.cwd(), "data", "leaderboard", "probe", "llm-stats-llm-leaderboard.html");
const src: LeaderboardSourceConfig = {
  name: "llm-stats",
  url: "https://llm-stats.com/leaderboards/llm-leaderboard",
  kind: "spec",
  enabled: true,
};

const html = readFileSync(PROBE, "utf-8");
const entries = parseHtml(src, html);
console.log("解析条目数:", entries.length);

const sel = selectBestModel(entries);
console.log("\n=== 筛选结果 ===");
console.log("selectedModelId:", sel.selectedModelId);
console.log("tier:", sel.tier);
console.log("reason:", sel.reason);
console.log("usedSources:", sel.usedSources);

console.log("\n=== 模型排行榜视图（按能力分降序，top 12）===");
const ranked = [...sel.modelRanking]
  .filter((m) => m.capability !== null)
  .sort((a, b) => (b.capability ?? 0) - (a.capability ?? 0));
for (const m of ranked.slice(0, 12)) {
  console.log(
    `  ${m.id.padEnd(22)} cap=${m.capability} pct=${(m.percentile ?? 0).toFixed(2)} credits=${m.creditsLabel} match=${m.matchedName}`
  );
}
console.log("\n无能力分(未匹配)模型:", sel.modelRanking.filter((m) => m.capability === null).map((m) => m.id).join(", "));
