# PRD：AI 调用凭证轮询分配

## 背景
- AI 调用（`/v1/chat/completions`）当前固定使用 `getActive()` 返回的单条活跃凭证。
- 用户希望改为「按请求轮流分配有凭据的凭证」（round-robin），充分利用多账户额度。
- 「活跃」标记保留用于其他管理场景（额度查询、签到等），但不再决定 AI 路由。

## 需求
1. **轮询分配**：每个 `/v1/chat/completions` 请求分配下一个有凭据的凭证（`api-key` 有 `key` 或 `local-file` 有 `accessToken`）。
2. **过滤不可用**：无凭据（缺 key/accessToken）的凭证不参与轮询。
3. **只改 AI 调用**：其他使用 `getActive()` 的端点（admin/配额、签到/status 等）不受影响。
4. **无缝降级**：若无任何可用凭证，与现有 `getActive()` 一样返回 undefined → 503。

## 验收标准（AC）
- AC1：连续 3 个请求分别使用凭证列表中的第 1/2/3 个可用凭证（有凭据的），第 4 个请求回到第 1 个。
- AC2：无凭据的凭证（缺 key/accessToken）被跳过，不参与轮询。
- AC3：仅剩1个可用凭证时所有请求都走它（相当于退化回单凭证）。
- AC4：原先走 `getActive()` 的管理端点行为不变。
- AC5：后端 `tsc --noEmit` 通过。前端无代码变更。
