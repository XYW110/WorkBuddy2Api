import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getStats } from "../../services/usage-stats.js";
import { sendOk } from "../../utils/envelope.js";
import type { UsageStatsResponse } from "../../types/stats.js";

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/stats/usage",
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const entries = getStats();
      // 按 credentialId + model 排序
      entries.sort((a, b) =>
        a.credentialId.localeCompare(b.credentialId) ||
        a.model.localeCompare(b.model)
      );
      const data: UsageStatsResponse = {
        entries,
        updatedAt: new Date().toISOString(),
      };
      sendOk(reply, data);
    }
  );
}
