import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { OpenAIModelList } from "../types/openai.js";
import { sendOk } from "../utils/envelope.js";
import { MODELS, parseCredits } from "../model-catalog.js";

export { getCheapestModel } from "../model-catalog.js";

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
    const data: OpenAIModelList = {
      object: "list",
      data: [
        ...virtual,
        ...MODELS.map((m) => ({
          id: m.id,
          object: "model" as const,
          created: 1728000000,
          owned_by: m.owned_by,
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
