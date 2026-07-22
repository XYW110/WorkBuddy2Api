/** 额度解析类型定义 */

/** 上游额度 API 返回的单个资源包 */
export interface QuotaResourceItem {
  /** 资源包 ID */
  resourceId: string
  /** 状态：0=可用, 3=已用完 */
  status: number
  /** 总量 */
  packageTotal: string
  /** 已使用 */
  packageUsed: string
  /** 剩余 */
  packageRemaining: string
  /** 过期时间 */
  expireTime: string
  /** 资源包名称 */
  packageName?: string
}

/** 解析后的额度结构化数据 */
export interface QuotaParsed {
  /** 资源包总数 */
  totalCount: number
  /** 资源包列表 */
  resources: QuotaResourceItem[]
  /** 已使用总计（字符串形式，保留原始精度） */
  totalUsed: string
  /** 剩余总计 */
  totalRemaining: string
  /** 总量总计 */
  totalAmount: string
}