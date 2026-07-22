import "dotenv/config";
import { logger } from "../utils/logger.js";
import { runLeaderboard } from "../services/leaderboard/index.js";

async function main(): Promise<void> {
  logger.info("=== run-leaderboard-once 手动触发排行榜筛选 ===");
  const state = await runLeaderboard();
  logger.info(
    {
      selectedModelId: state.selectedModelId,
      tier: state.tier,
      reason: state.reason,
      usedSources: state.usedSources,
    },
    "排行榜筛选完成"
  );
  process.exitCode = state.selectedModelId ? 0 : 1;
}

main().catch((err) => {
  logger.error({ err }, "run-leaderboard-once 异常");
  process.exitCode = 1;
});
