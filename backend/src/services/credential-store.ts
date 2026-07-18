import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { logger } from "../utils/logger.js";
import { getCredentialStorePath, generateId } from "../utils/env.js";
import type { Credential, CredentialStore } from "../types/credential.js";

let store: CredentialStore = { credentials: [], activeId: null };

/** 从 JSON 文件加载凭证存储 */
export function loadStore(): void {
  const filePath = getCredentialStorePath();
  if (existsSync(filePath)) {
    try {
      const raw = readFileSync(filePath, "utf-8");
      store = JSON.parse(raw) as CredentialStore;
      logger.info(`从 ${filePath} 加载了 ${store.credentials.length} 条凭证`);
    } catch (err) {
      logger.warn({ err }, "凭证存储文件解析失败，使用空存储");
    }
  }
}

/** 持久化到 JSON 文件 */
function persist(): void {
  const filePath = getCredentialStorePath();
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
}

/** 获取所有凭证 */
export function getAll(): Credential[] {
  return store.credentials;
}

/** 根据 id 获取凭证 */
export function getById(id: string): Credential | undefined {
  return store.credentials.find((c) => c.id === id);
}

/** 获取当前活跃凭证 */
export function getActive(): Credential | undefined {
  if (store.activeId) {
    return store.credentials.find((c) => c.id === store.activeId);
  }
  // 回退到第一个本地文件凭证
  return store.credentials.find((c) => c.type === "local-file");
}

/** 添加凭证 */
export function addCredential(input: {
  name: string;
  key: string;
}): Credential {
  const cred: Credential = {
    id: generateId(),
    name: input.name,
    type: "api-key",
    key: input.key,
    isActive: false,
    source: "manual",
  };

  // 如果是第一个手动凭证且没有活跃凭证，自动激活
  const hasActive = store.credentials.some((c) => c.isActive);
  if (!hasActive) {
    cred.isActive = true;
    store.activeId = cred.id;
  }

  store.credentials.push(cred);
  persist();
  logger.info({ name: input.name }, "添加凭证");
  return cred;
}

/** 删除凭证 */
export function removeCredential(id: string): boolean {
  const idx = store.credentials.findIndex((c) => c.id === id);
  if (idx === -1) return false;

  const removed = store.credentials[idx];

  // 不允许删除唯一的本地文件凭证
  if (removed.type === "local-file") {
    const localCount = store.credentials.filter(
      (c) => c.type === "local-file"
    ).length;
    if (localCount <= 1) {
      logger.warn("不允许删除唯一的本地文件凭证");
      return false;
    }
  }

  store.credentials.splice(idx, 1);
  if (store.activeId === id) {
    store.activeId = store.credentials[0]?.id ?? null;
    if (store.credentials[0]) {
      store.credentials[0].isActive = true;
    }
  }
  persist();
  logger.info({ id }, "删除凭证");
  return true;
}

/** 切换活跃凭证 */
export function activateCredential(id: string): boolean {
  const target = store.credentials.find((c) => c.id === id);
  if (!target) return false;

  // 取消所有活跃标记
  for (const c of store.credentials) {
    c.isActive = false;
  }
  target.isActive = true;
  store.activeId = id;
  persist();
  logger.info({ id, name: target.name }, "切换活跃凭证");
  return true;
}

/** 添加本地文件凭证（由 loader 调用，直接写入存储） */
export function addLocalCredential(cred: Credential): void {
  // 检查是否已存在同名本地文件凭证
  const existing = store.credentials.find(
    (c) => c.type === "local-file" && c.uid === cred.uid
  );
  if (existing) {
    // 更新 token（可能已刷新）
    existing.accessToken = cred.accessToken;
    if (cred.refreshToken) existing.refreshToken = cred.refreshToken;
    logger.info("更新本地文件凭证 token");
  } else {
    store.credentials.push(cred);
    if (!store.activeId) {
      store.activeId = cred.id;
    }
    logger.info("添加本地文件凭证");
  }
  persist();
}

/** 更新凭证的 token（accessToken + refreshToken），用于刷新后回写 */
export function updateCredentialToken(
  id: string,
  accessToken: string,
  refreshToken: string
): boolean {
  const cred = store.credentials.find((c) => c.id === id);
  if (!cred) return false;
  cred.accessToken = accessToken;
  cred.refreshToken = refreshToken;
  persist();
  logger.info({ id }, "凭证 token 已更新");
  return true;
}
