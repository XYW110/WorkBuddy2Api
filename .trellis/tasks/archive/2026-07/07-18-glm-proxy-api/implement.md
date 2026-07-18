# 实施计划

## 前置准备

- [x] 初始化 `backend/` 项目：`package.json`、`tsconfig.json`
- [x] 安装依赖：`fastify`、`@fastify/cors`、`pino`、`tsx`、`typescript`、`@types/node`

## 实施步骤

### 阶段 1：项目骨架

- [x] 1.1 初始化 package.json 和 tsconfig.json
- [x] 1.2 创建目录结构（routes/、services/、types/、utils/）
- [x] 1.3 实现 config.ts — 读取 config.json
- [x] 1.4 实现 utils/logger.ts — pino 日志
- [x] 1.5 实现 utils/env.ts — 凭证文件路径解析
- [x] 1.6 实现 server.ts — Fastify 实例创建，注册插件
- [x] 1.7 实现 index.ts — 入口，启动服务

### 阶段 2：凭证管理

- [x] 2.1 定义 types/credential.ts — Credential 数据结构
- [x] 2.2 实现 services/credential-loader.ts — 读取 workbuddy-desktop.info
- [x] 2.3 实现 services/credential-store.ts — JSON 文件 CRUD
- [x] 2.4 实现 routes/admin/credentials.ts — 管理 API（CRUD + 切换）

### 阶段 3：协议转换层

- [x] 3.1 定义 types/openai.ts — OpenAI Chat API 类型
- [x] 3.2 定义 types/codebuddy.ts — CodeBuddy API 类型
- [x] 3.3 实现 services/translate.ts — OpenAI ↔ CodeBuddy 格式互转

### 阶段 4：代理与路由

- [x] 4.1 实现 services/proxy.ts — 向上游发起流式 SSE 请求
- [x] 4.2 实现 routes/chat.ts — POST /v1/chat/completions（流式 + 非流式）
- [x] 4.3 实现 routes/models.ts — GET /v1/models

### 阶段 5：部署与验证

- [x] 5.1 创建 ecosystem.config.cjs — PM2 配置
- [x] 5.2 编写 README.md — 使用说明
- [x] 5.3 整体测试：启动服务 → 用 curl 调 /v1/chat/completions → 验证 SSE 响应

### 阶段 6：扩展功能（超出原计划）
- [x] 6.1 Token 刷新 — 支持自动检测 401 并使用 refreshToken 续期
- [x] 6.2 Tool Calling — 支持 OpenAI function calling 协议
- [x] 6.3 额度查询 — POST /admin/credentials/:id/quota 查询凭证积分


## 风险点与验证

| 风险 | 验证方式 |
|------|---------|
| 上游 SSE 格式不确定 | 先发一个简单请求，抓包看 CodeBuddy 的真实响应格式，再完成 translate.ts |
| 凭证文件可能不存在 | credential-loader 需要优雅降级，启动时打印警告但不崩溃 |
| 非流式请求聚合 | 把上游流式 chunks 全部收集再拼接，注意处理 `[DONE]` 结束信号 |

## 文件清单（按创建顺序）

1. `backend/package.json`
2. `backend/tsconfig.json`
3. `backend/config.json`
4. `backend/src/types/credential.ts`
5. `backend/src/types/openai.ts`
6. `backend/src/types/codebuddy.ts`
7. `backend/src/utils/env.ts`
8. `backend/src/utils/logger.ts`
9. `backend/src/config.ts`
10. `backend/src/services/credential-loader.ts`
11. `backend/src/services/credential-store.ts`
12. `backend/src/services/translate.ts`
13. `backend/src/services/proxy.ts`
14. `backend/src/routes/admin/credentials.ts`
15. `backend/src/routes/chat.ts`
16. `backend/src/routes/models.ts`
17. `backend/src/server.ts`
18. `backend/src/index.ts`
19. `backend/ecosystem.config.cjs`
20. `README.md`
