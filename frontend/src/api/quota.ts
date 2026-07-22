import { apiClient } from './client'
import type { AdminQuotaData } from './types'

/** GET /admin/quota — 当前活跃凭证额度（含 credentialName）；无活跃凭证 404 */
export async function getActiveQuota(): Promise<AdminQuotaData> {
  const res = await apiClient.get<AdminQuotaData>('/admin/quota')
  return res.data
}
