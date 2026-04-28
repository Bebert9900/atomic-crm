import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";

export const get_finance_metrics: ToolDefinition = {
  name: "get_finance_metrics",
  description:
    "Snapshot financier global (MRR, ARR, revenu 30j, refunds 30j, abonnements actifs, churn 30j). Tous montants en cents.",
  input_schema: z.object({}),
  output_schema: z.object({
    mrr_cents: z.number().nullable(),
    arr_cents: z.number().nullable(),
    revenue_30d_cents: z.number().nullable(),
    refunded_30d_cents: z.number().nullable(),
    active_subscriptions: z.number().nullable(),
    churned_30d_count: z.number().nullable(),
    payments_30d_count: z.number().nullable(),
    currency: z.string().nullable(),
    computed_at: z.string().nullable(),
  }),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async (_args, ctx) => {
    const { data, error } = await ctx.supabase
      .from("finance_metrics")
      .select(
        "mrr_cents,arr_cents,revenue_30d_cents,refunded_30d_cents,active_subscriptions,churned_30d_count,payments_30d_count,currency,computed_at",
      )
      .maybeSingle();
    if (error) throw error;
    return (
      data ?? {
        mrr_cents: null,
        arr_cents: null,
        revenue_30d_cents: null,
        refunded_30d_cents: null,
        active_subscriptions: null,
        churned_30d_count: null,
        payments_30d_count: null,
        currency: null,
        computed_at: null,
      }
    );
  },
};

export const get_treasury: ToolDefinition = {
  name: "get_treasury",
  description:
    "État de trésorerie Stripe en temps réel (balance disponible + en attente). Appelle l'edge function get_stripe_treasury qui requête Stripe.",
  input_schema: z.object({}),
  output_schema: z.object({
    available: z
      .array(z.object({ amount: z.number(), currency: z.string() }))
      .optional(),
    pending: z
      .array(z.object({ amount: z.number(), currency: z.string() }))
      .optional(),
    error: z.string().optional(),
  }),
  kind: "read",
  reversible: true,
  cost_estimate: "medium",
  handler: async (_args, ctx) => {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/get_stripe_treasury`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${ctx.auth.token}` },
      },
    );
    if (!res.ok) {
      return {
        error: `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`,
      };
    }
    return await res.json();
  },
};

export const list_recent_payments: ToolDefinition = {
  name: "list_recent_payments",
  description:
    "Liste les derniers paiements Stripe (succeeded ou failed) sur les N derniers jours.",
  input_schema: z.object({
    days: z.number().int().min(1).max(90).default(30),
    status: z.enum(["succeeded", "failed", "any"]).default("any"),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      amount: z.number().nullable(),
      currency: z.string().nullable(),
      status: z.string().nullable(),
      type: z.string().nullable(),
      occurred_at: z.string().nullable(),
      company_id: z.number().nullable(),
      contact_id: z.number().nullable(),
      description: z.string().nullable(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ days, status, limit }, ctx) => {
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    let q = ctx.supabase
      .from("payments")
      .select(
        "id,amount,currency,status,type,occurred_at,company_id,contact_id,description",
      )
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (status !== "any") q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
};

export const list_recent_payouts: ToolDefinition = {
  name: "list_recent_payouts",
  description: "Liste les derniers virements Stripe (payouts) sortants.",
  input_schema: z.object({
    days: z.number().int().min(1).max(180).default(30),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      amount: z.number().nullable(),
      currency: z.string().nullable(),
      status: z.string().nullable(),
      arrival_date: z.string().nullable(),
      method: z.string().nullable(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ days, limit }, ctx) => {
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const { data, error } = await ctx.supabase
      .from("stripe_payouts")
      .select("id,amount,currency,status,arrival_date,method")
      .gte("occurred_at", since)
      .order("arrival_date", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },
};
