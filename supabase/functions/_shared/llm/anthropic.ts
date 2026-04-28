import Anthropic from "npm:@anthropic-ai/sdk@^0.33";
import type {
  LLMProvider,
  NormalizedResponse,
  NormalizedToolCall,
  NormalizedUsage,
  ToolDescriptor,
  ToolResultEntry,
} from "./types.ts";

const envApiKey = Deno.env.get("ANTHROPIC_API_KEY");
const envClient = new Anthropic({ apiKey: envApiKey ?? "missing" });

const OAUTH_BETA_HEADER = "oauth-2025-04-20";

function clientForRequest(args: {
  apiKey?: string;
  oauthToken?: string;
}): Anthropic {
  if (args.oauthToken) {
    return new Anthropic({
      authToken: args.oauthToken,
      defaultHeaders: { "anthropic-beta": OAUTH_BETA_HEADER },
    });
  }
  if (args.apiKey && args.apiKey !== envApiKey) {
    return new Anthropic({ apiKey: args.apiKey });
  }
  return envClient;
}

// USD per 1M tokens
const pricing: Record<
  string,
  { input: number; output: number; cache_write: number; cache_read: number }
> = {
  "claude-opus-4-7": {
    input: 15,
    output: 75,
    cache_write: 18.75,
    cache_read: 1.5,
  },
  "claude-sonnet-4-6": {
    input: 3,
    output: 15,
    cache_write: 3.75,
    cache_read: 0.3,
  },
  "claude-haiku-4-5-20251001": {
    input: 1,
    output: 5,
    cache_write: 1.25,
    cache_read: 0.1,
  },
};

export const anthropicProvider: LLMProvider = {
  id: "anthropic",

  supportsModel(model) {
    return model.startsWith("claude-");
  },

  hasApiKey() {
    return Boolean(envApiKey);
  },

  // deno-lint-ignore no-explicit-any
  _anthropicClientFor: clientForRequest as any,

  buildInitialMessages(userContent) {
    return [{ role: "user", content: userContent }];
  },

  async createCompletion({
    model,
    system,
    messages,
    tools,
    maxTokens,
    apiKey,
    userOAuthToken,
  }): Promise<NormalizedResponse> {
    const sdk = clientForRequest({ apiKey, oauthToken: userOAuthToken });
    const systemBlocks = [
      {
        type: "text" as const,
        text: system,
        cache_control: { type: "ephemeral" as const },
      },
    ];
    const claudeTools = tools.map((t, i, arr) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
      ...(i === arr.length - 1
        ? { cache_control: { type: "ephemeral" as const } }
        : {}),
    }));

    // deno-lint-ignore no-explicit-any
    const response = await sdk.messages.create({
      model,
      system: systemBlocks,
      tools: claudeTools as any,
      messages: messages as any,
      max_tokens: maxTokens,
    });

    // deno-lint-ignore no-explicit-any
    const u = (response.usage ?? {}) as any;
    const usage: NormalizedUsage = {
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    };

    const text = response.content
      // deno-lint-ignore no-explicit-any
      .filter((b: any) => b.type === "text")
      // deno-lint-ignore no-explicit-any
      .map((b: any) => b.text)
      .join("\n");

    const toolCalls: NormalizedToolCall[] = response.content
      // deno-lint-ignore no-explicit-any
      .filter((b: any) => b.type === "tool_use")
      // deno-lint-ignore no-explicit-any
      .map((b: any) => ({ id: b.id, name: b.name, args: b.input }));

    return {
      text,
      toolCalls,
      finishReason: response.stop_reason === "tool_use" ? "tool_use" : "stop",
      usage,
      rawAssistantMessage: { role: "assistant", content: response.content },
    };
  },

  appendToolResults(messages, results) {
    const content = results.map((r) => ({
      type: "tool_result",
      tool_use_id: r.toolCallId,
      content: r.content,
      is_error: r.isError,
    }));
    return [...messages, { role: "user", content }];
  },

  computeCost(model, usage) {
    const p = pricing[model];
    if (!p) return 0;
    return (
      (usage.input_tokens * p.input +
        usage.output_tokens * p.output +
        (usage.cache_creation_input_tokens ?? 0) * p.cache_write +
        (usage.cache_read_input_tokens ?? 0) * p.cache_read) /
      1_000_000
    );
  },
};
