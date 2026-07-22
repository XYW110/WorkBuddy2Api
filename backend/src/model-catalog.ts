/**
 * 共享模型目录：模型列表与倍率解析的单一来源。
 * 列表/路由/排行榜筛选/模型名映射均从此处获取，避免重复定义。
 */

export interface ModelDef {
  id: string;
  name: string;
  owned_by: string;
  credits: string;
}

/** 从 /v3/config 抓包确认的真实模型列表
 *  vendor 映射: e=智谱, f=第三方, j=腾讯混元, tencent=腾讯自研 */
export const MODELS: ModelDef[] = [
  { id: "auto", name: "Auto", owned_by: "codebuddy", credits: "x1.00" },
  { id: "hy3", name: "Hy3", owned_by: "tencent", credits: "x0.00" },
  {
    id: "minimax-m2.5",
    name: "MiniMax-M2.5",
    owned_by: "minimax",
    credits: "x0.18",
  },
  {
    id: "glm-5v-turbo",
    name: "GLM-5v-Turbo",
    owned_by: "zhipu",
    credits: "x0.95",
  },
  { id: "glm-5.2", name: "GLM-5.2", owned_by: "zhipu", credits: "x0.79" },
  { id: "glm-5.1", name: "GLM-5.1", owned_by: "zhipu", credits: "x0.79" },
  {
    id: "glm-5.0-turbo",
    name: "GLM-5.0-Turbo",
    owned_by: "zhipu",
    credits: "x0.95",
  },
  { id: "glm-4.6v", name: "GLM-4.6V", owned_by: "zhipu", credits: "x0.11" },
  { id: "glm-4.6", name: "GLM-4.6", owned_by: "zhipu", credits: "x0.23" },
  {
    id: "kimi-k2.7",
    name: "Kimi-K2.7-Code",
    owned_by: "moonshot",
    credits: "x0.57",
  },
  {
    id: "kimi-k2.6",
    name: "Kimi-K2.6",
    owned_by: "moonshot",
    credits: "x0.52",
  },
  {
    id: "kimi-k2.5",
    name: "Kimi-K2.5",
    owned_by: "moonshot",
    credits: "x0.45",
  },
  {
    id: "kimi-k2-thinking",
    name: "Kimi-K2-Thinking",
    owned_by: "moonshot",
    credits: "x0.54",
  },
  {
    id: "minimax-m3",
    name: "MiniMax-M3",
    owned_by: "minimax",
    credits: "x0.25",
  },
  {
    id: "minimax-m2.7",
    name: "MiniMax-M2.7",
    owned_by: "minimax",
    credits: "x0.26",
  },
  {
    id: "deepseek-v4-flash",
    name: "Deepseek-V4-Flash",
    owned_by: "deepseek",
    credits: "x0.06",
  },
  {
    id: "deepseek-v4-pro",
    name: "Deepseek-V4-Pro",
    owned_by: "deepseek",
    credits: "x0.16",
  },
  {
    id: "deepseek-v3-2-volc",
    name: "DeepSeek-V3.2",
    owned_by: "deepseek",
    credits: "x0.29",
  },
  {
    id: "deepseek-v3-1-volc",
    name: "DeepSeek-V3-1-Terminus",
    owned_by: "deepseek",
    credits: "x0.52",
  },
  {
    id: "deepseek-v3-1-lkeap",
    name: "DeepSeek-V3-1",
    owned_by: "deepseek",
    credits: "x0.52",
  },
  {
    id: "deepseek-v3-1",
    name: "DeepSeek-V3.1",
    owned_by: "deepseek",
    credits: "x0.52",
  },
  {
    id: "deepseek-v3-0324-lkeap",
    name: "DeepSeek-V3-0324",
    owned_by: "deepseek",
    credits: "x0.52",
  },
  {
    id: "deepseek-r1-0528-lkeap",
    name: "DeepSeek-R1-0528",
    owned_by: "deepseek",
    credits: "",
  },
  {
    id: "kimi-k2-instruct-taiji",
    name: "Kimi-K2",
    owned_by: "moonshot",
    credits: "",
  },
  {
    id: "hunyuan-2.0-instruct",
    name: "Hunyuan-2.0-Instruct",
    owned_by: "tencent",
    credits: "",
  },
  {
    id: "hunyuan-chat",
    name: "Hunyuan-Turbos",
    owned_by: "tencent",
    credits: "",
  },
  {
    id: "default-1.1",
    name: "Claude-3.7-Sonnet",
    owned_by: "anthropic",
    credits: "",
  },
  {
    id: "default-1.2",
    name: "Claude-4.0-Sonnet",
    owned_by: "anthropic",
    credits: "",
  },
];

/** 解析 credits 字符串（如 "x0.06"）为数值，空字符串返回 NaN */
export function parseCredits(credits: string): number {
  const num = parseFloat(credits.replace("x", "").trim());
  return isNaN(num) ? NaN : num;
}

/** 免费模型（credits 为 0）优先；否则返回 credits 最小的可定价模型 id。
 *  返回 null 表示没有可用模型。 */
export function getCheapestModel(): string | null {
  const candidates = MODELS.filter((m) => m.credits && m.credits.trim() !== "")
    .map((m) => ({ id: m.id, creditsNum: parseCredits(m.credits) }))
    .filter((m) => !isNaN(m.creditsNum));

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.creditsNum - b.creditsNum);
  return candidates[0].id;
}
