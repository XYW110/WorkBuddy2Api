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

/** 单个排行榜数据源配置 */
interface LeaderboardSourceConfig {
  /** 唯一名，primarySource 引用它 */
  name: string;
  /** 抓取 URL */
  url: string;
  /** 数据集类型：arena=竞技场排名（含 mu/rank）；spec=模型规格（含基准分/价格） */
  kind: "arena" | "spec";
  /** 是否启用该源（单源失败不影响其他源） */
  enabled: boolean;
}

interface LeaderboardConfig {
  /** 总开关，默认关闭，生产显式开启 */
  enabled: boolean;
  /** 每日定时小时（0-23） */
  hour: number;
  /** 每日定时分钟（0-59） */
  minute: number;
  /** 启动后若当日尚未跑则短延迟补跑 */
  runOnStartupIfMissed: boolean;
  /** 主源名（primarySource 必须匹配某个 source.name） */
  primarySource: string;
  /** 单源抓取超时（毫秒） */
  fetchTimeoutMs: number;
  /** 数据源列表 */
  sources: LeaderboardSourceConfig[];
}

interface AppConfig {
  server: ServerConfig;
  log: LogConfig;
  codebuddy: CodeBuddyConfig;
  checkin: CheckinConfig;
  leaderboard: LeaderboardConfig;
}

const DEFAULT_CHECKIN: CheckinConfig = {
  enabled: false,
  hour: 9,
  minute: 5,
  runOnStartupIfMissed: true,
};

const DEFAULT_LEADERBOARD: LeaderboardConfig = {
  enabled: false,
  hour: 3,
  minute: 0,
  runOnStartupIfMissed: true,
  primarySource: "llm-stats",
  fetchTimeoutMs: 15000,
  sources: [
    { name: "llm-stats", url: "https://llm-stats.com/leaderboards/llm-leaderboard", kind: "spec", enabled: true },
    { name: "artificial-analysis", url: "https://artificialanalysis.ai", kind: "spec", enabled: false },
    { name: "superclue", url: "https://www.superclueai.com", kind: "arena", enabled: false },
    { name: "lmarena", url: "https://arena.ai", kind: "arena", enabled: false },
    { name: "llmrank", url: "https://llmrank.top", kind: "arena", enabled: false },
  ],
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
    leaderboard: {
      ...DEFAULT_LEADERBOARD,
      ...fileConfig.leaderboard,
      sources: fileConfig.leaderboard?.sources ?? DEFAULT_LEADERBOARD.sources,
    },
  };
}

export const config = loadConfig();
