/**
 * OpenAI 兼容对话端到端测试
 * 测试 /v1/chat/completions 的流式和非流式模式
 */

const BASE = "http://127.0.0.1:3000";

async function testHealth() {
  const res = await fetch(`${BASE}/health`);
  const data = await res.json();
  console.log(`[健康检查] status=${res.status}`, data);
  return res.status === 200;
}

async function testModels() {
  const res = await fetch(`${BASE}/v1/models`);
  const data = await res.json();
  console.log(`[模型列表] count=${data.data.length}`);
  console.log(`  前5个: ${data.data.slice(0, 5).map((m) => m.id).join(", ")}`);
  return data.data.length > 0;
}

async function testStreamChat(model = "glm-5.2") {
  console.log(`\n[流式对话] model=${model}`);
  console.log("发送: 你好，请用一句话介绍你自己。");

  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "你是一个友好的助手。" },
        { role: "user", content: "你好，请用一句话介绍你自己。" },
      ],
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
          const content = chunk.choices?.[0]?.delta?.content ?? "";
          if (content) {
            fullContent += content;
            chunkCount++;
            process.stdout.write(content);
          }
          if (chunk.choices?.[0]?.finish_reason) {
            console.log(
              `\n  finish_reason=${chunk.choices[0].finish_reason}`
            );
          }
        } catch {
          // 忽略解析失败行
        }
      }
    }
  } catch (err) {
    console.error("  读取流错误:", err);
  }

  console.log(`\n  总计 ${chunkCount} 个chunk, 共 ${fullContent.length} 字符`);
  return fullContent.length > 0;
}

async function testNonStreamChat(model = "glm-5.2") {
  console.log(`\n[非流式对话] model=${model}`);
  console.log("发送: 1+1=?");

  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "user", content: "1+1=?" },
      ],
      stream: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`  错误: HTTP ${res.status}`, err);
    return false;
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  console.log(`  响应: ${content.slice(0, 200)}`);
  console.log(`  finish_reason=${data.choices?.[0]?.finish_reason}`);
  return content.length > 0;
}

async function testMultiTurn(model = "glm-5.2") {
  console.log(`\n[多轮对话] model=${model}`);

  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "你是一个数学老师。" },
        { role: "user", content: "什么是质数？" },
        { role: "assistant", content: "质数是大于1且只能被1和自身整除的自然数。" },
        { role: "user", content: "那前5个质数是什么？" },
      ],
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`  错误: HTTP ${res.status}`, err);
    return false;
  }

  const reader = res.body?.getReader();
  if (!reader) return false;

  const decoder = new TextDecoder();
  let fullContent = "";
  let buffer = "";

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
        if (payload === "[DONE]") continue;
        try {
          const chunk = JSON.parse(payload);
          const content = chunk.choices?.[0]?.delta?.content ?? "";
          if (content) {
            fullContent += content;
            process.stdout.write(content);
          }
        } catch { /* skip */ }
      }
    }
  } catch (err) {
    console.error("  读取流错误:", err);
  }

  console.log(`\n  共 ${fullContent.length} 字符`);
  return fullContent.length > 0;
}

// ---- 主流程 ----
async function main() {
  console.log("=== WorkBuddy2Api OpenAI 对话端到端测试 ===\n");
const results = /** @type {Record<string, boolean>} */ ({});


  results["健康检查"] = await testHealth();
  results["模型列表"] = await testModels();

  if (!results["健康检查"]) {
    console.error("\n❌ 服务未启动，请先启动服务");
    process.exit(1);
  }

  // 测试流式对话
  results["流式对话"] = await testStreamChat();

  // 测试非流式对话
  results["非流式对话"] = await testNonStreamChat();

  // 测试多轮对话
  results["多轮对话"] = await testMultiTurn();

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
