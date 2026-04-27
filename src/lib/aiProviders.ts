import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";

export type AIProvider = "anthropic" | "deepseek" | "openrouter";

export const PROVIDER_DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: "claude-sonnet-4-6",
  deepseek: "deepseek-chat",
  openrouter: "openai/gpt-4o-mini",
};

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  anthropic: "Anthropic (Claude)",
  deepseek: "DeepSeek",
  openrouter: "OpenRouter",
};

export const PROVIDER_HELP: Record<AIProvider, string> = {
  anthropic:
    "Clé API Claude (commence par sk-ant-...). Crée-la sur console.anthropic.com → Settings → API keys.",
  deepseek:
    "Clé API DeepSeek (commence par sk-...). Crée-la sur platform.deepseek.com → API keys.",
  openrouter:
    "Clé API OpenRouter (commence par sk-or-...). Donne accès à GPT-4o, Claude, Llama, etc. Crée-la sur openrouter.ai/keys.",
};

export type ProviderStatus = {
  provider: AIProvider;
  connected: boolean;
  label: string | null;
  model: string | null;
  updated_at: string | null;
};

export async function listProviderStatuses(): Promise<ProviderStatus[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_api_keys")
    .select("provider, label, model, updated_at");
  if (error) throw new Error(error.message);
  const byProvider = new Map<AIProvider, ProviderStatus>();
  for (const row of data ?? []) {
    byProvider.set(row.provider as AIProvider, {
      provider: row.provider as AIProvider,
      connected: true,
      label: (row.label as string | null) ?? null,
      model: (row.model as string | null) ?? null,
      updated_at: (row.updated_at as string | null) ?? null,
    });
  }
  const all: AIProvider[] = ["anthropic", "deepseek", "openrouter"];
  return all.map(
    (p) =>
      byProvider.get(p) ?? {
        provider: p,
        connected: false,
        label: null,
        model: null,
        updated_at: null,
      },
  );
}

export async function saveProviderKey(args: {
  provider: AIProvider;
  apiKey: string;
  label?: string;
  model?: string;
}): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: encrypted, error: encErr } = await supabase.rpc(
    "encrypt_ai_key",
    { plain_key: args.apiKey },
  );
  if (encErr) throw new Error(`encrypt_failed: ${encErr.message}`);

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error("not_authenticated");

  const payload = {
    user_id: userData.user.id,
    provider: args.provider,
    encrypted_key: encrypted as string,
    label: args.label?.trim() || null,
    model: args.model?.trim() || null,
  };
  const { error } = await supabase
    .from("user_api_keys")
    .upsert(payload, { onConflict: "user_id,provider" });
  if (error) throw new Error(error.message);
}

export async function deleteProviderKey(provider: AIProvider): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error("not_authenticated");
  const { error } = await supabase
    .from("user_api_keys")
    .delete()
    .eq("user_id", userData.user.id)
    .eq("provider", provider);
  if (error) throw new Error(error.message);
}
