import type { FastifyInstance } from "fastify";
import type { Credential } from "../../types/credential.js";
import {
  getAll,
  getById,
  getActive,
  addCredential,
  removeCredential,
  activateCredential,
  addLocalCredential,
} from "../../services/credential-store.js";
import { queryQuota } from "../../services/proxy.js";
import { generateId } from "../../utils/env.js";
import { sendOk, sendCreated, sendFail } from "../../utils/envelope.js";
import { maskCredential } from "../../utils/mask.js";
import { parsePagination, paginate } from "../../utils/pagination.js";
import { logger } from "../../utils/logger.js";

/** 凭据上传/创建载荷的统一校验与构造逻辑 */
function createCredentialFromPayload(input: {
  name?: string;
  type?: string;
  accessToken?: string;
  refreshToken?: string;
  uid?: string;
  source?: string;
  key?: string;
}):
  | { ok: true; cred: Credential; message: string }
  | { ok: false; status: number; message: string } {
  const type = input.type ?? "api-key";

  if (type === "local-file") {
    if (
      !input.name ||
      !input.accessToken ||
      !input.refreshToken ||
      !input.uid
    ) {
      return {
        ok: false,
        status: 422,
        message: "缺少必填字段: name, accessToken, refreshToken, uid",
      };
    }
    const cred: Credential = {
      id: generateId(),
      type: "local-file",
      name: input.name,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      uid: input.uid,
      source: input.source ?? "manual",
      isActive: false,
    };
    addLocalCredential(cred);
    return { ok: true, cred, message: "凭证添加成功" };
  }

  if (type === "api-key") {
    if (!input.name || !input.key) {
      return { ok: false, status: 422, message: "缺少必填字段: name, key" };
    }
    const cred = addCredential({ name: input.name, key: input.key });
    return { ok: true, cred, message: "凭证添加成功" };
  }

  return { ok: false, status: 422, message: `不支持的凭证类型: ${type}` };
}

/** 凭据管理路由（注册在 /admin prefix scope 下） */
export async function credentialRoutes(app: FastifyInstance): Promise<void> {
  /** GET /credentials — 列出所有凭证（敏感字段脱敏，分页） */
  app.get("/credentials", async (req, reply) => {
    const query = req.query as { page?: string; pageSize?: string };
    const { page, pageSize } = parsePagination(query.page, query.pageSize);
    const creds = getAll();
    const masked = creds.map(maskCredential);
    const paged = paginate(masked, page, pageSize);
    sendOk(reply, {
      items: paged.items,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
      activeId: getActive()?.id ?? null,
    });
  });

  /** POST /credentials — 添加新凭证（JSON body）
   *  注意：成功响应一次性返回明文敏感字段（D5），之后列表/详情均脱敏。
   */
  app.post("/credentials", async (req, reply) => {
    const body = req.body as {
      name?: string;
      type?: string;
      accessToken?: string;
      refreshToken?: string;
      uid?: string;
      source?: string;
      key?: string;
    };

    const result = createCredentialFromPayload(body);
    if (!result.ok) {
      sendFail(reply, result.status, result.message);
      return;
    }
    logger.info(
      { credId: result.cred.id, name: result.cred.name },
      "凭证已添加"
    );
    sendCreated(reply, result.cred, result.message);
  });

  /** POST /credentials/upload — multipart/form-data JSON 文件上传（D5）
   *  - 字段名: file（首选）；兼容 credential / credentials
   *  - 文件内容为 JSON，结构同 POST /credentials body
   *  - 成功 201 + 一次明文；缺文件/JSON 非法 → 422；超 1MB → 413
   */
  app.post("/credentials/upload", async (req, reply) => {
    let fileBuffer: Buffer | null = null;
    try {
      const part = await req.file();
      if (!part) {
        sendFail(reply, 422, "缺少上传文件（字段名: file）");
        return;
      }
      fileBuffer = await part.toBuffer();
    } catch (err) {
      const msg = (err as Error).message ?? "";
      // @fastify/multipart 超限会抛出含 file too large / FST_REQ_FILE_TOO_LARGE 的错误
      if (msg.includes("too large") || msg.includes("FST_REQ_FILE_TOO_LARGE")) {
        sendFail(reply, 413, "上传文件过大（限制 1MB）");
      } else {
        logger.error({ err }, "凭证上传读取失败");
        sendFail(reply, 422, `上传文件读取失败: ${msg}`);
      }
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(fileBuffer.toString("utf-8"));
    } catch (err) {
      sendFail(reply, 422, `JSON 解析失败: ${(err as Error).message}`);
      return;
    }

    if (!payload || typeof payload !== "object") {
      sendFail(reply, 422, "上传内容必须是 JSON 对象");
      return;
    }

    const result = createCredentialFromPayload(
      payload as Record<string, string>
    );
    if (!result.ok) {
      sendFail(reply, result.status, result.message);
      return;
    }

    logger.info(
      { credId: result.cred.id, name: result.cred.name },
      "凭证已上传并添加"
    );
    sendCreated(reply, result.cred, "凭证上传成功");
  });

  /** DELETE /credentials/:id — 删除指定凭证
   *  - 不存在：404
   *  - 唯一 local-file 不可删：409
   */
  app.delete("/credentials/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = getById(id);
    if (!existing) {
      sendFail(reply, 404, "凭证不存在");
      return;
    }
    if (existing.type === "local-file") {
      const localCount = getAll().filter((c) => c.type === "local-file").length;
      if (localCount <= 1) {
        sendFail(reply, 409, "不允许删除唯一的本地文件凭证");
        return;
      }
    }
    const removed = removeCredential(id);
    if (!removed) {
      sendFail(reply, 404, "凭证不存在");
      return;
    }
    sendOk(reply, { success: true }, "凭证已删除");
  });

  /** PUT /credentials/:id/activate — 激活指定凭证（RESTful 语义）
   *  保留 POST 兼容旧调用。
   */
  app.put("/credentials/:id/activate", async (req, reply) => {
    const { id } = req.params as { id: string };
    const activated = activateCredential(id);
    if (!activated) {
      sendFail(reply, 404, "凭证不存在");
      return;
    }
    logger.info({ credId: id }, "凭证已激活");
    sendOk(reply, { success: true, activeId: id }, "凭证已激活");
  });

  // 兼容：POST /credentials/:id/activate
  app.post("/credentials/:id/activate", async (req, reply) => {
    const { id } = req.params as { id: string };
    const activated = activateCredential(id);
    if (!activated) {
      sendFail(reply, 404, "凭证不存在");
      return;
    }
    logger.info({ credId: id }, "凭证已激活（POST 兼容）");
    sendOk(reply, { success: true, activeId: id }, "凭证已激活");
  });

  /** GET /credentials/:id/quota — 查询指定凭证的额度 */
  app.get("/credentials/:id/quota", async (req, reply) => {
    const { id } = req.params as { id: string };
    const credential = getById(id);
    if (!credential) {
      sendFail(reply, 404, "凭证不存在");
      return;
    }
    try {
      const { raw, parsed } = await queryQuota(credential);
      sendOk(reply, { credentialId: id, quota: { raw, parsed } });
    } catch (err) {
      logger.error({ err, credId: id }, "额度查询失败");
      sendFail(reply, 502, `额度查询失败: ${(err as Error).message}`);
    }
  });
}
