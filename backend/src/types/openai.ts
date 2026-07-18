/** OpenAI 标准 Chat Completion 请求 */
export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  user?: string;
  tools?: OpenAITool[];
  tool_choice?:
    | "auto"
    | "none"
    | { type: "function"; function: { name: string } };
}

/** OpenAI 工具定义 */
export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "function" | "tool";
  content: string | null;
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/** OpenAI SSE 流式响应 chunk */
export interface OpenAIChatChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: OpenAIChatChunkChoice[];
}

export interface OpenAIChatChunkChoice {
  index: number;
  delta: OpenAIChatDelta;
  finish_reason: "stop" | "length" | "content_filter" | "tool_calls" | null;
  logprobs?: null;
}

/** 流式 tool_calls delta（增量片段） */
export interface OpenAIToolCallDelta {
  index: number;
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface OpenAIChatDelta {
  role?: "assistant";
  content?: string;
  tool_calls?: OpenAIToolCallDelta[];
}

/** OpenAI 非流式完整响应 */
export interface OpenAIChatResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: OpenAIChatResponseChoice[];
  usage: OpenAIUsage;
}

export interface OpenAIChatResponseChoice {
  index: number;
  message: OpenAIMessage;
  finish_reason: "stop" | "length" | "content_filter" | "tool_calls";
}

export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** OpenAI 模型列表响应 */
export interface OpenAIModelList {
  object: "list";
  data: OpenAIModel[];
}

export interface OpenAIModel {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
}
