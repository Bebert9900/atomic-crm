import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";

export const search_companies: ToolDefinition = {
  name: "search_companies",
  description:
    "Search companies (vue companies_summary qui inclut nb_deals/nb_contacts) — filtres : query (nom), sector, country, sales_id (account owner).",
  input_schema: z.object({
    query: z.string().optional(),
    sector: z.string().optional(),
    country: z.string().optional(),
    sales_id: z.number().int().optional(),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      sector: z.string().nullable(),
      size: z.number().nullable(),
      country: z.string().nullable(),
      city: z.string().nullable(),
      sales_id: z.number().nullable(),
      nb_deals: z.number().nullable(),
      nb_contacts: z.number().nullable(),
      revenue: z.string().nullable(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, ctx) => {
    let q = ctx.supabase
      .from("companies_summary")
      .select(
        "id,name,sector,size,country,city,sales_id,nb_deals,nb_contacts,revenue",
      )
      .limit(args.limit);
    if (args.query) q = q.ilike("name", `%${args.query}%`);
    if (args.sector) q = q.eq("sector", args.sector);
    if (args.country) q = q.eq("country", args.country);
    if (args.sales_id) q = q.eq("sales_id", args.sales_id);
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

export const create_company: ToolDefinition = {
  name: "create_company",
  description:
    "Crée une company. Champs requis: name. Optionnels: sector, size, website, description, linkedin_url, phone_number, address, city, country, sales_id, lead_source.",
  input_schema: z.object({
    name: z.string().min(1),
    sector: z.string().optional(),
    size: z.number().int().optional(),
    website: z.string().optional(),
    description: z.string().optional(),
    linkedin_url: z.string().optional(),
    phone_number: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    country: z.string().optional(),
    sales_id: z.number().int().optional(),
    lead_source: z.string().optional(),
  }),
  output_schema: z.object({
    id: z.number(),
    name: z.string(),
  }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, ctx) => {
    const payload: Record<string, unknown> = {
      name: args.name,
      lead_source: args.lead_source ?? "agent",
    };
    for (const k of [
      "sector",
      "size",
      "website",
      "description",
      "linkedin_url",
      "phone_number",
      "address",
      "city",
      "country",
      "sales_id",
    ] as const) {
      if (args[k] !== undefined) payload[k] = args[k];
    }
    const { data, error } = await ctx.supabase
      .from("companies")
      .insert(payload)
      .select("id,name")
      .single();
    if (error) throw error;
    return data;
  },
};

export const update_company: ToolDefinition = {
  name: "update_company",
  description:
    "Met à jour une company. Au moins un champ doit être fourni en plus de id.",
  input_schema: z.object({
    id: z.number().int(),
    name: z.string().optional(),
    sector: z.string().optional(),
    size: z.number().int().nullable().optional(),
    website: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    linkedin_url: z.string().nullable().optional(),
    phone_number: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    sales_id: z.number().int().nullable().optional(),
  }),
  output_schema: z.object({
    id: z.number(),
    name: z.string(),
  }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ id, ...patch }, ctx) => {
    const cleaned = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(cleaned).length === 0) {
      throw new Error("update_company: no field to update");
    }
    const { data, error } = await ctx.supabase
      .from("companies")
      .update(cleaned)
      .eq("id", id)
      .select("id,name")
      .single();
    if (error) throw error;
    return data;
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
