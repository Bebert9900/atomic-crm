import type { LLMProvider } from "./types.ts";
import { anthropicProvider } from "./anthropic.ts";
import { deepseekProvider } from "./deepseek.ts";

const providers: LLMProvider[] = [anthropicProvider, deepseekProvider];

export function resolveProvider(model: string): LLMProvider {
  const p = providers.find((x) => x.supportsModel(model));
  if (!p) {
    throw new Error(
      `No LLM provider configured for model '${model}'. ` +
        `Supported prefixes: claude-*, deepseek-*.`,
    );
  }
  if (!p.hasApiKey()) {
    throw new Error(
      `Provider '${p.id}' has no API key set. ` +
        `Expected env: ${
          p.id === "anthropic" ? "ANTHROPIC_API_KEY" : "DEEPSEEK_API_KEY"
        }`,
    );
  }
  return p;
}

export { providers };
