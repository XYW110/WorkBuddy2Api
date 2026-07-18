# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

**This project does not use a database.** There is no ORM, no SQLite, and no migration system.

---

## Data Persistence

Data is persisted as JSON files under `backend/data/`:

- `credentials.json` — credential store (array of `Credential` objects)

All reads and writes go through `services/credential-store.ts`:
- `loadStore()` — reads `credentials.json` at startup
- `persist()` — writes updated store to `credentials.json` after mutations
- Pattern: `readFileSync` / `writeFileSync` with `JSON.parse` / `JSON.stringify`

---

## If a Database Is Added Later

When a real database is needed, follow these conventions:
- Add a `data/` layer under `services/` (e.g., `services/data/user-repo.ts`)
- Use the same `services/credential-store.ts` pattern as the public API
- Migrations go under `backend/migrations/`
- Connection config goes in `config.json`
