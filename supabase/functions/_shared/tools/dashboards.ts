import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";

export const get_pipeline_kpis: ToolDefinition = {
  name: "get_pipeline_kpis",
  description:
    "Snapshot du pipeline commercial : count + somme des amounts par stage (deals non archivés). Utile pour 'où en est le pipeline ?' ou les briefs.",
  input_schema: z.object({
    sales_id: z.number().int().optional(),
  }),
  output_schema: z.object({
    by_stage: z.array(
      z.object({
        stage: z.string(),
        count: z.number(),
        total_amount: z.number(),
      }),
    ),
    total_open: z.number(),
    total_amount_open: z.number(),
  }),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ sales_id }, ctx) => {
    let q = ctx.supabase
      .from("deals")
      .select("stage,amount")
      .is("archived_at", null);
    if (sales_id) q = q.eq("sales_id", sales_id);
    const { data, error } = await q;
    if (error) throw error;
    const byStage = new Map<string, { count: number; total: number }>();
    let totalOpen = 0;
    let totalAmount = 0;
    for (const d of (data ?? []) as Array<{
      stage: string;
      amount: number | null;
    }>) {
      if (d.stage === "won" || d.stage === "lost") continue;
      const cur = byStage.get(d.stage) ?? { count: 0, total: 0 };
      cur.count++;
      cur.total += d.amount ?? 0;
      byStage.set(d.stage, cur);
      totalOpen++;
      totalAmount += d.amount ?? 0;
    }
    const by_stage = [...byStage.entries()].map(([stage, v]) => ({
      stage,
      count: v.count,
      total_amount: v.total,
    }));
    return {
      by_stage,
      total_open: totalOpen,
      total_amount_open: totalAmount,
    };
  },
};

export const get_my_kpis: ToolDefinition = {
  name: "get_my_kpis",
  description:
    "KPIs personnels du sales connecté (ou d'un sales fourni) : pipeline, deals won ce mois, tasks ouvertes, mails non lus, RDV à venir.",
  input_schema: z.object({
    sales_id: z.number().int().optional(),
  }),
  output_schema: z.object({
    sales_id: z.number().nullable(),
    deals_open: z.number(),
    pipeline_amount: z.number(),
    deals_won_this_month: z.number(),
    won_amount_this_month: z.number(),
    tasks_open: z.number(),
    tasks_overdue: z.number(),
    unread_emails: z.number(),
    upcoming_appointments_7d: z.number(),
  }),
  kind: "read",
  reversible: true,
  cost_estimate: "medium",
  handler: async ({ sales_id }, ctx) => {
    let resolvedSalesId: number | null = sales_id ?? null;
    if (!resolvedSalesId) {
      const { data } = await ctx.supabase
        .from("sales")
        .select("id")
        .eq("user_id", ctx.auth.userId)
        .maybeSingle();
      resolvedSalesId = (data as { id: number } | null)?.id ?? null;
    }

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const weekFromNow = new Date(Date.now() + 7 * 86400_000).toISOString();
    const now = new Date().toISOString();

    const dealsOpen = ctx.supabase
      .from("deals")
      .select("amount, stage", { count: "exact" })
      .is("archived_at", null)
      .not("stage", "in", '("won","lost")');
    if (resolvedSalesId) dealsOpen.eq("sales_id", resolvedSalesId);

    const dealsWon = ctx.supabase
      .from("deals")
      .select("amount", { count: "exact" })
      .eq("stage", "won")
      .gte("updated_at", monthStart.toISOString());
    if (resolvedSalesId) dealsWon.eq("sales_id", resolvedSalesId);

    const tasksOpen = ctx.supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .is("done_date", null);
    if (resolvedSalesId) tasksOpen.eq("sales_id", resolvedSalesId);

    const tasksOverdue = ctx.supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .is("done_date", null)
      .lt("due_date", now);
    if (resolvedSalesId) tasksOverdue.eq("sales_id", resolvedSalesId);

    const unread = ctx.supabase
      .from("unread_emails_summary")
      .select("id", { count: "exact", head: true });
    if (resolvedSalesId) unread.eq("sales_id", resolvedSalesId);

    const appts = ctx.supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .gte("start_at", now)
      .lt("start_at", weekFromNow);
    if (resolvedSalesId) appts.eq("sales_id", resolvedSalesId);

    const [dealsRes, wonRes, tasksRes, tasksOverdueRes, unreadRes, apptsRes] =
      await Promise.all([
        dealsOpen,
        dealsWon,
        tasksOpen,
        tasksOverdue,
        unread,
        appts,
      ]);

    type DealsRow = { amount: number | null; stage?: string };
    const openDeals = (dealsRes.data ?? []) as DealsRow[];
    const wonDeals = (wonRes.data ?? []) as DealsRow[];

    return {
      sales_id: resolvedSalesId,
      deals_open: openDeals.length,
      pipeline_amount: openDeals.reduce((s, d) => s + (d.amount ?? 0), 0),
      deals_won_this_month: wonDeals.length,
      won_amount_this_month: wonDeals.reduce((s, d) => s + (d.amount ?? 0), 0),
      tasks_open: tasksRes.count ?? 0,
      tasks_overdue: tasksOverdueRes.count ?? 0,
      unread_emails: unreadRes.count ?? 0,
      upcoming_appointments_7d: apptsRes.count ?? 0,
    };
  },
};

export const list_integrations: ToolDefinition = {
  name: "list_integrations",
  description:
    "Liste les intégrations CRM activées et leur statut (Google Calendar, Stripe, PostHog, BillionMail, etc.). Pour 'est-ce que mon Google Calendar est branché ?'",
  input_schema: z.object({}),
  output_schema: z.array(
    z.object({
      id: z.string(),
      enabled: z.boolean(),
      updated_at: z.string().nullable(),
      config_keys: z.array(z.string()),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async (_args, ctx) => {
    const { data, error } = await ctx.supabase
      .from("crm_integrations")
      .select("id,enabled,updated_at,config")
      .order("id");
    if (error) throw error;
    return (data ?? []).map(
      // deno-lint-ignore no-explicit-any
      (r: any) => ({
        id: r.id,
        enabled: r.enabled,
        updated_at: r.updated_at,
        config_keys:
          r.config && typeof r.config === "object" ? Object.keys(r.config) : [],
      }),
    );
  },
};
