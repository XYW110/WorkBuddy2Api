# 实现计划：每日排行榜驱动的智能经济型别名（auto-cheapest）

> 关联 PRD：`prd.md`（OQ1/OQ2/OQ3/OQ4 均已确认）。
> 复用模式来源：`src/services/scheduler.ts`（checkin 每日定时）、`src/services/checkin.ts`、`src/scripts/run-checkin-once.ts`。

## 0. 前置研究：llm-stats.com 数据源探查（必须先做）

SPA 站点直接 `fetch` HTML 拿不到排行榜数据，需先确认数据从哪来。

- 新建临时脚本 `backend/src/scripts/probe-llm-stats.ts`：
  - `fetch('https://llm-stats.com')` → 打印 HTML 前 N 字节；正则查找 `__NEXT_DATA__` / `<script type="application/json">` / 内嵌 JSON。
  - 若内嵌 JSON 命中 → 确认可直接解析。
  - 若未命中 → 探查常见数据接口（`/api/...`、`/_next/data/...`、`cdn/*.json`、浏览器网络面板常见的 XHR 路径），打印响应结构。
  - 同时探测 AA / SuperCLUE / LMArena / LLMRank 是否可直连、是否也有内嵌数据。
- 输出一份"数据源→取数方式"结论表，作为 `parse.ts` 实现的依据。
- **成功判据**：明确 llm-stats.com（及至少 1 个备选源）的可用取数路径；失败则触发 PRD 的"快照 JSON 兜底"路线。

## 1. 配置（config）

- `backend/src/config.ts`：`Config` 增加 `leaderboard?: { enabled: boolean; hour: number; minute: number; runOnStartupIfMissed: boolean; sources: string[]; primarySource: string; fetchTimeoutMs: number }`。
- `backend/config.json`：加 `leaderboard` 段，默认 `enabled: false`，`primarySource: "llm-stats"`，sources 含多源；生产环境显式开启。
- 遵守 database-guidelines：敏感/可配项走 config，不写死。

## 2. 抓取层 `src/services/leaderboard/fetch.ts`

- `fetchAllSources(cfg)`：并发抓多源；每源：
  - 带 `fetchTimeoutMs` 超时（AbortController）；
  - 单源失败仅记 warn 并跳过，不影响其他源；
  - **先存原始快照** `data/leaderboard/raw/<source>-<YYYY-MM-DD>.json`（无论解析成败，便于回放）；
  - 全部失败 → 返回 `snapshot.json` 兜底数据 + info 日志。
- 导出统一的"原始响应 + 状态码"。

## 3. 解析层 `src/services/leaderboard/parse.ts`

- `parseSource(source, raw)` → `RankEntry[]`，结构：`{ modelName: string; score?: number; rank?: number; source: string }`。
- 每源一个解析函数（基于阶段 0 结论）；SPA 内嵌 JSON 优先，HTML 兜底；解析异常 → 返回 `[]` + 告警。
- llm-stats.com 作为主源，权重最高；多源合并去重。

## 4. 模型名映射 `src/services/leaderboard/map.ts`

- `mapToModelId(name)`：对榜单名做归一化（小写、去空格/版本符号、去厂商前缀），与 `MODELS` 表的 `id`/`name`/`aliases` 模糊匹配（含子串/编辑距离）。
- 映射不上 → 忽略该条目，记 info 日志（统计忽略数）。

## 5. 筛选算法 `src/services/leaderboard/select.ts`

- `selectBestModel(rankEntries, models)`：
  - **百分位归一化**：各源排名 → 百分位（0–1），候选模型取平均百分位作为性能依据（PRD AC5）。
  - **免费档**（PRD OQ4）：`credits === 0` 候选中取平均百分位最高者 → 当前即 `hy3`；命中则直接返回。
  - **收费档**：排除 `credits` 最小的"最弱"模型，于剩余中取"倍率较低 + 百分位较高"者（确定性打分）。
  - 返回 `{ selectedModelId, scores: Record<id, percentile>, usedSources }`。
- 纯函数、可单测、可复现。

## 6. 持久化 `src/services/leaderboard/store.ts`

- 写 `data/economy-alias.json`：`{ selectedModelId, scores, source, updatedAt, history: [...] }`（history 保留最近 N 条，遵守 data/ 下 JSON 约定）。
- 读 `loadAlias()`：供路由 / Admin API / 前端使用；文件缺失或损坏 → 返回 `null`（路由回退礼貌错误）。

## 7. scheduler 接入 `src/services/scheduler.ts`

- 复用 checkin 模式：recursive `setTimeout` + `running` 守卫 + `unref`，新增 `scheduleLeaderboard(cfg.leaderboard)`。
- `runOnStartupIfMissed`：启动后短延迟补跑（若当日未跑）。
- `server.ts` 启动处注册（与 checkin 并列）。

## 8. 路由生效 `src/routes/chat.ts`

- `auto-cheapest` 分支：从 `store.loadAlias()` 读 `selectedModelId`；有结果则路由到该模型，否则回退礼貌错误（PRD AC7）。
- 删除/替换原写死 `getCheapestModel()` 调用。

## 9. 模型列表可见 `src/routes/models.ts`

- `GET /v1/models`：追加虚拟模型 `auto-cheapest`（`owned_by` 为本项目、标注虚拟），其 `id` 可被复制使用（PRD AC8）。

## 10. Admin API + 手动脚本

- `src/routes/admin.ts`（或新建 `leaderboard.admin.ts`）：`GET /admin/leaderboard` 看当前结果与 history；`POST /admin/leaderboard/refresh` 立即重算（鉴权复用现有 admin 中间件）。
- `src/scripts/run-leaderboard-once.ts`：手动跑一次抓取+筛选+写入（仿 `run-checkin-once.ts`）。
- `backend/package.json`：加 `npm run leaderboard:once`、`leaderboard:probe`。

## 11. 前端展示 `frontend/src/pages/Models.vue`

- 展示 `auto-cheapest` 当前指向 + 最新排行榜来源/筛选结果（调用 Admin API；OQ3）。
- 新增"刷新经济别名"按钮（触发 `POST /admin/leaderboard/refresh`）。

## 12. 测试与质量

- `backend/test/`：补 `leaderboard.test.ts` —— 映射、百分位归一化、免费优先、收费档排除最弱、持久化读写、SPA 解析（用快照 fixture）。
- 跑 `npm run lint` / `tsc --noEmit` 确保无错（quality-guidelines）。
- 临时 `probe-llm-stats.ts` 探查完成后保留为 `leaderboard:probe` 脚本（可复用于排障），不必删除。

## 复用检查清单

- [x] scheduler 递归定时模式（checkin）
- [x] data/ JSON 持久化约定
- [x] pino 结构化日志（logging-guidelines）
- [x] 单源容错 + 超时 + 降级（error-handling）
- [x] admin 鉴权中间件

## 验收（对应 PRD AC1–AC10）

逐条对照 `prd.md` 的 AC 验收。
