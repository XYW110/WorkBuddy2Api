import { apiClient } from './client'
import type {
  ApiKey,
  CreateApiKeyBody,
  UpdateApiKeyBody,
  SuccessResponse,
  Paginated,
  PaginationQuery,
} from './types'

/** GET /admin/api-keys — 列表（key 已 mask，标准分页） */
export async function listApiKeys(
  q?: PaginationQuery,
): Promise<Paginated<ApiKey>> {
  const res = await apiClient.get<Paginated<ApiKey>>('/admin/api-keys', {
    params: q,
  })
  return res.data
}

/** POST /admin/api-keys — 创建；201 明文 key 一次 */
export async function createApiKey(body: CreateApiKeyBody): Promise<ApiKey> {
  const res = await apiClient.post<ApiKey>('/admin/api-keys', body)
  return res.data
}

/** PUT /admin/api-keys/:id — 至少提供 name 或 enabled 之一；返回已 mask 的 ApiKey */
export async function updateApiKey(
  id: string,
  body: UpdateApiKeyBody,
): Promise<ApiKey> {
  const res = await apiClient.put<ApiKey>(`/admin/api-keys/${id}`, body)
  return res.data
}

/** DELETE /admin/api-keys/:id — 撤销 */
export async function deleteApiKey(id: string): Promise<SuccessResponse> {
  const res = await apiClient.delete<SuccessResponse>(`/admin/api-keys/${id}`)
  return res.data
}
