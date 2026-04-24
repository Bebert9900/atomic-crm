import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";

/**
 * Fetches the PostHog activity for a given email, using the CRM-wide
 * integration credentials stored in `crm_integrations` (row id = 'posthog').
 *
 * Called from ContactShow. Any authenticated CRM user can query the PostHog
 * activity of any contact — same "team sees everything" model as the rest
 * of the CRM. The PostHog API key never leaves the edge function.
 */

type Payload = { email: string; limit?: number };

async function getPostHogConfig() {
  const { data, error } = await supabaseAdmin
    .from("crm_integrations")
    .select("*")
    .eq("id", "posthog")
    .single();
  if (error || !data || !data.enabled) return null;
  const { host, project_id, personal_api_key } = (data.config ?? {}) as Record<
    string,
    string
  >;
  if (!host || !project_id || !personal_api_key) return null;
  return {
    host: host.replace(/\/$/, ""),
    project_id,
    api_key: personal_api_key,
  };
}

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST")
    return createErrorResponse(405, "Method not allowed");

  const body = (await req.json()) as Payload;
  if (!body.email) return createErrorResponse(400, "email is required");
  const email = body.email.trim().toLowerCase();
  const limit = Math.min(body.limit ?? 20, 100);

  const cfg = await getPostHogConfig();
  if (!cfg) {
    return new Response(
      JSON.stringify({ configured: false, events: [], person: null }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }

  const authHeader = { Authorization: `Bearer ${cfg.api_key}` };

  // 1) Find the PostHog person by email (distinct_id or email property)
  const personUrl = `${cfg.host}/api/projects/${cfg.project_id}/persons/?search=${encodeURIComponent(email)}`;
  const personRes = await fetch(personUrl, { headers: authHeader });
  if (!personRes.ok) {
    return createErrorResponse(
      502,
      `PostHog persons API returned ${personRes.status}`,
    );
  }
  const personJson = await personRes.json();
  const person = (personJson.results ?? []).find((p: any) => {
    const props = p.properties ?? {};
    return (
      (typeof props.email === "string" &&
        props.email.toLowerCase() === email) ||
      (Array.isArray(p.distinct_ids) &&
        p.distinct_ids.some(
          (d: string) => typeof d === "string" && d.toLowerCase() === email,
        ))
    );
  });

  if (!person) {
    return new Response(
      JSON.stringify({ configured: true, events: [], person: null }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }

  // 2) Fetch events for that person
  const distinctId = person.distinct_ids?.[0] ?? email;
  const eventsUrl = `${cfg.host}/api/projects/${cfg.project_id}/events/?distinct_id=${encodeURIComponent(
    distinctId,
  )}&limit=${limit}`;
  const eventsRes = await fetch(eventsUrl, { headers: authHeader });
  if (!eventsRes.ok) {
    return createErrorResponse(
      502,
      `PostHog events API returned ${eventsRes.status}`,
    );
  }
  const eventsJson = await eventsRes.json();

  const events = (eventsJson.results ?? []).map((e: any) => ({
    id: e.id,
    event: e.event,
    timestamp: e.timestamp,
    url: e.properties?.$current_url ?? null,
    session_id: e.properties?.$session_id ?? null,
    properties: {
      browser: e.properties?.$browser ?? null,
      os: e.properties?.$os ?? null,
      device_type: e.properties?.$device_type ?? null,
    },
  }));

  return new Response(
    JSON.stringify({
      configured: true,
      person: {
        id: person.id,
        name: person.name ?? null,
        distinct_id: distinctId,
        posthog_url: `${cfg.host}/project/${cfg.project_id}/person/${encodeURIComponent(
          distinctId,
        )}`,
      },
      events,
    }),
    {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    },
  );
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req) => handler(req)),
    ),
  ),
);
