# Design: API Key 调用统计

## 架构概览

```
chat.ts (请求入口)
  │ credential.getNextRoundRobin() → 选定 credential
  │ 收集 prompt 文本（messages）
  │ 收集 completion 文本（流式聚合）
  │
  └─→ usageStats.record({ credentialId, model, promptTokens, completionTokens })
        │ 内存 Map: `${credId}:${model}` → UsageEntry
        │ 每 30s 定时器 → writeToFile()
        │ 启动时 → loadFromFile()
```

## 数据类型

```ts
// 统计数据文件 structure/schema
interface UsageStatsSnapshot {
  entries: Record<string, UsageEntry>; // key = `${credentialId}:${model}`
  updatedAt: string;                   // ISO timestamp
}

interface UsageEntry {
  credentialId: string;
  credentialName: string;   // 冗余存储，方便 display
  model: string;
  callCount: number;
  promptTokens: number;
  completionTokens: number;
}

// API 响应
interface UsageStatsResponse {
  entries: UsageEntry[];
  updatedAt: string;
}
```

## Token 估算算法

```ts
function estimateTokens(text: string): number {
  let chinese = 0, other = 0;
  for (const ch of text) {
    /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch) ? chinese++ : other++;
  }
  return Math.ceil(chinese / 1.8 + other / 4);
}
```

## 数据流

### 请求时记录 (chat.ts)

```
1. credential = getNextRoundRobin()  // 已有
2. promptText = openaiReq.messages.map(m => m.content).join("") // 仅 text content
3. 流式响应中聚合 completionText（已有 translate.ts 的 chunksToOpenAIResponse 模式）
4. promptTokens = estimateTokens(promptText)
5. completionTokens = estimateTokens(completionText)
6. usageStats.record(credentialId, credentialName, model, promptTokens, completionTokens)
```

### 存储 (usage-stats.ts)

```
loadFromFile() → 解析 JSON → 恢复内存 Map
定时器每 30s → writeToFile() → 写入整个 Map → 原子覆盖文件
record() → 更新内存 Map（立即生效，不阻塞）
```

## 文件结构

```
backend/src/
  services/
    usage-stats.ts        ← 新建：UsageStatsManager 类
  routes/
    admin/
      stats.ts            ← 新建：GET /admin/stats/usage
  types/
    stats.ts              ← 新建：类型定义

frontend/src/
  api/
    stats.ts              ← 新建：API 调用
    types.ts              ← 追加 UsageEntry 类型
  pages/
    Stats.vue             ← 新建：统计面板页面
```

## 接口层

### chat.ts 改动

- `streamRequest` 回调中聚合 completion content
- 请求完成后调用 `usageStats.record()`
- 非 stream 模式使用 `chunksToOpenAIResponse` 已有的聚合结果

### admin 路由注册

```
backend/src/routes/admin/index.ts → 追加 stats 路由
```

## 边界 & 异常

- 请求失败/中断：不记录（只记录成功完成的请求）
- JSON 文件损坏：忽略，从零开始（打 warn 日志）
- credential 被删除：历史统计数据保留（credentialName 冗余存储）
- no active credential：不记录
