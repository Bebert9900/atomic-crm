/**
 * Edge function: sync_saas_user
 *
 * Receives a webhook from the Fabrik SaaS whenever a user is created, updated,
 * or deleted. Verifies the HMAC-SHA256 signature, ensures the "Fabrik" tag
 * exists, then upserts a contact in the CRM with that tag attached so users
 * automatically appear in a filterable list.
 *
 * Matching rule: email (case-insensitive) is the stable identifier.
 * - INSERT/UPDATE: upsert contact, add Fabrik tag if missing
 * - DELETE: we do NOT delete the CRM contact (avoid data loss). Instead we
 *   just remove the Fabrik tag so they disappear from the list.
 */
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";

const SAAS_SYNC_SECRET = Deno.env.get("SAAS_SYNC_SECRET") ?? "";

const FABRIK_TAG_NAME = "Fabrik";
const FABRIK_TAG_COLOR = "#7c3aed"; // violet-600

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

type UserPayload = {
  event: "INSERT" | "UPDATE" | "DELETE";
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company_name: string | null;
  linkedin_url: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

/** Get or create the Fabrik tag, return its id. */
async function ensureFabrikTagId(): Promise<number | null> {
  // Try to find existing tag (case-insensitive match)
  const { data: existing } = await supabaseAdmin
    .from("tags")
    .select("id")
    .ilike("name", FABRIK_TAG_NAME)
    .limit(1);

  if (existing && existing.length > 0) {
    return existing[0].id;
  }

  // Create it
  const { data: created, error } = await supabaseAdmin
    .from("tags")
    .insert({ name: FABRIK_TAG_NAME, color: FABRIK_TAG_COLOR })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create Fabrik tag:", error);
    return null;
  }

  return created.id;
}

/** Find a company by name (case-insensitive), or create it if missing. */
async function resolveCompanyId(
  name: string | null,
): Promise<number | null> {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();

  const { data: existing } = await supabaseAdmin
    .from("companies")
    .select("id")
    .ilike("name", trimmed)
    .limit(1);

  if (existing && existing.length > 0) {
    return existing[0].id;
  }

  const { data: created, error } = await supabaseAdmin
    .from("companies")
    .insert({ name: trimmed, lead_source: "fabrik" })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create company:", error);
    return null;
  }

  return created.id;
}

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

  const payload: UserPayload = JSON.parse(body);
  const normalizedEmail = payload.email.trim().toLowerCase();

  // Find existing contact by email
  const { data: existingContacts } = await supabaseAdmin
    .from("contacts")
    .select("id, tags")
    .contains(
      "email_jsonb",
      JSON.stringify([{ email: normalizedEmail }]),
    );

  const existingContact = existingContacts?.[0] ?? null;

  // DELETE event: just remove the Fabrik tag (don't delete the contact)
  if (payload.event === "DELETE") {
    if (!existingContact) {
      return new Response(
        JSON.stringify({ success: true, action: "nothing_to_delete" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const fabrikTagId = await ensureFabrikTagId();
    const currentTags: number[] = existingContact.tags ?? [];
    const newTags = currentTags.filter((t) => t !== fabrikTagId);

    const { error } = await supabaseAdmin
      .from("contacts")
      .update({ tags: newTags })
      .eq("id", existingContact.id);

    if (error) {
      console.error("Remove tag error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, action: "tag_removed" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // INSERT/UPDATE: upsert the contact + attach Fabrik tag
  const fabrikTagId = await ensureFabrikTagId();
  if (!fabrikTagId) {
    return new Response(
      JSON.stringify({ error: "Could not ensure Fabrik tag" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const companyId = await resolveCompanyId(payload.company_name);

  const emailJsonb = [
    { email: normalizedEmail, type: "Work" as const },
  ];
  const phoneJsonb = payload.phone
    ? [{ number: payload.phone, type: "Work" as const }]
    : [];

  if (existingContact) {
    // Merge Fabrik tag into existing tags (dedup)
    const currentTags: number[] = existingContact.tags ?? [];
    const newTags = currentTags.includes(fabrikTagId)
      ? currentTags
      : [...currentTags, fabrikTagId];

    const updates: Record<string, unknown> = {
      tags: newTags,
      last_seen: payload.updated_at,
    };

    // Only fill name fields if they're empty on the CRM side
    if (payload.first_name) updates.first_name = payload.first_name;
    if (payload.last_name) updates.last_name = payload.last_name;
    if (payload.linkedin_url) updates.linkedin_url = payload.linkedin_url;
    if (companyId) updates.company_id = companyId;

    const { error } = await supabaseAdmin
      .from("contacts")
      .update(updates)
      .eq("id", existingContact.id);

    if (error) {
      console.error("Update contact error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        action: "updated",
        contact_id: existingContact.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Create new contact
  const { data: created, error } = await supabaseAdmin
    .from("contacts")
    .insert({
      first_name: payload.first_name,
      last_name: payload.last_name,
      email_jsonb: emailJsonb,
      phone_jsonb: phoneJsonb,
      linkedin_url: payload.linkedin_url,
      company_id: companyId,
      tags: [fabrikTagId],
      status: "cold",
      first_seen: payload.created_at,
      last_seen: payload.updated_at,
      lead_source: "fabrik",
    })
    .select("id")
    .single();

  if (error) {
    console.error("Insert contact error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      action: "created",
      contact_id: created?.id,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

Deno.serve((req) => OptionsMiddleware(req, handler));
