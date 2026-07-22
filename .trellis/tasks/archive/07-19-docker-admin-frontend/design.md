# Design: Docker 部署与管理前端

> 本文为技术设计，不包含完整业务实现代码；仅给出接口形状示意与原则性约定。实现见 `implement.md`。

## 1. 架构总览

### 1.1 拓扑

- **单容器单服务**：Fastify 后端同时托管 API（`/admin/*`、`/v1`、`/health`）与静态前端（`@fastify/static`，D4）。
- **Docker Compose**：一个 `backend` 服务；volume 挂载 `DATA_DIR` 持久化 `credentials.json`（及 D3 新增的 api-keys 数据）。
- **前端构建产物**：Vite build → `frontend/dist` → 构建阶段拷入后端镜像 → 由 `@fastify/static` 托管。

### 1.2 边界

```
+---------------------------+        +---------------------------+
|  浏览器（管理台壳）        |        |  OpenAI 兼容客户端        |
|  /admin-ui-config.json    |        |  /v1 请求                 |
|  x-admin-token            |        |  Authorization (可选)     |
+------------+--------------+        +------------+--------------+
             |                                    |
             | HTTPS (反代, 可选)                 | HTTPS (反代, 可选)
             v                                    v
+-------------------------------------------------------------+
|  Fastify 容器 (单进程)                                       |
|  /admin/* (envelope + x-admin-token)                        |
|  /v1       (D1/D3 可选 API Key)                             |
|  /health   (免鉴权)                                          |
|  static    (/admin-ui-config.json + 前端 dist)              |
+-------------------------------------------------------------+
|  Volume: DATA_DIR -> credentials.json + api-keys.json       |
+-------------------------------------------------------------+
```

### 1.3 进程内分层（原则）

- `routes/admin/*` 仅负责 HTTP 边界：鉴权、参数解析、envelope 包装、调用 service。
- `services/*` 负责业务逻辑与持久化（credential-store、checkin、proxy、新增 api-key-store）。
- 禁止在 route 层直连 store 读写敏感字段不经脱敏（D5）。

---

## 2. 后端管理 API 契约（R5/D8）

### 2.1 统一 envelope

形状示意（非实现代码）：

```ts
// 响应形状示意，仅描述结构
type AdminEnvelope<T> = {
  code: number;      // 与 HTTP 状态对齐：200/201/401/403/404/409/422/503/502
  message: string;   // 人类可读，面向前端展示
  data: T | null;    // 业务载荷；错误时为 null
  requestId?: string; // 可选，用于排障链路
};
```

- 所有 `/admin/*` 响应统一走该形状；`/health` 与 `/v1` 不强制（`/v1` 保持 OpenAI 兼容原样）。
- `code` 与 HTTP status 一致，便于前端拦截器单点判定。

### 2.2 鉴权

- 中间件挂在 `/admin` 前缀（preHandler 或独立插件）：
  - 读取 `x-admin-token` 请求头；与 `process.env.ADMIN_TOKEN` 常量时间比较。
  - 匹配失败 → `401` envelope。
  - `ADMIN_TOKEN` 未配置 → 整个 `/admin/*` 返回 `503`（拒绝服务，D2），避免误开放。
- `/admin/auth/verify`：供前端「校验当前 Token 是否有效」用；命中即返回 `200` 空数据 envelope。
- `/health`：免鉴权；`/v1`：按 D1/D3（可选 API Key）。

### 2.3 资源路由表（原则级）

| Method | Path | 用途 | 鉴权 | 脱敏/分页注意 |
|---|---|---|---|---|
| GET | `/admin/auth/verify` | 校验 Token 有效性 | 是（命中即 200） | 无 |
| GET | `/admin/credentials` | 凭证列表 | 是 | 敏感字段前 4+后 4；分页 `page`/`pageSize` |
| POST | `/admin/credentials` | 添加 api-key（`{name,key}`） | 是 | 成功响应可返回一次明文 `key` |
| POST | `/admin/credentials/upload` | 上传 local-file（multipart JSON） | 是 | 成功响应可返回一次明文 `accessToken/refreshToken` |
| DELETE | `/admin/credentials/:id` | 删除凭证 | 是 | 无 |
| PUT | `/admin/credentials/:id/activate` | 设为活跃 | 是 | 无 |
| GET | `/admin/credentials/:id/quota` | 查询配额 | 是 | 透传上游 quota 结构 |
| GET | `/admin/api-keys` | API Key 列表（D3） | 是 | `key` 脱敏前 4+后 4；分页 |
| POST | `/admin/api-keys` | 创建 API Key | 是 | 成功响应返回一次明文 |
| PUT | `/admin/api-keys/:id` | 启用/停用或更新 | 是 | 无 |
| DELETE | `/admin/api-keys/:id` | 撤销 | 是 | 无 |
| POST | `/admin/checkin` | 手动触发活跃凭证签到 | 是 | 透传签到结果 |
| POST | `/admin/checkin/:id` | 指定凭证签到 | 是 | 透传签到结果 |
| GET | `/admin/checkin/status` | 查询签到状态 | 是 | 透传状态 |
| GET | `/admin/quota` | 活跃凭证配额（便捷入口） | 是 | 透传上游 |
| GET | `/health` | 健康检查 | **否** | 无 |

注：`quota` 既有 `GET /admin/credentials/:id/quota` 也有 `GET /admin/quota`（活跃），二者并存以适配 D8 feature flag 关闭「配额页」时仍可被凭证详情内嵌调用。

### 2.4 错误与分页约定

- HTTP 状态语义：
  - `200` 成功读取/更新；`201` 成功创建。
  - `401` Token 缺失/错误；`403` Token 有效但资源被禁用（如 `ADMIN_TOKEN` 未配置时也可用 503，二选一以 D2 实现定，design 建议 503）。
  - `404` 资源不存在；`409` 冲突（如重复 name）；`422` 校验失败（字段缺失/格式非法）。
  - `502` 上游代理失败；`503` 服务不可用（ADMIN_TOKEN 未配置）。
- 列表分页（MVP）：
  - 查询参数 `page`（从 1 起，默认 1）、`pageSize`（默认 20，上限 100）。
  - 响应 `data` 形如 `{ items: T[]; total: number; page: number; pageSize: number }`。

### 2.5 与现有路由差异（迁移注意，不写代码）

- 现状（`backend/src/routes/admin/credentials.ts`、`checkin.ts`）与 R5/D8 的差距：
  1. **无鉴权**：全部 `/admin/*` 无 `x-admin-token` 校验 → 需新增 admin auth 中间件并挂到 `/admin` 前缀。
  2. **无统一 envelope**：现有响应直接 `reply.send(...)` 自由结构 → 需统一为 `{code,message,data}` 形状。
  3. **`POST /admin/credentials` 仅支持 `{name,key}`**：需新增 `POST /admin/credentials/upload` 承接 local-file 上传（D5），保留原端点语义。
  4. **列表明文**：`GET /admin/credentials` 当前返回完整 token/key → 需脱敏为前 4+后 4（D5）。
  5. **字段命名**：现有 `credentialId` / `activeId` / `executedAt` 已 camelCase，基本对齐；新增字段统一 camelCase。
  6. **无 `api-keys` 资源**：需新增路由与 store（D3）。
  7. **`ADMIN_TOKEN` 未配置**：当前无该配置项，需新增并在缺失时拒绝 `/admin/*`。
  8. **CORS**：当前 `origin: true` → 公网向收紧为同源或白名单（D1/D8）。

---

## 3. 前端通用壳（D8-B）

### 3.1 目录分层

```
frontend/
  src/
    api/            # HTTP client + 资源模块（auth/credentials/apiKeys/checkin/quota）
      client.ts     # axios/fetch 封装：baseURL、拦截器、envelope 解包、401 跳登录
      auth.ts
      credentials.ts
      apiKeys.ts
      checkin.ts
      quota.ts
    stores/         # Pinia：auth、credentials、apiKeys、config(flags)
    pages/          # Login / Credentials / ApiKeys / Checkin / Quota
    components/     # 通用组件（BrandHeader、NavMenu、SensitiveField、Pagination）
    config/         # 品牌与 flags 加载：从 VITE_* 或 /admin-ui-config.json
      index.ts
      schema.ts     # config 形状定义（ts 类型）
    router/         # 读 flags 生成路由守卫与菜单
    App.vue
    main.ts
  public/
    admin-ui-config.json   # 可选 runtime 配置（static 托管）
  vite.config.ts
  .env / .env.production
```

### 3.2 config 与 feature flags 字段清单

```ts
// 形状示意，仅描述结构
type AdminUiConfig = {
  brand: {
    name: string;          // 品牌名
    logoUrl?: string;      // Logo
    pageTitle: string;     // 浏览器标题
  };
  nav: {
    credentials: string;  // 导航文案
    apiKeys: string;
    checkin: string;
    quota: string;
  };
  api: {
    baseURL: string;      // 空字符串表示同源
  };
  features: {
    checkin: boolean;
    quota: boolean;
    apiKeys: boolean;
    // 可扩展
  };
};
```

- 构建期：`VITE_BRAND_NAME`、`VITE_API_BASE`、`VITE_FEATURE_CHECKIN` 等注入。
- 运行期（可选）：`/admin-ui-config.json` 由 `@fastify/static` 托管，前端启动时 fetch 并合并；二者叠加以 design 实现定（建议 runtime 覆盖构建期）。

### 3.3 路由与菜单如何读 flags

- `router/index.ts`：路由 meta 声明 `feature: 'checkin' | 'quota' | ...`；全局前置守卫读 `stores.config.features`，关闭则 `next('/credentials')` 或 404。
- `components/NavMenu.vue`：根据同一 flags 源过滤菜单项；关闭项不渲染。
- 关闭后不可通过手输 URL 访问（守卫拦截），符合 R4「关闭后导航与路由不可达」。

### 3.4 api client 约定

- `api/client.ts`：
  - `baseURL` 从 config 读取（开发期 Vite proxy 转发 `/admin` 到 `127.0.0.1:11434`；生产同源留空）。
  - 请求拦截器：从 `localStorage` 取 Token 注入 `x-admin-token`。
  - 响应拦截器：
    - 解包 envelope：`data` 抽出给业务；`code !== 2xx` 抛错。
    - `401` → 清 Token、跳 `/login`。
    - `503`（ADMIN_TOKEN 未配置）→ 提示并跳登录。
- 资源模块按 §2.3 表逐个封装，字段 camelCase。

### 3.5 MVP 页面与 stores 对应

| 页面 | 路由 | 依赖 store | 依赖 API 模块 | feature flag |
|---|---|---|---|---|
| Login | `/login` | auth | auth.verify | — |
| Credentials | `/credentials` | credentials | credentials | — |
| ApiKeys | `/api-keys` | apiKeys | apiKeys | `features.apiKeys` |
| Checkin | `/checkin` | checkin | checkin | `features.checkin` |
| Quota | `/quota` | quota | quota | `features.quota` |

---

## 4. 数据模型扩展（D3）

### 4.1 api-keys 存储

- 独立文件：`DATA_DIR/api-keys.json`（与 `credentials.json` 分离，避免耦合）。
- 字段（camelCase）：
  - `id`：内部 ID（uuid 或 nanoid）。
  - `name`：人类可读标签。
  - `key`：实际 API Key（建议 `sk-` 前缀或自定义前缀；生成于创建时）。
  - `enabled`：boolean。
  - `createdAt` / `updatedAt`：ISO 字符串。
- 列表/详情 `key` 脱敏前 4+后 4；创建响应返回一次明文（D5 规则继承）。

### 4.2 凭证轮询策略

- 配置位置：建议放在 `credentials.json` 顶层 `rotation` 字段，或独立 `rotation.json`（design 建议 `credentials.json` 内 `meta.rotation`）。
- 默认策略：`round-robin`（轮询）；可选 `priority`（按 priority 字段）。
- 运行时：`/v1` 请求时按策略从 `credentials` 中取一个启用且有效的凭证；失败自动 failover 到下一个。
- 策略可由管理前端设置（MVP 可仅支持轮询开关，不强制 UI 暴露 priority）。

---

## 5. Docker / 部署

### 5.1 镜像构建（多阶段）

- Stage 1（`node:20-alpine`）：构建 `frontend`（`npm ci && npm run build`）。
- Stage 2（`node:20-alpine`）：构建 `backend`（`npm ci && npm run build`）；拷入 `frontend/dist` 到后端静态目录。
- Stage 3（运行时，精简）：仅拷贝 `backend/dist`、`frontend/dist`、`package.json`、`node_modules`（或 `npm ci --omit=dev`）。

### 5.2 环境变量

- `ADMIN_TOKEN`：管理员 Token（必填，否则 `/admin/*` 拒绝服务）。
- `API_KEY`：可选，`/v1` 客户端 API Key（D1/D3，未配置则不校验）。
- `PORT`：默认 11434。
- `HOST`：Docker `0.0.0.0`；本机 `127.0.0.1`。
- `DATA_DIR`：数据目录，默认 `backend/data`。
- `CORS_ORIGIN`：可选白名单，未配置时公网向默认同源收紧（D8）。
- 前端 feature flags 可通过构建期 `VITE_FEATURE_*` 注入（运行期 config 覆盖）。

### 5.3 volume / healthcheck

- volume：`<host>:/data` 映射到 `DATA_DIR`。
- healthcheck：`CMD ["wget", "-qO-", "http://127.0.0.1:11434/health"]` 或 `node` 内置 fetch。
- `docker-compose.yml` 示例 env 文件 `.env.example`。

---

## 6. 安全

### 6.1 脱敏

- 敏感字段（`accessToken` / `refreshToken` / `key`）在列表/详情统一前 4+后 4（D5）。
- 仅创建/上传成功响应返回一次明文；之后一律脱敏。
- 日志：禁止打印完整 Token/Key；统一 mask。

### 6.2 Token 存储

- 前端 Token 存 `localStorage`：存在 XSS 窃取风险；设计上接受（MVP 单用户管理台，D2 静态 Token）。
- 缓解：CORS 收紧同源/白名单；后续如需更高安全可改为 httpOnly cookie（非本任务范围）。

### 6.3 CORS

- 公网向场景：`origin` 收紧为同源或显式白名单 `CORS_ORIGIN`（D1/D8）。
- 开发期 Vite proxy 绕过 CORS。

### 6.4 公网暴露清单

- 必须开放：`11434/tcp`。
- `/health` 可对探针开放（免鉴权，仅返回状态）。
- `/admin/*`、`/v1`、static 前端均通过同一端口；建议前置反代加 HTTPS（Out of Scope，仅文档说明）。

---

## 7. 兼容与迁移

### 7.1 旧 `credentials.json` 兼容

- 现有 `credentials.json` 结构保持读取兼容；新增 `api-keys.json`、`rotation` 字段为可选，缺失时使用默认策略。
- 首次启动若 `ADMIN_TOKEN` 未配置，`/admin/*` 拒绝服务但 `/v1`、`/health` 仍可用（D1/D2）。

### 7.2 管理 API 响应形状变更影响

- 仓库内**无现有前端客户端**（Confirmed Facts），`/admin/*` 响应改为统一 envelope 属破坏性变更但可接受。
- `backend/test/` 为脚本式，需同步更新断言（验收阶段处理，不强制本任务改测试框架）。

### 7.3 `/v1` 兼容

- `/v1` 保持 OpenAI 兼容原样；仅新增可选 API Key 校验（D1/D3），未配置 `API_KEY` 时行为不变。

---

## 8. 风险与非目标

### 8.1 明确不做（C 级）

- 资源元数据 schema 驱动 CRUD 表单渲染。
- 插件式页面注册。
- 多租户白标 SaaS、主题市场。
- 管理 API 完整 OpenAPI 自动生成流水线（可手写文档）。

### 8.2 风险

- 单容器同时跑前后端：静态文件路径与 API 路由冲突需在 `@fastify/static` 配置 `prefix` 或 `root` 规避（如 static 仅服务非 `/admin`、`/v1`、`/health` 的路径）。
- `localStorage` Token 风险（见 §6.2）。
- 多凭证轮询 failover 在并发场景下的竞态：需 store 层原子化（MVP 可接受简单锁或顺序选择）。

### 8.3 测试策略

- 现有 `backend/test/` 为脚本式，无 jest/vitest。
- 管理鉴权与脱敏：用脚本/手工验收（curl + 断言 envelope 形状与脱敏格式）。
- Docker：`docker compose up` 后 `curl /health` 与 `/admin/auth/verify`（带/不带 Token）。
- 前端：MVP 不强制单测，手工走查 5 个页面 + feature flag 开关。

---

## 9. 决策追溯

| 决策 | 选项 | 映射章节 |
|---|---|---|
| D1 部署拓扑 | C 公网向 | §1.1、§5、§6.3、§6.4 |
| D2 管理员 Token | A 静态 Token | §2.2、§6.2、§7.1 |
| D3 AI 能力分发 | C 两层都要 | §2.3（api-keys 路由）、§4 |
| D4 前端技术栈 | Vue3+Vite+ElementPlus | §3.1、§5.1 |
| D5 上传契约与脱敏 | A | §2.3、§2.4、§6.1、§7.1 |
| D6 Windows 脚本 | A | （见 prd R2，本文不展开） |
| D7 端口统一 | C | §5.2 |
| D8 通用管理壳与 API 契约 | B | §2、§3（全文） |
