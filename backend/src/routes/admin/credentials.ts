import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { Credential } from "../../types/credential.js";
import {
  getAll,
  getById,
  getActive,
  addCredential,
  removeCredential,
  activateCredential,
  addLocalCredential,
  getStore,
  importStore,
} from "../../services/credential-store.js";
import { queryQuota } from "../../services/proxy.js";
import { generateId } from "../../utils/env.js";
import { sendOk, sendCreated, sendFail } from "../../utils/envelope.js";
import { maskCredential } from "../../utils/mask.js";
import { parsePagination, paginate } from "../../utils/pagination.js";
import { logger } from "../../utils/logger.js";

/** 读取并解析上传的 JSON 文件（multipart 字段名: file）
 *  - 缺文件 → 422；超 1MB → 413；JSON 非法 → 422
 *  - 成功返回解析后的对象；失败时已回写 reply 并返回 null
 */
async function readUploadJson(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<unknown | null> {
  let fileBuffer: Buffer | null = null;
  try {
    const part = await req.file();
    if (!part) {
      sendFail(reply, 422, "缺少上传文件（字段名: file）");
      return null;
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
    return null;
  }

  try {
    return JSON.parse(fileBuffer.toString("utf-8"));
  } catch (err) {
    sendFail(reply, 422, `JSON 解析失败: ${(err as Error).message}`);
    return null;
  }
}

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
    const payload = await readUploadJson(req, reply);
    if (payload === null) return; // 错误已在 helper 内回写

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

  /** GET /credentials/export — 导出整库快照（含明文密钥，admin-only）
   *  - 返回 { credentials:[...], activeId } 原样 JSON，触发浏览器下载
   *  - 日志仅记条数，绝不打印明文
   */
  app.get("/credentials/export", async (_req, reply) => {
    const snapshot = getStore();
    logger.info(
      { count: snapshot.credentials.length, activeId: snapshot.activeId },
      "凭证快照已导出"
    );
    reply
      .header("Content-Type", "application/json")
      .header(
        "Content-Disposition",
        'attachment; filename="credentials-backup.json"'
      )
      .send(JSON.stringify(snapshot, null, 2));
  });

  /** POST /credentials/import — 导入整库快照（admin-only）
   *  - multipart 字段名: file
   *  - 文件结构: { credentials: Credential[], activeId?: string|null }
   *  - 按 id 合并去重（存在→更新，不存在→新增），并还原 activeId
   *  - 返回 { added, updated, activeId }
   */
  app.post("/credentials/import", async (req, reply) => {
    const payload = await readUploadJson(req, reply);
    if (payload === null) return;

    if (
      !payload ||
      typeof payload !== "object" ||
      !Array.isArray((payload as Record<string, unknown>).credentials)
    ) {
      sendFail(
        reply,
        422,
        "备份文件结构无效：需包含 credentials 数组（可含 activeId）"
      );
      return;
    }

    const snapshot = payload as {
      credentials: import("../../types/credential.js").Credential[];
      activeId?: string | null;
    };
    const { added, updated } = importStore({
      credentials: snapshot.credentials,
      activeId: snapshot.activeId ?? null,
    });

    sendOk(
      reply,
      { added, updated, activeId: getActive()?.id ?? null },
      `导入完成：新增 ${added}，更新 ${updated}`
    );
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
