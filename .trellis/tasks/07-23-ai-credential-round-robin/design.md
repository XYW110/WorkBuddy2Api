# Design：AI 调用凭证轮询分配

## 变更文件
- `backend/src/services/credential-store.ts`：新增 `getNextRoundRobin()`。
- `backend/src/routes/chat.ts`：`getActive()` → `getNextRoundRobin()`。

## 详细设计

### 1. `credential-store.ts` 新增

```ts
/** 模块级索引，跨线程安全（Node 单线程无竞态） */
let rrIndex = 0;

/** 轮询返回下一个有凭据的凭证（不含无法建立 auth 的） */
export function getNextRoundRobin(): Credential | undefined {
  const usable = store.credentials.filter(
    (c) =>
      (c.type === "api-key" && !!c.key) ||
      (c.type === "local-file" && !!c.accessToken)
  );
  if (usable.length === 0) return undefined;

  const cred = usable[rrIndex % usable.length];
  rrIndex += 1;
  return cred;
}
```

- 过滤规则与 `proxy.ts:30-38` 的 Header 注入条件一致（`api-key` 有 `key` 或 `local-file` 有 `accessToken`）。
- `rrIndex` 单调递增，靠 `% usable.length` 自然循环。即使 `usable` 长度因动态增删变化，索引自动适配（下次取余落在合法范围内，但轮询顺序可能偏移一个位置，可接受，不要求严格均等）。

### 2. `chat.ts` 改动

```ts
// line 70: 替换
- const cred = credentials.getActive();
+ const cred = credentials.getNextRoundRobin();
```

`streamRequest` 与 `doStreamRequest` 接口不变——它们只接收 `Credential` 对象做 HTTP 请求，不关心是谁选的。

### 3. 不涉及的端点

- `GET /admin/quota` → 保留 `getActive()`（仍显示当前操作凭证的额度）。
- `POST /admin/checkin` → 保留 `getActive()`（单次手动签到仍用活跃凭证）。
- `routes/admin/credentials.ts` 的激活/列表 → 不受影响。
- 前端 → 无变更。

### 4. 回滚

仅改 2 行关键代码（1 个新函数 + 1 行替换），极低风险。回滚：恢复 `chat.ts` 为 `getActive()` 即可。
