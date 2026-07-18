# Error Handling

> How errors are handled in this project.

---

## Overview

The project uses a simple, explicit error pattern. There are no custom error classes — all errors are plain `Error` objects with descriptive messages. Errors propagate through callbacks (in proxy layer) or via try-catch (in route handlers).

---

## Error Types

No custom error classes are defined. Errors use the pattern:

```typescript
new Error(`描述性错误信息: ${context}`)
```

The project relies on HTTP status codes to convey error semantics:

| Status | Meaning | Example |
|--------|---------|---------|
| 400 | Client request error | `{ error: "缺少 messages 字段" }` |
| 401 | Authentication required | `{ error: "无可用凭证，请先配置" }` |
| 404 | Resource not found | `{ error: "凭证不存在" }` |
| 502 | Upstream failure | `{ error: "上游错误: connection refused" }` |

---

## Error Handling Patterns

### Route handlers (Fastify)
```typescript
// Validate input early, return 400 for bad requests
if (!openaiReq.messages || !Array.isArray(openaiReq.messages)) {
  return reply.status(400).send({ error: "缺少 messages 字段" });
}

// Return 401 for auth issues
if (!cred) {
  return reply.status(401).send({ error: "无可用凭证，请先配置" });
}
```

### Proxy layer (callback-based)
```typescript
// streamRequest uses three callbacks: onData, onEnd, onError
streamRequest(
  credential, body,
  (dataLine) => { /* process data */ },
  () => { /* success: send response */ },
  (err) => {
    logger.error({ err }, "上游流式请求出错");
    reply.status(502).send({ error: `上游错误: ${err.message}` });
  }
);
```

### Promise-based services
```typescript
// Return Promise, reject with descriptive errors
export function refreshAccessToken(credential: Credential): Promise<...> {
  return new Promise((resolve, reject) => {
    if (!credential.accessToken) {
      return reject(new Error("缺少 accessToken，无法刷新"));
    }
    // ...
    if (data.code !== 0) {
      return reject(new Error(`Token 刷新失败: ${data.msg}`));
    }
  });
}
```

---

## API Error Responses

All error responses follow this format:

```json
{
  "error": "人类可读的错误描述"
}
```

Streaming errors inject the error into the SSE stream before closing:
```typescript
reply.raw.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
reply.raw.write(createDoneSSE());
reply.raw.end();
```

---

## Common Mistakes

- **Forgetting to call `resolve()` in Promise wrappers**: The `await new Promise<void>((resolve) => { ... })` pattern under `streamRequest` MUST call `resolve()` in both `onEnd` and `onError` callbacks. Missing `resolve()` causes the Promise to hang forever.
- **Double-sending reply in non-streaming mode**: Fastify's `reply.send()` can only be called once. Use the `ended` flag in `streamRequest` to prevent `[DONE]` from double-triggering `onEnd()`.
- **Calling `reply.send()` after handler returns**: Non-streaming handlers wrap `streamRequest` in `await new Promise()` to ensure the Promise resolves before the handler returns.
