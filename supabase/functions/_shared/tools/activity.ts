import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";

export const get_recent_activity: ToolDefinition = {
  name: "get_recent_activity",
  description:
    "Get recent activity (deals updated, contacts created, notes created) within a time window.",
  input_schema: z.object({
    since: z.string().datetime().optional(),
    until: z.string().datetime().optional(),
    limit: z.number().int().min(1).max(100).default(50),
  }),
  output_schema: z.object({
    recent_deals: z.array(z.record(z.unknown())),
    recent_contacts: z.array(z.record(z.unknown())),
    recent_notes: z.array(z.record(z.unknown())),
  }),
  kind: "read",
  reversible: true,
  cost_estimate: "medium",
  handler: async (args, ctx) => {
    const since =
      args.since ?? new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const [deals, contacts, notes] = await Promise.all([
      ctx.supabase
        .from("deals")
        .select("id,name,stage,amount,updated_at,company_id")
        .gte("updated_at", since)
        .limit(args.limit)
        .order("updated_at", { ascending: false }),
      ctx.supabase
        .from("contacts")
        .select("id,first_name,last_name,first_seen,company_id,lead_source")
        .gte("first_seen", since)
        .limit(args.limit)
        .order("first_seen", { ascending: false }),
      ctx.supabase
        .from("contact_notes")
        .select("id,contact_id,date,status")
        .gte("date", since)
        .limit(args.limit)
        .order("date", { ascending: false }),
    ]);
    return {
      recent_deals: deals.data ?? [],
      recent_contacts: contacts.data ?? [],
      recent_notes: notes.data ?? [],
    };
  },
};
