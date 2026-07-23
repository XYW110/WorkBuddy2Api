import { apiClient } from "./client";
import type { UsageStatsResponse } from "./types";

/** GET /admin/stats/usage */
export async function fetchUsageStats(): Promise<UsageStatsResponse> {
  const res = await apiClient.get<UsageStatsResponse>("/admin/stats/usage");
  return res.data;
}
