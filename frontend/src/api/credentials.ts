import { apiClient } from './client'
import type {
  Credential,
  CredentialListData,
  CreateCredentialBody,
  SuccessResponse,
  ActivateCredentialResult,
  AdminQuotaData,
  PaginationQuery,
} from './types'

/** GET /admin/credentials — 列表（字段已就地 mask，多 activeId） */
export async function listCredentials(
  q?: PaginationQuery,
): Promise<CredentialListData> {
  const res = await apiClient.get<CredentialListData>('/admin/credentials', {
    params: q,
  })
  return res.data
}

/** POST /admin/credentials — JSON 创建；201 明文一次 */
export async function createCredential(
  body: CreateCredentialBody,
): Promise<Credential> {
  const res = await apiClient.post<Credential>('/admin/credentials', body)
  return res.data
}

/** POST /admin/credentials/upload — multipart JSON 文件；201 明文一次
 *  注意：字段名必须为 file；禁止手动设 Content-Type（让浏览器带 boundary）。
 */
export async function uploadCredential(file: File): Promise<Credential> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await apiClient.post<Credential>('/admin/credentials/upload', fd)
  return res.data
}

/** DELETE /admin/credentials/:id — 唯一 local-file 时 409 */
export async function deleteCredential(id: string): Promise<SuccessResponse> {
  const res = await apiClient.delete<SuccessResponse>(`/admin/credentials/${id}`)
  return res.data
}

/** PUT /admin/credentials/:id/activate — 激活（POST 兼容存在） */
export async function activateCredential(
  id: string,
): Promise<ActivateCredentialResult> {
  const res = await apiClient.put<ActivateCredentialResult>(
    `/admin/credentials/${id}/activate`,
  )
  return res.data
}

/** GET /admin/credentials/:id/quota — 指定凭证额度（无 credentialName） */
export async function getCredentialQuota(
  id: string,
): Promise<AdminQuotaData> {
  const res = await apiClient.get<AdminQuotaData>(
    `/admin/credentials/${id}/quota`,
  )
  return res.data
}
