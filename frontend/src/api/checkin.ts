import { apiClient } from './client'
import type {
  CheckinResult,
  CheckinStatusData,
  CheckinHistoryRecord,
  Paginated,
  PaginationQuery,
} from './types'

/**
 * POST /admin/checkin — 手动签到（活跃凭证）
 * 签到失败时后端 HTTP 502 + envelope code=502，client 会 reject ApiError，
 * ApiError 仅保留 code/message，可能丢失 CheckinResult 详情。
 * 页面可 catch 后用 message 展示；需要 partial result 再增强 client。
 */
export async function runCheckin(): Promise<CheckinResult> {
  const res = await apiClient.post<CheckinResult>('/admin/checkin')
  return res.data
}

/** POST /admin/checkin/:id — 指定凭证签到 */
export async function runCheckinById(id: string): Promise<CheckinResult> {
  const res = await apiClient.post<CheckinResult>(`/admin/checkin/${id}`)
  return res.data
}

/** GET /admin/checkin/status — 当前活跃凭证签到状态 */
export async function getCheckinStatus(): Promise<CheckinStatusData> {
  const res = await apiClient.get<CheckinStatusData>('/admin/checkin/status')
  return res.data
}

/** GET /admin/checkin/history — 签到历史（最新在前，分页） */
export async function listCheckinHistory(
  q?: PaginationQuery,
): Promise<Paginated<CheckinHistoryRecord>> {
  const res = await apiClient.get<Paginated<CheckinHistoryRecord>>(
    '/admin/checkin/history',
    { params: q },
  )
  return res.data
}
