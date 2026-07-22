import type { FastifyInstance } from "fastify";
import {
  listApiKeys,
  getApiKeyById,
  createApiKey,
  updateApiKey,
  removeApiKey,
} from "../../services/api-key-store.js";
import { sendOk, sendCreated, sendFail } from "../../utils/envelope.js";
import { maskSecret } from "../../utils/mask.js";
import { parsePagination, paginate } from "../../utils/pagination.js";
import { logger } from "../../utils/logger.js";

/** 管理 API Key 路由（注册在 /admin prefix scope 下）
 *  注意：此处的 key 是客户端访问 /v1 的 sk- key，与 credentials 中 type=api-key 的 ck_ 凭证严格区分。
 */
export async function apiKeyRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api-keys — 列表（脱敏 + 分页） */
  app.get("/api-keys", async (req, reply) => {
    const query = req.query as { page?: string; pageSize?: string };
    const { page, pageSize } = parsePagination(query.page, query.pageSize);
    const all = listApiKeys().map((k) => ({
      ...k,
      key: maskSecret(k.key) ?? "****",
    }));
    const paged = paginate(all, page, pageSize);
    sendOk(reply, {
      items: paged.items,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
    });
  });

  /** POST /api-keys — 创建；201 明文 key 一次 */
  app.post("/api-keys", async (req, reply) => {
    const body = req.body as { name?: string };
    if (!body?.name || typeof body.name !== "string" || !body.name.trim()) {
      sendFail(reply, 422, "缺少必填字段: name");
      return;
    }
    const created = createApiKey({ name: body.name.trim() });
    logger.info({ id: created.id, name: created.name }, "管理 API Key 已创建");
    sendCreated(reply, created, "API Key 创建成功，请妥善保存（仅此一次明文）");
  });

  /** PUT /api-keys/:id — 更新 name / enabled */
  app.put("/api-keys/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; enabled?: boolean };
    if (body.name === undefined && body.enabled === undefined) {
      sendFail(reply, 422, "至少提供 name 或 enabled 之一");
      return;
    }
    if (!getApiKeyById(id)) {
      sendFail(reply, 404, "API Key 不存在");
      return;
    }
    const updated = updateApiKey(id, {
      name: body.name,
      enabled: body.enabled,
    });
    if (!updated) {
      sendFail(reply, 404, "API Key 不存在");
      return;
    }
    sendOk(
      reply,
      { ...updated, key: maskSecret(updated.key) ?? "****" },
      "API Key 已更新"
    );
  });

  /** DELETE /api-keys/:id — 撤销 */
  app.delete("/api-keys/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!getApiKeyById(id)) {
      sendFail(reply, 404, "API Key 不存在");
      return;
    }
    removeApiKey(id);
    sendOk(reply, { success: true }, "API Key 已删除");
  });
}
