# Implement: API Key 调用统计

## 执行清单

### 1. 类型定义
- [ ] `backend/src/types/stats.ts` — UsageEntry, UsageStatsSnapshot, UsageStatsResponse

### 2. Token 估算工具
- [ ] `backend/src/services/usage-stats.ts` — UsageStatsManager 类
  - estimateTokens(text) — 启发式算法
  - loadFromFile() — 启动时恢复
  - record({ credentialId, credentialName, model, promptTokens, completionTokens })
  - getStats() → UsageEntry[]
  - writeToFile() — 定时持久化
  - 30s 定时器

### 3. chat.ts 集成
- [ ] 流式模式：聚合 completion content，请求结束后 record
- [ ] 非流模式：使用已有的 chunksToOpenAIResponse 结果 record

### 4. 管理 API
- [ ] `backend/src/routes/admin/stats.ts` — GET /admin/stats/usage
- [ ] `backend/src/routes/admin/index.ts` — 注册 stats 路由

### 5. 前端 API 层
- [ ] `frontend/src/api/stats.ts` — fetchUsageStats()
- [ ] `frontend/src/api/types.ts` — 追加 UsageEntry, UsageStatsResponse

### 6. 前端页面
- [ ] `frontend/src/pages/Stats.vue` — 统计表格
  - 列：Key 名称 | 模型 | 调用次数 | Prompt Token | Completion Token | 总 Token | Token 占比
  - 导航入口（侧边栏或 App.vue）

### 7. 验证
- [ ] `tsc --noEmit` 后端编译 0 错误
- [ ] `tsc --noEmit` 前端编译 0 错误（vue-tsc）
- [ ] 发送一个 AI 请求，确认统计累加
- [ ] 重启服务，确认统计不丢失
- [ ] `GET /admin/stats/usage` 返回正确 JSON

## 验证命令

```bash
cd backend && npx tsc --noEmit
cd frontend && npx vue-tsc --noEmit
```
