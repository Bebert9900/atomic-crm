/**
 * Edge function: sync_saas_plan
 *
 * Receives a webhook from the SaaS database (via pg_net) whenever a plan
 * is created, updated, or deleted. Verifies the HMAC-SHA256 signature,
 * resolves the contact by matching the SaaS user email, and upserts the
 * plan data into the CRM's `contact_plans` table.
 */
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";

const SAAS_SYNC_SECRET = Deno.env.get("SAAS_SYNC_SECRET") ?? "";

async function verifySignature(
  body: string,
  signature: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SAAS_SYNC_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return expected === signature;
}

type PlanPayload = {
  event: "INSERT" | "UPDATE" | "DELETE";
  plan_id: string;
  user_id: string;
  user_email: string;
  name: string;
  description: string | null;
  plan_type: string;
  status: string;
  completion_score: number | null;
  thumbnail_url: string | null;
  format: string;
  orientation: string;
  created_at: string;
  updated_at: string;
};

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  const body = await req.text();
  const signature = req.headers.get("x-signature") ?? "";

  if (!SAAS_SYNC_SECRET || !(await verifySignature(body, signature))) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const payload: PlanPayload = JSON.parse(body);

  // Handle DELETE
  if (payload.event === "DELETE") {
    const { error } = await supabaseAdmin
      .from("contact_plans")
      .delete()
      .eq("saas_plan_id", payload.plan_id);

    if (error) {
      console.error("Delete error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, action: "deleted" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Resolve contact by email
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .contains("email_jsonb", JSON.stringify([{ email: payload.user_email }]));

  const contactId = contacts?.[0]?.id ?? null;

  if (!contactId) {
    console.warn(
      `No CRM contact found for email ${payload.user_email} — skipping plan sync`,
    );
    return new Response(
      JSON.stringify({
        success: false,
        reason: "no_contact",
        email: payload.user_email,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Build the preview URL (the SaaS app URL for the plan)
  const previewUrl = `https://app.fabrik.so/plans/${payload.plan_id}`;

  // Upsert the plan
  const { data, error } = await supabaseAdmin
    .from("contact_plans")
    .upsert(
      {
        saas_plan_id: payload.plan_id,
        contact_id: contactId,
        name: payload.name,
        description: payload.description,
        plan_type: payload.plan_type,
        status: payload.status,
        completion_score: payload.completion_score,
        thumbnail_url: payload.thumbnail_url,
        preview_url: previewUrl,
        format: payload.format,
        orientation: payload.orientation,
        created_at: payload.created_at,
        updated_at: payload.updated_at,
      },
      { onConflict: "saas_plan_id" },
    )
    .select("id")
    .single();

  if (error) {
    console.error("Upsert error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      action: payload.event === "INSERT" ? "created" : "updated",
      contact_plan_id: data?.id,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

Deno.serve((req) => OptionsMiddleware(req, handler));
