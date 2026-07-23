/** API Key 调用统计相关类型 */

export interface UsageEntry {
  credentialId: string;
  credentialName: string;
  model: string;
  callCount: number;
  promptTokens: number;
  completionTokens: number;
}

export interface UsageStatsSnapshot {
  entries: Record<string, UsageEntry>; // key = `${credentialId}:${model}`
  updatedAt: string;
}

export interface UsageStatsResponse {
  entries: UsageEntry[];
  updatedAt: string;
}
