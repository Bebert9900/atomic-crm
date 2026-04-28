import type {
  LLMProvider,
  NormalizedResponse,
  NormalizedToolCall,
  NormalizedUsage,
} from "./types.ts";

// OpenRouter is OpenAI-compatible. Model ids follow `<vendor>/<model>` form,
// e.g. "anthropic/claude-3.5-sonnet", "openai/gpt-4o-mini", "deepseek/deepseek-chat".
// We treat any model id containing a "/" as OpenRouter unless another provider
// matches it first.

const envApiKey = Deno.env.get("OPENROUTER_API_KEY");
const baseUrl =
  Deno.env.get("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1";
const referer = Deno.env.get("OPENROUTER_HTTP_REFERER") ?? "https://atomic.crm";
const xTitle = Deno.env.get("OPENROUTER_X_TITLE") ?? "Atomic CRM Agent";

type OpenAIMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  // deno-lint-ignore no-explicit-any
  tool_calls?: any[];
  tool_call_id?: string;
};

export const openrouterProvider: LLMProvider = {
  id: "openrouter",

  supportsModel(model) {
    return model.includes("/");
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
    if (!key) throw new Error("OPENROUTER_API_KEY not configured");

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
        "HTTP-Referer": referer,
        "X-Title": xTitle,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`OpenRouter API ${res.status}: ${t}`);
    }
    const json = await res.json();
    const choice = json.choices?.[0];
    if (!choice) throw new Error("OpenRouter returned no choice");

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
      cache_read_input_tokens: 0,
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

  // OpenRouter exposes per-model pricing via API; without a local price table
  // we report 0 (real cost is reported by OpenRouter's own dashboard).
  computeCost() {
    return 0;
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
