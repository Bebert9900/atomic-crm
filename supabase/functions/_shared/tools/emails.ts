import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";

export const search_emails: ToolDefinition = {
  name: "search_emails",
  description:
    "Search email messages by contact, unread status, or free-text subject/from.",
  input_schema: z.object({
    contact_id: z.number().optional(),
    unread: z.boolean().optional(),
    query: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      subject: z.string().nullable(),
      from_email: z.string(),
      to_emails: z.unknown().nullable(),
      date: z.string(),
      is_read: z.boolean(),
      contact_id: z.number().nullable(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, ctx) => {
    let q = ctx.supabase
      .from("email_messages")
      .select("id,subject,from_email,to_emails,date,is_read,contact_id")
      .limit(args.limit)
      .order("date", { ascending: false });
    if (args.contact_id) q = q.eq("contact_id", args.contact_id);
    if (args.unread === true) q = q.eq("is_read", false);
    if (args.unread === false) q = q.eq("is_read", true);
    if (args.query) {
      const p = `%${args.query}%`;
      q = q.or(`subject.ilike.${p},from_email.ilike.${p}`);
    }
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
};

export const get_email: ToolDefinition = {
  name: "get_email",
  description: "Get an email message with a truncated body (first 2000 chars).",
  input_schema: z.object({ id: z.number() }),
  output_schema: z.object({
    id: z.number(),
    subject: z.string().nullable(),
    from_email: z.string(),
    from_name: z.string().nullable(),
    to_emails: z.unknown().nullable(),
    cc_emails: z.unknown().nullable(),
    date: z.string(),
    is_read: z.boolean(),
    contact_id: z.number().nullable(),
    text_body_excerpt: z.string().nullable(),
    text_body_truncated: z.boolean(),
  }),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ id }, ctx) => {
    const { data, error } = await ctx.supabase
      .from("email_messages")
      .select(
        "id,subject,from_email,from_name,to_emails,cc_emails,date,is_read,contact_id,text_body",
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    // deno-lint-ignore no-explicit-any
    const r = data as any;
    const body = r.text_body ?? null;
    const truncated = body && body.length > 2000;
    return {
      id: r.id,
      subject: r.subject,
      from_email: r.from_email,
      from_name: r.from_name,
      to_emails: r.to_emails,
      cc_emails: r.cc_emails,
      date: r.date,
      is_read: r.is_read,
      contact_id: r.contact_id,
      text_body_excerpt: body ? body.slice(0, 2000) : null,
      text_body_truncated: Boolean(truncated),
    };
  },
};

export const link_email_to_contact: ToolDefinition = {
  name: "link_email_to_contact",
  description: "Link an email message to a contact id (sets contact_id).",
  input_schema: z.object({
    email_id: z.number(),
    contact_id: z.number(),
  }),
  output_schema: z.object({
    email_id: z.number(),
    before_contact_id: z.number().nullable(),
  }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ email_id, contact_id }, ctx) => {
    const { data: cur } = await ctx.supabase
      .from("email_messages")
      .select("contact_id")
      .eq("id", email_id)
      .single();
    const before =
      (cur as { contact_id: number | null } | null)?.contact_id ?? null;
    if (ctx.dryRun) return { email_id, before_contact_id: before };
    const { error } = await ctx.supabase
      .from("email_messages")
      .update({ contact_id })
      .eq("id", email_id);
    if (error) throw error;
    return { email_id, before_contact_id: before };
  },
  undo: async ({ output }, ctx) => {
    await ctx.supabase
      .from("email_messages")
      .update({ contact_id: output.before_contact_id })
      .eq("id", output.email_id);
  },
};

export const mark_email_read: ToolDefinition = {
  name: "mark_email_read",
  description: "Mark an email message as read.",
  input_schema: z.object({ id: z.number() }),
  output_schema: z.object({
    id: z.number(),
    before_is_read: z.boolean(),
  }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ id }, ctx) => {
    const { data: cur } = await ctx.supabase
      .from("email_messages")
      .select("is_read")
      .eq("id", id)
      .single();
    const before = Boolean((cur as { is_read: boolean } | null)?.is_read);
    if (ctx.dryRun) return { id, before_is_read: before };
    const { error } = await ctx.supabase
      .from("email_messages")
      .update({ is_read: true })
      .eq("id", id);
    if (error) throw error;
    return { id, before_is_read: before };
  },
  undo: async ({ output }, ctx) => {
    await ctx.supabase
      .from("email_messages")
      .update({ is_read: output.before_is_read })
      .eq("id", output.id);
  },
};
