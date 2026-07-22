/**
 * 阶段0 数据源探查：确认 llm-stats.com（及备选源）的排行榜数据如何获取。
 * 仅用于排障/规划，不计入主流程。运行：npm run leaderboard:probe
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const PROBE_DIR = join(process.cwd(), "data", "leaderboard", "probe");
mkdirSync(PROBE_DIR, { recursive: true });

interface ProbeTarget {
  name: string;
  url: string;
  /** 若为真，尝试当作可能的 JSON 接口直接解析 */
  tryJson?: boolean;
}

const TARGETS: ProbeTarget[] = [
  { name: "llm-stats", url: "https://llm-stats.com" },
  { name: "llm-stats-models", url: "https://llm-stats.com/models" },
  { name: "artificial-analysis", url: "https://artificialanalysis.ai" },
  { name: "superclue", url: "https://www.superclueai.com" },
  { name: "lmarena", url: "https://arena.ai" },
  { name: "llmrank", url: "https://llmrank.top" },
];

const MODEL_HINTS = [
  "GPT", "Claude", "Gemini", "DeepSeek", "Llama", "Qwen", "Mistral",
  "grok", "o1", "o3", "sonnet", "opus", "GLM", "Yi", "Ernie", "Hunyuan",
];

async function fetchWithTimeout(url: string, ms: number): Promise<{ ok: boolean; status: number; body: string; contentType: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/json,application/x-ndjson,*/*;q=0.8",
      },
    });
    const body = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      body,
      contentType: res.headers.get("content-type") ?? "",
    };
  } catch (e) {
    return { ok: false, status: 0, body: String(e), contentType: "" };
  } finally {
    clearTimeout(t);
  }
}

function summarizeHtml(name: string, body: string) {
  const len = body.length;
  const hasNextData = body.includes("__NEXT_DATA__");
  const hasNextProps = body.includes("__NEXT_PUBLIC") || body.includes("self.__next_f");
  const hasJsonScript = /<script[^>]*type="application\/json"/.test(body);
  // 统计模型名命中
  const hits = MODEL_HINTS.filter((h) => body.includes(h));
  // 找内嵌 JSON 片段
  let jsonSnippet = "";
  const m = body.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (m) {
    jsonSnippet = m[1].slice(0, 600);
  }
  return { len, hasNextData, hasNextProps, hasJsonScript, hitCount: hits.length, hits, jsonSnippet };
}

async function main() {
  console.log("=== 数据源探查开始 ===");
  for (const t of TARGETS) {
    console.log(`\n--- ${t.name} (${t.url}) ---`);
    const r = await fetchWithTimeout(t.url, 15000);
    if (!r.ok) {
      console.log(`  [FAIL] status=${r.status} err=${r.body.slice(0, 200)}`);
      continue;
    }
    console.log(`  status=${r.status} contentType=${r.contentType} bytes=${r.body.length}`);
    const isJsonLike = r.contentType.includes("json") || t.tryJson;
    if (isJsonLike) {
      try {
        const parsed = JSON.parse(r.body);
        console.log(`  [JSON OK] topKeys=${Object.keys(parsed).slice(0, 12).join(",")}`);
        writeFileSync(join(PROBE_DIR, `${t.name}.json`), r.body);
      } catch {
        console.log("  [JSON parse fail] 当作 HTML 处理");
        const s = summarizeHtml(t.name, r.body);
        console.log("  ", JSON.stringify(s, null, 2).split("\n").join("\n   "));
        writeFileSync(join(PROBE_DIR, `${t.name}.html`), r.body);
      }
    } else {
      const s = summarizeHtml(t.name, r.body);
      console.log("  ", JSON.stringify(s, null, 2).split("\n").join("\n   "));
      writeFileSync(join(PROBE_DIR, `${t.name}.html`), r.body);
    }
  }
  console.log("\n=== 探查完成，原始响应已存至 data/leaderboard/probe/ ===");
}

main().catch((e) => {
  console.error("probe error", e);
  process.exit(1);
});
