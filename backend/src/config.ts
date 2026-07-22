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
  // env 优先于 config.json：PORT/HOST 覆盖 server 段
  const envPort = process.env.PORT ? Number(process.env.PORT) : undefined;
  const envHost = process.env.HOST;
  const server: ServerConfig = {
    port: envPort ?? fileConfig.server?.port ?? 11434,
    host: envHost ?? fileConfig.server?.host ?? "127.0.0.1",
  };
  return {
    server,
    log: fileConfig.log ?? { level: "info" },
    codebuddy: fileConfig.codebuddy ?? {
      baseUrl: "https://copilot.tencent.com",
      domain: "www.codebuddy.cn",
    },
    checkin: { ...DEFAULT_CHECKIN, ...fileConfig.checkin },
  };
}

export const config = loadConfig();
