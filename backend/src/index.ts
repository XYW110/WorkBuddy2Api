import "dotenv/config";
import { logger } from "./utils/logger.js";
import { loadLocalCredential } from "./services/credential-loader.js";
import { loadStore, addLocalCredential } from "./services/credential-store.js";
import { loadApiKeyStore } from "./services/api-key-store.js";
import { loadCheckinHistoryStore } from "./services/checkin-history-store.js";
import { startServer } from "./server.js";

async function main() {
  logger.info("=== WorkBuddy2Api 启动中 ===");

  // 1. 加载凭证存储、管理 API Key 与签到历史
  loadStore();
  loadApiKeyStore();
  loadCheckinHistoryStore();

  // 2. 尝试从本地文件加载凭证
  const localCred = loadLocalCredential();
  if (localCred) {
    addLocalCredential(localCred);
  } else {
    logger.warn("未找到本地凭证文件，可通过管理 API 手动添加 ck_xxx key");
  }

  // 3. 启动服务器
  await startServer();
}

main().catch((err) => {
  logger.error({ err }, "启动失败");
  process.exit(1);
});
