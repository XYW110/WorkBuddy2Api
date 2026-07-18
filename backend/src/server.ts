import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";
import { credentialRoutes } from "./routes/admin/credentials.js";
import { chatRoutes } from "./routes/chat.js";
import { modelRoutes } from "./routes/models.js";

export async function createServer() {
  const app = Fastify({
    logger: false, // 使用 pino 自定义 logger
  });

  // CORS — 允许本地客户端访问
  await app.register(cors, {
    origin: true,
  });

  // 注册路由
  await app.register(credentialRoutes);
  await app.register(chatRoutes);
  await app.register(modelRoutes);

  // 健康检查
  app.get("/health", async () => ({ status: "ok" }));

  return app;
}

export async function startServer() {
  const app = await createServer();

  try {
    await app.listen({ port: config.server.port, host: config.server.host });
    logger.info(`服务启动成功: http://${config.server.host}:${config.server.port}`);
    logger.info(`OpenAI 兼容端点: http://${config.server.host}:${config.server.port}/v1`);
    logger.info(`管理 API: http://${config.server.host}:${config.server.port}/admin/credentials`);
  } catch (err) {
    logger.error({ err }, "服务启动失败");
    process.exit(1);
  }
}
