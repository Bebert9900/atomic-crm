import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";

const STATUS = z.enum([
  "backlog",
  "todo",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
]);
const PRIORITY = z.enum(["none", "low", "medium", "high", "urgent"]);

export const search_dev_tasks: ToolDefinition = {
  name: "search_dev_tasks",
  description:
    "Search dev_tasks (internal team tasks) by status, priority, assignee, related entity, or free text on title/description.",
  input_schema: z.object({
    query: z.string().optional(),
    status: STATUS.optional(),
    priority: PRIORITY.optional(),
    assignee_id: z.number().optional(),
    contact_id: z.number().optional(),
    company_id: z.number().optional(),
    deal_id: z.number().optional(),
    archived: z.boolean().default(false),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      status: z.string(),
      priority: z.string(),
      assignee_id: z.number().nullable(),
      due_date: z.string().nullable(),
      label_ids: z.array(z.number()),
      contact_id: z.number().nullable(),
      company_id: z.number().nullable(),
      deal_id: z.number().nullable(),
      updated_at: z.string(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, ctx) => {
    let q = ctx.supabase
      .from("dev_tasks")
      .select(
        "id,title,status,priority,assignee_id,due_date,label_ids,contact_id,company_id,deal_id,updated_at,archived_at",
      )
      .order("updated_at", { ascending: false })
      .limit(args.limit);
    if (!args.archived) q = q.is("archived_at", null);
    if (args.status) q = q.eq("status", args.status);
    if (args.priority) q = q.eq("priority", args.priority);
    if (args.assignee_id) q = q.eq("assignee_id", args.assignee_id);
    if (args.contact_id) q = q.eq("contact_id", args.contact_id);
    if (args.company_id) q = q.eq("company_id", args.company_id);
    if (args.deal_id) q = q.eq("deal_id", args.deal_id);
    if (args.query) {
      const p = `%${args.query}%`;
      q = q.or(`title.ilike.${p},description.ilike.${p}`);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      priority: r.priority,
      assignee_id: r.assignee_id,
      due_date: r.due_date,
      label_ids: r.label_ids ?? [],
      contact_id: r.contact_id,
      company_id: r.company_id,
      deal_id: r.deal_id,
      updated_at: r.updated_at,
    }));
  },
};

export const get_dev_task: ToolDefinition = {
  name: "get_dev_task",
  description: "Get a single dev_task with description.",
  input_schema: z.object({ id: z.number() }),
  output_schema: z.object({
    id: z.number(),
    title: z.string(),
    description: z.string().nullable(),
    status: z.string(),
    priority: z.string(),
    assignee_id: z.number().nullable(),
    due_date: z.string().nullable(),
    label_ids: z.array(z.number()),
    contact_id: z.number().nullable(),
    company_id: z.number().nullable(),
    deal_id: z.number().nullable(),
    updated_at: z.string(),
    created_at: z.string(),
  }),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ id }, ctx) => {
    const { data, error } = await ctx.supabase
      .from("dev_tasks")
      .select(
        "id,title,description,status,priority,assignee_id,due_date,label_ids,contact_id,company_id,deal_id,updated_at,created_at",
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    return { ...data, label_ids: data?.label_ids ?? [] };
  },
};

export const list_dev_task_labels: ToolDefinition = {
  name: "list_dev_task_labels",
  description: "List available dev_task labels (id, name, color).",
  input_schema: z.object({}),
  output_schema: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      color: z.string(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async (_args, ctx) => {
    const { data, error } = await ctx.supabase
      .from("dev_task_labels")
      .select("id,name,color")
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
};

export const create_dev_task: ToolDefinition = {
  name: "create_dev_task",
  description:
    "Create a dev_task. Optional links to contact/company/deal, optional assignee.",
  input_schema: z.object({
    title: z.string().min(1).max(300),
    description: z.string().optional(),
    status: STATUS.default("backlog"),
    priority: PRIORITY.default("none"),
    assignee_id: z.number().optional(),
    due_date: z.string().date().optional(),
    label_ids: z.array(z.number()).default([]),
    contact_id: z.number().optional(),
    company_id: z.number().optional(),
    deal_id: z.number().optional(),
  }),
  output_schema: z.object({ id: z.number() }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, ctx) => {
    if (ctx.dryRun) return { id: -1 };
    const { data, error } = await ctx.supabase
      .from("dev_tasks")
      .insert(args)
      .select("id")
      .single();
    if (error) throw error;
    return { id: (data as { id: number }).id };
  },
  undo: async ({ output }, ctx) => {
    if (output.id < 0) return;
    await ctx.supabase.from("dev_tasks").delete().eq("id", output.id);
  },
};

export const update_dev_task: ToolDefinition = {
  name: "update_dev_task",
  description:
    "Update fields on a dev_task. Use for any combination of status/priority/assignee/labels/links/dates.",
  input_schema: z.object({
    id: z.number(),
    patch: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      status: STATUS.optional(),
      priority: PRIORITY.optional(),
      assignee_id: z.number().nullable().optional(),
      due_date: z.string().date().nullable().optional(),
      label_ids: z.array(z.number()).optional(),
      contact_id: z.number().nullable().optional(),
      company_id: z.number().nullable().optional(),
      deal_id: z.number().nullable().optional(),
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
        .from("dev_tasks")
        .select(cols.join(","))
        .eq("id", id)
        .single();
      before = (data ?? {}) as Record<string, unknown>;
    }
    if (ctx.dryRun) return { id, before };
    const { error } = await ctx.supabase
      .from("dev_tasks")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return { id, before };
  },
  undo: async ({ output }, ctx) => {
    // deno-lint-ignore no-explicit-any
    await ctx.supabase
      .from("dev_tasks")
      .update(output.before as any)
      .eq("id", output.id);
  },
};

export const archive_dev_task: ToolDefinition = {
  name: "archive_dev_task",
  description: "Archive a dev_task (soft-hide). Reversible.",
  input_schema: z.object({ id: z.number() }),
  output_schema: z.object({
    id: z.number(),
    before_archived_at: z.string().nullable(),
  }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ id }, ctx) => {
    const { data: cur } = await ctx.supabase
      .from("dev_tasks")
      .select("archived_at")
      .eq("id", id)
      .single();
    const before =
      (cur as { archived_at: string | null } | null)?.archived_at ?? null;
    if (ctx.dryRun) return { id, before_archived_at: before };
    const { error } = await ctx.supabase
      .from("dev_tasks")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return { id, before_archived_at: before };
  },
  undo: async ({ output }, ctx) => {
    await ctx.supabase
      .from("dev_tasks")
      .update({ archived_at: output.before_archived_at })
      .eq("id", output.id);
  },
};
