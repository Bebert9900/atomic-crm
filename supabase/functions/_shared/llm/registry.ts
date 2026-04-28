import type { LLMProvider } from "./types.ts";
import { anthropicProvider } from "./anthropic.ts";
import { deepseekProvider } from "./deepseek.ts";
import { openrouterProvider } from "./openrouter.ts";

// Order matters: more specific matchers first. OpenRouter's matcher (contains
// "/") is the broadest, so it goes last.
const providers: LLMProvider[] = [
  anthropicProvider,
  deepseekProvider,
  openrouterProvider,
];

const ENV_VAR: Record<LLMProvider["id"], string> = {
  anthropic: "ANTHROPIC_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

export function resolveProvider(model: string): LLMProvider {
  const p = providers.find((x) => x.supportsModel(model));
  if (!p) {
    throw new Error(
      `No LLM provider configured for model '${model}'. ` +
        `Supported prefixes: claude-*, deepseek-*, <vendor>/<model> (OpenRouter).`,
    );
  }
  if (!p.hasApiKey()) {
    throw new Error(
      `Provider '${p.id}' has no API key set. Expected env: ${ENV_VAR[p.id]}`,
    );
  }
  return p;
}

export { providers };
