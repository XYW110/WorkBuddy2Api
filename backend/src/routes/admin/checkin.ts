import type { FastifyInstance } from "fastify";
import { getActive, getById } from "../../services/credential-store.js";
import {
  runCheckin,
  runCheckinWithActive,
  getCheckinStatus,
} from "../../services/checkin.js";
import { listCheckinHistory } from "../../services/checkin-history-store.js";
import type { CheckinResult } from "../../types/checkin.js";
import { logger } from "../../utils/logger.js";
import { sendOk, sendFail } from "../../utils/envelope.js";
import { parsePagination, paginate } from "../../utils/pagination.js";

/** 签到管理路由（注册在 /admin prefix scope 下） */
export async function checkinRoutes(app: FastifyInstance): Promise<void> {
  /** POST /checkin — 手动触发签到（使用当前活跃凭证） */
  app.post("/checkin", async (_req, reply) => {
    try {
      const result: CheckinResult = await runCheckinWithActive();
      const status = result.success ? 200 : 502;
      sendOk(reply, result, "ok", status);
    } catch (err) {
      logger.error({ err }, "手动签到时发生异常");
      sendOk(
        reply,
        {
          success: false,
          skipped: false,
          reason: (err as Error).message,
          executedAt: new Date().toISOString(),
        },
        "签到异常",
        502
      );
    }
  });

  /** GET /checkin/status — 查看签到调度状态 */
  app.get("/checkin/status", async (_req, reply) => {
    const credential = getActive();
    if (!credential) {
      sendFail(reply, 404, "无活跃凭证");
      return;
    }
    try {
      const status = await getCheckinStatus(credential);
      sendOk(reply, {
        credentialId: credential.id,
        credentialName: credential.name,
        status: status.data,
        raw: status,
      });
    } catch (err) {
      // 直接返回错误，调用方可改用 POST /checkin 手动触发
      sendFail(reply, 502, `查询失败: ${(err as Error).message}`);
    }
  });

  /** GET /checkin/history — 签到历史（最新在前，分页） */
  app.get("/checkin/history", async (req, reply) => {
    const query = req.query as { page?: string; pageSize?: string };
    const { page, pageSize } = parsePagination(query.page, query.pageSize);
    const all = listCheckinHistory();
    const paged = paginate(all, page, pageSize);
    sendOk(reply, {
      items: paged.items,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
    });
  });

  /** POST /checkin/:id — 对指定凭证触发签到 */
  app.post("/checkin/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const credential = getById(id);
    if (!credential) {
      sendFail(reply, 404, "凭证不存在");
      return;
    }
    try {
      const result: CheckinResult = await runCheckin(credential);
      const status = result.success ? 200 : 502;
      sendOk(reply, result, "ok", status);
    } catch (err) {
      logger.error({ err, credId: id }, "指定凭证签到时发生异常");
      sendOk(
        reply,
        {
          success: false,
          skipped: false,
          reason: (err as Error).message,
          executedAt: new Date().toISOString(),
        },
        "签到异常",
        502
      );
    }
  });
}
