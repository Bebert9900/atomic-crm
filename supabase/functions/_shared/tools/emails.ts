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

export const list_email_accounts: ToolDefinition = {
  name: "list_email_accounts",
  description:
    "List the email accounts the current user (sales) can send from. Use the returned id as email_account_id when calling send_email.",
  input_schema: z.object({}),
  output_schema: z.array(
    z.object({
      id: z.number(),
      email: z.string(),
      sales_id: z.number().nullable(),
      is_active: z.boolean(),
      smtp_host: z.string().nullable(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async (_args, ctx) => {
    const { data, error } = await ctx.supabase
      .from("email_accounts")
      .select("id,email,sales_id,is_active,smtp_host")
      .eq("is_active", true);
    if (error) throw error;
    return data ?? [];
  },
};

/**
 * draft_email_reply produces a structured draft (no send). Useful when the
 * agent should produce a reply for human review (default safe path) or to
 * stage content before a separate send_email call.
 */
export const draft_email_reply: ToolDefinition = {
  name: "draft_email_reply",
  description:
    "Produce a draft reply to an email (no send). Returns subject + text_body. The caller LLM is expected to fill these in via tool_use; this tool only echoes/persists the draft so the trace records what was prepared.",
  input_schema: z.object({
    in_reply_to_email_id: z.number(),
    subject: z.string().min(1).max(300),
    text_body: z.string().min(1).max(20_000),
    contact_id: z.number().optional(),
  }),
  output_schema: z.object({
    in_reply_to_email_id: z.number(),
    subject: z.string(),
    text_body: z.string(),
    contact_id: z.number().nullable(),
  }),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, _ctx) => {
    return {
      in_reply_to_email_id: args.in_reply_to_email_id,
      subject: args.subject,
      text_body: args.text_body,
      contact_id: args.contact_id ?? null,
    };
  },
};

/**
 * send_email actually delivers via SMTP through the existing send_email_raw
 * edge function. The user JWT is used so the edge function authorizes the
 * caller against the email_account.sales_id.
 */
export const send_email: ToolDefinition = {
  name: "send_email",
  description:
    "Send an outbound email via the user's configured SMTP account (calls send_email_raw). Use list_email_accounts first to pick an email_account_id you own. Provide either a reply context (in_reply_to + references) or a fresh subject. Body must be plain text (text_body). Attachments are not supported by the agent in v1.",
  input_schema: z.object({
    email_account_id: z.number(),
    to: z.array(z.string().email()).min(1),
    cc: z.array(z.string().email()).optional(),
    bcc: z.array(z.string().email()).optional(),
    subject: z.string().min(1).max(300),
    text_body: z.string().min(1).max(20_000),
    in_reply_to: z.string().optional(),
    references: z.string().optional(),
  }),
  output_schema: z.object({
    sent: z.boolean(),
    message_id: z.string().nullable(),
  }),
  kind: "write",
  reversible: false,
  cost_estimate: "medium",
  handler: async (args, ctx) => {
    if (ctx.dryRun) return { sent: false, message_id: null };
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send_email_raw`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.auth.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`send_email_raw ${res.status}: ${body}`);
    }
    const json = (await res.json()) as { message_id?: string };
    return { sent: true, message_id: json.message_id ?? null };
  },
};
