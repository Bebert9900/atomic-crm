// Anthropic OAuth helper (service-role only). Exchanges authorization codes
// and refreshes tokens against Anthropic's platform.claude.com endpoints.
// Uses the public Claude Code client_id; see src/constants/oauth.ts.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const AUTHORIZE_URL = "https://claude.com/cai/oauth/authorize";
const MANUAL_REDIRECT_URL = "https://platform.claude.com/oauth/code/callback";

export const ANTHROPIC_OAUTH_SCOPES = [
  "org:create_api_key",
  "user:profile",
  "user:inference",
  "user:sessions:claude_code",
  "user:mcp_servers",
  "user:file_upload",
];

export const ANTHROPIC_AUTHORIZE_URL = AUTHORIZE_URL;
export const ANTHROPIC_MANUAL_REDIRECT_URL = MANUAL_REDIRECT_URL;
export const ANTHROPIC_CLIENT_ID = CLIENT_ID;

export type AnthropicTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  account?: { uuid: string; email_address?: string };
  organization?: { uuid?: string; organization_type?: string };
};

function serviceRoleClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key =
    Deno.env.get("SB_ADMIN_KEY") ??
    Deno.env.get("SUPABASE_INTERNAL_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

export async function exchangeAuthorizationCode(params: {
  code: string;
  codeVerifier: string;
  state: string;
  useManualRedirect?: boolean;
  port?: number;
}): Promise<AnthropicTokenResponse> {
  const redirectUri = params.useManualRedirect
    ? MANUAL_REDIRECT_URL
    : `http://localhost:${params.port ?? 0}/callback`;

  const body = {
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: redirectUri,
    client_id: CLIENT_ID,
    code_verifier: params.codeVerifier,
    state: params.state,
  };

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`token_exchange_failed: ${res.status} ${text}`);
  }
  return (await res.json()) as AnthropicTokenResponse;
}

export async function refreshAnthropicToken(
  refreshToken: string,
): Promise<AnthropicTokenResponse> {
  const body = {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    scope: ANTHROPIC_OAUTH_SCOPES.join(" "),
  };
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`token_refresh_failed: ${res.status} ${text}`);
  }
  return (await res.json()) as AnthropicTokenResponse;
}

function orgTypeToSubscription(orgType?: string): string | null {
  switch (orgType) {
    case "claude_max":
      return "max";
    case "claude_pro":
      return "pro";
    case "claude_enterprise":
      return "enterprise";
    case "claude_team":
      return "team";
    default:
      return null;
  }
}

export async function storeAnthropicTokens(
  userId: string,
  tok: AnthropicTokenResponse,
): Promise<void> {
  const db = serviceRoleClient();
  const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString();
  const scopes = tok.scope?.split(" ").filter(Boolean) ?? [];
  const subscriptionType = orgTypeToSubscription(
    tok.organization?.organization_type,
  );
  const { error } = await db.from("user_oauth_tokens").upsert(
    {
      user_id: userId,
      provider: "anthropic",
      access_token: tok.access_token,
      refresh_token: tok.refresh_token ?? null,
      expires_at: expiresAt,
      scopes,
      subscription_type: subscriptionType,
      account_email: tok.account?.email_address ?? null,
    },
    { onConflict: "user_id,provider" },
  );
  if (error) throw new Error(`store_tokens_failed: ${error.message}`);
}

export async function getValidAnthropicToken(
  userId: string,
): Promise<{ accessToken: string; subscriptionType: string | null } | null> {
  const db = serviceRoleClient();
  const { data, error } = await db
    .from("user_oauth_tokens")
    .select("access_token, refresh_token, expires_at, subscription_type")
    .eq("user_id", userId)
    .eq("provider", "anthropic")
    .maybeSingle();
  if (error) {
    console.error("getValidAnthropicToken query error", {
      userId,
      error: error.message,
      code: (error as { code?: string }).code,
    });
    return null;
  }
  if (!data) {
    console.error("getValidAnthropicToken no data", { userId });
    return null;
  }

  const expiresAt = data.expires_at ? Date.parse(data.expires_at) : 0;
  const needsRefresh = expiresAt - Date.now() < 5 * 60 * 1000;
  if (!needsRefresh) {
    return {
      accessToken: data.access_token,
      subscriptionType: data.subscription_type ?? null,
    };
  }
  if (!data.refresh_token) return null;

  try {
    const tok = await refreshAnthropicToken(data.refresh_token);
    await storeAnthropicTokens(userId, tok);
    return {
      accessToken: tok.access_token,
      subscriptionType: orgTypeToSubscription(
        tok.organization?.organization_type,
      ),
    };
  } catch {
    return null;
  }
}

export async function revokeAnthropicTokens(userId: string): Promise<void> {
  const db = serviceRoleClient();
  await db
    .from("user_oauth_tokens")
    .delete()
    .eq("user_id", userId)
    .eq("provider", "anthropic");
}
