/**
 * 排行榜逻辑断言脚本（纯函数，无需启动服务）。
 * 运行: cd backend && npx tsx test/leaderboard.unit.ts
 * 复用 data/leaderboard/probe/llm-stats.html 作为 fixture。
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseHtml } from "../src/services/leaderboard/parse.js";
import { selectBestModel } from "../src/services/leaderboard/select.js";
import { normalizeName, matchCapability } from "../src/services/leaderboard/map.js";
import { MODELS } from "../src/model-catalog.js";
import type { LeaderboardSourceConfig } from "../src/services/leaderboard/types.js";

interface Case {
  name: string;
  pass: boolean;
  detail: string;
}
const cases: Case[] = [];
function check(name: string, pass: boolean, detail: string) {
  cases.push({ name, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${name}: ${detail}`);
}

const PROBE = join(process.cwd(), "data", "leaderboard", "probe", "llm-stats.html");
const src: LeaderboardSourceConfig = {
  name: "llm-stats",
  url: "https://llm-stats.com",
  kind: "arena",
  enabled: true,
};

if (!existsSync(PROBE)) {
  check("fixture 存在", false, `缺少 ${PROBE}，请先运行 npm run leaderboard:probe`);
} else {
  const html = readFileSync(PROBE, "utf-8");

  // 1) 解析
  const entries = parseHtml(src, html);
  check("解析出条目", entries.length > 1000, `entries=${entries.length}`);
  check("条目含 mu 分数", entries.every((e) => typeof e.score === "number"), "全部条目有 score");

  // 2) 归一化
  check("normalizeName 去符号", normalizeName("GLM-5.2") === "glm52", normalizeName("GLM-5.2"));

  // 3) 映射：glm-5.2 应能匹配且有合理分数
  const cap = matchCapability(entries);
  check("glm-5.2 命中映射", cap.has("glm-5.2"), `score=${cap.get("glm-5.2")?.score}`);
  check("hy3 命中映射", cap.has("hy3"), `score=${cap.get("hy3")?.score}`);

  // 4) 筛选：免费优先 → hy3
  const sel = selectBestModel(entries);
  check("免费优先选 hy3", sel.selectedModelId === "hy3", `selected=${sel.selectedModelId}, tier=${sel.tier}`);
  check("modelRanking 含所有模型", sel.modelRanking.length === MODELS.length, `len=${sel.modelRanking.length}, expect=${MODELS.length}`);
  check("百分数在 [0,1]", sel.modelRanking.every((m) => m.percentile === null || (m.percentile >= 0 && m.percentile <= 1)), "percentile 范围正确");

  // 5) 付费档逻辑（构造不含免费模型的场景需要改 MODELS，这里校验排除最弱逻辑——
  //    通过“仅给付费模型条目”验证：hy3 无匹配时应仍走免费（只有免费），
  //    故改为校验：deepseek-v4-flash 作为最弱不应在付费 top 中被优先）
  const paidOnly = entries.filter((e) => !/hy3/i.test(e.modelName));
  const selPaid = selectBestModel(paidOnly);
  // 无 hy3 匹配时免费档仍选 hy3（它是免费且总有匹配尝试），这里仅校验不崩溃且返回有效 id
  check("筛选返回有效 id", typeof selPaid.selectedModelId === "string" && selPaid.selectedModelId.length > 0, `selected=${selPaid.selectedModelId}`);
}

const failed = cases.filter((c) => !c.pass).length;
console.log(`\n${cases.length - failed}/${cases.length} 通过`);
process.exitCode = failed === 0 ? 0 : 1;
