# Directory Structure

> How backend code is organized in this project.

---

## Overview

Backend is a TypeScript Node.js project using Fastify, located at `backend/`. The codebase follows a layered architecture with clear separation of concerns: routes (HTTP handlers), services (business logic), types (data contracts), and utils (shared helpers).

---

## Directory Layout

```
backend/
├── src/
│   ├── index.ts              # Entry point — starts the Fastify server
│   ├── server.ts             # Fastify instance creation, plugin registration
│   ├── config.ts             # Reads config.json, exports typed config object
│   ├── routes/
│   │   ├── chat.ts           # POST /v1/chat/completions — OpenAI-compatible chat
│   │   ├── models.ts         # GET /v1/models — model listing
│   │   └── admin/
│   │       ├── credentials.ts # Admin CRUD + quota endpoints
│   │       └── checkin.ts     # Admin checkin routes (run / status / by-id)
│   ├── services/
│   │   ├── credential-loader.ts  # Reads local workbuddy-desktop.info file
│   │   ├── credential-store.ts   # In-memory credential storage + JSON persistence
│   │   ├── translate.ts          # OpenAI ↔ CodeBuddy protocol translation
│   │   ├── proxy.ts             # HTTP requests to upstream CodeBuddy API
│   │   ├── checkin.ts           # Daily checkin service (status + daily-checkin + refresh retry)
│   │   └── scheduler.ts         # setTimeout-based daily checkin scheduler
│   ├── types/
│   │   ├── credential.ts    # Credential, CredentialStore interfaces
│   │   ├── openai.ts        # OpenAI Chat API types (requests, responses, chunks)
│   │   ├── codebuddy.ts     # CodeBuddy native API types
│   │   └── checkin.ts      # Checkin activity / daily-checkin / result interfaces
│   ├── scripts/
│   │   └── run-checkin-once.ts # One-shot CLI: npm run checkin:once
│   └── utils/
│       ├── env.ts           # Path resolution (credential file, data dir)
│       └── logger.ts        # Pino logger wrapper
├── test/
│   ├── chat-e2e.test.mjs    # End-to-end streaming/non-streaming chat tests
│   ├── tool-call.test.mjs   # Function calling end-to-end tests
│   └── api.test.ts          # Basic API endpoint tests
├── config.json              # Static config (port, upstream URL, domain, checkin schedule)
├── ecosystem.config.cjs     # PM2 process manager config
├── package.json
└── tsconfig.json
```

---

## Module Organization

- **routes/** — Fastify route handlers. Each file registers routes onto a Fastify instance. Admin routes go under `routes/admin/`.
- **services/** — Business logic and external integration. Services are pure functions with callback or Promise-based APIs. Should NOT import Fastify.
- **types/** — TypeScript interfaces and type aliases only. No runtime code. File naming: `domain-name.ts` (e.g., `openai.ts`, `codebuddy.ts`).
- **utils/** — Small, reusable utility functions. No business logic. No side effects on import.
- **test/** — Test scripts. Named `<feature>.test.mjs` for standalone Node.js scripts, or `<feature>.test.ts` for TypeScript tests.

When adding a new feature:

1. Add types in `types/` if needed
2. Add business logic in `services/`
3. Add route handler in `routes/`
4. Register the route in `server.ts`

---

## Naming Conventions

- **Files**: kebab-case with `.ts` extension (`.js` in imports due to ESM)
- **Routes**: `domain-name.ts` (e.g., `chat.ts`, `models.ts`)
- **Services**: `domain-name.ts` (e.g., `credential-store.ts`, `translate.ts`)
- **Types**: `domain-name.ts` (e.g., `openai.ts`, `codebuddy.ts`)
- **Test files**: `feature-name.test.mjs` or `feature-name.test.ts`
- **Functions**: camelCase, with `export` prefix for public API
- **Directories**: kebab-case or singular noun (`routes/`, `services/`, `types/`, `utils/`)

---

## Examples

- `routes/chat.ts` — See how `doStreamRequest()` wraps proxy with auth refresh
- `services/proxy.ts` — See `streamRequest()` for callback-based HTTP pattern
- `services/credential-store.ts` — See JSON file persistence with `persist()` helper
- `services/checkin.ts` — See `runCheckin()` for the three-step checkin flow with token refresh retry
- `services/scheduler.ts` — See `startScheduler()` for setTimeout-based daily scheduling with `unref()`
- `routes/admin/checkin.ts` — See admin checkin run/status/by-id endpoints
