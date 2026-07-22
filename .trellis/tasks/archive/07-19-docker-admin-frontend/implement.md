# Implement: Docker 部署与管理前端

> 仅 checklist 骨架，无实现代码。执行顺序从上到下；每步完成后跑对应验证。

## 1. 后端 envelope + admin auth 中间件

- [x] 新增统一 envelope 工具（`{code,message,data,requestId?}`）。
- [x] 新增 `ADMIN_TOKEN` 读取与常量时间比较的 admin auth 中间件，挂到 `/admin` 前缀。
- [x] 未配置 `ADMIN_TOKEN` 时 `/admin/*` 返回 503。
- [x] 新增 `/admin/auth/verify` 端点。
- [x] 验证：无 Token → 401；错误 Token → 401；正确 Token → 200 envelope；未配置 → 503（本地用 `ADMIN_TOKEN=test-token-123` 启动验证通过）。

## 2. credentials / api-keys / checkin / quota 契约对齐

- [x] `credentials.ts`：列表脱敏（前 4+后 4）、envelope 包装、分页 `page`/`pageSize`。
- [x] 新增 `POST /admin/credentials/upload`（multipart JSON，D5 契约）。
- [x] 新增 `api-keys` 路由 + store（`DATA_DIR/api-keys.json`）。
- [x] `checkin.ts`：envelope 包装，保留现有三个端点语义。
- [x] `quota`：新增 `GET /admin/quota`（活跃凭证）便捷入口。
- [x] 错误码对齐：401/403/404/409/422/502/503。
- [x] CORS 收紧：`CORS_ORIGIN` 同源或白名单。
- [x] 验证：typecheck 通过，npm run build 通过。

## 3. Docker

- [x] 多阶段 `Dockerfile`（frontend build → backend build → runtime）。
- [x] `docker-compose.yml` + `.env.example`（ADMIN_TOKEN/PORT/HOST/DATA_DIR/CORS_ORIGIN）。
- [x] volume 挂载 `DATA_DIR`。
- [x] healthcheck 调 `/health`。
- [x] `@fastify/static` 配置避免与 `/admin`、`/v1`、`/health` 路径冲突。
- [ ] 验证：`docker compose up` → `/health`、`/admin/auth/verify`（带/不带 Token）、`/v1`（有凭证）。（本地 Docker Desktop 未启动，待 Linux 环境验证）

## 4. Windows 脚本

- [x] `scripts/windows/export-credential.ps1`：读取 `workbuddy-desktop.info`，输出 D5 JSON，支持 `-OutFile`。（mock 干跑正/负例通过；真实 upload 联调待后端启动后验证）
- [ ] 可选 `export-credential.mjs`（明确延后，有跨平台需求再补）。
- [x] 验证：mock 干跑通过（正例 stdout/OutFile + 缺 refreshToken exit 5 + 文件不存在 exit 2），JSON 形状对齐 D5 契约。

## 5. 前端脚手架与分层

- [x] `frontend/` 初始化：Vue3 + Vite + Element Plus + Pinia + Vue Router。
- [x] 目录分层：`src/api`、`src/stores`、`src/pages`、`src/components`、`src/config`、`src/router`。
- [x] `api/client.ts`：baseURL、`x-admin-token` 拦截器、envelope 解包、401/503 跳登录。（实现调整为仅 clearAdminToken，未做硬刷新）
- [x] `config/index.ts` + `schema.ts`：读取 `VITE_*` 与可选 `/admin-ui-config.json`。
- [x] feature flags 注入 `stores.config`，路由守卫与菜单过滤。
- [x] 验证：`npm run dev` 可启动；无 Token 访问受保护页跳登录。`npm run typecheck` + `npm run build` 通过。

## 6. 页面联调

- [x] Login：输入 Token → 调 `/admin/auth/verify` → 存 localStorage。
- [x] Credentials：列表（脱敏）、添加 api-key、上传 local-file、删除、激活、查看 quota。
- [x] ApiKeys：列表（脱敏）、创建、启用/停用、删除。
- [x] Checkin：手动触发、状态查询、指定凭证触发。
- [x] Quota：活跃凭证配额查看。
- [x] feature flag 开关：关闭 checkin/quota 后导航与路由不可达。
- [ ] 验证：5 页面手工走查 + flag 开关验证。（typecheck/build 已通过；后端联调待 ADMIN_TOKEN 启动后执行）

## 7. 文档与验收

- [ ] README：Compose 启动、ADMIN_TOKEN/API_KEY/PORT/HOST/DATA_DIR 说明、健康检查。
- [ ] 部署文档：volume、反代 HTTPS 建议（Out of Scope 但需提示）。
- [ ] 管理 API 手写文档（资源表 + envelope 形状 + 错误码）。
- [ ] 验收清单逐项核对 prd.md Acceptance Criteria。
- [ ] 跑 `backend/test/` 脚本，同步更新断言以适配 envelope。
