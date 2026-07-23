import { existsSync } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";
import { setupAdminAuth } from "./plugins/admin-auth.js";
import { authRoutes } from "./routes/admin/auth.js";
import { credentialRoutes } from "./routes/admin/credentials.js";
import { checkinRoutes } from "./routes/admin/checkin.js";
import { leaderboardRoutes } from "./routes/admin/leaderboard.js";
import { apiKeyRoutes } from "./routes/admin/api-keys.js";
import { quotaRoutes } from "./routes/admin/quota.js";
import { statsRoutes } from "./routes/admin/stats.js";
import { chatRoutes } from "./routes/chat.js";
import { modelRoutes, adminModelRoutes } from "./routes/models.js";
import { startScheduler, startLeaderboardScheduler } from "./services/scheduler.js";
import { loadStats, startPersistTimer } from "./services/usage-stats.js";
import { refreshModelsInBackground } from "./services/model-fetcher.js";

export async function createServer() {
  const app = Fastify({
    logger: false, // 使用 pino 自定义 logger
  });

  // CORS — 白名单来自 CORS_ORIGIN（逗号分隔）；未配置则不下发跨域头
  const corsOrigins = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  await app.register(cors, {
    origin: corsOrigins.length > 0 ? corsOrigins : false,
  });

  // multipart — 供凭证文件上传（限 1MB 单文件）
  await app.register(multipart, {
    limits: {
      fileSize: 1024 * 1024,
      files: 1,
    },
  });

  // Admin 路由 — scoped under /admin，强制 x-admin-token 鉴权
  await app.register(
    async (adminScope) => {
      setupAdminAuth(adminScope);
      await adminScope.register(authRoutes);
      await adminScope.register(credentialRoutes);
      await adminScope.register(checkinRoutes);
      await adminScope.register(leaderboardRoutes);
      await adminScope.register(apiKeyRoutes);
      await adminScope.register(quotaRoutes);
      await adminScope.register(statsRoutes);
    },
    { prefix: "/admin" }
  );

  // 模型列表 — 同样 /admin 前缀，但不做鉴权
  await app.register(adminModelRoutes, { prefix: "/admin" });

  // 公开路由
  await app.register(chatRoutes);
  await app.register(modelRoutes);

  // 健康检查
  app.get("/health", async () => ({ status: "ok" }));

  // 静态资源托管（Docker 场景 STATIC_DIR=/app/public；本机开发可指向 ../frontend/dist）
  const staticRoot = process.env.STATIC_DIR ?? join(process.cwd(), "public");
  if (existsSync(staticRoot)) {
    await app.register(fastifyStatic, {
      root: staticRoot,
      prefix: "/",
      decorateReply: false,
    });
    // SPA fallback：hash 路由下只对非 API 的 GET 请求回落 index.html
    app.setNotFoundHandler((req, reply) => {
      if (
        req.method === "GET" &&
        !req.url.startsWith("/admin") &&
        !req.url.startsWith("/v1") &&
        req.url !== "/health"
      ) {
        return reply.sendFile("index.html");
      }
      return reply
        .status(404)
        .send({ code: 404, message: "Not Found", data: null });
    });
    logger.info({ root: staticRoot }, "静态资源托管已启用");
  }

  return app;
}

export async function startServer() {
  const app = await createServer();

  try {
    await app.listen({ port: config.server.port, host: config.server.host });
    logger.info(
      `服务启动成功: http://${config.server.host}:${config.server.port}`
    );
    logger.info(
      `OpenAI 兼容端点: http://${config.server.host}:${config.server.port}/v1`
    );
    logger.info(
      `管理 API: http://${config.server.host}:${config.server.port}/admin/credentials`
    );
    logger.info(
      `签到 API: http://${config.server.host}:${config.server.port}/admin/checkin`
    );
    loadStats();
    startPersistTimer();
    refreshModelsInBackground();
    startScheduler();
    startLeaderboardScheduler();
  } catch (err) {
    logger.error({ err }, "服务启动失败");
    process.exit(1);
  }
}
