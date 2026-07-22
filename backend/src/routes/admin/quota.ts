import type { FastifyInstance } from "fastify";
import { getActive } from "../../services/credential-store.js";
import { queryQuota } from "../../services/proxy.js";
import { sendOk, sendFail } from "../../utils/envelope.js";
import { logger } from "../../utils/logger.js";

/** 配额便捷入口（注册在 /admin prefix scope 下） */
export async function quotaRoutes(app: FastifyInstance): Promise<void> {
  /** GET /quota — 查询当前活跃凭证额度 */
  app.get("/quota", async (_req, reply) => {
    const credential = getActive();
    if (!credential) {
      sendFail(reply, 404, "无活跃凭证");
      return;
    }
    try {
      const { raw, parsed } = await queryQuota(credential);
      sendOk(reply, {
        credentialId: credential.id,
        credentialName: credential.name,
        quota: { raw, parsed },
      });
    } catch (err) {
      logger.error({ err, credId: credential.id }, "活跃凭证额度查询失败");
      sendFail(reply, 502, `额度查询失败: ${(err as Error).message}`);
    }
  });
}
