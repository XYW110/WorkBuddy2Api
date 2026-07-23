# Journal - xyw (Part 1)

> AI development session journal
> Started: 2026-07-18

---



## Session 1: 排行榜驱动的经济型模型别名与价格/基准分展示

**Date**: 2026-07-23
**Task**: 排行榜驱动的经济型模型别名与价格/基准分展示
**Branch**: `master`

### Summary

将排行榜主源从 llm-stats 首页切换为 /leaderboards/llm-leaderboard（spec 类型），重构 parse.ts 用标准 RSC 还原法从 initialData 提取规格+基准分并合成为归一化能力分；新增 leaderboard 服务（parse/map/select/store/fetch）、/admin/leaderboard 路由、model-catalog 与探查/验证脚本、单元测试；前端 Models 页新增能力指数与输入/输出价格列；.gitignore 忽略后端运行日志。后端 tsc 与 leaderboard 单测、前端 vue-tsc 均通过，真实出网端到端验证选中 hy3 并写入价格。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `4523b16` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 2: credentials 整库快照导出/导入备份闭环

**Date**: 2026-07-23
**Task**: credentials 整库快照导出/导入备份闭环
**Branch**: `master`

### Summary

为 Credentials 页面新增导出备份与导入备份闭环：credential-store 新增 getStore()/importStore()（按 id 合并去重、还原 activeId、仅记统计日志不打印明文）；admin/credentials 路由新增 GET /credentials/export（下载 credentials-backup.json）与 POST /credentials/import（multipart 快照合并，返回 added/updated/activeId），置于 /admin scope 下自动 admin-only；前端 api 新增 exportCredentials/importCredentials 与 ImportResult 类型，Credentials.vue 新增导出/导入备份按钮（保留原上传 JSON 单条添加）；新增 test/credentials.unit.ts round-trip 单测与 credentials:test 脚本。后端 tsc、单测与前端 vue-tsc 均通过。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `672cb4c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 3: 模型动态拉取(UA修复/字段扩展)与 API Key 调用统计

**Date**: 2026-07-24
**Task**: 模型动态拉取(UA修复/字段扩展)与 API Key 调用统计
**Branch**: `master`

### Summary

实现两个功能：(1) API Key 调用统计面板——按 key+model 维度统计调用次数/token，H1 估算，JSON 当日持久化，GET /admin/stats/usage + 前端面板；(2) 模型列表动态拉取——从 /v3/config 抓取，经 Reqable 抓包定位到必须带 WorkBuddy UA 否则上游走精简分支只回 productFeatures，修复后返回 43 个模型，字段扩展(descriptionZh/maxAllowedSize/maxInputTokens/maxOutputTokens/supportsImages/supportsToolCall/supportsReasoning/isDefault/tags)并透出前后端，默认 max_tokens 按模型 maxOutputTokens 配置走。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `92a0617` | (see git log) |
| `3bbda51` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
