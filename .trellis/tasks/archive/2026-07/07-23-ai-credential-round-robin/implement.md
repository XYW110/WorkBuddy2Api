# Implement：AI 调用凭证轮询分配

## 执行清单
1. [x] `backend/src/services/credential-store.ts`：新增 `getNextRoundRobin()` 函数（`rrIndex` 轮询 + 过滤无凭据凭证）。
2. [x] `backend/src/routes/chat.ts`：line 70 `credentials.getActive()` → `credentials.getNextRoundRobin()`。
3. [x] 验证：`cd backend && npx tsc --noEmit` → ✅ 0 错误。

## 验证命令
- `cd backend && npx tsc --noEmit`

## 回滚
- `git checkout -- backend/src/routes/chat.ts` 恢复单行；`git checkout -- backend/src/services/credential-store.ts` 恢复新增函数。
