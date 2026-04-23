import Anthropic from "npm:@anthropic-ai/sdk@^0.33";

const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

export const client = new Anthropic({
  apiKey: apiKey ?? "missing-api-key",
});

export function hasApiKey(): boolean {
  return Boolean(apiKey);
}
