/**
 * 敏感字段脱敏工具：保留首尾各 4 字符，中间用 **** 替换。
 * - 长度 <= 8 直接返回 ****
 * - 空值原样返回（undefined / null / ""）
 */
export function maskSecret(value: string | undefined | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
}

/**
 * 脱敏 Credential 的敏感字段（accessToken / refreshToken / key）。
 * 保留其他字段原样，返回新对象（不修改入参）。
 */
export function maskCredential<T extends {
  accessToken?: string;
  refreshToken?: string;
  key?: string;
}>(cred: T): T {
  return {
    ...cred,
    accessToken: maskSecret(cred.accessToken),
    refreshToken: maskSecret(cred.refreshToken),
    key: cred.key ? maskSecret(cred.key) : undefined,
  };
}
