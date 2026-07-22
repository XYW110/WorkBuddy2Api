import { apiClient } from './client'

/** GET /admin/auth/verify — 成功时 data 为 null */
export async function verifyAdminToken(): Promise<void> {
  await apiClient.get('/admin/auth/verify')
}
