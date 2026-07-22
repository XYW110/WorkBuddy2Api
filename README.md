# WorkBuddy2Api

将 CodeBuddy 桌面端的 GLM 5.2 额度封装为**标准 OpenAI 兼容 API**，并附带**管理后端 + Vue3 管理前端**，支持凭证管理、签到、额度查询、API Key 管理与 Windows 凭证导出上传。

- **后端**：Fastify 5 + TypeScript + `tsx`（ESM，Node `>=20`），暴露 `/v1` / `/admin` / `/health`
- **前端**：Vue 3 + Vite + Element Plus + Pinia + Vue Router，端口 `5173`，Vite proxy 转发 `/admin`
- **核心能力**：凭证管理（本地 Key + 文件上传）、定时签到与历史、额度查询、API Key CRUD、管理员 Token 鉴权

> 完整 API 契约见 [`docs/admin-api.md`](docs/admin-api.md)；部署拓扑/反代/HTTPS 见 [`docs/deployment.md`](docs/deployment.md)。

---

## 项目结构

```
WorkBuddy2Api/
├── backend/                # Fastify 后端
│   ├── src/                 # config / routes / services / plugins / utils
│   ├── config.json         # 端口/日志/CodeBuddy/签到配置（可被环境变量覆盖）
│   ├── ecosystem.config.cjs# PM2 守护配置
│   └── package.json
├── frontend/               # Vue3 管理前端
│   ├── src/                # api / pages / stores / router / components
│   ├── .env                # VITE_API_BASE / 品牌 / 功能开关
│   └── vite.config.ts      # proxy /admin -> 后端
├── docs/
│   ├── admin-api.md        # 管理 API 完整契约
│   └── deployment.md       # 部署/环境变量/反代/HTTPS/安全
├── scripts/
│   └── windows/            # export-credential.ps1 凭证导出
├── Dockerfile              # 多阶段构建（前端 + 后端 → 运行时镜像）
├── docker-compose.yml      # 单服务 Compose（含 volume 持久化与 healthcheck）
├── .dockerignore
├── .env.example            # Docker Compose 环境变量模板
├── README.md
```

---

## 快速开始

### 后端

```bash
cd backend
npm install

# 配置环境变量（二选一）：
# 方式一：复制 .env.example 并修改（推荐）
cp .env.example .env
# 编辑 .env 修改 ADMIN_TOKEN 等配置

# 方式二：命令行临时设置
$env:ADMIN_TOKEN="your-strong-token"   # PowerShell

# 开发模式（热重载）
npm run dev

# 生产模式
npm start
```

默认监听 `http://127.0.0.1:3000`（由 `backend/config.json` 的 `server.port=3000` 决定，可用 `PORT` 环境变量覆盖）。

健康检查（免鉴权）：

```bash
curl http://127.0.0.1:3000/health
# {"status":"ok"}
```

### 前端

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Vite dev server 通过 proxy 将 `/admin/*` 转发到后端。**联调前需确保 `frontend/vite.config.ts` 的 `proxy.target` 与后端实际监听端口一致**（当前 target 为 `http://127.0.0.1:11434`，若后端用默认 3000 启动，需改 target 或以 `PORT=11434` 启动后端）。

生产构建：

```bash
cd frontend
npm run build        # 输出到 frontend/dist/
```

构建产物由任意静态服务器托管，并通过反代将 `/admin/*` 指向后端（详见 `docs/deployment.md`）。

---

## 配置

### 配置优先级

**环境变量 > `.env` 文件 > `backend/config.json` > 代码内置默认**

### 后端环境变量

| 变量          | 用途                    | 必填             | 默认                         |
| ------------- | ----------------------- | ---------------- | ---------------------------- |
| `PORT`        | 监听端口                | 否               | `config.json` 或 `11434`     |
| `HOST`        | 监听地址                | 否               | `config.json` 或 `127.0.0.1` |
| `ADMIN_TOKEN` | `/admin/*` 鉴权 Token   | **是**（管理面） | 未配置 → 503                 |
| `DATA_DIR`    | 数据存储目录            | 否               | `./data`                     |
| `CORS_ORIGIN` | CORS 白名单（逗号分隔） | 否               | 空 → 不下发跨域头            |
| `NODE_ENV`    | 运行环境                | 否               | `production`（PM2）          |

### 前端环境变量（`frontend/.env`）

| 变量                    | 用途           | 默认                                 |
| ----------------------- | -------------- | ------------------------------------ |
| `VITE_API_BASE`         | API 基础 URL   | 空 → 相对路径（需反代或 Vite proxy） |
| `VITE_BRAND_NAME`       | 品牌名         | `WorkBuddy Admin`                    |
| `VITE_PAGE_TITLE`       | 页面标题       | `WorkBuddy Admin`                    |
| `VITE_FEATURE_CHECKIN`  | 签到页开关     | `true`                               |
| `VITE_FEATURE_QUOTA`    | 额度页开关     | `true`                               |
| `VITE_FEATURE_API_KEYS` | API Key 页开关 | `true`                               |

### config.json 示例

```jsonc
{
  "server": { "port": 3000, "host": "127.0.0.1" },
  "log": { "level": "info" },
  "codebuddy": {
    "baseUrl": "https://www.codebuddy.cn",
    "domain": "www.codebuddy.cn"
  },
  "checkin": {
    "enabled": true,
    "hour": 9,
    "minute": 5,
    "runOnStartupIfMissed": true
  }
}
```

> `PORT` / `HOST` 环境变量优先于 `config.json`；签到配置目前仅在 `config.json` 中生效。

---

## OpenAI 客户端配置

在 ChatBox / OpenCat / Open WebUI 等客户端中配置：

- **API 地址**：`http://127.0.0.1:3000/v1`
- **API Key**：留空或填任意值
- **模型**：`auto` 或 `glm-5.2`

> **注意**：当前 `/v1` **不校验 API Key**。管理端 `sk-` Key（`/admin/api-keys`）暂未对接 `/v1` 鉴权，仅作额度分组与审计预留。

---

## 管理前端

- **技术栈**：Vue 3 + Element Plus + Pinia + Vue Router + Axios
- **功能页面**：凭证管理 / API Key 管理 / 签到（含历史）/ 额度查询，可通过 `VITE_FEATURE_*` 开关
- **登录**：首次访问跳转 `/login`，输入 `ADMIN_TOKEN` 后存入 `localStorage`，每次请求带 `x-admin-token` header
- **开发联调**：Vite proxy `/admin` → 后端，需保证 target 端口与后端一致
- **生产托管**：`npm run build` → `frontend/dist/`，由静态服务器托管 + 反代 `/admin`

---

## 管理 API 概览

所有 `/admin/*` 路由需携带 header：`x-admin-token: <ADMIN_TOKEN>`。响应统一为 envelope 结构 `{ok, data, error}`（`/health` 除外）。

| 资源        | Method | Path                              | 说明                    |
| ----------- | ------ | --------------------------------- | ----------------------- |
| auth        | GET    | `/admin/auth/verify`              | 校验 Token 有效性       |
| credentials | GET    | `/admin/credentials`              | 凭证列表（分页 + 掩码） |
| credentials | POST   | `/admin/credentials`              | 添加 `ck_xxx` Key       |
| credentials | POST   | `/admin/credentials/upload`       | 上传凭证 JSON 文件      |
| credentials | DELETE | `/admin/credentials/:id`          | 删除凭证                |
| credentials | PUT    | `/admin/credentials/:id/activate` | 切换活跃凭证            |
| credentials | GET    | `/admin/credentials/quota`        | 凭证额度快照            |
| api-keys    | GET    | `/admin/api-keys`                 | API Key 列表            |
| api-keys    | POST   | `/admin/api-keys`                 | 创建 API Key            |
| api-keys    | PUT    | `/admin/api-keys/:id`             | 更新 API Key            |
| api-keys    | DELETE | `/admin/api-keys/:id`             | 删除 API Key            |
| checkin     | POST   | `/admin/checkin`                  | 立即执行签到            |
| checkin     | POST   | `/admin/checkin/:id`              | 对指定凭证签到          |
| checkin     | GET    | `/admin/checkin/status`           | 签到状态                |
| checkin     | GET    | `/admin/checkin/history`          | 签到历史（分页）        |
| quota       | GET    | `/admin/quota`                    | 当前活跃凭证额度        |
| health      | GET    | `/health`                         | 健康探针（免鉴权）      |

完整请求/响应字段、错误码、envelope 结构详见 [`docs/admin-api.md`](docs/admin-api.md)。

### 添加凭证示例

```bash
curl -X POST http://127.0.0.1:3000/admin/credentials `
  -H "Content-Type: application/json" `
  -H "x-admin-token: your-strong-token" `
  -d '{"name":"备用Key","key":"ck_xxxxxx"}'
```

---

## Windows 凭证导出

Linux 服务器无 CodeBuddy 桌面端时，可在 Windows 主机导出凭证 JSON 后通过 `/admin/credentials/upload` 上传。

### 脚本

`scripts/windows/export-credential.ps1`

### 用法

```powershell
# 在已登录 CodeBuddy 桌面端的 Windows 主机执行
.\scripts\windows\export-credential.ps1 -OutFile .\credential.json -Name "我的账号"
```

脚本读取桌面端 `auth/workbuddy-desktop.info`，输出形状：

```json
{
  "name": "我的账号",
  "type": "local-file",
  "accessToken": "...",
  "refreshToken": "...",
  "uid": "...",
  "source": "export"
}
```

### 上传

```powershell
curl -X POST http://127.0.0.1:3000/admin/credentials/upload `
  -H "x-admin-token: your-strong-token" `
  -F "file=@./credential.json"
```

---

## 部署

### Docker Compose — 本地构建

```bash
# 1. 复制环境变量模板并修改
cp .env.example .env
# 编辑 .env，修改 ADMIN_TOKEN（必填）

# 2. 构建并启动
docker compose up -d --build

# 3. 验证
curl http://127.0.0.1:11434/health
curl -H "x-admin-token: <你的ADMIN_TOKEN>" http://127.0.0.1:11434/admin/auth/verify
# 浏览器打开 http://127.0.0.1:11434/ 使用管理前端
```

- 容器内端口固定 `11434`，宿主机映射通过 `.env` 的 `PORT` 变量控制
- 数据持久化：`credentials.json` / `api-keys.json` 等通过 Docker volume `workbuddy-data` 保存
- 健康检查：自动探测 `GET /health`，间隔 30s

### Docker Compose — 服务器从 GHCR 拉取（推荐生产）

镜像由 GitHub Actions 自动构建并推送至 `ghcr.io/xyw110/workbuddy2api:latest`：

```bash
# 1. 登录 GHCR（首次）
echo "$GITHUB_TOKEN" | docker login ghcr.io -u YOUR_USERNAME --password-stdin

# 2. 拉取并启动
cp .env.example .env        # 编辑 ADMIN_TOKEN
docker compose -f docker-compose.prod.yml up -d
```

- CI/CD：推送 `master` 分支自动触发（`.github/workflows/docker-publish.yml`）
- 更新镜像：`docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d`
- 前置条件：GitHub Actions workflow permissions 设为 Read and write

### PM2 守护（后端）

```bash
npm install -g pm2
cd backend
pm2 start ecosystem.config.cjs
pm2 status
pm2 stop workbuddy2api
```

### 前端构建

```bash
cd frontend
npm run build
# 将 dist/ 部署到静态服务器，反代 /admin -> 后端
```

### 生产反代与 HTTPS

后端**不终止 TLS**，HTTPS 由 Nginx / Caddy 等外部反代处理。完整反代示例（Nginx / Caddy）、安全暴露面收敛、故障排查清单详见 [`docs/deployment.md`](docs/deployment.md)。

> Docker Compose 单容器部署已支持（见上方部署章节）；`Dockerfile` 使用多阶段构建，前端构建产物由 `@fastify/static` 同源托管。

---

## 文档索引

| 文档                                                                             | 内容                                                     |
| -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [`docs/admin-api.md`](docs/admin-api.md)                                         | 管理 API 完整契约：路由、请求/响应字段、错误码、envelope |
| [`docs/deployment.md`](docs/deployment.md)                                       | 部署拓扑、环境变量、反代/HTTPS、安全、故障排查           |
| [`scripts/windows/export-credential.ps1`](scripts/windows/export-credential.ps1) | Windows 凭证导出脚本                                     |
