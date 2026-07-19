# Checkin Scheduler

> Daily checkin automation, setTimeout-based scheduling, and admin API contracts.

---

## Scope / Trigger

This guideline applies when you work on:

- Daily checkin against upstream CodeBuddy billing endpoints
- Scheduled auto-checkin or startup catch-up runs
- Admin routes under `/admin/checkin*`
- One-shot debug script `npm run checkin:once`
- Token refresh behavior used only during checkin

**Do not use this guide for** chat proxy flows, credential CRUD (except token update side-effects), or frontend UI.

**Real files:**

| File | Role |
|------|------|
| `backend/src/types/checkin.ts` | Response and result types |
| `backend/src/services/checkin.ts` | Status query, daily checkin, refresh retry |
| `backend/src/services/scheduler.ts` | Daily schedule + startup catch-up |
| `backend/src/routes/admin/checkin.ts` | Admin HTTP API |
| `backend/src/scripts/run-checkin-once.ts` | CLI one-shot entry |
| `backend/src/config.ts` | `CheckinConfig` merge defaults |
| `backend/src/server.ts` | Register routes; call `startScheduler()` after listen |

**Upstream endpoints (CodeBuddy / copilot.tencent.com):**

| Purpose | Method + Path | Body |
|---------|---------------|------|
| Activity status | `POST /v2/billing/meter/checkin-activity-status` | `{}` |
| Daily checkin | `POST /v2/billing/meter/daily-checkin` | `{}` |
| Token refresh (shared) | `POST /v2/plugin/auth/token/refresh` | via `proxy.refreshAccessToken` |

---

## Signatures

### Types (`types/checkin.ts`)

```typescript
export interface CheckinActivityData {
  active: boolean;
  today_checked_in: boolean;
  streak_days: number;
  daily_credit: number;
  today_credit: number;
  is_streak_day: boolean;
  next_streak_day: number;
  streak_bonus_days: number;
  streak_bonus_credit: number;
  checkin_dates: string[];
  week_checkin_days: number;
  week_progress: boolean[];
  total_credits: number;
  start_time: string;
  end_time: string;
  theme_name: string;
  season: number;
  activity_name: string;
  claim_button_text: string;
  action_button?: { show: boolean; text: string; action: string };
}

export interface CheckinStatusResponse {
  code: number;
  msg: string;
  requestId?: string;
  data: CheckinActivityData;
}

export interface DailyCheckinResponse {
  code: number;
  msg: string;
  requestId?: string;
  data: { credit: number; streak_days: number; is_streak_day: boolean };
}

export interface CheckinResult {
  success: boolean;
  skipped: boolean;
  reason?: string;
  credit?: number;
  streakDays?: number;
  totalCredits?: number;
  todayCheckedIn?: boolean;
  executedAt: string;
  credentialId?: string;
  credentialName?: string;
}
```

### Checkin service (`services/checkin.ts`)

```typescript
export async function getCheckinStatus(
  credential: Credential
): Promise<CheckinStatusResponse>;

export async function doDailyCheckin(
  credential: Credential
): Promise<DailyCheckinResponse>;

/** Full flow: status → skip or checkin → optional verify; 401/403 refresh once */
export async function runCheckin(
  credential: Credential,
  retried?: boolean  // default false
): Promise<CheckinResult>;

export async function runCheckinWithActive(): Promise<CheckinResult>;
```

Internal (do not re-export elsewhere unless needed):

- `buildHeaders(credential)` — api-key → `Bearer key`; local-file → `Bearer accessToken` + optional `X-User-Id` + `X-Domain`
- `hasAuth(credential)` — api-key needs `key`; else `accessToken`
- `postEmptyJson(path, credential)` — native `node:http` / `node:https`, body always `"{}"`
- `tryRefresh(credential)` — **local-file only**; calls `refreshAccessToken` + `store.updateCredentialToken`
- `isAuthError(err)` — checks `err.authError === true`

### Scheduler (`services/scheduler.ts`)

```typescript
export function msUntilNext(
  hour: number,
  minute: number,
  from?: Date  // default new Date()
): number;

export function startScheduler(): void;
export function stopScheduler(): void;
```

### Config (`config.ts` — not exported interface, module-local)

```typescript
interface CheckinConfig {
  enabled: boolean;
  hour: number;
  minute: number;
  runOnStartupIfMissed: boolean;
}

// Defaults (conservative)
const DEFAULT_CHECKIN: CheckinConfig = {
  enabled: false,
  hour: 9,
  minute: 5,
  runOnStartupIfMissed: true,
};

// Merge: { ...DEFAULT_CHECKIN, ...parsed.checkin }
```

### Admin routes (`routes/admin/checkin.ts`)

```typescript
export async function checkinRoutes(app: FastifyInstance): Promise<void>;
// POST /admin/checkin           → runCheckinWithActive(); 200 or 502 + CheckinResult
// GET  /admin/checkin/status    → getCheckinStatus(active); 404 if no credential; no auto-refresh
// POST /admin/checkin/:id       → runCheckin(getById(id)); 404 if missing
```

### One-shot script (`scripts/run-checkin-once.ts`)

```typescript
// Order (must match index.ts bootstrap):
// 1. loadStore()
// 2. loadLocalCredential() → addLocalCredential or exitCode=2
// 3. await runCheckinWithActive()
// 4. exitCode = result.success ? 0 : 1
// Uncaught → exitCode=1
```

### Server wiring (`server.ts`)

```typescript
await app.register(checkinRoutes);
// After successful app.listen(...):
startScheduler();  // NEVER before listen
```

---

## Contracts

### HTTP headers for checkin upstream

| Credential type | Authorization | Extra headers |
|-----------------|---------------|---------------|
| `api-key` | `Bearer ${key}` | `Content-Type`, `Accept` |
| `local-file` | `Bearer ${accessToken}` | `X-User-Id` if uid present; `X-Domain: config.codebuddy.domain` |

Base URL: `config.codebuddy.baseUrl`. Body: always empty JSON object `{}`.

### `runCheckin` exit paths (reason literals must stay exact)

| Condition | success | skipped | reason |
|-----------|---------|---------|--------|
| Missing auth (`!hasAuth`) | `false` | `true` | `"凭证缺少 accessToken/key"` |
| `data.active === false` | `true` | `true` | `"活动未开启"` |
| `data.today_checked_in === true` | `true` | `true` | `"今日已签到"` |
| `doDailyCheckin` succeeded | `true` | `false` | `"签到成功"` |
| No active credential (`runCheckinWithActive`) | `false` | `true` | `"无活跃凭证"` |
| Refresh failed after 401/403 | `false` | `false` | `` `token 刷新失败: ${message}` `` |
| Other failure | `false` | `false` | `err.message` |

Refresh-not-supported (thrown by `tryRefresh`, not a stable skip reason on first return unless caught as refresh failure):

- `"当前凭证类型不支持 token 刷新，请重新登录桌面端"` — non-`local-file` or missing `accessToken`

### Auth error + retry contract

1. `getCheckinStatus` / `doDailyCheckin` on HTTP 401 or 403 throw `Error` with `authError = true`.
2. If `!retried && isAuthError(err)` → `tryRefresh` (local-file only) → `runCheckin(refreshed, true)` **once**.
3. Refresh writes tokens via `store.updateCredentialToken` (disk persist).
4. Second failure is not retried again.

### Status-first rule

Always query `checkin-activity-status` before `daily-checkin`. Never call daily-checkin when `today_checked_in` is already true.

Post-checkin status verify is best-effort: failure logs warn and still returns success from daily-checkin response.

### Scheduler contracts

| Rule | Detail |
|------|--------|
| Timezone | Local machine `Date` (`setHours` / `setDate`) |
| Engine | Recursive `setTimeout`, not cron |
| Overlap | Module flag `running`; if still true, skip with warn |
| Main timer | `timer.unref()` when available |
| Startup catch-up | If `runOnStartupIfMissed`, `setTimeout(runCheckinTask, 3000)` — **not** unref'd today |
| Enable gate | `config.checkin.enabled === false` → log and return (no timers) |
| Lifecycle | Call `startScheduler()` only after successful `listen`; PM2 restart re-schedules from cold start |
| Stop | `stopScheduler()` clears main timer only (does not cancel in-flight task) |

### Admin API contracts

| Method | Path | Auth | Behavior |
|--------|------|------|----------|
| POST | `/admin/checkin` | None (same as other admin) | Full `runCheckinWithActive`; body = `CheckinResult`; 200 if `success`, else 502 |
| GET | `/admin/checkin/status` | None | Active credential required; **no** token auto-refresh; 404 `{ error: "无活跃凭证" }`; 502 on upstream fail |
| POST | `/admin/checkin/:id` | None | 404 `{ error: "凭证不存在" }` if missing |

Prefer POST `/admin/checkin` when status returns auth errors (refresh path lives in `runCheckin`).

### Script exit codes

| Code | Meaning |
|------|---------|
| 0 | `result.success === true` (includes skipped "今日已签到" / "活动未开启") |
| 1 | Checkin failed or uncaught exception |
| 2 | Local credential file not found (script-only) |

### Store prerequisite

Module-level credential store starts empty. Any script or process **must** call `loadStore()` before `getActive()` / checkin. Optional: `loadLocalCredential` + `addLocalCredential` for desktop JWT.

### Import style

ESM with explicit `.js` extensions in imports (e.g. `from "./checkin.js"`).

---

## Validation & Error Matrix

| Input / situation | Validation | Result |
|-------------------|------------|--------|
| Empty store, no active | `getActive()` undefined | `success:false`, `skipped:true`, `"无活跃凭证"` |
| api-key without `key` / local-file without `accessToken` | `hasAuth` | `success:false`, `skipped:true`, `"凭证缺少 accessToken/key"` |
| Upstream `code !== 0` or missing `data` | After HTTP OK | Throw → `success:false`, reason = message |
| HTTP 401/403 on status or checkin | `authError` flag | Refresh once (local-file) or fail |
| api-key hits 401 | `tryRefresh` rejects | `token 刷新失败: 当前凭证类型不支持 token 刷新，请重新登录桌面端` |
| Non-JSON body | `JSON.parse` fails | Reject with parse error message |
| Concurrent scheduler ticks | `running` flag | Second tick skipped with warn log |
| `checkin.enabled=false` | `startScheduler` | No schedule, info log only |
| Admin GET status, no credential | Early return | 404 |
| Admin POST checkin business fail | `result.success` | 502 + `CheckinResult` |
| Admin unexpected throw | catch | 502 + synthetic `CheckinResult` (`err: any` today) |

---

## Good / Base / Bad Cases

### Good

- Status shows not checked in → call daily-checkin → return `reason: "签到成功"` with credit/streak.
- Status shows `today_checked_in` → return success skip without calling daily-checkin.
- 401 on local-file → refresh, update store, retry once, complete.
- `npm run checkin:once` after `loadStore` + local cred → exit 0 when skipped today.
- Server: register `checkinRoutes`, listen, then `startScheduler()`.

### Base (default / expected ops)

- `DEFAULT_CHECKIN.enabled = false`; production enables via `config.json` `"checkin": { "enabled": true, ... }`.
- Schedule at local 09:05; startup catch-up after 3s if configured.
- Scheduler task only calls `runCheckinWithActive()` (active credential).

### Bad (do not)

- Call `daily-checkin` without prior status check.
- Start scheduler before `listen` (or before credentials loaded in process).
- Assume store is loaded without `loadStore()`.
- Implement refresh for `api-key` the same way as local-file.
- Retry auth failures more than once in the same `runCheckin` chain.
- Change Chinese `reason` string literals without updating this spec and all callers.
- Log raw access tokens or API keys.
- Rely on cron packages; this project uses recursive `setTimeout` only.

---

## Tests Required

Minimum coverage when changing checkin/scheduler:

| Area | What to assert |
|------|----------------|
| Skip paths | Missing auth, inactive activity, already checked in — exact `reason` strings |
| Happy path | Mock status `today_checked_in:false` then daily-checkin success |
| Auth retry | 401 once → refresh success → second attempt succeeds; second 401 does not loop |
| api-key 401 | Refresh not attempted / fails with type message |
| `msUntilNext` | Before target time same day; after target time rolls to next day |
| Scheduler overlap | `running=true` skips second invocation |
| Admin routes | 404 no credential / no id; 200 vs 502 based on `success` |
| Script exit codes | 0 success/skip, 1 fail, 2 no local file |
| Config merge | Partial `checkin` in JSON fills remaining defaults |

There is currently **no** dedicated automated checkin test file under `backend/test/`. Prefer adding `checkin.test.mjs` or unit tests with mocked HTTP before relying only on `checkin:once`.

Manual acceptance:

```bash
cd backend
npm run typecheck
npm run build
npm run checkin:once
# Optional with server up:
# POST http://127.0.0.1:<port>/admin/checkin
# GET  http://127.0.0.1:<port>/admin/checkin/status
```

---

## Wrong vs Correct

### Wrong: fire daily-checkin blindly

```typescript
// BAD
await doDailyCheckin(credential);
```

### Correct: status first

```typescript
// GOOD
const status = await getCheckinStatus(credential);
if (!status.data.active) return skip("活动未开启");
if (status.data.today_checked_in) return skip("今日已签到");
await doDailyCheckin(credential);
```

### Wrong: start scheduler before listen / without store

```typescript
// BAD
startScheduler();
await app.listen(...);
// store never loaded → always "无活跃凭证"
```

### Correct: bootstrap order

```typescript
// GOOD (server)
await app.listen(...);
startScheduler();

// GOOD (script)
loadStore();
const local = loadLocalCredential();
if (local) addLocalCredential(local);
await runCheckinWithActive();
```

### Wrong: multi-retry auth loop

```typescript
// BAD
while (true) {
  try { return await runCheckin(cred); }
  catch { cred = await tryRefresh(cred); }
}
```

### Correct: single refresh via `retried` flag

```typescript
// GOOD (as implemented)
if (!retried && isAuthError(err)) {
  const refreshed = await tryRefresh(credential);
  return runCheckin(refreshed, true);
}
```

### Wrong: treat skip as process failure in CLI

```typescript
// BAD
process.exitCode = result.skipped ? 1 : 0;
```

### Correct: success includes intentional skip

```typescript
// GOOD
process.exitCode = result.success ? 0 : 1;
```

---

## Design Decisions

1. **Recursive `setTimeout`, not cron** — Zero extra dependencies; enough for one daily local wall-clock slot. PM2 restart reschedules via `startScheduler()`.

2. **`DEFAULT_CHECKIN.enabled = false`** — Conservative code default; enable explicitly in `config.json` for production auto-run.

3. **401/403 refresh only for `local-file`, once** — Desktop JWT has refresh token; `api-key` (`ck_*`) does not. Infinite refresh loops are forbidden.

4. **`running` guard + main timer `unref()`** — Prevents overlapping checkin tasks; main timer does not keep the process alive alone. Startup 3s catch-up timer is intentionally not unref'd (keeps short-lived processes alive long enough to run).

5. **Native `http`/`https` for empty POST** — Matches existing proxy stack; no axios.

6. **Admin APIs unauthenticated** — Same as credential admin routes; intended for localhost binding (`127.0.0.1`). Do not expose publicly without an auth layer.

7. **Chinese wire-format reasons** — User-facing / log-facing reason strings stay Chinese literals; English is for this guideline prose only.

8. **Post-checkin status verify is soft** — Prefer reporting checkin success over failing the whole flow if the second status call fails.

### Known gaps (document only; not blocking this spec)

- GET `/admin/checkin/status` does not auto-refresh tokens.
- No `SIGTERM` → `stopScheduler()` wiring yet.
- Startup catch-up timer has no `unref()`.
- Route catch blocks use `err: any` (conflicts with quality-guidelines preference against `any`).

---

## Related Docs

- Capture analysis (Chinese): `docs/签到API分析.md`
- Error patterns: [Error Handling](./error-handling.md)
- Logging: [Logging Guidelines](./logging-guidelines.md)
- Layout: [Directory Structure](./directory-structure.md)
