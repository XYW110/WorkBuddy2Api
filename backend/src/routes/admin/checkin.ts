import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as store from "../../services/credential-store.js";
import {
  getCheckinStatus,
  runCheckin,
  runCheckinWithActive,
} from "../../services/checkin.js";
import { logger } from "../../utils/logger.js";

export async function checkinRoutes(app: FastifyInstance): Promise<void> {
  /** 手动执行完整签到流程 */
  app.post(
    "/admin/checkin",
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await runCheckinWithActive();
        const status = result.success ? 200 : 502;
        return reply.status(status).send(result);
      } catch (err: any) {
        logger.error({ err }, "手动签到失败");
        return reply.status(502).send({
          success: false,
          skipped: false,
          reason: err.message,
          executedAt: new Date().toISOString(),
        });
      }
    }
  );

  /** 仅查询签到状态，不执行签到 */
  app.get(
    "/admin/checkin/status",
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const credential = store.getActive();
      if (!credential) {
        return reply.status(404).send({ error: "无活跃凭证" });
      }

      try {
        const status = await getCheckinStatus(credential);
        return reply.send({
          credentialId: credential.id,
          credentialName: credential.name,
          status: status.data,
          raw: status,
        });
      } catch (err: any) {
        // 401 时尝试让 runCheckin 的刷新路径覆盖；这里状态查询单独重试一次 runCheckin 不合适
        // 直接返回错误，调用方可改用 POST /admin/checkin
        logger.error({ err }, "查询签到状态失败");
        return reply.status(502).send({ error: `查询失败: ${err.message}` });
      }
    }
  );

  /** 对指定凭证执行签到 */
  app.post(
    "/admin/checkin/:id",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const credential = store.getById(id);
      if (!credential) {
        return reply.status(404).send({ error: "凭证不存在" });
      }

      try {
        const result = await runCheckin(credential);
        const status = result.success ? 200 : 502;
        return reply.status(status).send(result);
      } catch (err: any) {
        logger.error({ err, id }, "指定凭证签到失败");
        return reply.status(502).send({
          success: false,
          skipped: false,
          reason: err.message,
          executedAt: new Date().toISOString(),
        });
      }
    }
  );
}
