import type { FastifyInstance } from "fastify";
import { sendOk } from "../../utils/envelope.js";

/**
 * 管理员鉴权验证路由
 * 必须已在 admin scope 的 preHandler 中通过 x-admin-token 校验
 * 路径: /auth/verify (注册到 /admin prefix 下即为 /admin/auth/verify)
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get("/auth/verify", async (_req, reply) => {
    sendOk(reply, null, "Token 有效");
  });
}
