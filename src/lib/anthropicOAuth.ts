import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";

const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTHORIZE_URL = "https://claude.com/cai/oauth/authorize";
const MANUAL_REDIRECT_URL =
  "https://platform.claude.com/oauth/code/callback";
const SCOPES = [
  "user:profile",
  "user:inference",
  "user:sessions:claude_code",
  "user:mcp_servers",
  "user:file_upload",
];

function base64UrlEncode(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(s: string): Promise<Uint8Array> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return new Uint8Array(digest);
}

export type PendingOAuth = {
  codeVerifier: string;
  state: string;
};

export async function buildAnthropicAuthUrl(): Promise<{
  url: string;
  pending: PendingOAuth;
}> {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const stateBytes = crypto.getRandomValues(new Uint8Array(16));
  const codeVerifier = base64UrlEncode(verifierBytes);
  const state = base64UrlEncode(stateBytes);
  const codeChallenge = base64UrlEncode(await sha256(codeVerifier));

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("code", "true");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", MANUAL_REDIRECT_URL);
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);

  return { url: url.toString(), pending: { codeVerifier, state } };
}

async function authHeader(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await getSupabaseClient().auth.getSession();
  if (!session) throw new Error("not_authenticated");
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function exchangeAnthropicCode(
  code: string,
  pending: PendingOAuth,
): Promise<{
  ok: boolean;
  subscription_type?: string;
  account_email?: string;
}> {
  const headers = await authHeader();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-runtime/oauth/anthropic/exchange`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        code_verifier: pending.codeVerifier,
        state: pending.state,
        use_manual_redirect: true,
      }),
    },
  );
  if (!res.ok) throw new Error(`exchange_failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export type OAuthStatus = {
  connected: boolean;
  subscription_type?: string | null;
  account_email?: string | null;
  scopes?: string[];
};

export async function getAnthropicStatus(): Promise<OAuthStatus> {
  const headers = await authHeader();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-runtime/oauth/anthropic/status`,
    { headers },
  );
  if (!res.ok) return { connected: false };
  return res.json();
}

export async function revokeAnthropic(): Promise<void> {
  const headers = await authHeader();
  await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-runtime/oauth/anthropic/revoke`,
    { method: "POST", headers },
  );
}
