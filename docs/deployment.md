# 部署指南

本文档覆盖 WorkBuddy2Api 的**部署拓扑、环境变量、前后端启动、反代/HTTPS 建议、安全暴露面**，并为 Docker 同源托管留出占位。

> API 细节请参阅 `docs/admin-api.md`；项目 README 仅覆盖本地快速启动。

---

## 1. 架构概览

```
客户端 (ChatBox / OpenCat / Open WebUI)
    |
    v  (OpenAI 兼容 /v1)
WorkBuddy2Api Backend (Fastify 5, tsx, ESM)
    |-- /v1          公开 Chat/Model 接口
    |-- /admin/*     管理 API（x-admin-token 鉴权）
    |-- /health      健康探针（免鉴权，不走 envelope）
    |
    +--> data/       credentials.json / api-keys.json / checkin-history.json

管理前端 (Vue 3 + Vite + Element Plus)
    |-- 开发：Vite dev server (:5173) + proxy /admin -> 后端
    |-- 生产：静态文件托管 + 反代 /admin 到后端
```

- **本地开发**前后端分离；**Docker 部署**由 `@fastify/static` 同源托管前端 `dist/`。
- 应用本身**不终止 TLS**，HTTPS 由外部反代处理。

---

## 2. 环境要求

| 组件                  | 要求                                      |
| --------------------- | ----------------------------------------- |
| Node.js               | `>= 20`（`backend/package.json` engines） |
| PM2（可选）           | 全局安装 `npm i -g pm2`，用于生产守护     |
| Nginx / Caddy（可选） | 仅在需要 HTTPS / 反代时使用               |

---

## 3. 环境变量与配置优先级

### 3.1 端口与监听

变量优先级：**环境变量 > `.env` 文件 > `backend/config.json` > 代码内置默认**。

| 优先级 | 来源                          | 默认值               |
| ------ | ----------------------------- | -------------------- |
| 1      | `PORT`                        | --                   |
| 2      | `config.json` → `server.port` | `3000`（当前仓库值） |
| 3      | 代码内置                      | `11434`              |

> **注意**：当前 `backend/config.json` 中 `port` 为 **3000**，与代码默认 `11434` 和 README 描述均不同。请以实际 `config.json` 或 `PORT` 环境变量为准。

### 3.2 全量变量表

| 变量          | 用途                    | 必填             | 默认                                 |
| ------------- | ----------------------- | ---------------- | ------------------------------------ |
| `PORT`        | 监听端口                | 否               | `config.json` 或 `11434`             |
| `HOST`        | 监听地址                | 否               | `config.json` 或 `127.0.0.1`         |
| `ADMIN_TOKEN` | `/admin/*` 鉴权 Token   | **是**（管理面） | 未配置 → 503                         |
| `DATA_DIR`    | 数据存储目录            | 否               | `./data`（相对于 cwd）               |
| `CORS_ORIGIN` | CORS 白名单（逗号分隔） | 否               | 空 → `origin: false`（不下发跨域头） |
| `NODE_ENV`    | PM2 注入的运行环境      | 否               | `production`（ecosystem）            |

### 3.3 前端环境变量

| 变量                    | 用途           | 默认                                 |
| ----------------------- | -------------- | ------------------------------------ |
| `VITE_API_BASE`         | API 基础 URL   | 空 → 相对路径（需反代或 Vite proxy） |
| `VITE_BRAND_NAME`       | 品牌名         | `WorkBuddy Admin`                    |
| `VITE_PAGE_TITLE`       | 页面标题       | `WorkBuddy Admin`                    |
| `VITE_FEATURE_CHECKIN`  | 签到页开关     | `true`                               |
| `VITE_FEATURE_QUOTA`    | 额度页开关     | `true`                               |
| `VITE_FEATURE_API_KEYS` | API Key 页开关 | `true`                               |

---

## 4. 后端部署

### 4.1 本机开发

```bash
cd backend
npm install
cp .env.example .env   # 从模板创建 .env
# 编辑 .env 修改 ADMIN_TOKEN 等配置
npm run dev            # 开发热重载（tsx watch）
```

- 开发默认端口由 `config.json`（3000）或 `PORT` 环境变量决定。
- 数据文件写入 `$cwd/data/`，可通过 `DATA_DIR` 覆盖。

### 4.2 生产启动

```bash
cd backend
npm install
# 方式一：通过 .env 配置（推荐）
cp .env.example .env
# 编辑 .env，设置 ADMIN_TOKEN 和 NODE_ENV=production
npm start

# 方式二：通过环境变量注入（PM2 / systemd 等）
ADMIN_TOKEN=your-production-token npm start
```

### 4.3 PM2 守护

```bash
cd backend
# 配置 ecosystem.config.cjs 中的 ADMIN_TOKEN
# 或启动前 export ADMIN_TOKEN=your-production-token
pm2 start ecosystem.config.cjs
pm2 status
pm2 logs workbuddy2api
```

`backend/ecosystem.config.cjs` 关键配置：

- `name`: `workbuddy2api`
- `script`: `npx tsx src/index.ts`
- `cwd`: `__dirname`（backend 目录）
- `env.ADMIN_TOKEN`: 若环境变量未设则回退为 `workbuddy2-admin-dev`（**仅开发用**）
- 日志路径：`logs/out.log` / `logs/err.log`

### 4.4 验证后端

```bash
# 健康检查（无需 Token）
curl http://127.0.0.1:3000/health
# 期望: {"status":"ok"}

# 管理 Token 校验
curl -H "x-admin-token: your-token" http://127.0.0.1:3000/admin/auth/verify
# 期望: {"code":200,"message":"Token 有效","data":null}

# 无 Token 访问管理接口
curl -i http://127.0.0.1:3000/admin/credentials
# 期望: 401 或 503
```

---

## 5. 前端部署

### 5.1 开发联调

```bash
cd frontend
npm install
npm run dev   # Vite dev server，端口 5173
```

`vite.config.ts` 中已配置 proxy：`/admin` → `http://127.0.0.1:11434`。

> 开发时请确保后端端口与 proxy target 一致（当前 target 为 `11434`，若 `config.json` 为 `3000` 需同步调整）。

### 5.2 生产构建

```bash
cd frontend
npm run build    # 输出到 frontend/dist/
```

### 5.3 生产部署方式

**推荐：静态文件托管 + 反代**

1. 前端 `dist/` 由 Nginx / Caddy / 其他静态服务器托管。
2. 反代将 `/admin/*`、`/v1/*`、`/health` 转发到后端。
3. 设置 `VITE_API_BASE` 为空（相对路径）或显式后端 origin。

**备选：VITE_API_BASE 显式指向后端**

若不使用反代，前端需配置 `VITE_API_BASE=https://your-backend-domain`，同时后端需配置 `CORS_ORIGIN` 白名单允许前端域。

---

## 6. 数据持久化

所有持久化数据位于 `DATA_DIR`（默认 `$cwd/data/`），包含三个 JSON 文件：

| 文件                   | 内容                         | 管理路由                 |
| ---------------------- | ---------------------------- | ------------------------ |
| `credentials.json`     | 凭证列表（含 token/refresh） | `/admin/credentials`     |
| `api-keys.json`        | 管理端 API Key 列表          | `/admin/api-keys`        |
| `checkin-history.json` | 签到历史记录（上限 500 条）  | `/admin/checkin/history` |

**运维建议**：

- 定期备份 `DATA_DIR` 目录。
- Linux 服务器无桌面端时，通过 `scripts/windows/export-credential.ps1` 在 Windows 上导出凭证 JSON，再通过 `POST /admin/credentials/upload` 上传。
- 修改 JSON 文件前建议停止服务，避免写入冲突。

---

## 7. 反向代理与 HTTPS

应用本身不终止 TLS，推荐使用 Nginx 或 Caddy 作为反代。

### 7.1 Nginx 示例

```nginx
server {
    listen 443 ssl;
    server_name admin.example.com;

    ssl_certificate     /etc/ssl/certs/example.pem;
    ssl_certificate_key /etc/ssl/private/example.key;

    # 前端静态文件
    location / {
        root /var/www/workbuddy-admin/dist;
        try_files $uri $uri/ /index.html;  # hash history 需要 fallback
    }

    # 后端 API
    location /admin/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /v1/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # SSE/Streaming 注意：禁用缓冲
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }

    location /health {
        proxy_pass http://127.0.0.1:3000;
    }
}
```

### 7.2 Caddy 示例（自动 HTTPS）

```
admin.example.com {
    tls /etc/caddy/cert.pem /etc/caddy/key.pem

    handle /admin/* {
        reverse_proxy 127.0.0.1:3000
    }
    handle /v1/* {
        reverse_proxy 127.0.0.1:3000 {
            flush_interval -1  # SSE
        }
    }
    handle /health {
        reverse_proxy 127.0.0.1:3000
    }

    handle {
        root * /var/www/workbuddy-admin/dist
        try_files {path} /index.html
        file_server
    }
}
```

### 7.3 注意事项

- `/v1` 支持 SSE 流式响应，反代必须**禁用缓冲**（Nginx: `proxy_buffering off`；Caddy: `flush_interval -1`）。
- `/health` 免鉴权，可用于外部监控探针。
- `/admin/*` 走 `x-admin-token` 鉴权，反代无需额外鉴权层。

---

## 8. 安全暴露面

| 暴露点     | 现状                                               | 建议                                      |
| ---------- | -------------------------------------------------- | ----------------------------------------- |
| `/admin/*` | Token 鉴权；未配置 `ADMIN_TOKEN` 返回 503          | 生产必须设置强 Token；公网必须 HTTPS      |
| `/v1/*`    | **当前不校验 API Key**（`findApiKeyByKey` 仅预留） | 若需公网暴露，建议反代层增加 API Key 校验 |
| `/health`  | 免鉴权、不走 envelope                              | 仅限内网或反代限制访问                    |
| CORS       | `CORS_ORIGIN` 未配置时 `origin: false`（无跨域头） | 分离前端部署时必须配置白名单或同源反代    |
| 凭证文件   | `data/*.json` 包含明文 token                       | 文件权限 600；勿提交到 Git；定期备份      |

---

## 9. Docker 部署

### 9.1 方式一：本地构建部署

适合开发/测试环境，从本地 Dockerfile 构建镜像：

```bash
# 1. 复制环境变量模板
cp .env.example .env
# 编辑 .env，修改 ADMIN_TOKEN

# 2. 构建并启动
docker compose up -d --build

# 3. 验证
curl http://127.0.0.1:11434/health
```

- 使用根目录 `docker-compose.yml`（含 `build` 段）
- 镜像名：`workbuddy2api:latest`
- 数据持久化：Docker volume `workbuddy-data`

### 9.2 方式二：服务器从 GHCR 拉取部署（推荐生产）

镜像由 GitHub Actions 自动构建并推送到 GitHub Container Registry，服务器只需拉取运行：

```bash
# 1. 复制环境变量模板
cp .env.example .env
# 编辑 .env，修改 ADMIN_TOKEN（必填）

# 2. 登录 GHCR（首次需要）
echo "$GITHUB_TOKEN" | docker login ghcr.io -u YOUR_USERNAME --password-stdin

# 3. 从 GHCR 拉取并启动
docker compose -f docker-compose.prod.yml up -d

# 4. 验证
curl http://127.0.0.1:11434/health
curl -H "x-admin-token: $ADMIN_TOKEN" http://127.0.0.1:11434/admin/auth/verify
```

- 使用 `docker-compose.prod.yml`（无 `build` 段，`pull_policy: always`）
- 镜像地址：`ghcr.io/xyw110/workbuddy2api:latest`
- CI/CD：推送 `master` 分支自动触发 GitHub Actions 构建（`.github/workflows/docker-publish.yml`）

### 9.3 GitHub Actions 配置

推送到 `master` 分支后，GitHub Actions 自动：

1. 检出代码 → 前端构建 → 后端构建 → 运行时镜像
2. 推送到 `ghcr.io/xyw110/workbuddy2api:latest` + `:<commit-sha>`
3. 使用 GHA Cache 加速后续构建

**前置条件**：GitHub 仓库 Settings → Actions → Workflow permissions → 勾选 **Read and write permissions**。

### 9.4 容器内环境变量

| 变量         | 容器内固定值  | 说明                                              |
| ------------ | ------------- | ------------------------------------------------- |
| `PORT`       | `11434`       | 容器内端口固定，宿主机映射由 compose `ports` 控制 |
| `HOST`       | `0.0.0.0`     | 容器内绑定所有接口                                |
| `DATA_DIR`   | `/app/data`   | 挂载 volume 持久化                                |
| `STATIC_DIR` | `/app/public` | 前端构建产物位置                                  |
| `NODE_ENV`   | `production`  | 生产模式（JSON 日志）                             |

### 9.5 更新镜像

```bash
# 服务器上拉取最新镜像并重启
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

---

## 10. 健康检查与运维探针

### 10.1 应用健康

```bash
GET /health
# 响应: {"status":"ok"}
# 免鉴权，不走 envelope
```

### 10.2 管理面存活

```bash
GET /admin/auth/verify
Header: x-admin-token: <ADMIN_TOKEN>
# 响应: {"code":200,"message":"Token 有效","data":null}
```

### 10.3 探针建议

| 场景                       | 方式                                   |
| -------------------------- | -------------------------------------- |
| 外部监控（UptimeRobot 等） | GET `/health`（免鉴权）                |
| 容器健康检查               | `curl -f http://localhost:3000/health` |
| 内部存活校验               | 带 Token 的 `/admin/auth/verify`       |

---

## 11. Windows 凭证导出与上传

适用于 Linux 服务器无桌面端的场景：

1. 在 Windows 机器上运行导出脚本：
   ```powershell
   .\scripts\windows\export-credential.ps1 -OutFile .\credential.json
   ```
2. 将 `credential.json` 上传到服务器。
3. 通过管理 API 上传：
   ```bash
   curl -X POST http://localhost:3000/admin/credentials/upload \
     -H "x-admin-token: $TOKEN" \
     -F "file=@./credential.json"
   ```

脚本输出形状与 `POST /admin/credentials/upload` 契约兼容（含 `name`、`type`、`accessToken`、`refreshToken`、`uid`、`source`）。

---

## 12. 故障排查

| 现象                   | 可能原因                        | 解决                              |
| ---------------------- | ------------------------------- | --------------------------------- |
| `/admin/*` 返回 503    | `ADMIN_TOKEN` 未配置            | 设置环境变量 `ADMIN_TOKEN`        |
| `/admin/*` 返回 401    | Token 不匹配或缺失              | 检查 `x-admin-token` header       |
| 前端无法连接后端       | CORS 拒绝 / 端口不对            | 配置 `CORS_ORIGIN` 或使用反代     |
| 前端 proxy 不生效      | 后端端口与 proxy target 不一致  | 检查 `vite.config.ts` target 端口 |
| 数据丢失               | `DATA_DIR` 指向错误目录或被清理 | 确认 `DATA_DIR` 路径；备份        |
| 签到 502               | 上游 CodeBuddy 请求失败         | 检查网络 / 凭证有效性             |
| PM2 启动后立即退出     | `ADMIN_TOKEN` 未设置 / 端口占用 | 检查 PM2 日志 `logs/err.log`      |
| `config.json` 读取失败 | cwd 不在 backend 目录           | 确保 `cd backend` 后再启动        |
