import type { AuthInfo } from "./auth.ts";
import {
  exchangeAuthorizationCode,
  revokeAnthropicTokens,
  storeAnthropicTokens,
} from "../_shared/oauth/anthropic.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

function serviceRole() {
  const key =
    Deno.env.get("SB_ADMIN_KEY") ??
    Deno.env.get("SUPABASE_INTERNAL_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(Deno.env.get("SUPABASE_URL")!, key);
}

export async function handleOAuthExchange(
  req: Request,
  auth: AuthInfo,
): Promise<Response> {
  let body: {
    code?: string;
    code_verifier?: string;
    state?: string;
    use_manual_redirect?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const { code, code_verifier, state } = body;
  if (!code || !code_verifier || !state) {
    return Response.json(
      { error: "missing_params", required: ["code", "code_verifier", "state"] },
      { status: 400 },
    );
  }
  try {
    const tok = await exchangeAuthorizationCode({
      code,
      codeVerifier: code_verifier,
      state,
      useManualRedirect: body.use_manual_redirect ?? true,
    });
    await storeAnthropicTokens(auth.userId, tok);
    return Response.json({
      ok: true,
      subscription_type:
        tok.organization?.organization_type?.replace("claude_", "") ?? null,
      account_email: tok.account?.email_address ?? null,
      scopes: tok.scope?.split(" ").filter(Boolean) ?? [],
    });
  } catch (err) {
    return Response.json(
      { error: "exchange_failed", message: String(err) },
      { status: 400 },
    );
  }
}

export async function handleOAuthStatus(auth: AuthInfo): Promise<Response> {
  const db = serviceRole();
  const { data } = await db
    .from("user_oauth_tokens")
    .select("subscription_type, account_email, scopes, expires_at")
    .eq("user_id", auth.userId)
    .eq("provider", "anthropic")
    .maybeSingle();
  if (!data) return Response.json({ connected: false });
  return Response.json({
    connected: true,
    subscription_type: data.subscription_type,
    account_email: data.account_email,
    scopes: data.scopes,
    expires_at: data.expires_at,
  });
}

export async function handleOAuthRevoke(auth: AuthInfo): Promise<Response> {
  await revokeAnthropicTokens(auth.userId);
  return Response.json({ ok: true });
}
