import { readFileSync, existsSync } from "node:fs";
import { logger } from "../utils/logger.js";
import { getCodeBuddyCredentialPath, generateId } from "../utils/env.js";
import type { Credential } from "../types/credential.js";

interface WorkBuddyInfo {
  auth?: {
    accessToken?: string;
    refreshToken?: string;
  };
  account?: {
    uid?: string;
  };
}

/** 从本地 workbuddy-desktop.info 加载凭证，失败返回 null */
export function loadLocalCredential(): Credential | null {
  const filePath = getCodeBuddyCredentialPath();

  if (!existsSync(filePath)) {
    logger.warn(`凭证文件不存在: ${filePath}`);
    return null;
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    const info: WorkBuddyInfo = JSON.parse(raw);

    const accessToken = info.auth?.accessToken;
    const refreshToken = info.auth?.refreshToken;
    const uid = info.account?.uid;

    if (!accessToken || !uid) {
      logger.warn("凭证文件内容不完整：缺少 accessToken 或 uid");
      return null;
    }

    logger.info("从本地文件加载 CodeBuddy 凭证成功");
    return {
      id: generateId(),
      name: "本地账号",
      type: "local-file",
      accessToken,
      refreshToken,
      uid,
      isActive: true,
      source: "auto-detected",
    };
  } catch (err) {
    logger.error({ err }, "解析凭证文件失败");
    return null;
  }
}
