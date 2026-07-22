# 管理 API 文档

本文描述 WorkBuddy2Api 的 **Admin 管理接口**（路径前缀 `/admin`）契约。
公开接口 `/health`、`/v1/*` 不在本文主体；仅在末尾对照说明。

> 源码真源：`backend/src/routes/admin/*`、`backend/src/utils/envelope.ts`、`backend/src/plugins/admin-auth.ts`。

---

## 1. 基础约定

### 1.1 Base URL 与端口

| 优先级 | 来源 | 说明 |
|--------|------|------|
| 1 | 环境变量 `PORT` / `HOST` | 最高优先级 |
| 2 | `backend/config.json` → `server.port` / `server.host` | 当前仓库常见为 `3000` / `127.0.0.1` |
| 3 | 代码内置默认 | `11434` / `127.0.0.1` |

示例（以本机当前配置为准）：

```text
http://127.0.0.1:3000
```

### 1.2 统一响应 Envelope

**所有** `/admin/*` 响应均使用：

```ts
interface AdminEnvelope<T> {
  code: number;       // 与 HTTP 状态码一致
  message: string;
  data: T | null;
  requestId?: string; // Fastify request.id
}
```

| 场景 | HTTP | envelope.code | data |
|------|------|---------------|------|
| 成功 | 200 | 200 | 业务对象 |
| 创建成功 | 201 | 201 | 新建对象（敏感字段明文一次） |
| 失败 | 与业务码相同 | 同左 | `null` |
| 签到业务失败 | **502** | **502** | 仍为 `CheckinResult`（见 §6） |

### 1.3 鉴权

| 项 | 说明 |
|----|------|
| Header | `x-admin-token: <ADMIN_TOKEN>` |
| 比较 | `crypto.timingSafeEqual` 常量时间比较 |
| `ADMIN_TOKEN` 未配置 | **503**，`message`: `ADMIN_TOKEN 未配置，管理接口已禁用` |
| Token 缺失或不匹配 | **401**，`message`: `未授权：管理员 Token 无效或缺失` |

除 `/health`、`/v1/*` 外，所有 `/admin/*` 均需通过鉴权。

### 1.4 分页

Query：`page`、`pageSize`（字符串或数字均可）。

| 参数 | 默认 | 约束 |
|------|------|------|
| `page` | 1 | 最小 1 |
| `pageSize` | 20 | 最小 1，**最大 100** |

列表 `data` 形状：

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20
}
```

凭证列表在分页字段之外额外返回 `activeId`（见 §4）。

### 1.5 脱敏

`maskSecret`：长度 ≤ 8 → `****`；否则 `前4 + **** + 后4`。

| 资源 | 列表/更新响应 | 创建/上传成功 |
|------|----------------|--------------|
| Credential | `accessToken` / `refreshToken` / `key` 就地脱敏 | **明文一次** |
| ApiKey | `key` 脱敏 | **明文一次** |

### 1.6 概念边界（不可混用）

| 概念 | 前缀/形态 | 用途 |
|------|-----------|------|
| Credential `type=api-key` | 上游 `ck_xxx` | 作为 CodeBuddy 上游凭证 |
| Credential `type=local-file` | JWT + refresh + uid | 本地桌面端导出凭证 |
| 管理端 ApiKey | 本服务 `sk-` | 设计上供客户端访问 `/v1` 的 Key |

**注意**：当前 `/v1` **未**对接 ApiKey 校验（`findApiKeyByKey` 仅预留）。文档不虚构已启用的 `/v1` 鉴权。

---

## 2. 错误码一览

| code | 含义 | 典型场景 |
|------|------|----------|
| 200 | 成功 | 列表、激活、删除、查询 |
| 201 | 创建成功 | POST credentials / upload / api-keys |
| 401 | 未授权 | 缺少或错误的 `x-admin-token` |
| 404 | 不存在 | 凭证/API Key 未找到；无活跃凭证 |
| 409 | 冲突 | 删除唯一的 `local-file` 凭证 |
| 413 | 实体过大 | upload 超过 1MB |
| 422 | 校验失败 | 缺字段、JSON 非法、不支持的 type |
| 502 | 上游失败 | 签到/额度查询上游错误；签到业务 `success=false` |
| 503 | 服务不可用 | 未配置 `ADMIN_TOKEN` |

---

## 3. 路由总表

| Method | Path | 说明 |
|--------|------|------|
| GET | `/admin/auth/verify` | 校验 Token；`data=null` |
| GET | `/admin/credentials` | 凭证列表（脱敏+分页+`activeId`） |
| POST | `/admin/credentials` | 添加凭证（JSON） |
| POST | `/admin/credentials/upload` | multipart 上传 local-file JSON |
| DELETE | `/admin/credentials/:id` | 删除凭证 |
| PUT | `/admin/credentials/:id/activate` | 激活凭证 |
| POST | `/admin/credentials/:id/activate` | 激活（兼容） |
| GET | `/admin/credentials/:id/quota` | 指定凭证额度 |
| GET | `/admin/api-keys` | 管理 Key 列表 |
| POST | `/admin/api-keys` | 创建管理 Key（201 明文） |
| PUT | `/admin/api-keys/:id` | 更新 name / enabled |
| DELETE | `/admin/api-keys/:id` | 删除管理 Key |
| POST | `/admin/checkin` | 活跃凭证签到 |
| POST | `/admin/checkin/:id` | 指定凭证签到 |
| GET | `/admin/checkin/status` | 签到状态 |
| GET | `/admin/checkin/history` | 签到历史分页 |
| GET | `/admin/quota` | 活跃凭证额度 |
| GET | `/health` | 健康检查（**免鉴权**，**非 envelope**） |

---

## 4. Auth

### `GET /admin/auth/verify`

校验 `x-admin-token` 是否有效（能到达本路由即已通过 preHandler）。

**成功 200**

```json
{
  "code": 200,
  "message": "Token 有效",
  "data": null,
  "requestId": "req-1"
}
```

---

## 5. Credentials

### 类型

```ts
type CredentialType = "local-file" | "api-key";

interface Credential {
  id: string;
  name: string;
  type: CredentialType;
  accessToken?: string;   // local-file
  refreshToken?: string;  // local-file
  uid?: string;           // local-file
  key?: string;           // api-key (ck_xxx)
  isActive: boolean;
  source?: string;
}
```

### `GET /admin/credentials`

Query：`page`、`pageSize`。

**成功 200 `data`**

```json
{
  "items": [
    {
      "id": "...",
      "name": "本地账号",
      "type": "local-file",
      "accessToken": "eyJh****xxxx",
      "refreshToken": "ref_****xxxx",
      "uid": "u1",
      "isActive": true,
      "source": "export"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20,
  "activeId": "..."
}
```

### `POST /admin/credentials`

JSON body，按 `type` 分支（默认 `type` 为 `api-key`）。

**api-key**

```json
{ "name": "备用Key", "key": "ck_xxxxxx" }
```

缺 `name` 或 `key` → **422** `缺少必填字段: name, key`。

**local-file**

```json
{
  "name": "本地账号",
  "type": "local-file",
  "accessToken": "...",
  "refreshToken": "...",
  "uid": "...",
  "source": "manual"
}
```

缺任一项 `name` / `accessToken` / `refreshToken` / `uid` → **422**。
未知 `type` → **422** `不支持的凭证类型: ...`。

**成功 201**：`data` 为完整 `Credential`（**敏感字段明文**）；`message` 为 `凭证添加成功`。

### `POST /admin/credentials/upload`

| 项 | 值 |
|----|-----|
| Content-Type | `multipart/form-data` |
| 文件字段 | 首选 `file`（注释兼容 `credential`/`credentials`；实现为 `req.file()`，不强制校验 fieldname） |
| 大小限制 | **1MB**（超限 **413**） |
| 文件内容 | JSON 对象，结构同 POST body |

| 错误 | code | message 示例 |
|------|------|----------------|
| 无文件 | 422 | `缺少上传文件（字段名: file）` |
| 过大 | 413 | `上传文件过大（限制 1MB）` |
| JSON 非法 | 422 | `JSON 解析失败: ...` |
| 非对象 | 422 | `上传内容必须是 JSON 对象` |
| 缺字段 | 422 | 同 create 校验 |

**成功 201**：`message` = `凭证上传成功`，`data` 明文一次。

Windows 导出脚本输出形状（可直接上传）：

```json
{
  "name": "本地账号",
  "type": "local-file",
  "accessToken": "...",
  "refreshToken": "...",
  "uid": "...",
  "source": "export"
}
```

> 脚本不输出 `id` / `isActive`（服务端生成）。

### `DELETE /admin/credentials/:id`

| 情况 | code |
|------|------|
| 成功 | 200，`data: { success: true }` |
| 不存在 | 404 `凭证不存在` |
| 唯一 local-file | **409** `不允许删除唯一的本地文件凭证` |

### `PUT|POST /admin/credentials/:id/activate`

**成功 200**

```json
{
  "code": 200,
  "message": "凭证已激活",
  "data": { "success": true, "activeId": "<id>" }
}
```

不存在 → **404**。

### `GET /admin/credentials/:id/quota`

**成功 200**

```json
{
  "credentialId": "<id>",
  "quota": { }
}
```

`quota` 为上游 raw JSON（`unknown`）。不存在 → 404；上游失败 → **502**。

---

## 6. API Keys（管理端 sk-）

```ts
interface ApiKey {
  id: string;
  name: string;
  key: string;       // sk-；仅创建时明文
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### `GET /admin/api-keys`

分页列表；`key` 已脱敏。

### `POST /admin/api-keys`

Body：`{ "name": "客户端A" }`（必填非空）。

缺 name → **422** `缺少必填字段: name`。

**成功 201**：`data` 含**明文** `key`；`message` = `API Key 创建成功，请妥善保存（仅此一次明文）`。

### `PUT /admin/api-keys/:id`

Body 至少提供 `name?` 或 `enabled?` 之一，否则 **422** `至少提供 name 或 enabled 之一`。

成功 200：返回更新后对象（`key` 脱敏）。不存在 → 404。

### `DELETE /admin/api-keys/:id`

成功 200：`data: { success: true }`。不存在 → 404。

---

## 7. Checkin

### 结果类型

```ts
interface CheckinResult {
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

### `POST /admin/checkin` / `POST /admin/checkin/:id`

| 结果 | HTTP + code | data |
|------|-------------|------|
| `result.success === true` | 200 | `CheckinResult` |
| `result.success === false` | **502** | 仍为 `CheckinResult`（**sendOk**，非 sendFail） |
| 抛异常 | 502 | 构造的失败 `CheckinResult`（`success:false`） |
| `:id` 不存在 | 404 | `null` |

### `GET /admin/checkin/status`

使用**活跃凭证**。无活跃 → **404** `无活跃凭证`。
上游失败 → **502**。

**成功 200 `data`**

```json
{
  "credentialId": "...",
  "credentialName": "...",
  "status": { },
  "raw": { }
}
```

`status` 为上游 `CheckinActivityData`；`raw` 为完整上游响应。

### `GET /admin/checkin/history`

Query：`page`、`pageSize`。最新在前。

**成功 200 `data`**：标准分页 `{ items, total, page, pageSize }`。

`items[]` 元素为 `CheckinHistoryRecord`：

```ts
interface CheckinHistoryRecord {
  id: string;
  source: "manual" | "scheduled" | "script";
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

---

## 8. Quota

### `GET /admin/quota`

活跃凭证额度便捷入口。

无活跃 → **404** `无活跃凭证`。上游失败 → **502**。

**成功 200**

```json
{
  "credentialId": "...",
  "credentialName": "...",
  "quota": { }
}
```

---

## 9. 非 Admin：健康检查

### `GET /health`

- **免鉴权**
- **不走** envelope

```json
{ "status": "ok" }
```

---

## 10. curl 示例

以下默认 `BASE=http://127.0.0.1:3000`，请按实际端口与 `ADMIN_TOKEN` 替换。

```bash
export BASE=http://127.0.0.1:3000
export TOKEN=your-admin-token

# 健康检查（无 Token）
curl -s "$BASE/health"

# 校验 Token
curl -s "$BASE/admin/auth/verify" -H "x-admin-token: $TOKEN"

# 凭证列表
curl -s "$BASE/admin/credentials?page=1&pageSize=20" -H "x-admin-token: $TOKEN"

# 添加 ck_ 凭证
curl -s -X POST "$BASE/admin/credentials" \
  -H "x-admin-token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"备用Key","key":"ck_xxxxxx"}'

# 上传 local-file JSON
curl -s -X POST "$BASE/admin/credentials/upload" \
  -H "x-admin-token: $TOKEN" \
  -F "file=@./credential.json"

# 激活
curl -s -X PUT "$BASE/admin/credentials/<id>/activate" -H "x-admin-token: $TOKEN"

# 创建管理 API Key
curl -s -X POST "$BASE/admin/api-keys" \
  -H "x-admin-token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"客户端A"}'

# 签到 + 历史
curl -s -X POST "$BASE/admin/checkin" -H "x-admin-token: $TOKEN"
curl -s "$BASE/admin/checkin/history?page=1" -H "x-admin-token: $TOKEN"

# 活跃额度
curl -s "$BASE/admin/quota" -H "x-admin-token: $TOKEN"

# 无 Token（期望 401 或未配置时 503）
curl -s -i "$BASE/admin/credentials"
```

---

## 11. 实现注意（写客户端时）

1. 成功判定：`HTTP` 与 `body.code` 均为 `200` 或 `201`；业务数据在 `body.data`。
2. 签到失败时 HTTP 可能是 **502** 且 `data` **非 null**，需同时看 `data.success`。
3. 创建类接口仅第一次返回明文密钥，务必立即保存。
4. 不要用 Credential 的 `ck_` 去当管理 ApiKey；也不要假设 `/v1` 已校验 `sk-`。
5. 旧文档中「API Key 留空任意值」仅描述 **当前** `/v1` 行为，与管理端 `api-keys` 资源无关。
