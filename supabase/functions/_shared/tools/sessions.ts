import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";
import { tools as toolDefs } from "./registry.ts";

export const list_available_tools: ToolDefinition = {
  name: "list_available_tools",
  description:
    "Return the complete list of agent tools (name, description, kind read/write). Use this to pick a relevant subset for a new skill manifest.",
  input_schema: z.object({}),
  output_schema: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      kind: z.enum(["read", "write"]),
      cost_estimate: z.enum(["low", "medium", "high"]),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async (_args, _ctx) => {
    return Object.values(toolDefs).map((t) => ({
      name: t.name,
      description: t.description,
      kind: t.kind,
      cost_estimate: t.cost_estimate,
    }));
  },
};

export const get_user_session: ToolDefinition = {
  name: "get_user_session",
  description:
    "Fetch the chronological action sequence of a user_action session. Returns actions with their resource, payload (sanitized), and context. Truncates at 200 actions.",
  input_schema: z.object({
    session_id: z.string().min(8).max(64),
    user_id: z.string().uuid().optional(),
  }),
  output_schema: z.object({
    session_id: z.string(),
    user_id: z.string().nullable(),
    started_at: z.string().nullable(),
    ended_at: z.string().nullable(),
    action_count: z.number(),
    actions: z.array(
      z.object({
        occurred_at: z.string(),
        action: z.string(),
        resource: z.string().nullable(),
        resource_id: z.string().nullable(),
        payload: z.unknown(),
        context: z.unknown(),
      }),
    ),
    truncated: z.boolean(),
  }),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ session_id, user_id }, ctx) => {
    let q = ctx.supabase
      .from("user_actions")
      .select("user_id,occurred_at,action,resource,resource_id,payload,context")
      .eq("session_id", session_id)
      .order("occurred_at", { ascending: true })
      .limit(201);
    if (user_id) q = q.eq("user_id", user_id);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data ?? [];
    const truncated = rows.length > 200;
    const trimmed = truncated ? rows.slice(0, 200) : rows;
    return {
      session_id,
      user_id:
        // deno-lint-ignore no-explicit-any
        ((trimmed[0] as any)?.user_id as string | undefined) ?? null,
      started_at: trimmed[0]?.occurred_at ?? null,
      ended_at: trimmed[trimmed.length - 1]?.occurred_at ?? null,
      action_count: rows.length,
      // deno-lint-ignore no-explicit-any
      actions: trimmed.map((r: any) => ({
        occurred_at: r.occurred_at,
        action: r.action,
        resource: r.resource,
        resource_id: r.resource_id,
        payload: r.payload,
        context: r.context,
      })),
      truncated,
    };
  },
};
