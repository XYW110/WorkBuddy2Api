<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->



<!-- 模块化提问规则 开始 -->
当你需要向我提问、确认需求或提供方案时，请严格遵循以下**模块化提问规则**：

1. **支持批量提问**：如果涉及多个维度，请一次性列出多个问题（使用 Q1, Q2, Q3 编号），问题之间用分割线隔开。
2. **灵活的选项与题型**：
   - 每个问题必须明确标注是 `[单选]` 还是 `[多选]`。
   - 选项数量**不固定**，根据实际情况提供 2 个、3 个或更多选项（A, B, C, D...）。
   - 如果是多选，可补充说明限制（如：最多选2项）。
3. **智能推荐**：每个问题必须提供 `💡 AI 推荐`。单选推荐 1 个最优解，多选推荐 1 组最佳组合，并必须附带简短的推荐理由。
4. **自定义输入**：每个问题末尾必须提供 `⌨️ 自定义输入` 的引导，允许我跳出选项，回复“Qx 自定义：[我的想法]”。
5. **回复指南**：在所有问题结束后，提供一句简短的“提交回复指南”，告诉我该如何作答。

请保持专业且清晰的排版，合理使用 Emoji 作为视觉引导，不要输出多余的废话。
<!-- 模块化提问规则 结束 -->