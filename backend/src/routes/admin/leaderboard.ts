import type { FastifyInstance } from "fastify";
import { runLeaderboard, loadAlias } from "../../services/leaderboard/index.js";
import { logger } from "../../utils/logger.js";
import { sendOk, sendFail } from "../../utils/envelope.js";

/** 排行榜管理路由（注册在 /admin prefix scope 下，需 x-admin-token） */
export async function leaderboardRoutes(app: FastifyInstance): Promise<void> {
  /** GET /leaderboard — 查看当前经济别名指向与筛选结果 + 历史 */
  app.get("/leaderboard", async (_req, reply) => {
    const state = loadAlias();
    if (!state) {
      sendFail(reply, 404, "尚未生成排行榜筛选结果（请触发刷新或等待每日调度）");
      return;
    }
    sendOk(reply, state);
  });

  /** POST /leaderboard/refresh — 立即重新抓取+筛选+写入 */
  app.post("/leaderboard/refresh", async (_req, reply) => {
    try {
      logger.info("手动触发排行榜刷新");
      const state = await runLeaderboard();
      sendOk(reply, state);
    } catch (err) {
      logger.error({ err }, "排行榜刷新失败");
      sendFail(reply, 502, `排行榜刷新失败: ${(err as Error).message}`);
    }
  });
}
