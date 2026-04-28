import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";

export const search_tasks: ToolDefinition = {
  name: "search_tasks",
  description: "Search tasks by assignee, done status, overdue, contact.",
  input_schema: z.object({
    sales_id: z.number().optional(),
    contact_id: z.number().optional(),
    done: z.boolean().optional(),
    overdue: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      contact_id: z.number(),
      type: z.string().nullable(),
      text: z.string().nullable(),
      due_date: z.string().nullable(),
      done_date: z.string().nullable(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, ctx) => {
    let q = ctx.supabase
      .from("tasks")
      .select("id,contact_id,type,text,due_date,done_date")
      .limit(args.limit)
      .order("due_date", { ascending: true });
    if (args.sales_id) q = q.eq("sales_id", args.sales_id);
    if (args.contact_id) q = q.eq("contact_id", args.contact_id);
    if (args.done === true) q = q.not("done_date", "is", null);
    if (args.done === false) q = q.is("done_date", null);
    if (args.overdue) {
      q = q.is("done_date", null).lt("due_date", new Date().toISOString());
    }
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
};

export const get_task: ToolDefinition = {
  name: "get_task",
  description: "Get a task by id.",
  input_schema: z.object({ id: z.number() }),
  output_schema: z.record(z.unknown()),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ id }, ctx) => {
    const { data, error } = await ctx.supabase
      .from("tasks")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },
};

export const create_task: ToolDefinition = {
  name: "create_task",
  description:
    "Create a task attached to a contact. Due date is ISO8601. Type is free-form string (e.g. Call, Email, Meeting).",
  input_schema: z.object({
    contact_id: z.number(),
    text: z.string().min(1),
    type: z.string().optional(),
    due_date: z.string().datetime().optional(),
  }),
  output_schema: z.object({ id: z.number() }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, ctx) => {
    if (ctx.dryRun) return { id: -1 };
    const { data, error } = await ctx.supabase
      .from("tasks")
      .insert(args)
      .select("id")
      .single();
    if (error) throw error;
    return { id: (data as { id: number }).id };
  },
  undo: async ({ output }, ctx) => {
    if (output.id < 0) return;
    await ctx.supabase.from("tasks").delete().eq("id", output.id);
  },
};

export const complete_task: ToolDefinition = {
  name: "complete_task",
  description: "Mark a task as done (sets done_date=now).",
  input_schema: z.object({ id: z.number() }),
  output_schema: z.object({
    id: z.number(),
    before_done_date: z.string().nullable(),
  }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ id }, ctx) => {
    const { data: cur } = await ctx.supabase
      .from("tasks")
      .select("done_date")
      .eq("id", id)
      .single();
    const before =
      (cur as { done_date: string | null } | null)?.done_date ?? null;
    if (ctx.dryRun) return { id, before_done_date: before };
    const { error } = await ctx.supabase
      .from("tasks")
      .update({ done_date: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return { id, before_done_date: before };
  },
  undo: async ({ output }, ctx) => {
    await ctx.supabase
      .from("tasks")
      .update({ done_date: output.before_done_date })
      .eq("id", output.id);
  },
};

export const reschedule_task: ToolDefinition = {
  name: "reschedule_task",
  description: "Change the due date of a task.",
  input_schema: z.object({
    id: z.number(),
    due_date: z.string().datetime(),
  }),
  output_schema: z.object({
    id: z.number(),
    before_due_date: z.string().nullable(),
  }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ id, due_date }, ctx) => {
    const { data: cur } = await ctx.supabase
      .from("tasks")
      .select("due_date")
      .eq("id", id)
      .single();
    const before =
      (cur as { due_date: string | null } | null)?.due_date ?? null;
    if (ctx.dryRun) return { id, before_due_date: before };
    const { error } = await ctx.supabase
      .from("tasks")
      .update({ due_date })
      .eq("id", id);
    if (error) throw error;
    return { id, before_due_date: before };
  },
  undo: async ({ output }, ctx) => {
    await ctx.supabase
      .from("tasks")
      .update({ due_date: output.before_due_date })
      .eq("id", output.id);
  },
};
