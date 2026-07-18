# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

Backend code uses TypeScript with strict type checking. The project is ESM-only (`"type": "module"` in package.json). Code is executed via `tsx` (not compiled to JS first).

---

## Forbidden Patterns

- **`any` type** — use proper TypeScript types or `unknown` + type guards
- **`require()` / CommonJS** — project is ESM-only, use `import` statements
- **String interpolation in logs** — use pino's structured logging: `logger.info({ key }, "msg")`
- **`console.log`** — use the pino logger wrapper
- **Direct filesystem writes outside `data/`** — use `credential-store.ts` pattern
- **Hardcoding credentials** — all secrets come from config.json or env files
- **`reply.send()` called twice** — use the `ended` flag guard in `streamRequest`

---

## Required Patterns

- **ESM imports with `.js` extension**: `import { config } from "../config.js"`
- **TypeScript type imports**: use `import type` for type-only imports
- **Explicit return types** on exported functions (when non-trivial)
- **Callback-based async patterns** for stream processing (not async generators)
- **`Promise` wrapping** for converting callback APIs to await-able patterns
- **Flag guards** to prevent double-callbacks: always check an `ended`-style flag before calling `onEnd()`

### Import style
```typescript
// Type imports (no runtime cost)
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { Credential } from "../types/credential.js";

// Value imports
import { streamRequest } from "../services/proxy.js";
import { logger } from "../utils/logger.js";
import * as credentials from "../services/credential-store.js";
```

---

## Testing Requirements

- Test scripts are standalone `.mjs` files using Node's built-in `fetch`
- Each major feature needs an end-to-end test: `chat-e2e.test.mjs`, `tool-call.test.mjs`
- Start the server first, then run tests against it
- Tests should verify: streaming mode, non-streaming mode, tool calling, error cases

---

## Code Review Checklist

- [ ] No `any` types or unnecessary type assertions
- [ ] All imports use `.js` extension (ESM requirement)
- [ ] Error paths have corresponding `logger.error()` calls
- [ ] Callback-based code checks `ended` flag to prevent double-trigger
- [ ] Promise wrappers call `resolve()` in all exit paths (including error)
- [ ] New routes are registered in `server.ts`
- [ ] Type definitions are in `types/`, not inline in service/route files
- [ ] No sensitive data in logs (tokens, keys, message content)
