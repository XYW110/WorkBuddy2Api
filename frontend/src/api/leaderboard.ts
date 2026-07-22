import { apiClient } from "./client";
import type { LeaderboardState } from "./types";

/** GET /admin/leaderboard — 查看当前经济别名指向与筛选结果 */
export async function getLeaderboard(): Promise<LeaderboardState> {
  const res = await apiClient.get<LeaderboardState>("/admin/leaderboard");
  return res.data;
}

/** POST /admin/leaderboard/refresh — 立即重新抓取+筛选+写入 */
export async function refreshLeaderboard(): Promise<LeaderboardState> {
  const res = await apiClient.post<LeaderboardState>("/admin/leaderboard/refresh");
  return res.data;
}
