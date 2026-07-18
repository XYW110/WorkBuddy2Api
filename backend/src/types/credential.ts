/** 凭证来源类型 */
export type CredentialType = "local-file" | "api-key";

/** 单条凭证结构 */
export interface Credential {
  id: string;
  name: string;
  type: CredentialType;
  /** 适用于 local-file 类型：JWT accessToken */
  accessToken?: string;
  /** 适用于 local-file 类型：长期 refreshToken（用于续期） */
  refreshToken?: string;
  /** 适用于 local-file 类型：用户 uid */
  uid?: string;
  /** 适用于 api-key 类型：ck_xxx 格式的 key */
  key?: string;
  /** 是否当前活跃凭证 */
  isActive: boolean;
  /** 来源标记 */
  source?: string;
}

/** 凭证存储的数据结构 */
export interface CredentialStore {
  credentials: Credential[];
  activeId: string | null;
}
