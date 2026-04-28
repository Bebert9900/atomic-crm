import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";

export const search_contacts: ToolDefinition = {
  name: "search_contacts",
  description:
    "Search contacts by free-text (matches name, email, company) plus optional company_id, tag_ids, updated_since. Returns id, names, email, company name, last_seen. Use this before referencing a contact by id.",
  input_schema: z.object({
    query: z.string().optional(),
    company_id: z.number().optional(),
    tag_ids: z.array(z.number()).optional(),
    updated_since: z.string().datetime().optional(),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      first_name: z.string().nullable(),
      last_name: z.string().nullable(),
      email: z.string().nullable(),
      company_name: z.string().nullable(),
      last_seen: z.string().nullable(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, ctx) => {
    let q = ctx.supabase
      .from("contacts_summary")
      .select("id, first_name, last_name, email_fts, company_name, last_seen")
      .limit(args.limit);
    if (args.query) {
      const p = `%${args.query}%`;
      q = q.or(
        `first_name.ilike.${p},last_name.ilike.${p},email_fts.ilike.${p},company_name.ilike.${p}`,
      );
    }
    if (args.company_id) q = q.eq("company_id", args.company_id);
    if (args.updated_since) q = q.gte("last_seen", args.updated_since);
    const { data, error } = await q;
    if (error) throw error;
    // deno-lint-ignore no-explicit-any
    return (data ?? []).map((r: any) => ({
      id: r.id,
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email_fts,
      company_name: r.company_name,
      last_seen: r.last_seen,
    }));
  },
};

export const get_contact: ToolDefinition = {
  name: "get_contact",
  description:
    "Get a contact with emails, phones, tags, company link, background.",
  input_schema: z.object({ id: z.number() }),
  output_schema: z.object({
    id: z.number(),
    first_name: z.string().nullable(),
    last_name: z.string().nullable(),
    title: z.string().nullable(),
    company_id: z.number().nullable(),
    email_jsonb: z.array(z.unknown()).nullable(),
    phone_jsonb: z.array(z.unknown()).nullable(),
    tags: z.array(z.number()).nullable(),
    background: z.string().nullable(),
    status: z.string().nullable(),
    lead_source: z.string(),
  }),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ id }, ctx) => {
    const { data, error } = await ctx.supabase
      .from("contacts")
      .select(
        "id,first_name,last_name,title,company_id,email_jsonb,phone_jsonb,tags,background,status,lead_source",
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },
};

export const create_contact: ToolDefinition = {
  name: "create_contact",
  description:
    "Create a contact. Provide first_name and/or last_name and/or an email. Do NOT set sales_id (auto-filled). Returns the new id.",
  input_schema: z.object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    title: z.string().optional(),
    company_id: z.number().optional(),
    email_jsonb: z
      .array(
        z.object({
          email: z.string().email(),
          type: z.enum(["Work", "Home", "Other"]),
        }),
      )
      .optional(),
    phone_jsonb: z
      .array(
        z.object({
          number: z.string(),
          type: z.enum(["Work", "Home", "Other"]),
        }),
      )
      .optional(),
    tags: z.array(z.number()).optional(),
    background: z.string().optional(),
    lead_source: z
      .enum([
        "outbound",
        "referral",
        "partner",
        "manual",
        "email_campaign",
        "seo",
        "other",
        "unknown",
      ])
      .default("manual"),
  }),
  output_schema: z.object({ id: z.number() }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, ctx) => {
    if (ctx.dryRun) return { id: -1 };
    const { data, error } = await ctx.supabase
      .from("contacts")
      .insert(args)
      .select("id")
      .single();
    if (error) throw error;
    return { id: (data as { id: number }).id };
  },
  undo: async ({ output }, ctx) => {
    if (output.id < 0) return;
    await ctx.supabase.from("contacts").delete().eq("id", output.id);
  },
};

export const update_contact: ToolDefinition = {
  name: "update_contact",
  description:
    "Update non-destructive fields of a contact. Only provided keys are changed.",
  input_schema: z.object({
    id: z.number(),
    patch: z.object({
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      title: z.string().optional(),
      company_id: z.number().optional(),
      tags: z.array(z.number()).optional(),
      background: z.string().optional(),
      status: z.string().optional(),
    }),
  }),
  output_schema: z.object({
    id: z.number(),
    before: z.record(z.unknown()),
  }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ id, patch }, ctx) => {
    const cols = Object.keys(patch);
    let before: Record<string, unknown> = {};
    if (cols.length > 0) {
      const { data } = await ctx.supabase
        .from("contacts")
        .select(cols.join(","))
        .eq("id", id)
        .single();
      before = (data ?? {}) as Record<string, unknown>;
    }
    if (ctx.dryRun) return { id, before };
    const { error } = await ctx.supabase
      .from("contacts")
      .update(patch)
      .eq("id", id);
    if (error) throw error;
    return { id, before };
  },
  undo: async ({ output }, ctx) => {
    // deno-lint-ignore no-explicit-any
    await ctx.supabase
      .from("contacts")
      .update(output.before as any)
      .eq("id", output.id);
  },
};

export const list_contact_tasks: ToolDefinition = {
  name: "list_contact_tasks",
  description: "List tasks on a contact. Optional filter by done/pending.",
  input_schema: z.object({
    contact_id: z.number(),
    done: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      type: z.string().nullable(),
      text: z.string().nullable(),
      due_date: z.string().nullable(),
      done_date: z.string().nullable(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, ctx) => {
    let q = ctx.supabase
      .from("tasks")
      .select("id,type,text,due_date,done_date")
      .eq("contact_id", args.contact_id)
      .limit(args.limit);
    if (args.done === true) q = q.not("done_date", "is", null);
    if (args.done === false) q = q.is("done_date", null);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
};

export const list_contact_notes: ToolDefinition = {
  name: "list_contact_notes",
  description: "List notes on a contact, newest first.",
  input_schema: z.object({
    contact_id: z.number(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      text: z.string().nullable(),
      date: z.string(),
      status: z.string().nullable(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ contact_id, limit }, ctx) => {
    const { data, error } = await ctx.supabase
      .from("contact_notes")
      .select("id,text,date,status")
      .eq("contact_id", contact_id)
      .order("date", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },
};

export const list_contact_emails: ToolDefinition = {
  name: "list_contact_emails",
  description:
    "List email messages linked to a contact, newest first. Bodies are truncated to 500 chars.",
  input_schema: z.object({
    contact_id: z.number(),
    unread_only: z.boolean().default(false),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      subject: z.string().nullable(),
      from_email: z.string(),
      date: z.string(),
      is_read: z.boolean(),
      text_body_excerpt: z.string().nullable(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, ctx) => {
    let q = ctx.supabase
      .from("email_messages")
      .select("id,subject,from_email,date,is_read,text_body")
      .eq("contact_id", args.contact_id)
      .order("date", { ascending: false })
      .limit(args.limit);
    if (args.unread_only) q = q.eq("is_read", false);
    const { data, error } = await q;
    if (error) throw error;
    // deno-lint-ignore no-explicit-any
    return (data ?? []).map((r: any) => ({
      id: r.id,
      subject: r.subject,
      from_email: r.from_email,
      date: r.date,
      is_read: r.is_read,
      text_body_excerpt: r.text_body ? r.text_body.slice(0, 500) : null,
    }));
  },
};

export const list_contact_recordings: ToolDefinition = {
  name: "list_contact_recordings",
  description:
    "List audio recordings on a contact with transcription/summary status.",
  input_schema: z.object({ contact_id: z.number() }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      duration_seconds: z.number().nullable(),
      transcription_status: z.string(),
      has_summary: z.boolean(),
      created_at: z.string(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ contact_id }, ctx) => {
    const { data, error } = await ctx.supabase
      .from("contact_recordings")
      .select("id,duration_seconds,transcription_status,summary,created_at")
      .eq("contact_id", contact_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    // deno-lint-ignore no-explicit-any
    return (data ?? []).map((r: any) => ({
      id: r.id,
      duration_seconds: r.duration_seconds,
      transcription_status: r.transcription_status,
      has_summary: Boolean(r.summary),
      created_at: r.created_at,
    }));
  },
};

export const find_duplicate_contacts: ToolDefinition = {
  name: "find_duplicate_contacts",
  description:
    "Find candidate duplicates of a given contact via shared email or normalized name. Returns a similarity score 0..1 (heuristic). Use before merge_contacts.",
  input_schema: z.object({
    contact_id: z.number(),
    limit: z.number().int().min(1).max(20).default(5),
  }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      first_name: z.string().nullable(),
      last_name: z.string().nullable(),
      email: z.string().nullable(),
      company_name: z.string().nullable(),
      similarity: z.number(),
      reason: z.string(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "medium",
  handler: async ({ contact_id, limit }, ctx) => {
    const { data: source, error: sErr } = await ctx.supabase
      .from("contacts")
      .select("id,first_name,last_name,email_jsonb,company_id")
      .eq("id", contact_id)
      .single();
    if (sErr || !source) throw sErr ?? new Error("contact not found");
    // deno-lint-ignore no-explicit-any
    const src = source as any;
    const emails: string[] = (src.email_jsonb ?? [])
      // deno-lint-ignore no-explicit-any
      .map((e: any) => (e?.email ?? "").toLowerCase())
      .filter(Boolean);
    const fn = (src.first_name ?? "").trim().toLowerCase();
    const ln = (src.last_name ?? "").trim().toLowerCase();

    const candidates = new Map<
      number,
      {
        id: number;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        company_name: string | null;
        similarity: number;
        reason: string;
      }
    >();

    if (emails.length > 0) {
      const orExpr = emails.map((e) => `email_fts.ilike.%${e}%`).join(",");
      const { data } = await ctx.supabase
        .from("contacts_summary")
        .select("id,first_name,last_name,email_fts,company_name")
        .or(orExpr)
        .neq("id", contact_id)
        .limit(limit);
      // deno-lint-ignore no-explicit-any
      for (const r of (data ?? []) as any[]) {
        candidates.set(r.id, {
          id: r.id,
          first_name: r.first_name,
          last_name: r.last_name,
          email: r.email_fts,
          company_name: r.company_name,
          similarity: 0.95,
          reason: "shared email",
        });
      }
    }

    if (fn && ln) {
      const { data } = await ctx.supabase
        .from("contacts_summary")
        .select("id,first_name,last_name,email_fts,company_name")
        .ilike("first_name", `${fn}%`)
        .ilike("last_name", `${ln}%`)
        .neq("id", contact_id)
        .limit(limit);
      // deno-lint-ignore no-explicit-any
      for (const r of (data ?? []) as any[]) {
        if (!candidates.has(r.id)) {
          candidates.set(r.id, {
            id: r.id,
            first_name: r.first_name,
            last_name: r.last_name,
            email: r.email_fts,
            company_name: r.company_name,
            similarity: 0.7,
            reason: "name match",
          });
        }
      }
    }

    return Array.from(candidates.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  },
};

export const merge_contacts: ToolDefinition = {
  name: "merge_contacts",
  description:
    "Merge two contacts using the existing merge_contacts edge function. winner_id keeps its primary fields; loser_id is deleted after data is folded in. NOT reversible from the agent — do not call without high confidence.",
  input_schema: z.object({
    winner_id: z.number(),
    loser_id: z.number(),
  }),
  output_schema: z.object({
    winner_id: z.number(),
    loser_id: z.number(),
    merged: z.boolean(),
  }),
  kind: "write",
  reversible: false,
  cost_estimate: "high",
  handler: async ({ winner_id, loser_id }, ctx) => {
    if (winner_id === loser_id) {
      throw new Error("winner_id and loser_id must differ");
    }
    if (ctx.dryRun) {
      return { winner_id, loser_id, merged: false };
    }
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/merge_contacts`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.auth.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ winner_id, loser_id }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`merge_contacts ${res.status}: ${body}`);
    }
    return { winner_id, loser_id, merged: true };
  },
};
