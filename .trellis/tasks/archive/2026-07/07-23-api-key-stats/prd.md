# PRD: API Key 调用统计

## 背景

当前系统使用轮询机制分发 AI 请求到多个 API Key，但缺乏对各 Key 调用量的可见性。需要统计每个 Key 的调用次数和 token 消耗量。

## 需求

### R1 — 调用次数统计
- 每次 chat 请求成功完成后，对发起请求的 API Key + 模型累加调用次数

### R2 — Token 使用量统计
- 使用启发式算法估算每次请求的 prompt_tokens 和 completion_tokens
- 按 API Key + 模型维度累加 token 使用量
- 估算规则：中文字符 / 1.8 + 其他字符 / 4 → token 数

### R3 — 数据持久化
- 内存中维护统计状态，定时（每 30 秒）写入 JSON 文件
- 重启后从文件恢复已有统计数据
- JSON 文件路径与 credential-store 一致模式

### R4 — 统计 API
- `GET /admin/stats/usage` — 返回所有 Key + Model 的统计数据 JSON
- 管理后台权限访问

### R5 — 前端统计面板
- 表格视图：Key 名称 | 模型 | 调用次数 | Prompt Token | Completion Token | 总 Token
- 支持按 Key 和模型展示
- 后端不提供前端，不做图表

## 非需求（明确不做）

- 不重置/清空统计（始终累积）
- 不做请求级明细记录
- 不上游 usage 提取（已验证上游不返回）
- 不做图表可视化（表格即可）

## 验收标准

1. 发送 AI 请求后，对应 Key+Model 的调用次数 +1
2. Token 估算基于 prompt 消息文本和 completion 回复文本
3. 服务重启后，统计不丢失
4. `GET /admin/stats/usage` 返回正确的 JSON 结构
5. 前端表格正确展示所有 Key 的统计
