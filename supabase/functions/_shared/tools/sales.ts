import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";

export const list_sales: ToolDefinition = {
  name: "list_sales",
  description:
    "Liste les commerciaux/équipe (sales actifs uniquement). Utilise pour proposer une réassignation.",
  input_schema: z.object({}),
  output_schema: z.array(
    z.object({
      id: z.number(),
      first_name: z.string(),
      last_name: z.string(),
      email: z.string(),
      administrator: z.boolean(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async (_args, ctx) => {
    const { data, error } = await ctx.supabase
      .from("sales")
      .select("id,first_name,last_name,email,administrator")
      .eq("disabled", false)
      .order("first_name");
    if (error) throw error;
    return data ?? [];
  },
};

export const assign_contact_to_sale: ToolDefinition = {
  name: "assign_contact_to_sale",
  description: "Assigne un contact à un sales (sales_id).",
  input_schema: z.object({
    contact_id: z.number().int(),
    sales_id: z.number().int(),
  }),
  output_schema: z.object({ contact_id: z.number(), sales_id: z.number() }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ contact_id, sales_id }, ctx) => {
    const { error } = await ctx.supabase
      .from("contacts")
      .update({ sales_id })
      .eq("id", contact_id);
    if (error) throw error;
    return { contact_id, sales_id };
  },
};

export const assign_deal_to_sale: ToolDefinition = {
  name: "assign_deal_to_sale",
  description: "Assigne un deal/affaire à un sales.",
  input_schema: z.object({
    deal_id: z.number().int(),
    sales_id: z.number().int(),
  }),
  output_schema: z.object({ deal_id: z.number(), sales_id: z.number() }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ deal_id, sales_id }, ctx) => {
    const { error } = await ctx.supabase
      .from("deals")
      .update({ sales_id })
      .eq("id", deal_id);
    if (error) throw error;
    return { deal_id, sales_id };
  },
};

export const assign_task_to_sale: ToolDefinition = {
  name: "assign_task_to_sale",
  description: "Assigne une tâche à un sales.",
  input_schema: z.object({
    task_id: z.number().int(),
    sales_id: z.number().int(),
  }),
  output_schema: z.object({ task_id: z.number(), sales_id: z.number() }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ task_id, sales_id }, ctx) => {
    const { error } = await ctx.supabase
      .from("tasks")
      .update({ sales_id })
      .eq("id", task_id);
    if (error) throw error;
    return { task_id, sales_id };
  },
};

export const assign_company_to_sale: ToolDefinition = {
  name: "assign_company_to_sale",
  description: "Assigne une company à un sales (account owner).",
  input_schema: z.object({
    company_id: z.number().int(),
    sales_id: z.number().int(),
  }),
  output_schema: z.object({ company_id: z.number(), sales_id: z.number() }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ company_id, sales_id }, ctx) => {
    const { error } = await ctx.supabase
      .from("companies")
      .update({ sales_id })
      .eq("id", company_id);
    if (error) throw error;
    return { company_id, sales_id };
  },
};
