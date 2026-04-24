import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { getUserSale } from "../_shared/getUserSale.ts";

type Payload = { code: string; state: string };

async function handler(req: Request, user: any): Promise<Response> {
  if (req.method !== "POST")
    return createErrorResponse(405, "Method not allowed");

  const body = (await req.json()) as Payload;
  if (!body.code || !body.state)
    return createErrorResponse(400, "code and state are required");

  // 1) Look up state in DB and validate it matches the current user's sale.
  const { data: stateRow, error: stateErr } = await supabaseAdmin
    .from("oauth_states")
    .select("*")
    .eq("state", body.state)
    .eq("provider", "google_calendar")
    .single();
  if (stateErr || !stateRow) {
    return createErrorResponse(400, "Invalid or expired OAuth state");
  }
  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    await supabaseAdmin.from("oauth_states").delete().eq("state", body.state);
    return createErrorResponse(400, "OAuth state expired");
  }

  const currentSale = await getUserSale(user);
  if (!currentSale) return createErrorResponse(401, "No sale record for user");
  if (currentSale.id !== stateRow.sales_id) {
    return createErrorResponse(
      403,
      "OAuth state does not match authenticated user",
    );
  }

  // 2) Load app-level Google OAuth config
  const { data: cfg, error: cfgErr } = await supabaseAdmin
    .from("crm_integrations")
    .select("*")
    .eq("id", "google_calendar")
    .single();
  if (cfgErr || !cfg) {
    return createErrorResponse(500, "Google integration not configured");
  }
  const { client_id, client_secret, redirect_uri } = (cfg.config ??
    {}) as Record<string, string>;
  if (!client_id || !client_secret || !redirect_uri) {
    return createErrorResponse(
      500,
      "Missing client_id/client_secret/redirect_uri",
    );
  }

  // 3) Exchange authorization code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: body.code,
      client_id,
      client_secret,
      redirect_uri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error("Google token exchange failed:", text);
    return createErrorResponse(
      502,
      `Google token exchange failed: ${tokenRes.status}`,
    );
  }
  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
  };

  // 4) Fetch the user's Google email so we can display it in the UI
  let googleEmail: string | null = null;
  try {
    const userRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );
    if (userRes.ok) {
      const u = await userRes.json();
      googleEmail = u.email ?? null;
    }
  } catch (_) {
    /* ignore */
  }

  // 5) Persist tokens. If refresh_token is absent (user re-consenting, Google
  // sometimes skips it) we keep any existing one so the user doesn't need to
  // revoke and re-add.
  const expiresAt = new Date(
    Date.now() + tokens.expires_in * 1000,
  ).toISOString();

  const upsert: Record<string, unknown> = {
    sales_id: currentSale.id,
    google_email: googleEmail,
    access_token: tokens.access_token,
    access_token_expires_at: expiresAt,
    calendar_id: "primary",
    updated_at: new Date().toISOString(),
  };
  if (tokens.refresh_token) upsert.refresh_token = tokens.refresh_token;

  const { error: upsertErr } = await supabaseAdmin
    .from("google_calendar_accounts")
    .upsert(upsert, { onConflict: "sales_id" });
  if (upsertErr) {
    return createErrorResponse(
      500,
      `Failed to save tokens: ${upsertErr.message}`,
    );
  }

  // 6) Delete the used state
  await supabaseAdmin.from("oauth_states").delete().eq("state", body.state);

  return new Response(
    JSON.stringify({ success: true, google_email: googleEmail }),
    { headers: { "Content-Type": "application/json", ...corsHeaders } },
  );
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => handler(req, user)),
    ),
  ),
);
