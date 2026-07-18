/** CodeBuddy 聊天补全请求（原生格式） */
export interface CodeBuddyChatRequest {
  messages: CodeBuddyMessage[];
  model: string;
  stream: boolean;
  max_tokens?: number;
  tools?: CodeBuddyTool[];
  tool_choice?:
    | "auto"
    | "none"
    | { type: "function"; function: { name: string } };
}

/** 工具定义（OpenAI 兼容格式） */
export interface CodeBuddyTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface CodeBuddyMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** CodeBuddy SSE 流中的单条 data 结构（需实际调试确认） */
export interface CodeBuddySSEChunk {
  id?: string;
  model?: string;
  choices?: CodeBuddySSEChoice[];
}

export interface CodeBuddySSEChoice {
  index?: number;
  delta?: {
    role?: string;
    content?: string;
    tool_calls?: CodeBuddyToolCallDelta[];
  };
  finish_reason?: string | null;
}

/** 流式 tool_calls delta（增量片段） */
export interface CodeBuddyToolCallDelta {
  index: number;
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
}
