/** 排行榜服务公共类型 */

export type LeaderboardKind = "arena" | "spec";

export interface LeaderboardSourceConfig {
  name: string;
  url: string;
  kind: LeaderboardKind;
  enabled: boolean;
}

/** 解析后的单条排行榜记录（统一结构） */
export interface RankEntry {
  /** 数据源名（对应 config.leaderboard.sources[].name） */
  source: string;
  /** 榜单 model_id（如 "glm-5.2"） */
  modelId: string;
  /** 展示名（如 "GLM-5.2"） */
  modelName: string;
  /** 归一化能力分（0-1，跨源可比），用于排序；无则 null */
  score: number | null;
  /** 原始能力分（展示用，如 mu 或 gpqa_score）；无则 null */
  scoreRaw: number | null;
  /** 榜单排名（越小越好）；无则为 null */
  rank: number | null;
  /** 竞技场对局数（置信度） */
  gamesPlayed?: number;
  /** spec 源才有：每 1M token 价格（美元）；无则 null */
  inputPrice?: number | null;
  outputPrice?: number | null;
}

/** 单源抓取结果 */
export interface FetchResult {
  source: string;
  ok: boolean;
  html?: string;
  error?: string;
  status?: number;
}

export type SelectionTier = "free" | "paid";

/** 筛选结果 */
export interface SelectionResult {
  selectedModelId: string;
  /** 我们的模型 id → 能力百分位（0-1，越高越强） */
  scores: Record<string, number>;
  usedSources: string[];
  tier: SelectionTier;
  reason: string;
}

/** 前端/Admin 展示用：我们的模型在排行榜上的排序条目 */
export interface ModelRankView {
  id: string;
  name: string;
  owned_by: string;
  credits: string;
  creditsLabel: string;
  /** 能力分（归一化 0-1，展示时乘 100 为能力指数） */
  capability: number | null;
  /** 能力百分位（0-1） */
  percentile: number | null;
  /** 匹配到的榜单名（用于排障） */
  matchedName: string | null;
  /** spec 源匹配到的每 1M token 价格（美元），无则 null */
  inputPrice: number | null;
  outputPrice: number | null;
}

/** 历史条目 */
export interface LeaderboardHistoryEntry {
  updatedAt: string;
  selectedModelId: string;
  tier: SelectionTier;
  reason: string;
  usedSources: string[];
}

/** 持久化的别名状态（data/economy-alias.json） */
export interface LeaderboardState {
  selectedModelId: string | null;
  scores: Record<string, number>;
  usedSources: string[];
  tier: SelectionTier | null;
  reason: string | null;
  /** 我们的模型排行榜视图（用于前端展示） */
  modelRanking: ModelRankView[];
  updatedAt: string;
  history: LeaderboardHistoryEntry[];
}
