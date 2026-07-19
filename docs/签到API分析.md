# WorkBuddy 签到 API 分析文档

> 更新时间: 2026-07-19  
> 抓包工具: Reqable Live Capture  
> 目标应用: WorkBuddy 5.2.3 / CLI 2.106.4  
> 用户: momo (`9d1be9d2-6785-4fc7-9fd5-695ce79eef2f`)

---

## 1. 核心结论

1. **真正的签到接口**是 `POST /v2/billing/meter/daily-checkin`，请求体为空 `{}`。
2. **签到状态查询接口**是 `POST /v2/billing/meter/checkin-activity-status`，同样请求体 `{}`。
3. **埋点接口** `POST /v2/report` 仅上报，不参与签到发奖。
4. 签到后服务端会发放积分，并更新 `today_checked_in` / `streak_days` / `total_credits` 等字段。
5. 自动化可行性高：空 body + Bearer Token 即可触发签到。

---

## 2. 端点清单

| 端点 | 方法 | 用途 | 请求体 |
|------|------|------|--------|
| `/v2/billing/meter/daily-checkin` | POST | 执行签到并发放积分 | `{}` |
| `/v2/billing/meter/checkin-activity-status` | POST | 查询签到活动状态 | `{}` |
| `/v2/billing/meter/get-user-resource` | POST | 查询用户资源/积分包 | 待补充 |
| `/v2/report` | POST | 埋点上报 | 事件数组 |

基础域名: `https://copilot.tencent.com`

---

## 3. 签到 API：`daily-checkin`

### 请求

```http
POST /v2/billing/meter/daily-checkin HTTP/1.1
Host: copilot.tencent.com
Content-Type: application/json
Authorization: Bearer <JWT>
X-User-Id: 9d1be9d2-6785-4fc7-9fd5-695ce79eef2f
X-Domain: www.codebuddy.cn

{}
```

### 响应（记录 #85）

```json
{
  "code": 0,
  "msg": "OK",
  "requestId": "52a53304-b441-4aa2-82d5-77258db53a66",
  "data": {
    "credit": 100,
    "streak_days": 4,
    "is_streak_day": false
  }
}
```

| 字段 | 含义 |
|------|------|
| `credit` | 本次签到获得积分 |
| `streak_days` | 签到后的连续天数 |
| `is_streak_day` | 是否连续签到奖励日（含义待更多数据验证） |

---

## 4. 状态查询：`checkin-activity-status`

### 请求

```http
POST /v2/billing/meter/checkin-activity-status HTTP/1.1
Host: copilot.tencent.com
Content-Type: application/json
Authorization: Bearer <JWT>
X-User-Id: 9d1be9d2-6785-4fc7-9fd5-695ce79eef2f
X-Domain: www.codebuddy.cn

{}
```

### 签到前后对比（#52 签到前 vs #87 签到后）

| 字段 | 签到前 (#52) | 签到后 (#87) | 说明 |
|------|-------------|-------------|------|
| `today_checked_in` | `false` | `true` | 今日是否已签到 |
| `streak_days` | `3` | `4` | 连续签到天数 +1 |
| `checkin_dates` | 7/16-7/18 共3天 | 7/16-7/19 共4天 | 追加今日 |
| `week_checkin_days` | `3` | `4` | 本周签到天数 +1 |
| `week_progress[6]` | `false` | `true` | 周日位变为已签 |
| `total_credits` | `300` | `400` | 本期总积分 +100 |
| `is_streak_day` | `false` | `false` | 本次未变化 |
| `next_streak_day` | `0` | `0` | 未变化 |
| `streak_bonus_days` | `0` | `0` | 未变化 |
| `streak_bonus_credit` | `0` | `0` | 未变化 |

### 签到后完整响应（#87）

```json
{
  "code": 0,
  "msg": "OK",
  "requestId": "8f717777-7721-4bd6-b1b0-a5026f6dec60",
  "data": {
    "active": true,
    "today_checked_in": true,
    "streak_days": 4,
    "daily_credit": 100,
    "today_credit": 100,
    "is_streak_day": false,
    "next_streak_day": 0,
    "streak_bonus_days": 0,
    "streak_bonus_credit": 0,
    "checkin_dates": ["2026-07-19", "2026-07-18", "2026-07-17", "2026-07-16"],
    "week_checkin_days": 4,
    "week_progress": [false, false, false, true, true, true, true],
    "total_credits": 400,
    "start_time": "2026-07-16 00:00:00",
    "end_time": "2026-07-22 23:59:59",
    "theme_name": "Buddy加油站",
    "season": 4,
    "activity_name": "本期：灵感",
    "claim_button_text": "立即领取",
    "action_button": {
      "show": true,
      "text": "体验「灵感」",
      "action": "workbuddy://discover"
    }
  }
}
```

### 字段说明

| 字段 | 说明 |
|------|------|
| `active` | 活动是否开启 |
| `today_checked_in` | 今日是否已签到（自动化前应先查此字段） |
| `daily_credit` | 每日基础积分 |
| `today_credit` | 今日可得积分 |
| `week_progress` | 本周周一到周日签到进度 |
| `start_time` / `end_time` | 本期活动窗口 |
| `season` | 期数（当前第4期） |
| `theme_name` / `activity_name` | UI 文案 |
| `action_button` | 跳转 deep link |

### `is_streak_day` 猜测

当前连续签到中该字段始终为 `false`。可能在以下情况变为 `true`：

1. 断签后重新签到触发连续奖励
2. 达到特定连续天数阈值（如 7 天）
3. 与 `streak_bonus_*` 字段联动

需要更多数据点验证。

---

## 5. 埋点：`/v2/report`

事件码: `checkin_claim_click`

| stage | 时机 | 关键字段 |
|-------|------|----------|
| `click` | 点击领取前 | `streak_days: 3`, `today_credit: 100`, `source: bubble` |
| `success` | 签到成功后 | `streak_days: 4`, `credit: 100` |

`mode: LOCAL` 仅为埋点字段，不代表签到在本地完成。

---

## 6. 典型调用时序

```
1. POST checkin-activity-status  → today_checked_in=false, streak_days=3
2. POST /v2/report (stage=click)
3. POST daily-checkin            → credit=100, streak_days=4
4. POST get-user-resource        → 刷新积分包列表
5. POST /v2/report (stage=success)
6. POST checkin-activity-status  → today_checked_in=true, streak_days=4, total_credits+100
```

抓包索引：

| ID | 端点 | 时间 |
|----|------|------|
| #52 | checkin-activity-status（签到前） | 02:34:46 |
| #78 | report 签到前埋点 | - |
| #85 | daily-checkin | - |
| #89 | get-user-resource | - |
| #90 | report 签到后埋点 | - |
| #87 | checkin-activity-status（签到后） | 02:35:02 |

说明：当前会话中 `daily-checkin` 仅捕获到 #85 一条。用户若在同一天再次点击，服务端可能直接拒绝或客户端因 `today_checked_in=true` 不再发起签到请求。

---

## 7. 自动化建议

### 最小可行流程

```text
1. 带 Bearer Token 调 checkin-activity-status
2. 若 today_checked_in == true → 跳过
3. 否则 POST daily-checkin body={}
4. 可选：再查 checkin-activity-status / get-user-resource 校验积分
```

### 请求头模板

```http
Authorization: Bearer <token>
Content-Type: application/json
X-User-Id: <user-id>
X-Domain: www.codebuddy.cn
User-Agent: WorkBuddy/5.2.3 WorkBuddy/5.2.3 CLI/2.106.4
```

### 风险

| 风险 | 说明 |
|------|------|
| Token 过期 | JWT `exp` 需关注；刷新机制未分析 |
| 重复签到 | 应以 `today_checked_in` 为准，避免无效请求 |
| 防作弊 | 当前 body 为空，未见设备指纹字段，强度待评估 |
| 活动窗口 | 需关注 `start_time`/`end_time`/`active` |

---

## 8. 待办

- [ ] 实际模拟 `daily-checkin` 验证自动化（需有效 Token）
- [ ] 分析 Token 刷新机制
- [ ] 观察 `is_streak_day` / `streak_bonus_*` 在特殊日的变化
- [ ] 解析 `get-user-resource` 完整响应结构
- [ ] 评估重复签到错误码（当天二次调用）

---

## 9. 参考数据

| 项 | 值 |
|----|-----|
| 用户 ID | `9d1be9d2-6785-4fc7-9fd5-695ce79eef2f` |
| 用户名 | momo |
| 应用 | WorkBuddy 5.2.3 / CLI 2.106.4 |
| API 域名 | `https://copilot.tencent.com` |
| 每日奖励 | 100 credits |
| 活动 | Buddy加油站 第4期「灵感」|
| 活动窗口 | 2026-07-16 ~ 2026-07-22 |
