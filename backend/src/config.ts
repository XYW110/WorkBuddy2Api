import { readFileSync } from "node:fs";
import { join } from "node:path";

interface ServerConfig {
  port: number;
  host: string;
}

interface LogConfig {
  level: string;
}

interface CodeBuddyConfig {
  baseUrl: string;
  domain: string;
}

interface CheckinConfig {
  enabled: boolean;
  hour: number;
  minute: number;
  runOnStartupIfMissed: boolean;
}

interface AppConfig {
  server: ServerConfig;
  log: LogConfig;
  codebuddy: CodeBuddyConfig;
  checkin: CheckinConfig;
}

const DEFAULT_CHECKIN: CheckinConfig = {
  enabled: false,
  hour: 9,
  minute: 5,
  runOnStartupIfMissed: true,
};

function loadConfig(): AppConfig {
  const configPath = join(process.cwd(), "config.json");
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return {
      server: parsed.server ?? { port: 11434, host: "127.0.0.1" },
      log: parsed.log ?? { level: "info" },
      codebuddy: parsed.codebuddy ?? {
        baseUrl: "https://copilot.tencent.com",
        domain: "www.codebuddy.cn",
      },
      checkin: { ...DEFAULT_CHECKIN, ...parsed.checkin },
    };
  } catch {
    // 默认配置
    return {
      server: { port: 11434, host: "127.0.0.1" },
      log: { level: "info" },
      codebuddy: {
        baseUrl: "https://copilot.tencent.com",
        domain: "www.codebuddy.cn",
      },
      checkin: { ...DEFAULT_CHECKIN },
    };
  }
}

export const config = loadConfig();
