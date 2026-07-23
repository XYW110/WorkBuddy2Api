# PRD: 模型列表动态拉取

## 背景

当前 `GET /v1/models` 和 `GET /admin/models` 返回的是 `model-catalog.ts` 中**硬编码的静态列表**（来自某次 `/v3/config` 抓包快照）。CodeBuddy 上线新模型后，列表不会自动更新，导致「模型列表不全」。

## 需求

### R1 — 动态拉取
- 运行时向 CodeBuddy 上游 `GET {baseUrl}/v3/config` 拉取最新模型配置
- 使用可用凭证（api-key 的 key 或 local-file 的 accessToken）构造认证 Header

### R2 — 当天缓存
- 拉取结果按「当天」缓存：日期字符串 `YYYY-MM-DD` 作为有效性标识
- 同一天内重复请求不重复打上游；跨天（或首次/缓存失效）才重新拉取
- 缓存持久化到文件 `data/models-cache.json`，重启后若日期仍为当天则复用，不再打上游

### R3 — 静态兜底
- 上游拉取失败 / 解析失败 / 无可用凭证时，回退到 `model-catalog.ts` 的静态 `MODELS`
- 保证上游不可用时模型列表仍有内容

### R4 — 接口兼容
- `/v1/models`（OpenAI 兼容）和 `/admin/models`（含倍率）均使用动态列表
- `auto-cheapest` 虚拟模型仍保留
- 倍率（credits）信息：动态模型若无倍率，沿用静态 `MODELS` 中同 id 的倍率；静态中没有的新模型标为「未定价」

## 非需求

- 不实时逐请求拉取（有当天缓存）
- 不做模型列表的管理/编辑 UI（仅展示）

## 验收标准

1. 服务启动后首次访问 `/admin/models`，触发一次 `/v3/config` 拉取（日志可见）
2. 同一天内再次访问，不再打上游，直接返回缓存
3. 模拟上游失败（或无凭证），返回静态 `MODELS` 列表，不报错
4. 跨天后首次访问重新拉取
5. `tsc --noEmit` 通过
