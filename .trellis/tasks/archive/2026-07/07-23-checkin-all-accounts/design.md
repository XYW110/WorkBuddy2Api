# Design：自动签到所有账户

## 边界与契约

### 后端
1. **类型新增**（`types/checkin.ts`）
   ```ts
   export interface CheckinBatchResult {
     results: CheckinResult[];
     summary: { total: number; checked: number; skipped: number; failed: number };
   }
   ```
2. **`services/checkin.ts` 新增 `runCheckinAll`**
   - 签名：`runCheckinAll(source: CheckinSource): Promise<CheckinBatchResult>`
   - 行为：
     - 模块级 `let allRunning = false` 守卫：若已在跑，直接返回（或路由侧 409）。推荐：守卫内返回一项 `skipped=true, reason="已有签到任务进行中"` 的占位——但更清晰的是路由层判忙返回 409。实现采用：函数内 `if (allRunning) throw new Error('CHECKIN_ALL_BUSY')`，由路由捕获为 409。
     - `const creds = store.getAll();`（`credential-store` 已导出 `getAll`）
     - 顺序 `for` 每条：`const r = await runCheckin(cred, source); results.push(r);`（复用既有单条逻辑，含刷新/历史写入）
     - 汇总：`checked = results.filter(r=>r.success && !r.skipped).length`；`skipped = results.filter(r=>r.skipped).length`；`failed = results.filter(r=>!r.success && !r.skipped).length`；`total = results.length`
   - 不新增 `mode` 开关（按用户决策直接全量）。
3. **`services/scheduler.ts` 改造 `runCheckinTask`**
   - 原 `runCheckinWithActive("scheduled")` 改为 `runCheckinAll("scheduled")`。
   - 保留 `running` 守卫（防止与手动 `/checkin/all`/启动任务重叠）。
4. **`routes/admin/checkin.ts` 新增路由**
   - `POST /checkin/all`：`try { const res = await runCheckinAll("manual"); sendOk(reply, res, ...) } catch(e){ if (busy) sendFail(409) else sendFail(500) }`
   - 保留 `/checkin`（活跃）、`/checkin/:id`（指定）不变。
   - 路由在 `/admin` scope 下，自动 admin-only（沿用 `setupAdminAuth`）。

### 前端
5. **`api/checkin.ts` 新增 `checkinAll()`**
   - `POST /admin/checkin/all`，返回 `CheckinBatchResult`。
6. **`pages/Checkin.vue` 新增「全部签到」按钮**
   - 工具栏加 `el-button`（`:loading="allSubmitting"`），点击调 `checkinAll()`，成功后 `ElMessage.success(\`已签 X / 跳过 Y / 失败 Z\`)` 并刷新列表与历史。
   - 复用现有 `load()` / 历史加载函数与 `errMsg` 处理。

## 数据流
调度/手动 → `runCheckinAll` → 遍历 `getAll()` → 逐条 `runCheckin` → `runCheckinCore`（判定 skip/执行/刷新）→ `appendCheckinHistory(credentialId=...)` → 汇总 `CheckinBatchResult` → 返回前端 → 提示 + 刷新。

## 兼容性与回滚
- 删除 active-only 默认：现有多账户用户行为立即变为全量签到。若需回退，临时方案是仅保留 1 条有凭据凭证（其余删 key）——但更稳妥的回滚是 git revert 本任务或恢复 `scheduler.ts` 用 `runCheckinWithActive`。
- 前端仅新增按钮，不删改既有按钮，回滚安全。
- 历史记录结构不变（`appendCheckinHistory` 已含 `credentialId`，天然支持多账户）。

## 取舍
- **顺序执行**而非并发：避免 CodeBuddy 限流与签到历史 JSON 并发写竞争；账户量级小（个位数~几十），耗时可接受。
- **不设 mode 开关**：用户明确选择直接全量，去掉开关降低复杂度。
- **复用 `runCheckin` 单条逻辑**：不重复刷新/跳过/历史写入代码，保证行为一致。
