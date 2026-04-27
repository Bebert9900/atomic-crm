// Service-role helper: fetch a user's plaintext LLM API key.
// Reads the encrypted blob from public.user_api_keys, then calls the SECURITY
// DEFINER decrypt_ai_key RPC. Both steps require service_role.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type ApiKeyProvider = "anthropic" | "deepseek" | "openrouter";

function serviceRoleClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key =
    Deno.env.get("SB_ADMIN_KEY") ??
    Deno.env.get("SUPABASE_INTERNAL_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

export type UserApiKey = {
  provider: ApiKeyProvider;
  apiKey: string;
  model: string | null;
};

export async function getUserApiKey(
  userId: string,
  provider: ApiKeyProvider,
): Promise<UserApiKey | null> {
  const db = serviceRoleClient();
  const { data, error } = await db
    .from("user_api_keys")
    .select("encrypted_key, model")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error || !data) return null;

  const { data: plain, error: decErr } = await db.rpc("decrypt_ai_key", {
    encrypted_key: data.encrypted_key,
  });
  if (decErr || !plain) return null;

  return {
    provider,
    apiKey: plain as string,
    model: (data.model as string | null) ?? null,
  };
}

export async function listUserConnectedProviders(
  userId: string,
): Promise<ApiKeyProvider[]> {
  const db = serviceRoleClient();
  const { data } = await db
    .from("user_api_keys")
    .select("provider")
    .eq("user_id", userId);
  return ((data ?? []) as { provider: ApiKeyProvider }[]).map(
    (r) => r.provider,
  );
}
