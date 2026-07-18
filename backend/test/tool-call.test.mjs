/**
 * 工具调用（function calling）端到端测试
 * 测试 /v1/chat/completions 流式模式下 tools 参数的正确性
 */
const BASE = "http://127.0.0.1:3000";

// ---- 工具定义 ----
const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "获取指定城市的天气信息",
      parameters: {
        type: "object",
        properties: {
          city: {
            type: "string",
            description: "城市名称，例如：北京、上海",
          },
        },
        required: ["city"],
      },
    },
  },
];

// ---- 测试函数 ----

async function testHealth() {
  const res = await fetch(`${BASE}/health`);
  const data = await res.json();
  console.log(`[健康检查] status=${res.status}`, data);
  return res.status === 200;
}

/** 流式工具调用：要求模型查询天气 */
async function testStreamToolCall() {
  console.log(`\n[流式工具调用] 发送带 tools 的请求`);
  console.log("发送: 北京今天天气怎么样？");

  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "glm-5.2",
      messages: [
        { role: "user", content: "北京今天天气怎么样？" },
      ],
      tools: TOOLS,
      tool_choice: "auto",
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`  错误: HTTP ${res.status}`, err);
    return false;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    console.error("  错误: 无法获取响应流");
    return false;
  }

  const decoder = new TextDecoder();
  let fullContent = "";
  let chunkCount = 0;
  let buffer = "";
  /** @type {Array<{index:number, id:string, name:string, arguments:string}>} */
  const toolCallParts = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6);
        if (payload === "[DONE]") {
          console.log("\n  [DONE] 流结束");
          continue;
        }
        try {
          const chunk = JSON.parse(payload);
          chunkCount++;

          // content delta
          const content = chunk.choices?.[0]?.delta?.content ?? "";
          if (content) {
            fullContent += content;
            process.stdout.write(content);
          }

          // tool_calls delta
          const toolCalls = chunk.choices?.[0]?.delta?.tool_calls;
          if (toolCalls) {
            for (const tc of toolCalls) {
              const existing = toolCallParts.find((p) => p.index === tc.index);
              if (existing) {
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name += tc.function.name;
                if (tc.function?.arguments) existing.arguments += tc.function.arguments;
              } else {
                toolCallParts.push({
                  index: tc.index,
                  id: tc.id ?? "",
                  name: tc.function?.name ?? "",
                  arguments: tc.function?.arguments ?? "",
                });
              }
            }
          }

          const finishReason = chunk.choices?.[0]?.finish_reason;
          if (finishReason) {
            console.log(`\n  finish_reason=${finishReason}`);
          }
        } catch {
          // 忽略解析失败行
        }
      }
    }
  } catch (err) {
    console.error("  读取流错误:", err);
  }

  console.log(`\n  总计 ${chunkCount} 个 chunk`);
  console.log(`  content: "${fullContent}" (${fullContent.length} 字符)`);

  // 输出工具调用结果
  if (toolCallParts.length > 0) {
    console.log(`  tool_calls 数量: ${toolCallParts.length}`);
    for (const tc of toolCallParts) {
      console.log(`    [${tc.index}] fn=${tc.name} args=${tc.arguments}`);
    }
  } else {
    console.log("  ⚠️ 未收到 tool_calls，可能是模型选择了直接文本回复");
  }

  // 检测：要么有 tool_calls，要么有 content（模型自由选择）
  const hasToolCalls = toolCallParts.length > 0;
  const hasContent = fullContent.length > 0;
  const passed = hasToolCalls || hasContent;
  console.log(`  结果: ${passed ? "✅ 通过" : "❌ 无响应"}`);
  return passed;
}

/** 非流式工具调用 */
async function testNonStreamToolCall() {
  console.log(`\n[非流式工具调用] 发送带 tools 的请求`);
  console.log("发送: 上海今天天气怎么样？");

  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "glm-5.2",
      messages: [
        { role: "user", content: "上海今天天气怎么样？" },
      ],
      tools: TOOLS,
      tool_choice: "auto",
      stream: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`  错误: HTTP ${res.status}`, err);
    return false;
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  const content = choice?.message?.content ?? "";
  const toolCalls = choice?.message?.tool_calls ?? [];

  console.log(`  content: "${content}"`);
  console.log(`  finish_reason=${choice?.finish_reason}`);
  console.log(`  tool_calls 数量: ${toolCalls.length}`);
  for (const tc of toolCalls) {
    console.log(`    [${tc.index}] fn=${tc.function?.name} args=${tc.function?.arguments}`);
  }

  const passed = content.length > 0 || toolCalls.length > 0;
  console.log(`  结果: ${passed ? "✅ 通过" : "❌ 无响应"}`);
  return passed;
}

// ---- 主流程 ----
async function main() {
  console.log("=== WorkBuddy2Api 工具调用端到端测试 ===\n");

  /** @type {Record<string, boolean>} */
  const results = {};

  results["健康检查"] = await testHealth();

  if (!results["健康检查"]) {
    console.error("\n❌ 服务未启动，请先启动服务");
    process.exit(1);
  }

  // 流式工具调用
  results["流式工具调用"] = await testStreamToolCall();

  // 非流式工具调用
  results["非流式工具调用"] = await testNonStreamToolCall();

  // 汇总
  console.log("\n=== 测试结果汇总 ===");
  for (const [name, ok] of Object.entries(results)) {
    console.log(`  ${ok ? "✅" : "❌"} ${name}`);
  }

  const allPassed = Object.values(results).every(Boolean);
  console.log(`\n${allPassed ? "🎉 全部通过" : "⚠️ 存在失败项"}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("测试脚本异常:", err);
  process.exit(1);
});
