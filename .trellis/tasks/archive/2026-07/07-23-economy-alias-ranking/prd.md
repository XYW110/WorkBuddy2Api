# PRD: 每日排行榜驱动的智能经济型模型别名

## 背景与演进

原始需求：按倍率得到"当前最便宜的模型"，把它包装成一个正式的**虚拟模型名**，该名称指向"当前最便宜的真实模型"。

经多轮讨论，需求演进为：

1. **免费优先最高** —— 免费模型（credits=0，当前即 `hy3`）优先级最高。
2. **"最便宜"太弱** —— 单纯倍率最小的模型（如 `deepseek-v4-flash` x0.06）能力太差，不能作为目标；要选"便宜但够用 / 高性价比"的模型。
3. **用实时排行榜辅助判断** —— 排行榜能给出模型"能力/性能"信号，弥补 `MODELS` 表只有倍率、没有能力的短板。
4. **自动化、可重复** —— 不是人工跑一次，而是**系统每日自动**拉取排行榜 → 列出排行 → 自动筛选 → **自动把别名指向选出的模型**。
5. **多源都抓** —— 抓取 LLM Stats / Artificial Analysis / SuperCLUE / LMArena / LLMRank 等多个实时榜单交叉验证。

现状衔接：

- `backend/src/routes/chat.ts` 已有 `auto-cheapest` 路由，写死调用 `getCheapestModel()`（仅按 `MODELS` 表倍率算），需升级为"读取每日筛选结果"的动态别名。
- `backend/src/services/scheduler.ts` 已有 `setTimeout` 递归 + `config` 驱动的每日定时（签到先例），可直接复用其模式。
- 项目无数据库，数据以 JSON 持久化于 `backend/data/`（见 database-guidelines）。

## 目标

实现一套每日自动化流程：

1. 每日自动抓取多个实时 LLM 排行榜（多源）。
2. 解析并列出排行（模型 → 性能分 / 排名）。
3. 按规则自动筛选：**优先高质量免费模型**；收费模型中选**性能评价高且价格便宜**（排除倍率最小的"最弱"垫底模型）。
4. 将筛选结果**自动写入别名指向目标**；别名作为虚拟模型可被请求使用，并出现在模型列表。

## 非目标

- 不做模型能力实测（仅依赖公开排行榜）。
- 不引入数据库（沿用 `data/` 下 JSON 持久化）。
- 不改变 `auto` / 各具体真实模型的既有路由行为。

## 需求与验收标准

- **AC1 配置驱动**：`config.json` 增加 `leaderboard` 段（`enabled` / `hour` / `minute` / `runOnStartupIfMissed` / `sources`），默认禁用，生产显式开启。
- **AC2 每日抓取 + 启动补跑**：复用 scheduler 模式（recursive `setTimeout` + `running` 守卫 + `unref`），每日定时抓取；`runOnStartupIfMissed` 时启动后短延迟补跑一次。
- **AC3 健壮性**：单源失败不影响其他源；全部失败回退上次缓存结果；每源解析失败跳过并告警；每源带超时保护。
- **AC4 模型名映射**：将榜单展示名映射到本项目 `MODELS` 的 `id`（基于 `name` 归一化 + 模糊匹配），映射不上的条目忽略，记录忽略日志。
- **AC5 筛选算法（确定性、可复现）**：
  - **免费档**：`credits === 0` 的候选中，取在榜单上性能分最高者（当前数据即 `hy3`）。
  - **收费档**（无免费或免费档关闭时）：排除倍率最小（最弱）的模型，于剩余收费候选中取"倍率较低 + 榜单性能较高"者。
  - 跨源分数归一化：各榜单排名转百分位（0–1），取候选模型的平均百分位作为性能依据。
  - 输出唯一目标模型 id。
- **AC6 自动驱动别名**：选出结果持久化至 `data/economy-alias.json`（含 `selectedModelId`、`scores`、`source`、`updatedAt`、历史），别名沿用 `auto-cheapest`（见 OQ2）指向该目标，每日自动重算重设。
- **AC7 路由生效**：`chat.ts` 别名路由改为读取持久化结果（替换原 `getCheapestModel()` 写死逻辑）；请求别名即路由到选出模型。无结果时回退礼貌错误。
- **AC8 列表可见**：别名作为虚拟模型出现在 `GET /v1/models`（标注 `owned_by` 为本项目），调用方可发现并复制 id。
- **AC9 手动触发**：提供 `run-leaderboard-once` 脚本（`npm run leaderboard:once`）+ 管理 API（`GET /admin/leaderboard` 看结果，`POST /admin/leaderboard/refresh` 重算）。
- **AC10 可观测**：抓取 / 解析 / 筛选 / 写入全程结构化日志（pino）；Admin API 可回看最近结果与历史。

## 待确认（Open Questions）

已确认（见对话）：

- **OQ2 别名命名**：沿用 `auto-cheapest`。现有 `chat.ts` 路由已支持该名，只需把写死的 `getCheapestModel()` 改为读取每日筛选结果（持久化的 `selectedModelId`）。
- **OQ4 免费档优先级**：有免费模型（如 `hy3`）则一律优先免费，不参与"是否更高性能付费"的比较。当前数据下免费档即恒选 `hy3`；排行榜主要用于"免费缺失时选高性价比付费模型"以及"展示/验证"。
- **OQ3 前端展示**：后端 `GET /v1/models` 含别名 + Admin API 可查结果；并在管理后台 / `Models.vue` 展示别名当前指向与最新排行榜 / 筛选结果。

已确认：

- **OQ1 抓取路线：以 llm-stats.com 为主源**。多源交叉（LLM Stats / Artificial Analysis / SuperCLUE / LMArena / LLMRank）仍保留，但 **llm-stats.com 作为主源与兜底**（用户指定）。
  - 现实约束与应对（写进方案）：
    - llm-stats.com 等榜单多为 SPA（前端 JS 渲染数据）。**实现时第一步先"探查数据源"**：抓首页 HTML → 解析 `__NEXT_DATA__` / 内嵌 `<script type="application/json">` / 页面内嵌 JSON → 若仍取不到，再探查其前端实际调用的 XHR/JSON 接口（如 `/api/...`、CDN 上的 `*.json`）。
    - **持久化"原始抓取快照"**：无论解析成功与否，先把原始响应存盘（`data/leaderboard/raw/<source>-<date>.json`），便于失败回放与手动补解析，避免重复出网。
    - **快照 JSON 兜底**：全部源都取不到时，支持从 `data/leaderboard/snapshot.json` 读取人工/上次缓存，保证"每日自动"降级为"有数据可算"。

## 风险

- 榜单网站结构变化 / 反爬导致解析失败 → 需容错 + 可手动更新映射；全部失败回退缓存。
- 跨源分数不可直接相加 → 采用排名百分位归一化。
- 出网被阻断（见 OQ1）→ 需有降级路径（缓存 / 快照导入）。
