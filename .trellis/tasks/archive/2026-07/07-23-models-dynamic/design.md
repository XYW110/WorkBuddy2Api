# Design: 模型列表动态拉取

## 架构

```
models 路由 (GET /v1/models, /admin/models)
   │
   └─→ getModels(): ModelDef[]
         │ 1. 内存缓存有效（cache.date === 今天）？返回
         │ 2. 文件缓存有效（models-cache.json.date === 今天）？返回
         │ 3. fetchUpstreamModels() → 成功则 saveModelCache + 更新内存
         │ 4. 失败 → 返回静态 MODELS（兜底）
```

## 新文件

`backend/src/services/model-fetcher.ts`
- `getModels(): ModelDef[]` — 对外主入口
- `fetchUpstreamModels(): Promise<ModelDef[] | null>` — 拉取 + 解析
- `parseModelsFromConfig(raw): ModelDef[] | null` — 防御式解析
- `loadModelCache() / saveModelCache()` — 文件缓存（当天有效）
- 内存缓存变量 `memCache: { date: string; models: ModelDef[] } | null`

## 认证 Header（复用 proxy.ts 逻辑）

```
api-key:    Authorization: Bearer <key>
local-file: Authorization: Bearer <accessToken>
            X-User-Id: <uid>
            X-Domain: <config.codebuddy.domain>
```

选凭证：用 `credential-store.getAll()` 过滤出可用凭证（有 key 或 accessToken），取第一个，**不推进 round-robin 计数器**（避免影响 AI 调用的轮询）。

## 解析策略（不确定 /v3/config 结构，需防御）

`parseModelsFromConfig` 按优先级尝试已知路径：
```
raw.modelList
raw.data.modelList
raw.models
raw.data.models
raw.model_config?.list
```
- 任一路径返回「对象数组且元素含 id 字符串」即视为模型列表
- 仍无法解析 → 返回 null（触发兜底），并 `logger.warn` 打出响应顶层 keys 便于排障

## 倍率合并

动态模型 `ModelDef` 默认 `credits: ""`（未定价）。返回前与静态 `MODELS` 按 id 合并：
- 静态中有同 id 且有倍率 → 沿用静态的 `credits` / `name` / `owned_by`
- 静态中没有 → 保留上游名称，倍率空（前端显示「未定价」）

## 文件布局

```
backend/src/services/model-fetcher.ts   ← 新建
backend/src/routes/models.ts            ← 改造：用 getModels() 替代 MODELS
backend/src/server.ts                   ← 可选：启动时预热（调用 getModels() 一次）
```

## 边界

- 无可用凭证：fetchUpstreamModels 返回 null → 兜底静态
- 上游超时/非 200：catch → null → 兜底
- 解析失败：null → 兜底
- 上游返回空列表：视为有效（不兜底），避免无限重试打上游
