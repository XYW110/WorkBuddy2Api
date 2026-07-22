# PRD: credentials 页面导出功能

## Goal / 用户价值
在管理后台「凭证管理」页面提供导出能力，便于管理员对凭证做**备份 / 迁移 / 盘点**。

## 已确认事实（代码探查）
- 凭证持久化于后端 JSON 文件（`store.credentials`），**明文保存** `key`(api-key)、`accessToken`/`refreshToken`(local-file) 与 `uid`。
- 列表接口 `GET /admin/credentials` 经 `maskCredential` 脱敏（仅保留首尾 4 字符）后分页返回；一次明文仅在创建/上传时返回。
- 前端 `Credentials.vue` 当前操作：刷新、添加 API Key、上传 JSON、激活、额度、删除；**无导出入口**。
- 前端 `items` 仅持有脱敏字段；分页每页最多 100 条。
- 前端 API：`listCredentials`(`/admin/credentials`)、`createCredential`、`uploadCredential`、`deleteCredential`、`activateCredential`、`getCredentialQuota`。
- 凭证两类：`api-key`（key）、`local-file`（accessToken/refreshToken/uid）；字段 `id/name/type/isActive/source`。

## Requirements（草案，待澄清后定稿）
- R1: 页面提供「导出」按钮。
- R2: 导出内容/格式/范围待定（见 open questions）。
- R3: 若含明文密钥，需后端接口 + 安全控制（admin-only、确认弹窗、一次性下载）。

## Acceptance Criteria（草案）
- AC1: 点击导出可下载文件，内容符合所选范围与格式。
- AC2: 若导出元数据，敏感字段应为脱敏值（与列表一致）或明确不包含秘密。
- AC3: 若导出明文，仅管理员可触发，且需二次确认，不写入前端日志。

## Out of Scope
- 凭证改名 / 详情编辑（页面提示无此接口）。
- 批量导入（已有单文件上传）。

## 用户意图（已澄清）
- 导出目的 = **备份，下次可重新导入**（round-trip）。因此导出必须是**含明文密钥的完整备份**，脱敏清单不可行（无法还原为可用凭证）。
- 推论：需新增后端导出接口返回完整 `store`（含明文），且需配套的**重新导入**能力（或复用/扩展现有上传接口）。

## 已决策（汇总）
- 导出内容：含明文密钥的完整备份（用于重导入）。
- 任务范围：**导出 + 导入都做**（round-trip 闭环）。
- 备份格式：整库快照 `{ credentials:[...含明文...], activeId:"..." }`，导入即整体还原，活跃态不丢。
- 导入冲突：**合并去重** — 按 id 比对，存在则更新、不存在则新增，`activeId` 同步覆盖（不删现有、不丢备份后新增）。

## 关键发现：现有「上传 JSON」不可复用为导入备份
- 前端已有「上传 JSON」按钮（`Credentials.vue:233`），调 `POST /credentials/upload`。
- 但 `createCredentialFromPayload`(`credentials.ts:20-69`) 仅接受**单条凭证对象**，每次 `generateId()` 生成全新 id（不按 id 合并），且不读写 `activeId`，不支持数组。
- 结论：**保留「上传 JSON」用于单条快速添加**；新增独立的「导入备份」按钮 + `POST /credentials/import` 接口，专门消费整库快照、按 id 合并去重、还原 activeId，形成导出↔导入闭环。

## 已决策（汇总）
- 导出内容：含明文密钥的完整备份（用于重导入）。
- 任务范围：导出 + 导入都做（round-trip 闭环）。
- 备份格式：整库快照 `{ credentials:[...含明文...], activeId:"..." }`。
- 导入冲突：合并去重 — 按 id 比对，存在则更新、不存在则新增，`activeId` 同步覆盖。
- 安全控制：**仅 admin-only 鉴权**（不做二次确认弹窗、不做日期化文件名、不强约束日志）。零成本底线：服务端日志只记 credId/name/type，不打印明文；导出文件名 `credentials-backup.json`。

## MVP 范围与实现方案（已核实代码）
### 后端
- **鉴权**：新接口置于现有 `credentialRoutes`（已注册在 `/admin` scope 下），`setupAdminAuth`(`admin-auth.ts:23-39`) 的 `preHandler` 钩子自动强制 `x-admin-token` → 满足 admin-only，无需额外守卫。
- `backend/src/services/credential-store.ts` 新增：
  - `getStore(): CredentialStore` — 返回模块级 `store`（含明文）。
  - `importStore(snapshot: CredentialStore): { added: number; updated: number }` — 逐条按 `id` 合并去重（存在→就地覆盖字段含 isActive；不存在→push 保留原 id）；合并后若 `snapshot.activeId` 存在则 `activateCredential(activeId)` 还原活跃态；`persist()` 落盘。日志只记统计与 credId。
- `backend/src/routes/admin/credentials.ts` 新增：
  - `GET /credentials/export`：读 `getStore()`，`reply.header("Content-Disposition","attachment; filename=credentials-backup.json").header("Content-Type","application/json").send(JSON.stringify(store))`；日志仅记条数。
  - `POST /credentials/import`（multipart `file`）：抽取读取 JSON 逻辑为 `readUploadJson(req)`（复用现有 upload 的 413/422 处理）；解析须为 `{ credentials: Credential[], activeId?: string|null }`；调 `importStore`；返回 `{ added, updated, activeId }`。

### 前端
- `frontend/src/api/credentials.ts` 新增：
  - `exportCredentials()`：`apiClient.get('/admin/credentials/export', { responseType: 'blob' })` → 生成 Blob 下载 `credentials-backup.json`（interceptor 对 blob 透传，data 即 Blob）。
  - `importCredentials(file)`：`FormData` 追加 `file`，`POST /admin/credentials/import`，返回 `{added, updated, activeId}`。
- `frontend/src/pages/Credentials.vue`：工具栏新增「导出备份」「导入备份」两个按钮（**保留**原「上传 JSON」做单条添加）；「导入备份」独立 file input，成功后提示 `新增 X / 更新 Y` 并刷新列表。

### 验证
- 后端 round-trip 单测：导出 store → importStore → 断言 store 等价、activeId 还原、合并去重计数正确；另测非法结构（非对象/无 credentials 数组）返回 422。
- 后端 `tsc` 通过；前端 `vue-tsc --noEmit` 通过。

## 实现状态（已完成）
- [x] `credential-store.ts`：新增 `getStore()`、`importStore()`（按 id 合并去重 + 还原 activeId + 落盘 + 仅记统计日志）。
- [x] `routes/admin/credentials.ts`：抽取 `readUploadJson` helper 复用上传读取逻辑；新增 `GET /credentials/export`（blob 下载 `credentials-backup.json`）、`POST /credentials/import`（按 id 合并，返回 `{added, updated, activeId}`）。两者均位于 `/admin` scope 下，自动 admin-only。
- [x] `api/credentials.ts`：新增 `exportCredentials()`（blob 下载）、`importCredentials(file)`（FormData）、`ImportResult` 类型。
- [x] `Credentials.vue`：工具栏新增「导出备份」「导入备份」按钮（保留原「上传 JSON」单条添加），含下载链路与成功提示 `新增 X / 更新 Y`。
- [x] 单测 `test/credentials.unit.ts` + `credentials:test` 脚本。

## 验证结果
- ✅ 后端 `npx tsc --noEmit` → 0 错误
- ✅ 后端 `npx tsx test/credentials.unit.ts` → 全部断言通过（首次 added=2；合并 added=1/updated=1；无效 activeId 不崩溃；round-trip id 集合等价）
- ✅ 前端 `npx vue-tsc --noEmit` → 0 错误

## 备注
- 仅做 admin-only（按用户选择，未加二次确认弹窗/日期化文件名）。零成本底线：服务端日志只记 credId/name/type，不打印明文；导出文件名固定 `credentials-backup.json`。
- 路由层 422 结构校验（非对象/缺 credentials 数组）已实现并随 tsc 通过；如需要可补一个 fastify 应用级 e2e 测试。
