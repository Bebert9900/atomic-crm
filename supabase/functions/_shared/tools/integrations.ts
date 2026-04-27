import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";

/**
 * PostHog activity for a contact (read-only). Wraps posthog_contact_activity
 * edge function which holds the API key in crm_integrations.
 */
export const get_posthog_activity: ToolDefinition = {
  name: "get_posthog_activity",
  description:
    "Fetch recent PostHog product activity for a contact (events + person profile). Returns {configured, person, events[]}. If PostHog is not configured, returns configured:false and empty events. Use this to assess product engagement before deciding on a follow-up.",
  input_schema: z.object({
    contact_id: z.number().optional(),
    email: z.string().email().optional(),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  output_schema: z.object({
    configured: z.boolean(),
    person: z.unknown().nullable(),
    events: z.array(z.unknown()),
  }),
  kind: "read",
  reversible: true,
  cost_estimate: "medium",
  handler: async (args, ctx) => {
    let email = args.email;
    if (!email && args.contact_id) {
      const { data } = await ctx.supabase
        .from("contacts")
        .select("email_jsonb")
        .eq("id", args.contact_id)
        .single();
      // deno-lint-ignore no-explicit-any
      const list = (data as any)?.email_jsonb as Array<{
        email?: string;
      }> | null;
      email = list?.find((e) => e?.email)?.email;
    }
    if (!email) {
      return { configured: false, person: null, events: [] };
    }
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/posthog_contact_activity`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.auth.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, limit: args.limit }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`posthog_contact_activity ${res.status}: ${body}`);
    }
    const json = (await res.json()) as {
      configured?: boolean;
      person?: unknown;
      events?: unknown[];
    };
    return {
      configured: Boolean(json.configured ?? true),
      person: json.person ?? null,
      events: json.events ?? [],
    };
  },
};

export const push_to_billionmail: ToolDefinition = {
  name: "push_to_billionmail",
  description:
    "Push a contact to the configured BillionMail mailing list (email marketing). Use to enroll a qualified contact in nurturing campaigns. Reversible only manually in BillionMail.",
  input_schema: z.object({
    contact_id: z.number(),
  }),
  output_schema: z.object({
    pushed: z.boolean(),
    response: z.unknown().optional(),
  }),
  kind: "write",
  reversible: false,
  cost_estimate: "medium",
  handler: async ({ contact_id }, ctx) => {
    if (ctx.dryRun) return { pushed: false };
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/billionmail_push_contact`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.auth.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ contact_id }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`billionmail_push_contact ${res.status}: ${body}`);
    }
    const response = await res.json().catch(() => ({}));
    return { pushed: true, response };
  },
};
