import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { OpenAIModelList } from "../types/openai.js";
import { sendOk } from "../utils/envelope.js";
import { parseCredits } from "../model-catalog.js";
import { getModels } from "../services/model-fetcher.js";

/** 动态取最经济模型（基于最新拉取的模型列表） */
export function getCheapestModel(): string | null {
  const candidates = getModels()
    .filter((m) => m.credits && m.credits.trim() !== "")
    .map((m) => ({ id: m.id, creditsNum: parseCredits(m.credits) }))
    .filter((m) => !isNaN(m.creditsNum));

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.creditsNum - b.creditsNum);
  return candidates[0].id;
}

export async function modelRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/models", async (_req: FastifyRequest, reply: FastifyReply) => {
    // 虚拟经济别名：每日由排行榜筛选自动指向实际模型
    const virtual: OpenAIModelList["data"] = [
      {
        id: "auto-cheapest",
        object: "model" as const,
        created: 1728000000,
        owned_by: "workbuddy",
      },
    ];
    const models = getModels();
    const data: OpenAIModelList = {
      object: "list",
      data: [
        ...virtual,
        ...models.map((m) => ({
          id: m.id,
          object: "model" as const,
          created: 1728000000,
          owned_by: m.owned_by,
          description: m.descriptionZh ?? undefined,
          // 上游能力/额度元数据（OpenAI 标准外扩展字段）
          descriptionZh: m.descriptionZh ?? undefined,
          credits: m.credits || undefined,
          maxAllowedSize: m.maxAllowedSize,
          maxInputTokens: m.maxInputTokens,
          maxOutputTokens: m.maxOutputTokens,
          supportsImages: m.supportsImages,
          supportsToolCall: m.supportsToolCall,
          supportsReasoning: m.supportsReasoning,
          isDefault: m.isDefault,
          tags: m.tags,
        })),
      ],
    };
    return reply.send(data);
  });
}

/** 管理后台模型列表，包含倍率等附加信息 */
export async function adminModelRoutes(app: FastifyInstance): Promise<void> {
  // 注意：server.ts 注册时已加 prefix: "/admin"，此处只需 "/models"
  app.get("/models", async (_req: FastifyRequest, reply: FastifyReply) => {
    const models = getModels();
    const enriched = models.map((m) => {
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
        descriptionZh: m.descriptionZh ?? "",
        maxAllowedSize: m.maxAllowedSize ?? null,
        maxInputTokens: m.maxInputTokens ?? null,
        maxOutputTokens: m.maxOutputTokens ?? null,
        supportsImages: m.supportsImages ?? false,
        supportsToolCall: m.supportsToolCall ?? false,
        supportsReasoning: m.supportsReasoning ?? false,
        isDefault: m.isDefault ?? false,
        tags: m.tags ?? [],
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
