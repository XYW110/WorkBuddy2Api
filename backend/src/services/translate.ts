import { randomUUID } from "node:crypto";
import type {
  OpenAIChatRequest,
  OpenAIChatChunk,
  OpenAIChatChunkChoice,
  OpenAIChatDelta,
  OpenAIMessage,
  OpenAIChatResponse,
} from "../types/openai.js";
import type {
  CodeBuddyChatRequest,
  CodeBuddySSEChunk,
  CodeBuddySSEChoice,
} from "../types/codebuddy.js";

const CHAT_ID = "chatcmpl-" + randomUUID().slice(0, 8);

/** OpenAI 请求 → CodeBuddy 原生请求 */
export function openaiToCodeBuddy(
  req: OpenAIChatRequest,
  maxTokens: number = 4096
): CodeBuddyChatRequest {
  const result: CodeBuddyChatRequest = {
    messages: req.messages
      .filter((m) => m.role !== "function" && m.role !== "tool") // CodeBuddy 只支持 system/user/assistant
      .map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content ?? "",
      })),
    model: req.model || "auto",
    // 上游强制 stream: true
    stream: true,
    max_tokens: req.max_tokens ?? maxTokens,
  };

  // 透传 tools 定义
  if (req.tools && req.tools.length > 0) {
    result.tools = req.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }));
  }

  // 透传 tool_choice
  if (req.tool_choice) {
    result.tool_choice = req.tool_choice;
  }

  return result;
}

/** 将 CodeBuddy SSE 单行 data 转为 OpenAI SSE chunk，无法解析返回 null */
export function codeBuddySSEToOpenAIChunk(
  dataLine: string,
  model: string,
  chunkIndex: number
): string | null {
  try {
    const raw: CodeBuddySSEChunk = JSON.parse(dataLine);
    const choice: CodeBuddySSEChoice | undefined = raw.choices?.[0];

    // 构建 delta — 同时处理 content 和 tool_calls
    const delta: OpenAIChatDelta = {};

    // 首个 chunk 携带 role
    if (chunkIndex === 0) {
      delta.role = "assistant";
    }

    // content delta
    if (choice?.delta?.content) {
      delta.content = choice.delta.content;
    }

    // tool_calls delta — 直接透传上游格式（index/id/type/function.name/function.arguments）
    if (choice?.delta?.tool_calls && choice.delta.tool_calls.length > 0) {
      delta.tool_calls = choice.delta.tool_calls.map((tc) => ({
        index: tc.index,
        id: tc.id,
        type: tc.type,
        function: {
          name: tc.function?.name,
          arguments: tc.function?.arguments,
        },
      }));
    }

    const chunk: OpenAIChatChunk = {
      id: CHAT_ID,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: raw.model || model,
      choices: [
        {
          index: choice?.index ?? 0,
          delta,
          finish_reason:
            (choice?.finish_reason as OpenAIChatChunkChoice["finish_reason"]) ||
            null,
        },
      ],
    };

    return `data: ${JSON.stringify(chunk)}\n\n`;
  } catch {
    return null;
  }
}

/** 生成 SSE 结束信号 */
export function createDoneSSE(): string {
  return "data: [DONE]\n\n";
}

/** 聚合所有流式 chunks 生成 OpenAI 完整响应 */
export function chunksToOpenAIResponse(
  chunks: OpenAIChatChunk[],
  model: string
): OpenAIChatResponse {
  let content = "";
  let finishReason: OpenAIChatResponse["choices"][0]["finish_reason"] = "stop";

  // tool_calls 聚合：按 index 合并 name + arguments 片段
  const toolCallMap = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();

  for (const chunk of chunks) {
    for (const choice of chunk.choices) {
      // 聚合 content
      if (choice.delta.content) {
        content += choice.delta.content;
      }

      // 聚合 tool_calls delta
      if (choice.delta.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          const existing = toolCallMap.get(tc.index) ?? {
            id: "",
            name: "",
            arguments: "",
          };
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name += tc.function.name;
          if (tc.function?.arguments)
            existing.arguments += tc.function.arguments;
          toolCallMap.set(tc.index, existing);
        }
      }

      if (choice.finish_reason) {
        finishReason =
          choice.finish_reason as OpenAIChatResponse["choices"][0]["finish_reason"];
      }
    }
  }

  // 构建 message — 有 tool_calls 时 content 为 null
  const hasToolCalls = toolCallMap.size > 0;
  const toolCalls = Array.from(toolCallMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([, tc]) => ({
      id: tc.id || `call_${Date.now()}`,
      type: "function" as const,
      function: { name: tc.name, arguments: tc.arguments || "{}" },
    }));

  const message: OpenAIMessage = hasToolCalls
    ? { role: "assistant", content: null, tool_calls: toolCalls }
    : { role: "assistant", content };

  return {
    id: chunks[0]?.id ?? CHAT_ID,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: hasToolCalls ? "tool_calls" : finishReason,
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}
