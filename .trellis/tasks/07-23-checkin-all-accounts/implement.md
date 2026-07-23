# Implement：自动签到所有账户

## 执行清单（有序）
1. [x] `backend/src/types/checkin.ts`：新增 `CheckinBatchResult` 接口（含 `results` 与 `summary`）。
2. [x] `backend/src/services/checkin.ts`：
   - 导入 `getAll` from `credential-store`；导入 `CheckinBatchResult` 类型。
   - 新增模块级 `let allRunning = false`。
   - 实现 `runCheckinAll(source)`：守卫（busy 抛 `CHECKIN_ALL_BUSY`）；遍历 `getAll()`；逐条 `await runCheckin(cred, source)`；汇总 `summary`；返回 `CheckinBatchResult`。
3. [x] `backend/src/services/scheduler.ts`：`runCheckinTask` 中将 `runCheckinWithActive("scheduled")` 改为 `runCheckinAll("scheduled")`（保留 `running` 守卫）。
4. [x] `backend/src/routes/admin/checkin.ts`：新增 `POST /checkin/all`，调用 `runCheckinAll("manual")`，捕获 `CHECKIN_ALL_BUSY` → 409；其余错误 502；返回 `CheckinBatchResult`。
5. [x] `frontend/src/api/checkin.ts`：新增 `checkinAll(): Promise<CheckinBatchResult>`（并在 `api/types.ts` 增加 `CheckinBatchResult`）。
6. [x] `frontend/src/pages/Checkin.vue`：新增 `allLoading` 状态、`onCheckinAll()` 处理、`「全部账户签到」` 按钮 + 成功提示 + 刷新。
7. [x] `backend/test/checkin-all.unit.ts`：单测 `runCheckinAll` 遍历/跳过逻辑（仅含无凭据凭证以规避真实网络；用 `DATA_DIR` 临时目录隔离历史文件）。

## 验证命令与结果
- 后端类型：`cd backend && npx tsc --noEmit` → ✅ 0 错误
- 后端单测：`cd backend && npx tsx test/checkin-all.unit.ts` → ✅ 4/4 通过（遍历全部 3 条而非仅活跃；summary.total=3/skipped=3；覆盖 c1/c2/c3）
- 前端类型：`cd frontend && npx vue-tsc --noEmit` → ✅ 0 错误
- （可选）端到端：用含 ≥2 条有凭据的 `credentials.json` 启动服务，`POST /admin/checkin/all` 校验 `summary` 与历史记录。

## 评审门
- 实现前需 `task.py start`（进入 in_progress）。
- 完成后跑齐上述三处类型检查 + 单测，确认均为 0 错误/全绿。

## 回滚点
- 若全量签到引发限流：回退 `scheduler.ts` 用 `runCheckinWithActive` 即可恢复活跃-only 行为；`runCheckinAll` 与前端按钮可保留（仅手动启用）。
- 整体回滚：`git revert` 本任务提交。
