export type NormalizedToolCall = {
  id: string;
  name: string;
  args: unknown;
};

export type NormalizedUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

export type NormalizedResponse = {
  /** Concatenated text blocks emitted by the assistant this turn. */
  text: string;
  /** Tool calls the assistant wants to run next. */
  toolCalls: NormalizedToolCall[];
  /** 'tool_use' if we must loop again, 'stop' if done. */
  finishReason: "stop" | "tool_use" | "length" | "error";
  usage: NormalizedUsage;
  /** Provider-native assistant message, to be appended to messages history. */
  rawAssistantMessage: unknown;
};

export type ToolResultEntry = {
  toolCallId: string;
  toolName: string;
  content: string;
  isError: boolean;
};

export type ToolDescriptor = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type LLMProvider = {
  id: "anthropic" | "deepseek" | "openrouter";

  /** Whether the provider supports this model id. */
  supportsModel(model: string): boolean;

  /** Create an initial messages array from the user input string. */
  buildInitialMessages(userContent: string): unknown[];

  /** Issue one request; returns normalized response. */
  createCompletion(args: {
    model: string;
    system: string;
    messages: unknown[];
    tools: ToolDescriptor[];
    maxTokens: number;
    /** Optional: per-request API key (typically the user's own key, fetched
     * from public.user_api_keys). When omitted, the provider falls back to
     * its server env var. */
    apiKey?: string;
    /** Optional: per-request OAuth bearer (Anthropic only — Claude Code flow).
     * When provided, takes precedence over apiKey and bills the user's
     * Claude subscription quota instead of API credits. */
    userOAuthToken?: string;
  }): Promise<NormalizedResponse>;

  /** Append tool results as a new user/tool message to history. */
  appendToolResults(messages: unknown[], results: ToolResultEntry[]): unknown[];

  /** USD cost for a given usage. */
  computeCost(model: string, usage: NormalizedUsage): number;

  /** True if the provider API key is configured. */
  hasApiKey(): boolean;
};
