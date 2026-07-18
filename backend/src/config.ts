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

interface AppConfig {
  server: ServerConfig;
  log: LogConfig;
  codebuddy: CodeBuddyConfig;
}

function loadConfig(): AppConfig {
  const configPath = join(process.cwd(), "config.json");
  try {
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as AppConfig;
  } catch {
    // 默认配置
    return {
      server: { port: 11434, host: "127.0.0.1" },
      log: { level: "info" },
      codebuddy: {
        baseUrl: "https://copilot.tencent.com",
        domain: "www.codebuddy.cn",
      },
    };
  }
}

export const config = loadConfig();
