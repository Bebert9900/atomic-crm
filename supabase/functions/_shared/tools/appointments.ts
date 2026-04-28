import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";

export const search_appointments: ToolDefinition = {
  name: "search_appointments",
  description:
    "Search calendar appointments by contact, sales owner, status, or date range. Newest first.",
  input_schema: z.object({
    contact_id: z.number().optional(),
    sales_id: z.number().optional(),
    status: z.string().optional(),
    starts_after: z.string().datetime().optional(),
    starts_before: z.string().datetime().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      contact_id: z.number().nullable(),
      sales_id: z.number().nullable(),
      start_at: z.string(),
      end_at: z.string(),
      location: z.string().nullable(),
      status: z.string(),
      source: z.string(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, ctx) => {
    let q = ctx.supabase
      .from("appointments")
      .select(
        "id,title,contact_id,sales_id,start_at,end_at,location,status,source",
      )
      .order("start_at", { ascending: false })
      .limit(args.limit);
    if (args.contact_id) q = q.eq("contact_id", args.contact_id);
    if (args.sales_id) q = q.eq("sales_id", args.sales_id);
    if (args.status) q = q.eq("status", args.status);
    if (args.starts_after) q = q.gte("start_at", args.starts_after);
    if (args.starts_before) q = q.lte("start_at", args.starts_before);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
};

export const get_appointment: ToolDefinition = {
  name: "get_appointment",
  description: "Get a single appointment by id with description.",
  input_schema: z.object({ id: z.number() }),
  output_schema: z.object({
    id: z.number(),
    title: z.string(),
    description: z.string().nullable(),
    contact_id: z.number().nullable(),
    sales_id: z.number().nullable(),
    start_at: z.string(),
    end_at: z.string(),
    location: z.string().nullable(),
    status: z.string(),
    source: z.string(),
  }),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ id }, ctx) => {
    const { data, error } = await ctx.supabase
      .from("appointments")
      .select(
        "id,title,description,contact_id,sales_id,start_at,end_at,location,status,source",
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },
};

export const list_my_day: ToolDefinition = {
  name: "list_my_day",
  description:
    "List all appointments for a sales user on a given day (default today). Returns chronological order.",
  input_schema: z.object({
    sales_id: z.number(),
    date: z.string().date().optional(),
  }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      contact_id: z.number().nullable(),
      start_at: z.string(),
      end_at: z.string(),
      location: z.string().nullable(),
      status: z.string(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ sales_id, date }, ctx) => {
    const day = date ?? new Date().toISOString().slice(0, 10);
    const dayStart = `${day}T00:00:00Z`;
    const dayEnd = `${day}T23:59:59Z`;
    const { data, error } = await ctx.supabase
      .from("appointments")
      .select("id,title,contact_id,start_at,end_at,location,status")
      .eq("sales_id", sales_id)
      .gte("start_at", dayStart)
      .lte("start_at", dayEnd)
      .order("start_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
};

export const find_free_slots: ToolDefinition = {
  name: "find_free_slots",
  description:
    "Find free 30/60-min slots for a sales user in a date range. Considers existing appointments. Returns up to 10 candidate start times (ISO).",
  input_schema: z.object({
    sales_id: z.number(),
    range_start: z.string().datetime(),
    range_end: z.string().datetime(),
    duration_minutes: z.number().int().min(15).max(240).default(30),
    work_hours_start: z.number().int().min(0).max(23).default(9),
    work_hours_end: z.number().int().min(1).max(24).default(18),
  }),
  output_schema: z.array(
    z.object({ start_at: z.string(), end_at: z.string() }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, ctx) => {
    const { data, error } = await ctx.supabase
      .from("appointments")
      .select("start_at,end_at")
      .eq("sales_id", args.sales_id)
      .gte("start_at", args.range_start)
      .lte("end_at", args.range_end)
      .order("start_at", { ascending: true });
    if (error) throw error;
    const busy = (data ?? []).map((r) => ({
      s: new Date(r.start_at).getTime(),
      e: new Date(r.end_at).getTime(),
    }));
    const slots: { start_at: string; end_at: string }[] = [];
    const start = new Date(args.range_start);
    const end = new Date(args.range_end);
    const stepMs = args.duration_minutes * 60_000;
    const cursor = new Date(start);
    cursor.setMinutes(0, 0, 0);
    while (cursor < end && slots.length < 10) {
      const h = cursor.getUTCHours();
      const dow = cursor.getUTCDay();
      const isWeekday = dow >= 1 && dow <= 5;
      const inHours = h >= args.work_hours_start && h < args.work_hours_end;
      if (isWeekday && inHours) {
        const slotStart = cursor.getTime();
        const slotEnd = slotStart + stepMs;
        const overlap = busy.some((b) => b.s < slotEnd && b.e > slotStart);
        if (!overlap) {
          slots.push({
            start_at: new Date(slotStart).toISOString(),
            end_at: new Date(slotEnd).toISOString(),
          });
        }
      }
      cursor.setTime(cursor.getTime() + stepMs);
    }
    return slots;
  },
};

export const create_appointment: ToolDefinition = {
  name: "create_appointment",
  description:
    "Create an appointment. start_at and end_at must be ISO8601. Source defaults to 'agent'.",
  input_schema: z.object({
    title: z.string().min(1).max(200),
    description: z.string().optional(),
    contact_id: z.number().optional(),
    sales_id: z.number().optional(),
    start_at: z.string().datetime(),
    end_at: z.string().datetime(),
    location: z.string().optional(),
    status: z.string().default("scheduled"),
  }),
  output_schema: z.object({ id: z.number() }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, ctx) => {
    if (ctx.dryRun) return { id: -1 };
    const { data, error } = await ctx.supabase
      .from("appointments")
      .insert({ ...args, source: "agent" })
      .select("id")
      .single();
    if (error) throw error;
    return { id: (data as { id: number }).id };
  },
  undo: async ({ output }, ctx) => {
    if (output.id < 0) return;
    await ctx.supabase.from("appointments").delete().eq("id", output.id);
  },
};

export const update_appointment: ToolDefinition = {
  name: "update_appointment",
  description: "Update an appointment. Only provided fields are changed.",
  input_schema: z.object({
    id: z.number(),
    patch: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      start_at: z.string().datetime().optional(),
      end_at: z.string().datetime().optional(),
      location: z.string().optional(),
      status: z.string().optional(),
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
        .from("appointments")
        .select(cols.join(","))
        .eq("id", id)
        .single();
      before = (data ?? {}) as Record<string, unknown>;
    }
    if (ctx.dryRun) return { id, before };
    const { error } = await ctx.supabase
      .from("appointments")
      .update(patch)
      .eq("id", id);
    if (error) throw error;
    return { id, before };
  },
  undo: async ({ output }, ctx) => {
    // deno-lint-ignore no-explicit-any
    await ctx.supabase
      .from("appointments")
      .update(output.before as any)
      .eq("id", output.id);
  },
};

export const cancel_appointment: ToolDefinition = {
  name: "cancel_appointment",
  description: "Set an appointment status to 'cancelled'. Reversible.",
  input_schema: z.object({ id: z.number() }),
  output_schema: z.object({
    id: z.number(),
    before_status: z.string(),
  }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ id }, ctx) => {
    const { data: cur } = await ctx.supabase
      .from("appointments")
      .select("status")
      .eq("id", id)
      .single();
    const before = (cur as { status: string } | null)?.status ?? "scheduled";
    if (ctx.dryRun) return { id, before_status: before };
    const { error } = await ctx.supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) throw error;
    return { id, before_status: before };
  },
  undo: async ({ output }, ctx) => {
    await ctx.supabase
      .from("appointments")
      .update({ status: output.before_status })
      .eq("id", output.id);
  },
};
