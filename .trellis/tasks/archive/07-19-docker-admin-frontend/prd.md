# Docker 部署与管理前端

## Goal

让 WorkBuddy2Api 能在 Linux 上通过 Docker Compose 稳定部署，并提供带管理员 Token 门禁的管理前端；同时把 Windows 本机凭证提取拆成独立脚本，扩展凭证"上传/添加"能力，形成「本机提取 → 上传到 Linux 服务 → 管理台运维」闭环。

## User Value

- 运维：`docker compose up` 即可在 Linux 跑代理与管理台，数据可持久化。
- 安全：管理端（凭证/签到）不再裸奔，需管理员 Token。
- 跨机：Windows 桌面凭证可导出后上传到服务器，不必在 Linux 上依赖桌面端文件。
- 使用：管理员有 Web UI 管理凭证、切换活跃账号、触发/查看签到（范围待定）。

## Confirmed Facts（仓库已核实）

### 现状架构

- 后端：`backend/` Fastify + TypeScript，无根级 `frontend/`。
- 无 `Dockerfile` / `docker-compose.yml`。
- 现有部署方式：本地 `npm run dev|start` 与 `pm2`（`ecosystem.config.cjs`）。
- 历史任务 `07-18-glm-proxy-api` 曾将 **Docker 部署** 标为 Out of Scope；本次为范围扩大。

### 凭证

- 类型：`local-file`（JWT access/refresh + uid）与 `api-key`（`ck_xxx`）。
- 存储：`backend/data/credentials.json`，路径可用 `DATA_DIR` 覆盖（`getCredentialStorePath`）。
- 自动加载：`credential-loader.loadLocalCredential()` 内嵌读取  
  `%LOCALAPPDATA%\CodeBuddyExtension\Data\Public\auth\workbuddy-desktop.info`（非 Windows 有 homedir 回退路径）。
- 启动：`index.ts` → `loadStore()` + 尝试 `loadLocalCredential()` + `addLocalCredential`。
- 管理 API `POST /admin/credentials` **仅支持** `{ name, key }` 添加 api-key；**不能**通过 API 上传完整 local-file 凭证包。
- 列表接口直接返回完整凭证对象（含 token/key 明文）——对公网暴露极危险。

### 鉴权与网络

- 全部 `/admin/*`（credentials + checkin）**无鉴权**。
- 无 `ADMIN_TOKEN` / `API_KEY` 配置项。
- `config.json`：`host: 127.0.0.1`，`port: 3000`；代码默认与 README 多为 `11434` + `127.0.0.1`（端口不一致需在部署方案中统一）。
- OpenAI 兼容 `/v1` 对客户端 API Key **不校验**（README 写明可填任意值）。
- Spec 明确：Admin 面向本机绑定；公网暴露前必须加鉴权层。

### 前端

- 仓库内 **无前端工程**。
- CORS 当前 `origin: true`（允许任意来源，需与 Token 鉴权一并收紧策略）。

### 测试

- `backend/test/` 为独立脚本，`package.json` 无 jest/vitest 脚本。

### 现有管理路由（迁移基线，见 design.md §2.5）

- `backend/src/routes/admin/credentials.ts`：
  - `GET /admin/credentials`（返回 `{ credentials, activeId }`，**明文**）。
  - `POST /admin/credentials`（仅 `{ name, key }`，**无鉴权**）。
  - `DELETE /admin/credentials/:id`、`PUT /admin/credentials/:id/activate`、`GET /admin/credentials/:id/quota`（均无鉴权）。
- `backend/src/routes/admin/checkin.ts`：
  - `POST /admin/checkin`、`GET /admin/checkin/status`、`POST /admin/checkin/:id`（均无鉴权）。
- 上述响应**无统一 envelope**，字段既有 snake/camel 混用；D8/R5 需对齐改造。

## Requirements（草案，待逐项确认）

### R1 Docker Compose（Linux）

- 提供可构建的后端镜像 + `docker-compose.yml`（及示例 env）。
- 持久化 `credentials.json`（及必要配置）到 volume。
- 默认端口 **11434**；`PORT`/`HOST` 环境变量可覆盖；Docker 绑定 `0.0.0.0`，本机默认 `127.0.0.1`。
- 文档说明：端口、环境变量、数据目录、健康检查 `/health`。

### R2 Windows 凭证提取脚本

- 将本机 `workbuddy-desktop.info` 读取/导出逻辑从运行时"隐式加载"中拆出，放到 `scripts/windows/`。
- 主脚本：`export-credential.ps1`（可选 `export-credential.mjs`）；读取 `%LOCALAPPDATA%\CodeBuddyExtension\Data\Public\auth\workbuddy-desktop.info`。
- 输出：默认 stdout，或 `-OutFile <path>` 指定输出文件；不启动后端。
- 导出 JSON 必须符合 D5 契约，可直接被上传接口消费（字段：`name`、`type:"local-file"`、`accessToken`、`refreshToken`、`uid` 等）。
- Linux 容器内默认不依赖桌面端路径（或仅可选）。

### R3 凭证上传与扩展添加

- 支持现有 `{ name, key }` 添加 `api-key`。
- 支持导入完整 `local-file`：`multipart/form-data` JSON 文件为主，可选同结构 JSON body。
- 列表/详情对敏感字段脱敏（前 4+后 4）；完整值仅添加/上传成功响应返回一次。
- 管理面写/读均强制管理员 Token（D2）。

### R4 管理前端 + 管理员 Token

- 新增管理前端；进入管理功能前必须校验管理员 Token。
- 后端 `/admin/*` 必须强制校验同一 Token（否则前端门禁可被绕过）。
- 技术栈与 MVP 页面：见 D4（Vue 3 + Vite + Element Plus；登录、凭证 CRUD+激活、API Key 管理、签到、配额）。
- Token 传递：前端统一 `x-admin-token` 请求头（与 D2 一致）。
- **通用壳（D8-B）**：前端按 `api / stores / pages / components / config` 分层；品牌名、Logo、页面标题、导航文案走配置（构建期 env 或 runtime config），禁止业务串散落写死。
- **Feature flags**：通过配置开关页面/能力（如 checkin、quota）；关闭后导航与路由不可达。
- **API base**：可配置；开发期 Vite 代理，生产同源由后端 static 托管。

### R5 管理 API 契约（新增）

- `/admin/*` 采用稳定 REST 资源 + 统一响应 envelope，前后端解耦，便于同一管理壳对接同类代理/凭证服务或 fork。
- 鉴权：全部管理接口强制 `x-admin-token`（D2）；未配置 `ADMIN_TOKEN` 时拒绝服务（D2）。
- 统一 envelope：`{ code, message, data, requestId? }`；错误与 HTTP 状态语义对齐（401/403/404/409/422）。
- 资源原则：credentials / api-keys / checkin / quota / auth-verify；字段 camelCase，与 D5 对齐。
- 敏感字段脱敏规则继承 D5；列表分页约定 `page` + `pageSize`（MVP）。
- 公开端点：`/health` 免鉴权；`/v1` 仍按 D1/D3。

## Acceptance Criteria（草案）

- [ ] Linux 上可通过 Docker Compose 启动服务，默认端口 11434（可用 PORT 覆盖），`/health` 正常，`/v1` 代理可用（在有有效凭证前提下）。
- [ ] `credentials.json` 通过 volume 重启后仍在。
- [ ] 无管理员 Token 时，`/admin/*` 返回 401/403。
- [ ] 有正确管理员 Token 时可完成凭证列表/添加/删除/激活及约定内的签到操作。
- [ ] Windows 专用脚本 `scripts/windows/export-credential.ps1` 可导出桌面凭证为 D5 JSON，并可用 `-OutFile` 写文件；导出 JSON 可被上传接口消费。
- [ ] 列表/详情敏感字段仅前 4+后 4；完整值仅添加/上传成功响应一次。
- [ ] 管理前端在未登录/无 Token 时无法使用管理功能；Token 正确后可完成核心运维操作。
- [ ] 前端可完成：登录、凭证 CRUD+激活、API Key 管理、签到手动触发/状态、配额查看。
- [ ] README/部署文档覆盖 Compose 与管理员 Token 配置。
- [ ] 前端分层符合 D8（api/stores/pages/components/config），核心文案/品牌可配置替换。
- [ ] feature flags 可关闭签到或配额页且导航不展示。
- [ ] `/admin/*` 响应符合统一 envelope；无 Token 返回 401/403。
- [ ] 管理资源路径与字段命名符合 R5/D8（camelCase）。

## Out of Scope（建议，待确认）

- 多用户 RBAC、OAuth、SSO。
- 公网 HTTPS/证书自动签发（可由反向代理承担，Compose 内可选文档说明）。
- 改造 OpenAI `/v1` 为强制单 Key 以外的复杂鉴权（本任务已按 D1/D3 做可选/多 Key，不扩 OAuth/RBAC）。
- 完整移动端适配、设计系统级 UI 库建设。
- Token 用量统计大盘（历史 Out of Scope）。
- 元数据 schema 驱动页面渲染、页面插件注册（通用化 C 级）。
- 多租户白标 SaaS、主题市场。
- 管理 API 完整 OpenAPI 生成流水线（可文档手写，不强制 CI 生成）。

## Resolved Decisions

- **D1 部署拓扑与暴露面**：采用 **C 公网向**。

  - Docker Compose 部署到 Linux，容器绑定 `0.0.0.0`，允许对外访问。
  - `/admin/*` 强制校验管理员 Token。
  - `/v1`（OpenAI 兼容端点）增加**可选** API Key 校验：未配置 `API_KEY` 时行为不变；配置后要求客户端 `Authorization: Bearer <API_KEY>`。
  - 前端静态托管方式：已由 D4 收口（同容器 `@fastify/static`）。

- **D2 管理员 Token 形态**：采用 **A 静态 Token**。

  - 后端从环境变量 `ADMIN_TOKEN` 读取；未设置时 `/admin/*` 直接 503/403（拒绝服务，避免误开放）。
  - 前端登录页输入 Token → 存 `localStorage` → 请求统一带 `x-admin-token: <Token>`。
  - 无 Token 或错误 → 401；前端拦截后跳回登录页。
  - **D3 "AI 能力分发"含义**：采用 **C 两层都要**。

  1. **`/v1` 多 API Key 管理**：管理员可在管理前端创建/撤销多个 API Key 分发给不同使用者；`/v1` 请求带任一有效 Key 即可放行；每 Key 可启用/停用。
  2. **多 CodeBuddy 凭证轮询**：现有 active 单凭证模式改为多凭证轮询/优先级模式（即多 `ck_xxx` 或多 `local-file` 凭证之间 load-balance/failover）。

  - 数据模型需新增：`api-keys` 表（独立于 CodeBuddy 凭证）+ 轮询策略配置。
  - 管理前端需新增：API Key 列表页 + 轮询策略设置。

- **D4 管理前端技术栈与托管**：采用 **Vue 3 + Vite + Element Plus**。

  - 构建产物由后端 `@fastify/static` 同容器托管（单镜像/单 Compose 服务）。
  - MVP 页面：登录、凭证 CRUD+激活、API Key 管理、签到手动触发/状态、配额查看。
  - 管理请求鉴权与 D2 一致：`x-admin-token`；未登录/401 回登录页。
  - 开发期可用 Vite 代理到后端；生产不单独暴露前端端口。

- **D5 凭证上传契约与脱敏**：采用 **A**。

  - 上传：`multipart/form-data` JSON 文件为主；可选同结构 JSON body。
  - `local-file` 字段与 store 对齐：`name`、`type:"local-file"`、`accessToken`、`refreshToken`、`uid`（`source` 可选）。
  - 列表/详情：`accessToken` / `refreshToken` / `key` 脱敏为前 4+后 4。
  - 完整明文仅在添加/上传成功响应返回一次；之后一律脱敏。
  - 管理接口均需 `x-admin-token`（D2）。

- **D6 Windows 凭证提取脚本**：采用 **A**。

  - 位置：`scripts/windows/`；主脚本 `export-credential.ps1`（可选 `export-credential.mjs`）。
  - 读取：`%LOCALAPPDATA%\CodeBuddyExtension\Data\Public\auth\workbuddy-desktop.info`。
  - 输出：默认 stdout；支持 `-OutFile <path>`；不启动后端。
  - 输出 JSON 符合 D5 契约（name/type/accessToken/refreshToken/uid）。

- **D7 端口与 host 统一策略**：采用 **C**。
  - 默认端口 **11434**（对齐 README 与 `config.ts` fallback）。
  - 支持环境变量 `PORT` / `HOST` 覆盖。
  - Docker/公网向：`HOST=0.0.0.0`；本机开发默认 `127.0.0.1`。
  - 同步调整：`config.json`、测试 BASE、Compose `ports`/`EXPOSE`、README。

- **D8 通用管理壳与 API 契约**：采用 **B**（分层 + 品牌/文案/API base 配置化 + feature flags；不做元数据驱动页面、不做插件注册）。

  - 目标：管理前端可复用为「通用管理台壳」；后端 `/admin/*` 为稳定、解耦契约。
  - 前端：
    1. 分层：`src/api`（HTTP client + 资源模块）、`src/stores`、`src/pages`、`src/components`、`src/config`。
    2. 配置化：品牌名、Logo URL、页面标题、导航文案、API base；构建期 `VITE_*` + 可选 runtime `/admin-ui-config.json`（由 static 托管，二选一或叠加以 design 定）。
    3. Feature flags：`features.checkin` / `features.quota` / `features.apiKeys` 等；关闭则路由与菜单隐藏。
    4. 不写死 WorkBuddy 业务专有串在组件内；业务页面可存在但文案从 config 注入。
    5. 不做：资源元数据驱动 CRUD 表单、插件式页面注册（C 级 Out of Scope）。
  - 后端：
    1. REST 资源化 `/admin/*`；统一响应 envelope。
    2. 字段 camelCase；分页 `page`/`pageSize`。
    3. 错误码与 HTTP 对齐；401 触发前端回登录。
    4. CORS 在公网向场景收紧为同源或显式白名单（与 D1 一致）。
    5. API 版本：MVP 路径仍 `/admin/...`；design 预留升级策略，不强制 `/admin/v1`。
  - 不可推翻：D1 公网向 Docker、D2 ADMIN_TOKEN + x-admin-token、D3 多 API Key + 凭证轮询、D4 Vue3+Vite+ElementPlus + @fastify/static、D5 上传脱敏。

## Open Questions

（无。D1–D8 已收口。下一步：design.md + implement.md。）

## Notes

- 任务目录：`.trellis/tasks/07-19-docker-admin-frontend`
- 复杂任务：确认需求后补 `design.md` + `implement.md`，再 `task.py start`
- Brainstorm 规则：仓库可答事实已写入 Confirmed Facts；仅向用户问产品/范围决策
- D8 已选 B（分层 + 品牌/文案/API base 配置化 + feature flags；不做元数据驱动页面、不做插件注册）
