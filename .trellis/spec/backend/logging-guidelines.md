# Logging Guidelines

> How logging is done in this project.

---

## Overview

The project uses **pino** via a thin wrapper at `src/utils/logger.ts`. All logging is **structured JSON** — no plain string interpolation. This enables log aggregation and searching in production (PM2 log files).

Real file: `backend/src/utils/logger.ts`

```typescript
import pino from "pino";
import { config } from "../config.js";

export const logger = pino({
  level: config.logging.level || "info",
  transport: {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "HH:MM:ss" },
  },
});
```

---

## Log Levels

| Level | When to use | Examples |
|-------|-------------|----------|
| `debug` | Detailed tracing (not used in current code) | — |
| `info` | Normal operations, state changes | "收到聊天请求", "添加凭证", "accessToken 刷新成功" |
| `warn` | Non-fatal issues, degradation | "上游认证失败，尝试刷新 token 后重试" |
| `error` | Failures that need attention | "上游流式请求出错", "token 刷新失败" |

---

## Structured Logging

Always use the structured logging pattern — pass context as the first argument:

```typescript
// ✅ Correct: structured context + message
logger.info({ model, stream: isStreaming }, "收到聊天请求");
logger.error({ err }, "上游流式请求出错");
logger.info({ name: input.name }, "添加凭证");

// ❌ Wrong: string interpolation
logger.info(`收到聊天请求: model=${model}, stream=${isStreaming}`);
```

---

## What to Log

- **Request lifecycle**: incoming requests, model selection, stream vs non-stream
- **Credential operations**: add, remove, activate, token refresh
- **Upstream interactions**: HTTP request sent, response received, auth failures
- **Errors**: always log the error object as `{ err }` first argument

---

## What NOT to Log

- **Access tokens or API keys** — never log `credential.accessToken`, `credential.key`, or `refreshToken`
- **User message content** — chat messages should not appear in logs
- **Full response bodies** — upstream SSE data should not be logged
- **Personal identifiers** — uid should only appear in structured context when necessary for debugging
