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

export const get_activity_log: ToolDefinition = {
  name: "get_activity_log",
  description:
    "Journal d'activité unifié du CRM (vue activity_log) — tous les événements (deals, contacts, notes, etc.) triés par date, optionnellement filtrés par sales ou par type d'événement. Préfère ce tool à get_recent_activity quand l'utilisateur demande \"qu'est-ce qui s'est passé\" ou \"l'activité récente\".",
  input_schema: z.object({
    since_days: z.number().int().min(1).max(60).default(7),
    sales_id: z.number().int().optional(),
    types: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(200).default(80),
  }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      type: z.string(),
      date: z.string(),
      sales_id: z.number().nullable(),
      company_id: z.number().nullable(),
      company: z.unknown().nullable(),
      contact: z.unknown().nullable(),
      deal: z.unknown().nullable(),
      contact_note: z.unknown().nullable(),
      deal_note: z.unknown().nullable(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ since_days, sales_id, types, limit }, ctx) => {
    const since = new Date(Date.now() - since_days * 86400_000).toISOString();
    let q = ctx.supabase
      .from("activity_log")
      .select("*")
      .gte("date", since)
      .order("date", { ascending: false })
      .limit(limit);
    if (sales_id !== undefined) q = q.eq("sales_id", sales_id);
    if (types && types.length) q = q.in("type", types);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
};
