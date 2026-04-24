import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { getUserSale } from "../_shared/getUserSale.ts";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

async function handler(_req: Request, user: any): Promise<Response> {
  const currentSale = await getUserSale(user);
  if (!currentSale) return createErrorResponse(401, "No sale record for user");

  const { data: cfg, error: cfgErr } = await supabaseAdmin
    .from("crm_integrations")
    .select("*")
    .eq("id", "google_calendar")
    .single();
  if (cfgErr || !cfg || !cfg.enabled) {
    return createErrorResponse(
      400,
      "Google Calendar integration is not configured or not enabled",
    );
  }
  const { client_id, redirect_uri } = (cfg.config ?? {}) as Record<
    string,
    string
  >;
  if (!client_id || !redirect_uri) {
    return createErrorResponse(
      400,
      "Missing client_id or redirect_uri in Google Calendar integration config",
    );
  }

  const stateBytes = new Uint8Array(24);
  crypto.getRandomValues(stateBytes);
  const state = Array.from(stateBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const { error: stateErr } = await supabaseAdmin.from("oauth_states").insert({
    state,
    sales_id: currentSale.id,
    provider: "google_calendar",
  });
  if (stateErr) {
    return createErrorResponse(
      500,
      `Failed to persist OAuth state: ${stateErr.message}`,
    );
  }

  const params = new URLSearchParams({
    client_id,
    redirect_uri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  return new Response(JSON.stringify({ auth_url: authUrl }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => handler(req, user)),
    ),
  ),
);
