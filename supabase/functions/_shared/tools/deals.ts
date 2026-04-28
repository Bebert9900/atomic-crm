import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";

// Terminal stages that are excluded from v1 whitelist (non-reversible moves).
const TERMINAL_STAGES = new Set(["won-deal", "lost-deal"]);

export const search_deals: ToolDefinition = {
  name: "search_deals",
  description:
    "Search deals by stage, amount range, assignee, or recently updated.",
  input_schema: z.object({
    stage: z.string().optional(),
    sales_id: z.number().optional(),
    min_amount: z.number().optional(),
    updated_since: z.string().datetime().optional(),
    archived: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      stage: z.string(),
      amount: z.number().nullable(),
      company_id: z.number().nullable(),
      updated_at: z.string(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, ctx) => {
    let q = ctx.supabase
      .from("deals")
      .select("id,name,stage,amount,company_id,updated_at")
      .limit(args.limit)
      .order("updated_at", { ascending: false });
    if (args.stage) q = q.eq("stage", args.stage);
    if (args.sales_id) q = q.eq("sales_id", args.sales_id);
    if (args.min_amount) q = q.gte("amount", args.min_amount);
    if (args.updated_since) q = q.gte("updated_at", args.updated_since);
    if (args.archived === true) q = q.not("archived_at", "is", null);
    if (args.archived === false) q = q.is("archived_at", null);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
};

export const get_deal: ToolDefinition = {
  name: "get_deal",
  description: "Get a full deal record.",
  input_schema: z.object({ id: z.number() }),
  output_schema: z.record(z.unknown()),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ id }, ctx) => {
    const { data, error } = await ctx.supabase
      .from("deals")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },
};

export const list_deal_notes: ToolDefinition = {
  name: "list_deal_notes",
  description: "List notes on a deal, newest first.",
  input_schema: z.object({
    deal_id: z.number(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      text: z.string().nullable(),
      type: z.string().nullable(),
      date: z.string(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ deal_id, limit }, ctx) => {
    const { data, error } = await ctx.supabase
      .from("deal_notes")
      .select("id,text,type,date")
      .eq("deal_id", deal_id)
      .order("date", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },
};

export const update_deal: ToolDefinition = {
  name: "update_deal",
  description:
    "Update safe fields on a deal (description, amount, expected_closing_date, category). Does NOT allow stage/archive changes.",
  input_schema: z.object({
    id: z.number(),
    patch: z.object({
      description: z.string().optional(),
      amount: z.number().optional(),
      expected_closing_date: z.string().optional(),
      category: z.string().optional(),
    }),
  }),
  output_schema: z.object({
    id: z.number(),
    before: z.record(z.unknown()),
  }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ id, patch }, ctx) => {
    const cols = Object.keys(patch);
    let before: Record<string, unknown> = {};
    if (cols.length > 0) {
      const { data } = await ctx.supabase
        .from("deals")
        .select(cols.join(","))
        .eq("id", id)
        .single();
      before = (data ?? {}) as Record<string, unknown>;
    }
    if (ctx.dryRun) return { id, before };
    const { error } = await ctx.supabase
      .from("deals")
      .update(patch)
      .eq("id", id);
    if (error) throw error;
    return { id, before };
  },
  undo: async ({ output }, ctx) => {
    // deno-lint-ignore no-explicit-any
    await ctx.supabase
      .from("deals")
      .update(output.before as any)
      .eq("id", output.id);
  },
};

export const move_deal_stage: ToolDefinition = {
  name: "move_deal_stage",
  description:
    "Move a deal to a non-terminal stage. Refuses won/lost transitions (excluded in v1).",
  input_schema: z.object({
    id: z.number(),
    stage: z.string(),
  }),
  output_schema: z.object({
    id: z.number(),
    before_stage: z.string(),
  }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ id, stage }, ctx) => {
    if (TERMINAL_STAGES.has(stage)) {
      throw new Error(
        `Terminal stage '${stage}' is not allowed in v1 (irreversible).`,
      );
    }
    const { data: cur } = await ctx.supabase
      .from("deals")
      .select("stage")
      .eq("id", id)
      .single();
    const before_stage = (cur as { stage: string } | null)?.stage ?? "";
    if (ctx.dryRun) return { id, before_stage };
    const { error } = await ctx.supabase
      .from("deals")
      .update({ stage })
      .eq("id", id);
    if (error) throw error;
    return { id, before_stage };
  },
  undo: async ({ output }, ctx) => {
    await ctx.supabase
      .from("deals")
      .update({ stage: output.before_stage })
      .eq("id", output.id);
  },
};

export const add_deal_note: ToolDefinition = {
  name: "add_deal_note",
  description: "Add a note to a deal. Returns the new note id.",
  input_schema: z.object({
    deal_id: z.number(),
    text: z.string().min(1),
    type: z.string().optional(),
  }),
  output_schema: z.object({ id: z.number() }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, ctx) => {
    if (ctx.dryRun) return { id: -1 };
    const { data, error } = await ctx.supabase
      .from("deal_notes")
      .insert({
        deal_id: args.deal_id,
        text: args.text,
        type: args.type,
        date: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: (data as { id: number }).id };
  },
  undo: async ({ output }, ctx) => {
    if (output.id < 0) return;
    await ctx.supabase.from("deal_notes").delete().eq("id", output.id);
  },
};
