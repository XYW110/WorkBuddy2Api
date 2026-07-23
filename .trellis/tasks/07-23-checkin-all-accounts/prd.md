# PRD：自动签到所有账户

## 背景 / 现状
- 定时签到 `runCheckinTask`（`scheduler.ts:23-47`）当前只调用 `runCheckinWithActive("scheduled")`，即仅对 `getActive()` 返回的**单条活跃凭证**签到，不遍历全部账户。
- `runCheckinCore`（`checkin.ts`）已具备「无凭据跳过 / 活动未开启跳过 / 今日已签跳过 / 401 刷新重试」能力，天然适配多账户逐条执行。
- 手动接口 `POST /admin/checkin`（活跃）与 `POST /admin/checkin/:id`（指定 id）已存在；无「全部签到」入口。

## 目标
将自动签到从「仅活跃账户」改为「所有账户」，并补一个手动「全部签到」入口，形成完整能力。

## 需求
1. **定时任务覆盖所有账户**：调度触发时遍历 `store.getAll()` 的全部凭证，对每条执行签到（具体是否真正签到由 `runCheckinCore` 按凭据/今日状态判定）。
2. **新增手动「全部签到」**：后端 `POST /admin/checkin/all` 触发同样的遍历逻辑；前端 `Checkin.vue` 新增「全部签到」按钮。
3. **保留既有单账户入口**：`POST /admin/checkin`（活跃）与 `POST /admin/checkin/:id`（指定）不变，避免破坏现有手动流程。
4. **结果可观测**：「全部签到」返回聚合结果（逐条 `CheckinResult` + 汇总：总数/已签/跳过/失败），前端据此提示。

## 约束 / 非目标
- 不做 mode 开关（用户明确选择「直接改为所有账户」，移除 active-only 默认）。
- 不改 `runCheckinCore` 的跳过/刷新语义；多账户只是外层「遍历 + 聚合」。
- 不做并发（顺序执行，复用现有串行与 `running` 守卫语义，避免触发限流与历史文件并发写）。
- 活跃态（`activeId`/`isActive`）与「是否签到」解耦：所有凭证都参与遍历，`isActive` 不再决定能否被自动签到。

## 验收标准（AC）
- AC1：启用定时签到且有 ≥2 条有凭据的凭证时，调度一次后各凭证的签到历史（`appendCheckinHistory` 的 `credentialId`）均出现对应记录（无凭据/今日已签的按 skip 处理）。
- AC2：`POST /admin/checkin/all` 返回 `CheckinBatchResult`，`summary.total` = 参与遍历的凭证数，`summary.checked/skipped/failed` 之和 = `total`。
- AC3：前端「全部签到」按钮点击后触发批量签到并弹出聚合提示（如「已签 X / 跳过 Y / 失败 Z」），列表/历史刷新。
- AC4：原有 `POST /admin/checkin` 与 `POST /admin/checkin/:id` 行为不变，单测/集成仍通过。
- AC5：后端 `tsc --noEmit` 与前端 `vue-tsc --noEmit` 0 错误；新增 `runCheckinAll` 遍历/跳过逻辑单测通过。
