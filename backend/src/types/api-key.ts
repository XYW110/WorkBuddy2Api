/** 管理 API Key：客户端访问 /v1 的鉴权 Key（与 CodeBuddy ck_ 凭证严格区分） */
export interface ApiKey {
  id: string;
  /** 客户端可见名称，用于识别调用方 */
  name: string;
  /** 完整 key，前缀 sk-，仅创建时明文返回一次 */
  key: string;
  /** 是否启用，禁用后 /v1 拒绝 */
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** api-keys 存储结构 */
export interface ApiKeyStore {
  keys: ApiKey[];
}
