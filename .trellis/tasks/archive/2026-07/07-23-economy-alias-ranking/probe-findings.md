# 阶段0 探查结论：llm-stats.com 数据源

运行 `npm run leaderboard:probe`（即 `src/scripts/probe-llm-stats.ts`）实抓确认。

## 取数方式（已验证可行）
- 站点为 Next.js App Router，`fetch('https://llm-stats.com')` 返回 200 / 1.6MB HTML。
- 排行榜数据以 **RSC 流**内嵌在 HTML 的 `self.__next_f.push([1,"<escaped>"])` 脚本里。
- 提取步骤（已在 `probe-analyze.ts` 验证）：
  1. 按 `self.__next_f.push([1,` 切分，取每个脚本块内 `"..."` 内容（到行尾 `"])` 前）。
  2. 反转移义：`\\`→`\`、`\"`→`"`、`\n`→换行。
  3. 用平衡括号扫描器提取所有 `{"model_id":...}` 对象（共 4768 个）。
- 原始 HTML 已存 `data/leaderboard/probe/llm-stats.html`（用于离线分析 / fixture）。

## 两套数据集
1. **竞技场排名**（4434 个）：`{model_id, model_name, organization_id, organization_name, conservative, mu, sigma, ci_lower, ci_upper, rank, rank_delta_14d, games_played}`。
   - `mu` / `conservative` 为能力分；`rank` 为排名。→ **作为主能力信号**。
2. **模型规格**（334 个）：`{model_id, name, organization, gpqa_score, swe_bench_verified_score, hle_score, context, param_count, input_price, output_price, throughput, is_open_source, ...}`。
   - 含绝对价格与基准分，但覆盖不到我们的模型（如 glm-5.2 不在其中），作辅助。

## 模型名映射可行性（对我们的 MODELS）
几乎全部命中竞技场条目（模糊匹配 + 归一化）：
- 命中：hy3, MiniMax-M2.5/M3/M2.7, GLM-5.2/5.1/5.0-Turbo/4.6V/4.6, Kimi-K2.7/2.6/2.5/Thinking, DeepSeek-V4-Flash/Pro, DeepSeek-V3.x 系列, Claude-3.7-Sonnet。
- 未命中：hunyuan-2.0-instruct、hunyuan-chat（Hunyuan 未在竞技场）、default-1.2（Claude-4.0-Sonnet，命名差异）。
- 同名多条目（如 GLM-5.2 有 3 个 mu 不同）：取**归一化名精确相等**者，再取 `mu` 最大者作为代表（体现最佳表现）。

## 实际选择结果（当前 MODELS）
- 免费档（credits==="x0.00"）：仅 `hy3` → 按 OQ4 免费优先，别名恒指 `hy3`。
- 付费档（兜底/展示）：在 credits>0 中排除最弱（最小 credits，即 deepseek-v4-flash x0.06），其余按"低 credits + 高 mu"打分选优。

## 风险与对策（已纳入实现）
- RSC 结构可能随站点改版变化 → 解析失败回退 `data/leaderboard/snapshot.json`；每源带超时 + 单源容错。
- 每次抓取先存原始 HTML 快照，避免重复出网、便于回放。
- lmarena 被 Cloudflare 403、llmrank 直连超时 → 主源 llm-stats 足够，其他源作为"能连就抓"。
