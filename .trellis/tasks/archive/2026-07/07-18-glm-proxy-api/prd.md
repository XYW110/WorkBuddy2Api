# CodeBuddy GLM 5.2 API 反代服务

## Goal

将 CodeBuddy 桌面端的 GLM 5.2 额度封装为一个可调用的 API 服务，让其他应用（如第三方聊天客户端）能够复用 CodeBuddy 的 AI 能力。

## 确认事实

### 上游 API 协议

- **API 地址**: `https://copilot.tencent.com/v2/chat/completions`（及其他端点）
- **认证方式**: JWT accessToken 或 `ck_xxx` API Key
- **凭证来源**: `%LOCALAPPDATA%\CodeBuddyExtension\Data\Public\auth\workbuddy-desktop.info`
  - 关键字段: `auth.accessToken`（JWT）、`account.uid`
- **必要 Header**:
  - `Authorization: Bearer {accessToken}`
  - `X-User-Id: {uid}`
  - `X-Domain: www.codebuddy.cn`
- **协议特点**: 非标准 OpenAI 格式
- **强制要求**: 必须流式请求 (`stream: true`)，非流式返回 `11101` 错误

### 可用端点

1. **积分额度查询**: POST 请求，查询当前账号的 GLM 5.2 剩余额度
2. **聊天补全**: POST 请求，支持流式 SSE 响应，参数包含 `messages`、`model`、`stream`、`max_tokens`

### 项目约束（来自 .gitignore）

- 涉及 Python、Node.js、Cloudflare Workers
- 计划有 `backend/` 和 `frontend/` 目录
- 配置通过 `config.json`
- 数据存储用 SQLite（`nocturne_memory.db`、`nocturne_data*.db`）

## Requirements

### 核心功能

1. **凭证管理**

   - 启动时自动从 `%LOCALAPPDATA%\CodeBuddyExtension\Data\Public\auth\workbuddy-desktop.info` 加载凭证
   - 支持手动添加 `ck_xxx` 形式的 API Key
   - 支持删除凭证
   - 支持列出所有凭证及额度
   - 支持切换当前使用的凭证

2. **OpenAI 兼容 API**

   - `POST /v1/chat/completions` — 聊天补全，接收标准 OpenAI 请求格式
   - `GET /v1/models` — 返回可用模型列表
   - 请求格式翻译：OpenAI 格式 → CodeBuddy 原生格式
   - 响应格式翻译：CodeBuddy SSE 流 → OpenAI 标准 SSE 流

3. **核心机制**

   - 所有聊天请求必须使用流式 SSE（上游强制要求）
   - 非流式请求也转为流式然后聚合返回完整响应
   - 自动注入必要 Header（Authorization、X-User-Id、X-Domain）

4. **配置与部署**
   - 通过 `config.json` 管理服务端口、日志级别等
   - 支持 PM2 守护进程管理

### 管理 API（内部使用）

- `GET /admin/credentials` — 列出所有凭证
- `POST /admin/credentials` — 添加凭证（`ck_xxx` key）
- `DELETE /admin/credentials/:id` — 删除凭证
- `PUT /admin/credentials/:id/activate` — 切换活跃凭证
- `GET /admin/credentials/:id/quota` — 查询某个凭证的额度

## Acceptance Criteria

- [x] 启动服务后，使用标准 OpenAI 客户端（如 ChatBox、OpenCat）配置 `http://localhost:xxxx/v1` 即可正常对话
- [x] 启动时自动发现并加载本地 `workbuddy-desktop.info` 凭证
- [x] 可通过管理 API 添加多个凭证并切换
- [x] 支持的模型可在 `/v1/models` 查询到
- [x] `pm2 start` / `pm2 stop` 可正常启停服务
- [x] 凭证过期或无效时有明确的错误提示

## Out of Scope

- 多用户认证/鉴权（服务仅本地暴露）
- 前端管理界面
- Docker 部署
- 对话历史持久化
- Token 用量统计

## 待澄清问题

- ✅ 技术栈选型 → Node.js + TypeScript
- ✅ 框架选型 → Fastify
- ✅ API 格式 → 标准 OpenAI 兼容格式（`/v1/chat/completions`）
- ✅ 账号管理 → 单用户多凭证（本地文件 + 手动 key，可切换）
- ✅ 管理界面 → MVP 不做前端，提供管理 API + 后续 CLI
- ✅ 部署方式 → PM2 后台守护服务
