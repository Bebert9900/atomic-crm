import type {
  LLMProvider,
  NormalizedResponse,
  NormalizedToolCall,
  NormalizedUsage,
  ToolResultEntry,
} from "./types.ts";

const envApiKey = Deno.env.get("DEEPSEEK_API_KEY");
const baseUrl = Deno.env.get("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com";

// USD per 1M tokens. DeepSeek has automatic server-side cache: cache-hit input
// is billed at the cache_read rate. Output stays flat.
// Reference: https://api-docs.deepseek.com/quick_start/pricing
const pricing: Record<
  string,
  { input: number; input_cache_hit: number; output: number }
> = {
  "deepseek-chat": { input: 0.27, input_cache_hit: 0.07, output: 1.1 },
  "deepseek-reasoner": { input: 0.55, input_cache_hit: 0.14, output: 2.19 },
};

type OpenAIMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  // deno-lint-ignore no-explicit-any
  tool_calls?: any[];
  tool_call_id?: string;
};

export const deepseekProvider: LLMProvider = {
  id: "deepseek",

  supportsModel(model) {
    return model.startsWith("deepseek-");
  },

  hasApiKey() {
    return Boolean(envApiKey);
  },

  buildInitialMessages(userContent) {
    return [{ role: "user", content: userContent }] as OpenAIMsg[];
  },

  async createCompletion({
    model,
    system,
    messages,
    tools,
    maxTokens,
    apiKey,
  }): Promise<NormalizedResponse> {
    const key = apiKey ?? envApiKey;
    if (!key) throw new Error("DEEPSEEK_API_KEY not configured");

    const payload = {
      model,
      messages: [
        { role: "system", content: system },
        ...(messages as OpenAIMsg[]),
      ],
      tools: tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      })),
      tool_choice: "auto",
      max_tokens: maxTokens,
    };

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`DeepSeek API ${res.status}: ${t}`);
    }
    const json = await res.json();
    const choice = json.choices?.[0];
    if (!choice) throw new Error("DeepSeek returned no choice");

    const msg = choice.message as OpenAIMsg;
    const text = typeof msg.content === "string" ? msg.content : "";
    const rawToolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

    const toolCalls: NormalizedToolCall[] = rawToolCalls.map(
      // deno-lint-ignore no-explicit-any
      (tc: any) => ({
        id: tc.id,
        name: tc.function?.name,
        args: safeJsonParse(tc.function?.arguments),
      }),
    );

    const u = json.usage ?? {};
    const usage: NormalizedUsage = {
      input_tokens: u.prompt_tokens ?? 0,
      output_tokens: u.completion_tokens ?? 0,
      cache_read_input_tokens: u.prompt_cache_hit_tokens ?? 0,
      cache_creation_input_tokens: 0,
    };

    const finishReason =
      choice.finish_reason === "tool_calls"
        ? ("tool_use" as const)
        : ("stop" as const);

    return {
      text,
      toolCalls,
      finishReason,
      usage,
      rawAssistantMessage: {
        role: "assistant",
        content: msg.content,
        tool_calls: rawToolCalls,
      },
    };
  },

  appendToolResults(messages, results) {
    const toolMsgs: OpenAIMsg[] = results.map((r) => ({
      role: "tool",
      tool_call_id: r.toolCallId,
      content: r.content,
    }));
    return [...(messages as OpenAIMsg[]), ...toolMsgs];
  },

  computeCost(model, usage) {
    const p = pricing[model];
    if (!p) return 0;
    const cacheHit = usage.cache_read_input_tokens ?? 0;
    const regularInput = Math.max(0, usage.input_tokens - cacheHit);
    return (
      (regularInput * p.input +
        cacheHit * p.input_cache_hit +
        usage.output_tokens * p.output) /
      1_000_000
    );
  },
};

function safeJsonParse(s: string | undefined): unknown {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
