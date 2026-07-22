/**
 * dev.js — 零依赖一键启动前后端开发服务器
 *
 * 用法：
 *   node scripts/dev.js         在根目录运行
 *   npm run dev                 配合根 package.json 使用
 *
 * 功能：
 *   1. 启动前检查 node_modules 和 .env
 *   2. 并行启动 backend（npm run dev）和 frontend（npm run dev）
 *   3. 实时转发 stdout/stderr，带彩色前缀
 *   4. Ctrl+C 优雅退出，超时 5s 强制 kill
 */

const { spawn } = require("child_process");
const path = require("path");

// 颜色常量
const C_RESET = "\x1b[0m";
const C_CYAN = "\x1b[36m";
const C_GREEN = "\x1b[32m";
const C_YELLOW = "\x1b[33m";
const C_RED = "\x1b[31m";

const ROOT = path.resolve(__dirname, "..");
const BACKEND_DIR = path.join(ROOT, "backend");
const FRONTEND_DIR = path.join(ROOT, "frontend");
const isWindows = process.platform === "win32";

/** 打印带颜色的前缀行 */
function prefixLog(prefix, color, text) {
  process.stdout.write(`${color}[${prefix}]${C_RESET} ${text}`);
}

/** 启动前环境检查，返回 false 表示有阻断性问题 */
function preflight() {
  const fs = require("fs");
  let ok = true;

  if (!fs.existsSync(path.join(BACKEND_DIR, "node_modules"))) {
    console.log(
      `${C_YELLOW}[!] backend/node_modules 不存在，请先执行: cd backend && npm install${C_RESET}`
    );
    ok = false;
  }
  if (!fs.existsSync(path.join(FRONTEND_DIR, "node_modules"))) {
    console.log(
      `${C_YELLOW}[!] frontend/node_modules 不存在，请先执行: cd frontend && npm install${C_RESET}`
    );
    ok = false;
  }
  if (!fs.existsSync(path.join(BACKEND_DIR, ".env"))) {
    console.log(
      `${C_YELLOW}[!] backend/.env 不存在，请复制 backend/.env.example 并填写${C_RESET}`
    );
    // 不阻断，.env 可能通过环境变量注入
  }

  return ok;
}

/**
 * 启动一个子进程并实时转发输出
 * @returns {import("child_process").ChildProcess}
 */
function startChild(label, color, cwd) {
  const child = spawn("npm", ["run", "dev"], {
    cwd,
    shell: isWindows,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "1" },
  });

  let lineBuf = "";

  child.stdout.on("data", (data) => {
    lineBuf += data.toString();
    const lines = lineBuf.split("\n");
    lineBuf = lines.pop(); // 保留不完整的最后一行
    for (const line of lines) {
      prefixLog(label, color, line + "\n");
    }
  });

  child.stderr.on("data", (data) => {
    lineBuf += data.toString();
    const lines = lineBuf.split("\n");
    lineBuf = lines.pop();
    for (const line of lines) {
      prefixLog(label, color, line + "\n");
    }
  });

  // 进程结束后刷新残余缓冲区
  child.on("close", () => {
    if (lineBuf.trim()) {
      prefixLog(label, color, lineBuf.trim() + "\n");
    }
  });

  return child;
}

// ========== 主流程 ==========

if (!preflight()) {
  process.exit(1);
}

console.log(`${C_GREEN}正在启动开发服务器...${C_RESET}`);
console.log(`  backend  → ${BACKEND_DIR}`);
console.log(`  frontend → ${FRONTEND_DIR}`);
console.log("");

const backend = startChild("backend", C_CYAN, BACKEND_DIR);
const frontend = startChild("frontend", C_GREEN, FRONTEND_DIR);

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${C_YELLOW}正在关闭子进程...${C_RESET}`);

  // 发送 SIGTERM
  if (backend && !backend.killed) {
    isWindows ? backend.kill() : backend.kill("SIGTERM");
  }
  if (frontend && !frontend.killed) {
    isWindows ? frontend.kill() : frontend.kill("SIGTERM");
  }

  // 5s 超时强制 kill
  setTimeout(() => {
    if (backend && !backend.killed) {
      console.log(`${C_RED}[backend] 超时强制关闭${C_RESET}`);
      backend.kill("SIGKILL");
    }
    if (frontend && !frontend.killed) {
      console.log(`${C_RED}[frontend] 超时强制关闭${C_RESET}`);
      frontend.kill("SIGKILL");
    }
    process.exit(0);
  }, 5000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// 任一子进程退出时记录退出码
let exitCode = 0;

backend.on("close", (code) => {
  if (code !== 0 && code !== null) exitCode = code;
  if (!shuttingDown) {
    prefixLog("backend", C_RED, `进程退出，退出码: ${code}\n`);
  }
});

frontend.on("close", (code) => {
  if (code !== 0 && code !== null) exitCode = code;
  if (!shuttingDown) {
    prefixLog("frontend", C_RED, `进程退出，退出码: ${code}\n`);
  }
});

// 两个子进程都退出后，主进程退出
let closedCount = 0;
backend.on("close", () => {
  closedCount++;
  if (closedCount === 2) process.exit(exitCode);
});
frontend.on("close", () => {
  closedCount++;
  if (closedCount === 2) process.exit(exitCode);
});
