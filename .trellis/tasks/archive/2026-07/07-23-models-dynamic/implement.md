# Implement: 模型列表动态拉取

## 执行清单

### 1. 新建 model-fetcher.ts
- [ ] 导入 `config`、`logger`、`getAll` from credential-store、`MODELS` from model-catalog
- [ ] `buildAuthHeaders(cred)` — 复制 proxy.ts 的 Header 构造
- [ ] `pickUsableCredential()` — 从 getAll() 取第一个可用凭证（不推进 rr）
- [ ] `fetchUpstreamModels()` — GET /v3/config，超时，解析
  - **关键**：必须带 `User-Agent: WorkBuddy/5.2.3 ...`（取自 Reqable 抓包），否则上游走精简分支只回 `productFeatures`、不含 `models`；并带 `X-Product: SaaS`、`Accept: application/json, text/plain, */*`
- [ ] `parseModelsFromConfig(raw)` — 多路径防御解析
- [ ] `extractModelArray` 解析上游字段：`id/name/vendor/credits` + 扩展元数据
  - `descriptionZh`(string)、`maxAllowedSize`(number/str)、`maxInputTokens`、`maxOutputTokens`
  - `supportsImages`、`supportsToolCall`（bool/0-1/"true" 容错）
- [ ] `mergeCredits(dynamic)` — 逐字段上游优先、静态兜底（含扩展元数据）
- [ ] `loadModelCache() / saveModelCache()` — 文件缓存（data/models-cache.json）
- [ ] `getModels()` — 内存 → 文件 → 拉取 → 兜底 主流程
- [ ] 内存缓存 `memCache`

### 1b. ModelDef 扩展（model-catalog.ts）
- [ ] 接口新增可选字段：`descriptionZh?` `maxAllowedSize?` `maxInputTokens?` `maxOutputTokens?` `supportsImages?` `supportsToolCall?`

### 1c. 字段透出
- [ ] `OpenAIModel`(openai.ts) 增加扩展元数据字段，`/v1/models` 携带（含标准 `description`）
- [ ] `/admin/models` 返回扩展字段；前端 `ModelInfo` 类型 + `Models.vue` 表格展示（能力标签/最大 token/大小/描述，行展开详情）

### 2. 改造 routes/models.ts
- [ ] `modelRoutes` 的 `/v1/models` 用 `getModels()` 代替 `MODELS`
- [ ] `adminModelRoutes` 的 `/models` 用 `getModels()` 代替 `MODELS`
- [ ] 保留 `auto-cheapest` 虚拟模型

### 3. server.ts（可选预热）
- [ ] 启动后调用一次 `getModels()` 触发当天拉取（避免首个请求延迟）

### 4. 验证
- [ ] `cd backend && npx tsc --noEmit`
- [ ] 启服务，访问 `/admin/models` 看日志是否拉取 /v3/config
- [ ] 二次访问确认命中缓存（无新拉取日志）
- [ ] 模拟无凭证场景确认兜底静态列表

## 验证命令
```bash
cd backend && npx tsc --noEmit
```
