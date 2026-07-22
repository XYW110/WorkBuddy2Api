import { homedir } from "node:os";
import { join } from "node:path";

/** CodeBuddy 桌面端凭证文件路径 (Windows) */
export function getCodeBuddyCredentialPath(): string {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    // 非 Windows 系统回退
    return join(
      homedir(),
      "CodeBuddyExtension",
      "Data",
      "Public",
      "auth",
      "workbuddy-desktop.info"
    );
  }
  return join(
    localAppData,
    "CodeBuddyExtension",
    "Data",
    "Public",
    "auth",
    "workbuddy-desktop.info"
  );
}

/** 凭证存储 JSON 文件路径 */
export function getCredentialStorePath(): string {
  const dataDir = process.env.DATA_DIR || join(process.cwd(), "data");
  return join(dataDir, "credentials.json");
}

/** 管理 API Key 存储 JSON 文件路径（与凭证存储分文件，避免概念混淆） */
export function getApiKeyStorePath(): string {
  const dataDir = process.env.DATA_DIR || join(process.cwd(), "data");
  return join(dataDir, "api-keys.json");
}

/** 签到历史存储 JSON 文件路径 */
export function getCheckinHistoryStorePath(): string {
  const dataDir = process.env.DATA_DIR || join(process.cwd(), "data");
  return join(dataDir, "checkin-history.json");
}

/** 生成 UUID v4 */
export function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
