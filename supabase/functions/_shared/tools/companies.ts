import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";

export const search_companies: ToolDefinition = {
  name: "search_companies",
  description: "Search companies by name or sector.",
  input_schema: z.object({
    query: z.string().optional(),
    sector: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      sector: z.string().nullable(),
      size: z.number().nullable(),
      lead_source: z.string(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, ctx) => {
    let q = ctx.supabase
      .from("companies")
      .select("id,name,sector,size,lead_source")
      .limit(args.limit);
    if (args.query) q = q.ilike("name", `%${args.query}%`);
    if (args.sector) q = q.eq("sector", args.sector);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
};

export const get_company: ToolDefinition = {
  name: "get_company",
  description: "Get a full company record.",
  input_schema: z.object({ id: z.number() }),
  output_schema: z.record(z.unknown()),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ id }, ctx) => {
    const { data, error } = await ctx.supabase
      .from("companies")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },
};

export const list_company_deals: ToolDefinition = {
  name: "list_company_deals",
  description: "List deals for a company, newest first.",
  input_schema: z.object({
    company_id: z.number(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      stage: z.string(),
      amount: z.number().nullable(),
      category: z.string().nullable(),
      updated_at: z.string(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ company_id, limit }, ctx) => {
    const { data, error } = await ctx.supabase
      .from("deals")
      .select("id,name,stage,amount,category,updated_at")
      .eq("company_id", company_id)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },
};

export const list_company_contacts: ToolDefinition = {
  name: "list_company_contacts",
  description: "List contacts belonging to a company.",
  input_schema: z.object({
    company_id: z.number(),
    limit: z.number().int().min(1).max(100).default(50),
  }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      first_name: z.string().nullable(),
      last_name: z.string().nullable(),
      title: z.string().nullable(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ company_id, limit }, ctx) => {
    const { data, error } = await ctx.supabase
      .from("contacts")
      .select("id,first_name,last_name,title")
      .eq("company_id", company_id)
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },
};
