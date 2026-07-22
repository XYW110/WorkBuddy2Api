import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { logger } from "../utils/logger.js";
import { getApiKeyStorePath, generateId } from "../utils/env.js";
import type { ApiKey, ApiKeyStore } from "../types/api-key.js";

let store: ApiKeyStore = { keys: [] };

/** 从 JSON 文件加载管理 API Key 存储 */
export function loadApiKeyStore(): void {
  const filePath = getApiKeyStorePath();
  if (existsSync(filePath)) {
    try {
      const raw = readFileSync(filePath, "utf-8");
      store = JSON.parse(raw) as ApiKeyStore;
      if (!Array.isArray(store.keys)) {
        store = { keys: [] };
      }
      logger.info(`从 ${filePath} 加载了 ${store.keys.length} 条管理 API Key`);
    } catch (err) {
      logger.warn({ err }, "api-keys 存储文件解析失败，使用空存储");
      store = { keys: [] };
    }
  } else {
    // 首次启动时自动创建空存储文件
    persist();
    logger.info(`已初始化 api-keys 存储文件: ${filePath}`);
  }
}

function persist(): void {
  const filePath = getApiKeyStorePath();
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
}

/** 生成 sk- 前缀的随机 key（区别于 CodeBuddy 的 ck_） */
function generateApiKeyValue(): string {
  return `sk-${randomBytes(24).toString("hex")}`;
}

export function listApiKeys(): ApiKey[] {
  return store.keys;
}

export function getApiKeyById(id: string): ApiKey | undefined {
  return store.keys.find((k) => k.id === id);
}

/** 按明文 key 查找（供 /v1 校验预留） */
export function findApiKeyByKey(key: string): ApiKey | undefined {
  return store.keys.find((k) => k.key === key);
}

export function createApiKey(input: { name: string }): ApiKey {
  const now = new Date().toISOString();
  const item: ApiKey = {
    id: generateId(),
    name: input.name,
    key: generateApiKeyValue(),
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
  store.keys.push(item);
  persist();
  logger.info({ id: item.id, name: item.name }, "创建管理 API Key");
  return item;
}

export function updateApiKey(
  id: string,
  patch: { name?: string; enabled?: boolean }
): ApiKey | undefined {
  const target = store.keys.find((k) => k.id === id);
  if (!target) return undefined;
  if (patch.name !== undefined) target.name = patch.name;
  if (patch.enabled !== undefined) target.enabled = patch.enabled;
  target.updatedAt = new Date().toISOString();
  persist();
  logger.info({ id, name: target.name }, "更新管理 API Key");
  return target;
}

export function removeApiKey(id: string): boolean {
  const idx = store.keys.findIndex((k) => k.id === id);
  if (idx === -1) return false;
  store.keys.splice(idx, 1);
  persist();
  logger.info({ id }, "删除管理 API Key");
  return true;
}
