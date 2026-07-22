import { logger } from "../../utils/logger.js";
import type { LeaderboardSourceConfig, RankEntry } from "./types.js";

/**
 * 从 HTML 提取所有 self.__next_f.push([1,"<escaped>"]) 的还原后脚本内容。
 * 采用标准 RSC 还原：把 <escaped> 当作 JSON 字符串字面量用 JSON.parse 还原，
 * 可正确处理 Next.js App Router 的多层转义（\\\\\" → \" → "）。
 */
function extractRscChunks(html: string): string[] {
  const out: string[] = [];
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      out.push(JSON.parse('"' + m[1] + '"'));
    } catch {
      out.push(m[1]);
    }
  }
  return out;
}

/** 把任意分数归一到 0-1（>1 视为百分制，除以 100） */
function to01(v: number): number {
  if (!isFinite(v)) return 0;
  if (v > 1.0001) v = v / 100;
  return Math.max(0, Math.min(1, v));
}

/**
 * 合成 spec 源的能力分（0-1）：
 * 优先 gpqa_score；否则取所有 index_* 字段均值；再否则 null。
 */
function syntheticSpecScore(o: Record<string, unknown>): {
  score: number | null;
  raw: number | null;
} {
  const gpqa = o.gpqa_score;
  if (typeof gpqa === "number" && isFinite(gpqa) && gpqa > 0) {
    return { score: to01(gpqa), raw: gpqa };
  }
  const idxVals: number[] = [];
  for (const k of Object.keys(o)) {
    if (k.startsWith("index_") && typeof o[k] === "number") {
      const v = o[k] as number;
      if (isFinite(v)) idxVals.push(v);
    }
  }
  if (idxVals.length > 0) {
    const avg = idxVals.reduce((a, b) => a + b, 0) / idxVals.length;
    return { score: to01(avg), raw: avg };
  }
  return { score: null, raw: null };
}

/** 竞技场 mu → 归一化（参考上限 1700） */
function arenaScore(mu: number): { score: number; raw: number } {
  return { score: to01(mu / 1700), raw: mu };
}

/** 平衡括号扫描：提取所有以 {"model_id" 开头的 JSON 对象 */
function extractObjects(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const marker = '{"model_id"';
  let i = text.indexOf(marker);
  while (i >= 0) {
    let depth = 0;
    let j = i;
    let inStr = false;
    let esc = false;
    for (; j < text.length; j++) {
      const c = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
      } else {
        if (c === '"') inStr = true;
        else if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) {
            j++;
            break;
          }
        }
      }
    }
    const slice = text.slice(i, j);
    try {
      out.push(JSON.parse(slice));
    } catch {
      /* 部分片段非法，跳过 */
    }
    i = text.indexOf(marker, j);
  }
  return out;
}

/** 从还原后的文本里提取 "initialData":[ ... ] 数组元素（spec 页数据载体） */
function extractInitialData(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re = /"initialData":(\[.*?\])/gs;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    try {
      const arr = JSON.parse(m[1]);
      if (Array.isArray(arr)) out.push(...arr);
    } catch {
      /* ignore */
    }
  }
  return out;
}

/**
 * 解析某源的 HTML → 统一 RankEntry[]。
 * - arena 源：取 mu 作为能力分（含 rank/games_played）。
 * - spec 源：从 initialData 取规格+基准分，能力分由 syntheticSpecScore 合成（gpqa 优先）。
 * 单条解析失败不影响其他条。
 */
export function parseHtml(
  source: LeaderboardSourceConfig,
  html: string
): RankEntry[] {
  const chunks = extractRscChunks(html);
  if (chunks.length === 0) {
    logger.warn({ source: source.name }, "未提取到 RSC 数据块，可能站点结构已变");
    return [];
  }
  const blob = chunks.join("\n");

  // spec 源优先从 initialData 数组取；若没有再退化为散落对象扫描
  let objs: Record<string, unknown>[] =
    source.kind === "spec" ? extractInitialData(blob) : [];
  if (objs.length === 0) objs = extractObjects(blob);

  const entries: RankEntry[] = [];
  for (const o of objs) {
    const modelId = o.model_id;
    if (typeof modelId !== "string" || !modelId) continue;

    if (source.kind === "arena") {
      if (typeof o.mu === "number") {
        const { score, raw } = arenaScore(o.mu);
        entries.push({
          source: source.name,
          modelId,
          modelName: typeof o.model_name === "string" ? o.model_name : modelId,
          score,
          scoreRaw: raw,
          rank: typeof o.rank === "number" ? o.rank : null,
          gamesPlayed:
            typeof o.games_played === "number" ? o.games_played : undefined,
        });
      }
    } else {
      // spec 源
      const { score, raw } = syntheticSpecScore(o);
      if (score === null) continue;
      const inputPrice =
        typeof o.input_price === "number" ? o.input_price : null;
      const outputPrice =
        typeof o.output_price === "number" ? o.output_price : null;
      entries.push({
        source: source.name,
        modelId,
        modelName: typeof o.name === "string" ? o.name : modelId,
        score,
        scoreRaw: raw,
        rank: null,
        inputPrice,
        outputPrice,
      });
    }
  }
  logger.info({ source: source.name, entries: entries.length }, "解析排行榜源完成");
  return entries;
}
