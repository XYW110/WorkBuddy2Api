/** 管理端 API 业务类型（对齐后端实测契约，字段名不可臆造） */

// —— 通用 ——

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

export interface SuccessResponse {
  success: true;
}

// —— Credential（CodeBuddy 上游凭证；type=api-key 的 key 为 ck_）——

export type CredentialType = "local-file" | "api-key";

export interface Credential {
  id: string;
  name: string;
  type: CredentialType;
  /** local-file：列表 mask，创建/upload 201 可能明文 */
  accessToken?: string;
  refreshToken?: string;
  uid?: string;
  /** api-key 凭证：ck_；列表 mask，创建/upload 201 可能明文 */
  key?: string;
  isActive: boolean;
  source?: string;
}

/** GET /admin/credentials data（比标准分页多 activeId） */
export interface CredentialListData extends Paginated<Credential> {
  activeId: string | null;
}

/** POST /admin/credentials JSON body */
export interface CreateCredentialBody {
  name: string;
  type?: CredentialType;
  key?: string;
  accessToken?: string;
  refreshToken?: string;
  uid?: string;
  source?: string;
}

/** PUT|POST /admin/credentials/:id/activate data */
export interface ActivateCredentialResult {
  success: true;
  activeId: string;
}

// —— ApiKey（客户端访问 /v1 的 sk-，与凭证 ck_ 严格区分）——

export interface ApiKey {
  id: string;
  name: string;
  /** 创建 201 明文；列表/PUT 已 mask */
  key: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApiKeyBody {
  name: string;
}

/** 至少提供 name 或 enabled 之一 */
export interface UpdateApiKeyBody {
  name?: string;
  enabled?: boolean;
}

// —— Checkin ——

export type CheckinSource = "manual" | "scheduled" | "script";

export interface CheckinResult {
  success: boolean;
  skipped: boolean;
  reason?: string;
  credit?: number;
  streakDays?: number;
  totalCredits?: number;
  todayCheckedIn?: boolean;
  executedAt: string;
  credentialId?: string;
  credentialName?: string;
}

/** POST /admin/checkin/all 返回的批量聚合结果 */
export interface CheckinBatchResult {
  results: CheckinResult[];
  summary: {
    total: number;
    checked: number;
    skipped: number;
    failed: number;
  };
}

/** 上游活动状态，保持 snake_case 原样 */
export interface CheckinActivityData {
  active: boolean;
  today_checked_in: boolean;
  streak_days: number;
  daily_credit: number;
  today_credit: number;
  is_streak_day: boolean;
  next_streak_day: number;
  streak_bonus_days: number;
  streak_bonus_credit: number;
  checkin_dates: string[];
  week_checkin_days: number;
  week_progress: boolean[];
  total_credits: number;
  start_time: string;
  end_time: string;
  theme_name: string;
  season: number;
  activity_name: string;
  claim_button_text: string;
  action_button?: {
    show: boolean;
    text: string;
    action: string;
  };
}

/** GET /admin/checkin/status data */
export interface CheckinStatusData {
  credentialId: string;
  credentialName: string;
  status: CheckinActivityData;
  raw: unknown;
}

export interface CheckinHistoryRecord {
  id: string;
  source: CheckinSource;
  success: boolean;
  skipped: boolean;
  reason?: string;
  credit?: number;
  streakDays?: number;
  totalCredits?: number;
  todayCheckedIn?: boolean;
  executedAt: string;
  credentialId?: string;
  credentialName?: string;
}

// —— Quota ——

/** 上游额度 API 返回的单个资源包 */
export interface QuotaResourceItem {
  resourceId: string;
  status: number;
  packageTotal: string;
  packageUsed: string;
  packageRemaining: string;
  expireTime: string;
  packageName?: string;
}

/** 解析后的额度结构化数据 */
export interface QuotaParsed {
  totalCount: number;
  resources: QuotaResourceItem[];
  totalUsed: string;
  totalRemaining: string;
  totalAmount: string;
}

/**
 * GET /admin/quota → 含 credentialName
 * GET /admin/credentials/:id/quota → 仅 credentialId + quota
 * quota.raw 为上游原始 JSON，quota.parsed 为解析后的结构化数据（可能为 null）
 */
export interface AdminQuotaData {
  credentialId: string;
  credentialName?: string;
  quota: {
    raw: unknown;
    parsed: QuotaParsed | null;
  };
}

// —— Models ——

/** GET /admin/models 返回的模型信息 */
export interface ModelInfo {
  id: string;
  name: string;
  owned_by: string;
  /** 原始倍率字符串，如 "x0.06" */
  credits: string;
  /** 倍率数值，为空时 NaN，为 0 时免费 */
  creditsNum: number;
  /** 展示用的倍率标签，如 "免费"、"0.06x"、"未定价" */
  creditsLabel: string;
}

// —— Leaderboard（经济型别名 auto-cheapest） ——

/** 我们的模型在排行榜上的排序视图 */
export interface ModelRankView {
  id: string;
  name: string;
  owned_by: string;
  credits: string;
  creditsLabel: string;
  /** 能力分（归一化 0-1，展示时乘 100 为能力指数） */
  capability: number | null;
  /** 能力百分位（0-1，越高越强） */
  percentile: number | null;
  /** 匹配到的榜单名（排障用） */
  matchedName: string | null;
  /** 每 1M token 输入/输出价格（美元），spec 源才有 */
  inputPrice: number | null;
  outputPrice: number | null;
}

export interface LeaderboardHistoryEntry {
  updatedAt: string;
  selectedModelId: string;
  tier: "free" | "paid";
  reason: string;
  usedSources: string[];
}

/** GET /admin/leaderboard 返回的经济别名状态 */
export interface LeaderboardState {
  selectedModelId: string | null;
  scores: Record<string, number>;
  usedSources: string[];
  tier: "free" | "paid" | null;
  reason: string | null;
  modelRanking: ModelRankView[];
  updatedAt: string;
  history: LeaderboardHistoryEntry[];
}
