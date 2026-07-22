import "dotenv/config";
import { logger } from "../utils/logger.js";
import { loadStore, addLocalCredential } from "../services/credential-store.js";
import { loadLocalCredential } from "../services/credential-loader.js";
import { loadCheckinHistoryStore } from "../services/checkin-history-store.js";
import { runCheckinWithActive } from "../services/checkin.js";

async function main(): Promise<void> {
  logger.info("=== run-checkin-once 调试脚本启动 ===");

  loadStore();
  loadCheckinHistoryStore();

  const localCred = loadLocalCredential();
  if (localCred) {
    addLocalCredential(localCred);
  } else {
    logger.warn("未找到本地凭证文件，无法签到");
    process.exitCode = 2;
    return;
  }

  const result = await runCheckinWithActive("script");
  logger.info({ result }, "签到执行结果");

  // success=true （含 skipped=true 的「今日已签」）视为退出码 0
  process.exitCode = result.success ? 0 : 1;
}

main().catch((err) => {
  logger.error({ err }, "run-checkin-once 异常");
  process.exitCode = 1;
});
