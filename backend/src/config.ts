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
  let fileConfig: Partial<AppConfig> = {};
  try {
    const raw = readFileSync(configPath, "utf-8");
    fileConfig = JSON.parse(raw) as Partial<AppConfig>;
  } catch {
    // config.json 缺失时使用默认值
  }
  // server 和 log 走环境变量（12-factor），config.json 仅保留业务配置
  const server: ServerConfig = {
    port: process.env.PORT ? Number(process.env.PORT) : 11434,
    host: process.env.HOST ?? "127.0.0.1",
  };
  const log: LogConfig = {
    level: process.env.LOG_LEVEL ?? "info",
  };
  return {
    server,
    log,
    codebuddy: fileConfig.codebuddy ?? {
      baseUrl: "https://copilot.tencent.com",
      domain: "www.codebuddy.cn",
    },
    checkin: { ...DEFAULT_CHECKIN, ...fileConfig.checkin },
  };
}

export const config = loadConfig();
