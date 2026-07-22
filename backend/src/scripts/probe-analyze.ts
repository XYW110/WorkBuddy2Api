import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROBE_DIR = join(process.cwd(), "data", "leaderboard", "probe");
const html = readFileSync(join(PROBE_DIR, "llm-stats.html"), "utf-8");

const MARK = 'self.__next_f.push([1,';
const chunks: string[] = [];
let from = 0;
while (true) {
  const i = html.indexOf(MARK, from);
  if (i < 0) break;
  const scriptEnd = html.indexOf("</script>", i);
  if (scriptEnd < 0) break;
  const block = html.slice(i + MARK.length, scriptEnd);
  const startQ = block.indexOf('"');
  const endQ = block.lastIndexOf('"]');
  if (startQ >= 0 && endQ > startQ) chunks.push(block.slice(startQ + 1, endQ));
  from = scriptEnd + 8;
}
let blob = chunks.join("\n")
  .replace(/\\\\/g, "\\")
  .replace(/\\"/g, '"')
  .replace(/\\n/g, "\n")
  .replace(/\\t/g, "\t");

// 平衡括号提取以 {"model_id" 开头的对象
function extractObjects(text: string): any[] {
  const out: any[] = [];
  const marker = '{"model_id"';
  let i = text.indexOf(marker);
  while (i >= 0) {
    // 从该 { 扫描匹配 }
    let depth = 0, j = i, inStr = false, esc = false;
    for (; j < text.length; j++) {
      const c = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
      } else {
        if (c === '"') inStr = true;
        else if (c === "{") depth++;
        else if (c === "}") { depth--; if (depth === 0) { j++; break; } }
      }
    }
    const slice = text.slice(i, j);
    try { out.push(JSON.parse(slice)); } catch {}
    i = text.indexOf(marker, j);
  }
  return out;
}

const all = extractObjects(blob);
const spec = all.filter((o) => o.gpqa_score !== undefined || o.input_price !== undefined || o.throughput !== undefined);
const arena = all.filter((o) => o.mu !== undefined && o.rank !== undefined);
console.log(`总模型对象: ${all.length}, 规格: ${spec.length}, 竞技场: ${arena.length}`);

if (spec.length) {
  console.log("\n[规格对象字段]:", Object.keys(spec[0]).join(", "));
  console.log("[规格示例]:", JSON.stringify(spec[0]));
}

// 我们的 MODELS（name 用于匹配）
const OUR = [
  ["hy3", "Hy3"], ["minimax-m2.5", "MiniMax-M2.5"], ["glm-5v-turbo", "GLM-5v-Turbo"],
  ["glm-5.2", "GLM-5.2"], ["glm-5.1", "GLM-5.1"], ["glm-5.0-turbo", "GLM-5.0-Turbo"],
  ["glm-4.6v", "GLM-4.6V"], ["glm-4.6", "GLM-4.6"], ["kimi-k2.7", "Kimi-K2.7-Code"],
  ["kimi-k2.6", "Kimi-K2.6"], ["kimi-k2.5", "Kimi-K2.5"], ["kimi-k2-thinking", "Kimi-K2-Thinking"],
  ["minimax-m3", "MiniMax-M3"], ["minimax-m2.7", "MiniMax-M2.7"],
  ["deepseek-v4-flash", "Deepseek-V4-Flash"], ["deepseek-v4-pro", "Deepseek-V4-Pro"],
  ["deepseek-v3-2-volc", "DeepSeek-V3.2"], ["deepseek-v3-1-volc", "DeepSeek-V3-1-Terminus"],
  ["deepseek-v3-1-lkeap", "DeepSeek-V3-1"], ["deepseek-v3-1", "DeepSeek-V3.1"],
  ["deepseek-v3-0324-lkeap", "DeepSeek-V3-0324"], ["kimi-k2-instruct-taiji", "Kimi-K2"],
  ["hunyuan-2.0-instruct", "Hunyuan-2.0-Instruct"], ["hunyuan-chat", "Hunyuan-Turbos"],
  ["default-1.1", "Claude-3.7-Sonnet"], ["default-1.2", "Claude-4.0-Sonnet"],
];

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function findMatch(name: string): { src: string; hit: string; score?: number }[] {
  const res: { src: string; hit: string; score?: number }[] = [];
  const n = norm(name);
  for (const o of arena) {
    const mn = norm(o.model_name ?? "");
    if (mn && (mn.includes(n) || n.includes(mn)) && n.length >= 3)
      res.push({ src: "arena", hit: o.model_name, score: o.conservative });
  }
  for (const o of spec) {
    const names = [o.model_id, o.name, o.model_name].filter(Boolean).map(String);
    for (const nm of names) {
      const mn = norm(nm);
      if (mn && (mn.includes(n) || n.includes(mn)) && n.length >= 3) {
        res.push({ src: "spec", hit: nm, score: o.gpqa_score });
        break;
      }
    }
  }
  return res;
}

console.log("\n[我们的模型 → 排行榜匹配测试]:");
for (const [id, name] of OUR) {
  const hits = findMatch(name);
  const top = hits.slice(0, 3).map((h) => `${h.src}:${h.hit}(${h.score ?? "?"})`).join(" | ");
  console.log(`  ${id.padEnd(24)} <= ${name.padEnd(20)} => ${top || "（无匹配）"}`);
}
