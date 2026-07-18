import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as store from "../../services/credential-store.js";
import { queryQuota } from "../../services/proxy.js";
import { logger } from "../../utils/logger.js";

interface AddBody {
  name: string;
  key: string;
}

export async function credentialRoutes(app: FastifyInstance): Promise<void> {
  // 列出所有凭证
  app.get(
    "/admin/credentials",
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const creds = store.getAll();
      return reply.send({
        credentials: creds,
        activeId: store.getActive()?.id ?? null,
      });
    }
  );

  // 添加凭证
  app.post(
    "/admin/credentials",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { name, key } = req.body as AddBody;
      if (!name || !key) {
        return reply.status(400).send({ error: "name 和 key 为必填字段" });
      }
      const cred = store.addCredential({ name, key });
      return reply.status(201).send(cred);
    }
  );

  // 删除凭证
  app.delete(
    "/admin/credentials/:id",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const ok = store.removeCredential(id);
      if (!ok) {
        return reply.status(404).send({ error: "凭证不存在或不允许删除" });
      }
      return reply.send({ success: true });
    }
  );

  // 切换活跃凭证
  app.put(
    "/admin/credentials/:id/activate",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const ok = store.activateCredential(id);
      if (!ok) {
        return reply.status(404).send({ error: "凭证不存在" });
      }
      return reply.send({ success: true, activeId: id });
    }
  );

  // 查询凭证额度
  app.get(
    "/admin/credentials/:id/quota",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const cred = store.getById(id);
      if (!cred) {
        return reply.status(404).send({ error: "凭证不存在" });
      }

      try {
        const quota = await queryQuota(cred);
        return reply.send({ credentialId: id, quota });
      } catch (err: any) {
        logger.error({ err, credentialId: id }, "额度查询失败");
        return reply.status(502).send({ error: `额度查询失败: ${err.message}` });
      }
    }
  );
}
