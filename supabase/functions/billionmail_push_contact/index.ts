import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";

/**
 * Pushes one contact into a BillionMail mailing list.
 *
 * Body:
 *   { contact_id: number }    → looks up the CRM contact and pushes it
 *   { email: string, name?: string }  → pushes an arbitrary recipient (for test)
 *
 * Reads BillionMail config from `crm_integrations` row id=`billionmail`.
 * The exact contacts endpoint path is version-dependent, so it's stored as
 * `contacts_endpoint` in the config (admin copies it from BillionMail Swagger).
 */

type Payload = { contact_id: number } | { email: string; name?: string };

function normalizeEmail(
  raw: Array<{ email?: string; type?: string }> | string | null | undefined,
): string | null {
  if (!raw) return null;
  if (typeof raw === "string") return raw.trim().toLowerCase() || null;
  const first = raw.find((e) => e && typeof e.email === "string" && e.email);
  return first?.email ? first.email.trim().toLowerCase() : null;
}

async function getBillionMailConfig() {
  const { data, error } = await supabaseAdmin
    .from("crm_integrations")
    .select("*")
    .eq("id", "billionmail")
    .single();
  if (error || !data) return null;
  const cfg = (data.config ?? {}) as Record<string, string>;
  const { base_url, admin_key, list_id, contacts_endpoint } = cfg;
  if (!base_url || !admin_key || !list_id || !contacts_endpoint) return null;
  return {
    enabled: !!data.enabled,
    base_url: base_url.replace(/\/$/, ""),
    admin_key,
    list_id,
    contacts_endpoint: contacts_endpoint.startsWith("/")
      ? contacts_endpoint
      : `/${contacts_endpoint}`,
  };
}

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST")
    return createErrorResponse(405, "Method not allowed");

  const body = (await req.json()) as Payload;

  const cfg = await getBillionMailConfig();
  if (!cfg)
    return createErrorResponse(
      400,
      "BillionMail integration is not fully configured",
    );
  if (!cfg.enabled)
    return createErrorResponse(400, "BillionMail integration is disabled");

  let email: string | null = null;
  let name: string | null = null;

  if ("contact_id" in body && body.contact_id) {
    const { data: contact, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select("id, first_name, last_name, email_jsonb")
      .eq("id", body.contact_id)
      .single();
    if (contactErr || !contact)
      return createErrorResponse(404, "Contact not found");
    email = normalizeEmail(contact.email_jsonb as any);
    name =
      [contact.first_name, contact.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || null;
  } else if ("email" in body && body.email) {
    email = body.email.trim().toLowerCase();
    name = body.name ?? null;
  } else {
    return createErrorResponse(400, "contact_id or email is required");
  }

  if (!email) return createErrorResponse(400, "No valid email to push");

  const url = `${cfg.base_url}${cfg.contacts_endpoint}`;
  const bmBody: Record<string, unknown> = {
    list_id: Number(cfg.list_id),
    email,
  };
  if (name) bmBody.name = name;

  let bmRes: Response;
  try {
    bmRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.admin_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bmBody),
    });
  } catch (e) {
    return createErrorResponse(
      502,
      `Network error calling BillionMail: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }

  const text = await bmRes.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* non-JSON response */
  }

  if (!bmRes.ok) {
    return new Response(
      JSON.stringify({
        ok: false,
        status: bmRes.status,
        endpoint: url,
        response: parsed ?? text,
      }),
      {
        status: 200, // return 200 so the frontend can render the error body cleanly
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      email,
      endpoint: url,
      billionmail_response: parsed ?? text,
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
