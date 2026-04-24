import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

/**
 * Syncs users from an external SaaS Supabase project into Atomic CRM contacts.
 *
 * Expected payload: Supabase Database Webhook format
 *   { type: "INSERT"|"UPDATE"|"DELETE", table: string, schema: string,
 *     record: { ...row }, old_record: { ...row } | null }
 *
 * Authentication: HMAC-SHA256 of the raw request body using the shared secret
 * stored in env var SAAS_SYNC_SECRET, passed in header `x-webhook-signature`
 * as a hex string.
 *
 * Behavior:
 *  - Only processes auth.users rows where email_confirmed_at is set AND
 *    (on UPDATE) was previously null → "post email verification" trigger.
 *  - Looks up the contact by email. If found, updates it. If not, inserts.
 *  - Resolves/creates a company by name from raw_user_meta_data.company_name.
 *  - Assigns to the first administrator sales as owner (fallback: any sales).
 *  - Tags the contact with "saas-signup" for traceability.
 */

const SECRET = Deno.env.get("SAAS_SYNC_SECRET") ?? "";
const DEFAULT_TAG_NAME = "saas-signup";
const DEFAULT_TAG_COLOR = "#eddcd2";

async function verifyHmac(
  rawBody: string,
  signatureHex: string,
): Promise<boolean> {
  if (!SECRET || !signatureHex) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (expected.length !== signatureHex.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signatureHex.charCodeAt(i);
  }
  return diff === 0;
}

function splitFullName(fullName: string | null | undefined): {
  first: string;
  last: string;
} {
  if (!fullName) return { first: "", last: "" };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

async function findContactIdByEmail(email: string): Promise<number | null> {
  const needle = JSON.stringify([{ email }]);
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .filter("email_jsonb", "cs", needle)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("findContactIdByEmail error", error);
    return null;
  }
  return data?.id ?? null;
}

async function resolveCompanyId(
  companyName: string | null | undefined,
  salesId: number | null,
): Promise<number | null> {
  if (!companyName) return null;
  const trimmed = companyName.trim();
  if (!trimmed) return null;

  const { data: existing } = await supabaseAdmin
    .from("companies")
    .select("id")
    .ilike("name", trimmed)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created, error } = await supabaseAdmin
    .from("companies")
    .insert({ name: trimmed, sales_id: salesId })
    .select("id")
    .single();
  if (error) {
    console.error("company insert error", error);
    return null;
  }
  return created.id;
}

async function resolveTagId(
  name: string,
  color: string,
): Promise<number | null> {
  const { data: existing } = await supabaseAdmin
    .from("tags")
    .select("id")
    .eq("name", name)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created, error } = await supabaseAdmin
    .from("tags")
    .insert({ name, color })
    .select("id")
    .single();
  if (error) {
    console.error("tag insert error", error);
    return null;
  }
  return created.id;
}

async function resolveDefaultSalesId(): Promise<number | null> {
  const { data: admin } = await supabaseAdmin
    .from("sales")
    .select("id")
    .eq("administrator", true)
    .eq("disabled", false)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (admin?.id) return admin.id;

  const { data: any } = await supabaseAdmin
    .from("sales")
    .select("id")
    .eq("disabled", false)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  return any?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-signature") ?? "";

  if (!(await verifyHmac(rawBody, signature))) {
    console.warn("invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: {
    type: "INSERT" | "UPDATE" | "DELETE";
    table: string;
    schema: string;
    record: Record<string, unknown> | null;
    old_record: Record<string, unknown> | null;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (payload.type === "DELETE" || !payload.record) {
    return new Response(
      JSON.stringify({ ok: true, skipped: "delete_or_no_record" }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }

  const record = payload.record as Record<string, any>;
  const oldRecord = payload.old_record as Record<string, any> | null;

  const email: string | null = record.email ?? null;
  if (!email) {
    return new Response(JSON.stringify({ ok: true, skipped: "no_email" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  if (payload.table === "users" && payload.schema === "auth") {
    if (!record.email_confirmed_at) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "not_confirmed" }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }
    if (payload.type === "UPDATE" && oldRecord?.email_confirmed_at) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "already_confirmed" }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }
  }

  const meta = (record.raw_user_meta_data ??
    record.user_metadata ??
    {}) as Record<string, any>;
  let firstName: string = meta.first_name ?? "";
  let lastName: string = meta.last_name ?? "";
  if (!firstName && !lastName && (record.full_name ?? meta.full_name)) {
    const split = splitFullName(record.full_name ?? meta.full_name);
    firstName = split.first;
    lastName = split.last;
  }
  const companyName: string | null =
    record.company ?? meta.company_name ?? meta.company ?? null;
  const phoneNumber: string | null =
    record.phone ?? meta.phone_number ?? meta.phone ?? null;
  const role: string | null = record.role ?? meta.role ?? null;
  const avatarUrl: string | null = record.avatar_url ?? meta.avatar_url ?? null;
  const acquisition: string | null = meta.acquisition_source ?? null;

  const emailJsonb = [{ email, type: "Work" }];
  const phoneJsonb = phoneNumber
    ? [{ number: phoneNumber, type: "Work" }]
    : null;
  const avatar = avatarUrl ? { src: avatarUrl, title: "Avatar" } : null;
  const background = [
    acquisition ? `Acquisition: ${acquisition}` : null,
    "Imported from SaaS signup",
  ]
    .filter(Boolean)
    .join("\n");

  const salesId = await resolveDefaultSalesId();
  const companyId = await resolveCompanyId(companyName, salesId);
  const tagId = await resolveTagId(DEFAULT_TAG_NAME, DEFAULT_TAG_COLOR);

  const existingId = await findContactIdByEmail(email);

  if (existingId) {
    const { data: existing } = await supabaseAdmin
      .from("contacts")
      .select("tags")
      .eq("id", existingId)
      .single();
    const mergedTags = Array.from(
      new Set<number>([...(existing?.tags ?? []), ...(tagId ? [tagId] : [])]),
    );
    const update: Record<string, unknown> = {
      first_name: firstName || undefined,
      last_name: lastName || undefined,
      title: role || undefined,
      email_jsonb: emailJsonb,
      phone_jsonb: phoneJsonb ?? undefined,
      avatar: avatar ?? undefined,
      company_id: companyId ?? undefined,
      tags: mergedTags,
      last_seen: new Date().toISOString(),
    };
    for (const k of Object.keys(update))
      if (update[k] === undefined) delete update[k];

    const { error } = await supabaseAdmin
      .from("contacts")
      .update(update)
      .eq("id", existingId);
    if (error) {
      console.error("update contact error", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
      });
    }
    return new Response(
      JSON.stringify({
        ok: true,
        action: "updated",
        contact_id: existingId,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }

  const nowIso = new Date().toISOString();
  const insertRow: Record<string, unknown> = {
    first_name: firstName || "Pending",
    last_name: lastName || "Pending",
    title: role,
    email_jsonb: emailJsonb,
    phone_jsonb: phoneJsonb,
    avatar,
    background,
    company_id: companyId,
    sales_id: salesId,
    tags: tagId ? [tagId] : [],
    status: "cold",
    first_seen: nowIso,
    last_seen: nowIso,
  };

  const { data: inserted, error } = await supabaseAdmin
    .from("contacts")
    .insert(insertRow)
    .select("id")
    .single();
  if (error) {
    console.error("insert contact error", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
    });
  }

  return new Response(
    JSON.stringify({ ok: true, action: "created", contact_id: inserted.id }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
});
