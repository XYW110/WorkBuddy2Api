import type { RankEntry } from "./types.js";
import { MODELS } from "../../model-catalog.js";

/** 归一化：小写 + 仅保留字母数字（去除版本符号/空格/厂商前缀差异） */
export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface CapabilityMatch {
  /** 归一化能力分（0-1，用于排序/百分位） */
  score: number;
  /** 原始能力分（展示用） */
  rawScore: number;
  source: string;
  matchedName: string;
  /** 匹配质量：3=精确相等，2=包含关系 */
  quality: number;
  /** spec 源匹配到的价格（每 1M token，美元） */
  inputPrice: number | null;
  outputPrice: number | null;
}

/**
 * 将排行榜条目映射到我们的模型 id，返回 Map<ourId, 代表能力分>。
 * 同名多条目（如 GLM-5.2 在竞技场有多个分区）取：优先精确匹配，再取能力分最高者。
 */
export function matchCapability(entries: RankEntry[]): Map<string, CapabilityMatch> {
  // ourId -> 候选列表
  const candidates = new Map<string, CapabilityMatch[]>();
  for (const m of MODELS) {
    candidates.set(m.id, []);
  }

  for (const e of entries) {
    if (typeof e.score !== "number") continue;
    const eNorm = normalizeName(e.modelName || e.modelId);
    if (eNorm.length < 3) continue;

    for (const m of MODELS) {
      const mNorm = normalizeName(m.name);
      if (mNorm.length < 3) continue;
      let quality = 0;
      if (eNorm === mNorm) quality = 3;
      else if (eNorm.includes(mNorm) || mNorm.includes(eNorm)) quality = 2;
      if (quality === 0) continue;
      candidates.get(m.id)!.push({
        score: e.score ?? 0,
        rawScore: e.scoreRaw ?? e.score ?? 0,
        source: e.source,
        matchedName: e.modelName,
        quality,
        inputPrice: e.inputPrice ?? null,
        outputPrice: e.outputPrice ?? null,
      });
    }
  }

  const result = new Map<string, CapabilityMatch>();
  for (const [id, list] of candidates) {
    if (list.length === 0) continue;
    // 先按质量降序，再按归一化分数降序，取最优代表
    list.sort((a, b) => (b.quality - a.quality) || (b.score - a.score));
    result.set(id, list[0]);
  }
  return result;
}
