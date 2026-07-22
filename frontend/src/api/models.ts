import { apiClient } from './client'
import type { ModelInfo } from './types'

/** GET /admin/models — 获取所有可用模型列表（无需鉴权，后端已排序） */
export async function getModels(): Promise<ModelInfo[]> {
  const res = await apiClient.get<ModelInfo[]>('/admin/models')
  return res.data
}