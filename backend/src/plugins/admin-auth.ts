import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { sendFail } from "../utils/envelope.js";

/** 常量时间比较，防止时序攻击 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return timingSafeEqual(bufA, bufB);
}

/**
 * 在当前 Fastify scope 上设置管理员鉴权 preHandler 钩子
 * - 若 ADMIN_TOKEN 未配置 → 503 拒绝所有请求
 * - 若 token 不匹配 → 401
 * - 匹配 → 放行
 *
 * 应在注册 admin 子路由前调用，以便钩子对所有子路由生效。
 */
export function setupAdminAuth(app: FastifyInstance): void {
  const adminToken = process.env.ADMIN_TOKEN;

  if (!adminToken) {
    app.addHook("preHandler", async (_req: FastifyRequest, reply: FastifyReply) => {
      sendFail(reply, 503, "ADMIN_TOKEN 未配置，管理接口已禁用");
    });
    return;
  }

  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.headers["x-admin-token"] as string | undefined;
    if (!token || !constantTimeCompare(token, adminToken)) {
      sendFail(reply, 401, "未授权：管理员 Token 无效或缺失");
    }
  });
}
