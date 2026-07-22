import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { OpenAIModelList } from "../types/openai.js";
import { sendOk } from "../utils/envelope.js";

/**
 * 从 /v3/config 抓包确认的真实模型列表
 * vendor 映射: e=智谱, f=第三方, j=腾讯混元, tencent=腾讯自研
 */
const MODELS = [
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

export async function modelRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/models", async (_req: FastifyRequest, reply: FastifyReply) => {
    const data: OpenAIModelList = {
      object: "list",
      data: MODELS.map((m) => ({
        id: m.id,
        object: "model" as const,
        created: 1728000000,
        owned_by: m.owned_by,
      })),
    };
    return reply.send(data);
  });
}

/** 解析 credits 字符串（如 "x0.06"）为数值，空字符串返回 NaN */
function parseCredits(credits: string): number {
  const num = parseFloat(credits.replace("x", "").trim());
  return isNaN(num) ? NaN : num;
}

/** 管理后台模型列表，包含倍率等附加信息 */
export async function adminModelRoutes(app: FastifyInstance): Promise<void> {
  // 注意：server.ts 注册时已加 prefix: "/admin"，此处只需 "/models"
  app.get("/models", async (_req: FastifyRequest, reply: FastifyReply) => {
    const enriched = MODELS.map((m) => {
      const creditsNum = parseCredits(m.credits);
      const creditsLabel =
        creditsNum === 0
          ? "免费"
          : isNaN(creditsNum)
          ? "未定价"
          : `${creditsNum.toFixed(2)}x`;
      return {
        id: m.id,
        name: m.name,
        owned_by: m.owned_by,
        credits: m.credits,
        creditsNum,
        creditsLabel,
      };
    });

    // 按倍率排序：免费优先，未定价排最后，中间按倍率升序
    enriched.sort((a, b) => {
      if (a.creditsNum === 0 && b.creditsNum !== 0) return -1;
      if (b.creditsNum === 0 && a.creditsNum !== 0) return 1;
      if (isNaN(a.creditsNum) && !isNaN(b.creditsNum)) return 1;
      if (!isNaN(a.creditsNum) && isNaN(b.creditsNum)) return -1;
      return a.creditsNum - b.creditsNum;
    });

    sendOk(reply, enriched);
  });
}

/**
 * 获取最便宜模型 ID（排除 credits 为空的模型）。
 * 免费模型（creditsNum === 0）优先返回，否则返回 creditsNum 最小的。
 * 返回 null 表示没有可用模型。
 */
export function getCheapestModel(): string | null {
  const candidates = MODELS.filter((m) => m.credits && m.credits.trim() !== "")
    .map((m) => ({ id: m.id, creditsNum: parseCredits(m.credits) }))
    .filter((m) => !isNaN(m.creditsNum));

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.creditsNum - b.creditsNum);
  return candidates[0].id;
}
