module.exports = {
  apps: [
    {
      name: "workbuddy2api",
      script: "npx",
      args: "tsx src/index.ts",
      cwd: __dirname,
      interpreter: "none", // npx 不需要 node 解释器
      env: {
        NODE_ENV: "production",
        ADMIN_TOKEN: process.env.ADMIN_TOKEN || "workbuddy2-admin-dev",
      },
      // 日志配置
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "logs/err.log",
      out_file: "logs/out.log",
      // 自动重启
      max_restarts: 10,
      restart_delay: 3000,
      // Windows 兼容
      kill_timeout: 5000,
      wait_ready: false,
    },
  ],
};
