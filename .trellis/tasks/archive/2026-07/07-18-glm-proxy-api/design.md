# 架构设计

## 整体架构

```
┌─────────────────────────────────────────────────────────┐
│  OpenAI 兼容客户端（ChatBox / OpenCat / Continue.dev）    │
│  请求: POST /v1/chat/completions                         │
└───────────────────┬─────────────────────────────────────┘
                    │ OpenAI 格式 (JSON/SSE)
                    ▼
┌─────────────────────────────────────────────────────────┐
│  WorkBuddy2Api (Fastify)                                │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ OpenAI Route │  │  Translate   │  │ Credential    │  │
│  │ /v1/*        │─▶│  Layer       │─▶│ Manager       │  │
│  └─────────────┘  └──────────────┘  └───────┬───────┘  │
│                                             │           │
│  ┌─────────────┐                    ┌───────▼───────┐  │
│  │ Admin Route │                    │ Credential    │  │
│  │ /admin/*     │                    │ Store         │  │
│  └─────────────┘                    │ (JSON file)   │  │
│                                     └───────────────┘  │
└───────────────────┬─────────────────────────────────────┘
                    │ CodeBuddy 原生格式 + Headers
                    ▼
┌─────────────────────────────────────────────────────────┐
│  CodeBuddy API (copilot.tencent.com)                    │
│  POST /v2/chat/completions  (流式 SSE)                  │
└─────────────────────────────────────────────────────────┘
```

## 目录结构

```
backend/
├── src/
│   ├── index.ts                  # 入口：初始化 server + 加载凭证
│   ├── server.ts                 # Fastify 实例创建 + 插件注册
│   ├── config.ts                 # config.json 读取与类型定义
│   │
│   ├── routes/
│   │   ├── chat.ts               # POST /v1/chat/completions
│   │   ├── models.ts             # GET  /v1/models
│   │   └── admin/
│   │       ├── credentials.ts    # GET/POST/DELETE/PUT /admin/credentials/*
│   │       └── quota.ts          # GET /admin/credentials/:id/quota
│   │
│   ├── services/
│   │   ├── credential-store.ts   # 凭证持久化存储（JSON 文件）
│   │   ├── credential-loader.ts  # 从本地 workbuddy-desktop.info 读取
│   │   ├── proxy.ts              # 向上游 CodeBuddy 发起 HTTP 请求
│   │   └── translate.ts          # OpenAI ↔ CodeBuddy 格式互转
│   │
│   ├── types/
│   │   ├── openai.ts             # OpenAI Chat API 类型
│   │   ├── codebuddy.ts          # CodeBuddy API 类型
│   │   └── credential.ts         # 凭证数据结构
│   │
│   └── utils/
│       ├── env.ts                # 环境变量/凭证文件路径解析
│       └── logger.ts             # 日志工具
│
├── data/
│   └── credentials.json          # 凭证存储文件
│
├── package.json
├── tsconfig.json
└── ecosystem.config.cjs          # PM2 配置
```

## 数据流

### 聊天补全流程

```
客户端请求 (OpenAI JSON)
  │
  ▼
POST /v1/chat/completions { model, messages, stream }
  │
  ├── 1. 读取当前活跃凭证（credential-store → active credential）
  │
  ├── 2. translate.openaiToCodeBuddy() 翻译请求
  │     OpenAI:  { messages: [{role,content}], model, stream, ... }
  │     → CodeBuddy: { messages: [{role,content}], model, stream:true, max_tokens }
  │
  ├── 3. proxy.streamRequest() 向上游发送流式请求
  │     注入 Header: Authorization, X-User-Id, X-Domain
  │     上游强制 stream: true
  │
  ├── 4a. 如果客户端 stream: true
  │     → translate.codeBuddyToOpenAIStream() 实时逐块翻译 SSE
  │     → 直接 pipe 给客户端
  │
  └── 4b. 如果客户端 stream: false
        → 收集所有 chunks → 聚合 → 翻译为 OpenAI 完整响应
        → 返回 JSON
```

## 凭证体系

### 凭证来源

| 来源 | 类型 | 获取方式 | 字段 |
|------|------|----------|------|
| 本地文件 | `local-file` | 自动读取 `workbuddy-desktop.info` | `accessToken` (JWT), `uid` |
| 手动 Key | `api-key` | 通过 API 添加 | `ck_xxx` 字符串 |

### 凭证存储结构

```jsonc
{
  "credentials": [
    {
      "id": "uuid-1",
      "name": "本地账号",
      "type": "local-file",      // "local-file" | "api-key"
      "source": "auto-detected", // 来源标记
      "accessToken": "eyJ...",
      "uid": "user-xxx",
      "isActive": true
    },
    {
      "id": "uuid-2",
      "name": "备用Key",
      "type": "api-key",
      "key": "ck_xxxxxx",
      "isActive": false
    }
  ],
  "activeId": "uuid-1"
}
```

### 凭证优先级

1. 手动激活的凭证（通过管理 API 切换）
2. 如果无活跃凭证，默认使用第一个本地文件凭证
3. `ck_xxx` Key 模式：Header 只需 `Authorization: Bearer {key}`，无需 `X-User-Id` 和 `X-Domain`

## 协议转换

### 请求转换：OpenAI → CodeBuddy

| OpenAI 字段 | CodeBuddy 字段 | 说明 |
|-------------|---------------|------|
| `messages` | `messages` | 直接映射 |
| `model` | `model` | 直接映射，默认 `"auto"` |
| `stream` | `stream` | 上游**强制设为 true** |
| `max_tokens` | `max_tokens` | 直接映射 |
| `temperature` | — | CodeBuddy 不支持，忽略 |
| `top_p` | — | 忽略 |

### 响应转换：CodeBuddy SSE → OpenAI SSE

CodeBuddy 的 SSE 格式为非标准。核心转换逻辑：
- 解析 CodeBuddy 的 SSE data 行
- 提取 `choices[0].delta.content` 填充到 OpenAI 格式
- 注入 `id`、`object: "chat.completion.chunk"` 等 OpenAI 规范字段
- 结束时发送 `[DONE]`

（具体格式字段在上游 API 实际调试后确认）

## 模型列表

启动时返回静态模型列表。CodeBuddy 默认使用 `"auto"` 自动选择模型。

```json
{
  "object": "list",
  "data": [
    { "id": "glm-5.2", "object": "model", "owned_by": "zhipu" },
    { "id": "auto",     "object": "model", "owned_by": "codebuddy" }
  ]
}
```

## 错误处理

| 场景 | HTTP 状态码 | 处理 |
|------|-----------|------|
| 无可用凭证 | 401 | 返回 `{"error": "No credential available"}` |
| 凭证过期/上游 401 | 502 | 标记凭证为过期，返回上游错误 |
| 上游网络错误 | 502 | 返回连接错误 |
| 非流式转换错误 | 500 | 内部聚合失败 |

## 技术选型

| 层 | 选择 | 原因 |
|----|------|------|
| 运行时 | Node.js + TypeScript | 类型安全 |
| 框架 | Fastify | SSE 流原生支持、插件化 |
| HTTP 客户端 | `undici` (Node 内置) | 性能好，原生 fetch |
| 配置 | `config.json` (JSON 文件) | 简单，无需额外库 |
| 凭证存储 | `data/credentials.json` | 轻型，无需 SQLite |
| 日志 | `pino` (Fastify 内置) | 高性能结构化日志 |
| 进程管理 | PM2 | Windows 兼容，后台守护 |
