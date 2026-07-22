import { MODELS, parseCredits, type ModelDef } from "../../model-catalog.js";
import { matchCapability } from "./map.js";
import type {
  RankEntry,
  SelectionResult,
  SelectionTier,
  ModelRankView,
} from "./types.js";

export interface SelectionOutput extends SelectionResult {
  modelRanking: ModelRankView[];
}

/**
 * 根据排行榜条目筛选最佳模型。
 * - 免费档：credits===0 的模型中取能力百分位最高者（免费一律优先，OQ4）。
 * - 付费档：排除倍率最小（最弱）模型后，按"低倍率 + 高能力百分位"综合选优。
 * - 无任何能力分时回退到倍率最小模型。
 */
export function selectBestModel(entries: RankEntry[]): SelectionOutput {
  const matches = matchCapability(entries);

  // 能力百分位：在有用到能力分的模型中按分数降序
  const capable = MODELS.filter((m) => matches.has(m.id)).map((m) => ({
    m,
    cap: matches.get(m.id)!.score,
  }));
  capable.sort((a, b) => b.cap - a.cap);
  const n = capable.length;
  const percentile = new Map<string, number>();
  capable.forEach((x, idx) => {
    percentile.set(x.m.id, n > 1 ? (n - 1 - idx) / (n - 1) : 1);
  });

  let selectedModelId: string;
  let tier: SelectionTier;
  let reason: string;

  const free = MODELS.filter((m) => parseCredits(m.credits) === 0);
  if (free.length > 0) {
    free.sort(
      (a, b) => (percentile.get(b.id) ?? -1) - (percentile.get(a.id) ?? -1)
    );
    selectedModelId = free[0].id;
    tier = "free";
    reason = `免费优先：免费模型 [${free.map((f) => f.id).join(", ")}] 中选能力最高者 (${selectedModelId})`;
  } else {
    const paid = MODELS.filter((m) => {
      const c = parseCredits(m.credits);
      return c > 0 && !isNaN(c) && percentile.has(m.id);
    });
    if (paid.length === 0) {
      const fallback = MODELS.filter((m) => {
        const c = parseCredits(m.credits);
        return c > 0 && !isNaN(c);
      }).sort((a, b) => parseCredits(a.credits) - parseCredits(b.credits));
      selectedModelId = fallback[0]?.id ?? MODELS[0].id;
      tier = "paid";
      reason = "无排行榜能力分，回退到倍率最小模型";
    } else {
      // 排除最弱（倍率最小者）
      const weakest = paid.reduce((min, m) =>
        parseCredits(m.credits) < parseCredits(min.credits) ? m : min
      );
      const pool = paid.filter((m) => m.id !== weakest.id);
      const evalPool = pool.length > 0 ? pool : paid;

      const creditsList = evalPool.map((m) => parseCredits(m.credits));
      const minC = Math.min(...creditsList);
      const maxC = Math.max(...creditsList);
      const scored = evalPool.map((m) => {
        const c = parseCredits(m.credits);
        const cheapness = maxC === minC ? 1 : (maxC - c) / (maxC - minC);
        const cap = percentile.get(m.id) ?? 0;
        return { m, final: 0.5 * cheapness + 0.5 * cap };
      });
      scored.sort((a, b) => b.final - a.final);
      selectedModelId = scored[0].m.id;
      tier = "paid";
      reason = `付费档：排除最弱(${weakest.id})后，按"低价+高能力"综合选优 (${selectedModelId})`;
    }
  }

  const scores: Record<string, number> = {};
  for (const [id, p] of percentile) scores[id] = p;

  const modelRanking: ModelRankView[] = MODELS.map((m) => {
    const c = parseCredits(m.credits);
    const creditsLabel =
      c === 0 ? "免费" : isNaN(c) ? "未定价" : `${c.toFixed(2)}x`;
    const match = matches.get(m.id);
    return {
      id: m.id,
      name: m.name,
      owned_by: m.owned_by,
      credits: m.credits,
      creditsLabel,
      capability: match?.score ?? null,
      percentile: percentile.get(m.id) ?? null,
      matchedName: match?.matchedName ?? null,
      inputPrice: match?.inputPrice ?? null,
      outputPrice: match?.outputPrice ?? null,
    };
  });

  const usedSources = [...new Set(entries.map((e) => e.source))];

  return { selectedModelId, scores, usedSources, tier, reason, modelRanking };
}
