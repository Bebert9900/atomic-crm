import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";

export const list_subscriptions: ToolDefinition = {
  name: "list_subscriptions",
  description:
    "List Stripe-synced subscriptions, optionally filtered by company, status, or 'at_risk' (canceled / past_due / cancel_at_period_end true).",
  input_schema: z.object({
    company_id: z.number().optional(),
    status: z.string().optional(),
    at_risk: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      stripe_subscription_id: z.string(),
      company_id: z.number().nullable(),
      status: z.string(),
      product_name: z.string().nullable(),
      amount: z.number().nullable(),
      currency: z.string().nullable(),
      recurring_interval: z.string().nullable(),
      current_period_end: z.string().nullable(),
      cancel_at_period_end: z.boolean(),
      canceled_at: z.string().nullable(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, ctx) => {
    let q = ctx.supabase
      .from("subscriptions")
      .select(
        "id,stripe_subscription_id,company_id,status,product_name,amount,currency,recurring_interval,current_period_end,cancel_at_period_end,canceled_at",
      )
      .order("updated_at", { ascending: false })
      .limit(args.limit);
    if (args.company_id) q = q.eq("company_id", args.company_id);
    if (args.status) q = q.eq("status", args.status);
    if (args.at_risk) {
      q = q.or(
        "status.in.(canceled,past_due,unpaid),cancel_at_period_end.eq.true",
      );
    }
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
};

export const get_subscription: ToolDefinition = {
  name: "get_subscription",
  description: "Get a single subscription by id.",
  input_schema: z.object({ id: z.number() }),
  output_schema: z.object({
    id: z.number(),
    stripe_subscription_id: z.string(),
    stripe_customer_id: z.string(),
    company_id: z.number().nullable(),
    status: z.string(),
    product_name: z.string().nullable(),
    amount: z.number().nullable(),
    currency: z.string().nullable(),
    recurring_interval: z.string().nullable(),
    current_period_start: z.string().nullable(),
    current_period_end: z.string().nullable(),
    cancel_at_period_end: z.boolean(),
    canceled_at: z.string().nullable(),
    started_at: z.string().nullable(),
    metadata: z.unknown(),
  }),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ id }, ctx) => {
    const { data, error } = await ctx.supabase
      .from("subscriptions")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },
};

export const list_payments: ToolDefinition = {
  name: "list_payments",
  description:
    "List Stripe payments (invoices, charges, refunds) for a company/contact/deal or globally. Newest first.",
  input_schema: z.object({
    company_id: z.number().optional(),
    contact_id: z.number().optional(),
    deal_id: z.number().optional(),
    type: z.string().optional(),
    status: z.string().optional(),
    since: z.string().datetime().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      type: z.string(),
      status: z.string().nullable(),
      amount: z.number(),
      amount_refunded: z.number(),
      currency: z.string(),
      company_id: z.number().nullable(),
      contact_id: z.number().nullable(),
      deal_id: z.number().nullable(),
      occurred_at: z.string(),
      hosted_invoice_url: z.string().nullable(),
      receipt_url: z.string().nullable(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, ctx) => {
    let q = ctx.supabase
      .from("payments")
      .select(
        "id,type,status,amount,amount_refunded,currency,company_id,contact_id,deal_id,occurred_at,hosted_invoice_url,receipt_url",
      )
      .order("occurred_at", { ascending: false })
      .limit(args.limit);
    if (args.company_id) q = q.eq("company_id", args.company_id);
    if (args.contact_id) q = q.eq("contact_id", args.contact_id);
    if (args.deal_id) q = q.eq("deal_id", args.deal_id);
    if (args.type) q = q.eq("type", args.type);
    if (args.status) q = q.eq("status", args.status);
    if (args.since) q = q.gte("occurred_at", args.since);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
};
