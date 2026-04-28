import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";
import { skills } from "../skills/index.ts";

export const schedule_skill_at: ToolDefinition = {
  name: "schedule_skill_at",
  description:
    "Planifie l'exécution d'une skill à une date future (ex: \"rappelle-moi dans 3 jours\"). Le worker l'exécutera automatiquement.",
  input_schema: z.object({
    skill_id: z.string().min(1),
    input: z.record(z.unknown()).optional(),
    when_iso: z.string().min(1),
    idempotency_key: z.string().optional(),
  }),
  output_schema: z.object({
    id: z.number().nullable(),
    scheduled_at: z.string(),
    status: z.string(),
  }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, ctx) => {
    if (!skills[args.skill_id]) {
      throw new Error(`unknown skill: ${args.skill_id}`);
    }
    const runAt = new Date(args.when_iso);
    if (Number.isNaN(runAt.getTime())) {
      throw new Error("invalid when_iso (must be a valid ISO date)");
    }
    if (runAt.getTime() < Date.now() - 60_000) {
      throw new Error("when_iso is in the past");
    }
    const { data, error } = await ctx.supabase
      .from("agentic_scheduled_actions")
      .insert({
        skill_id: args.skill_id,
        input: args.input ?? {},
        run_at: runAt.toISOString(),
        idempotency_key: args.idempotency_key ?? null,
        user_id: ctx.auth.userId,
        tenant_id: ctx.auth.tenantId ?? null,
      })
      .select("id,run_at,status")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return {
          id: null,
          scheduled_at: runAt.toISOString(),
          status: "duplicate",
        };
      }
      throw error;
    }
    const row = data as { id: number; run_at: string; status: string };
    return { id: row.id, scheduled_at: row.run_at, status: row.status };
  },
};

export const cancel_scheduled_action: ToolDefinition = {
  name: "cancel_scheduled_action",
  description: "Annule une action planifiée encore en attente.",
  input_schema: z.object({ id: z.number().int() }),
  output_schema: z.object({ id: z.number(), cancelled: z.boolean() }),
  kind: "write",
  reversible: false,
  cost_estimate: "low",
  handler: async ({ id }, ctx) => {
    const { data, error } = await ctx.supabase
      .from("agentic_scheduled_actions")
      .update({ status: "cancelled", ended_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return { id, cancelled: !!data };
  },
};

export const list_my_scheduled_actions: ToolDefinition = {
  name: "list_my_scheduled_actions",
  description:
    "Liste les actions planifiées de l'utilisateur (par défaut: pending et done sur 7 jours).",
  input_schema: z.object({
    status: z
      .enum(["pending", "running", "done", "error", "cancelled", "any"])
      .default("any"),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  output_schema: z.array(
    z.object({
      id: z.number(),
      skill_id: z.string(),
      run_at: z.string(),
      status: z.string(),
      created_at: z.string(),
      error_message: z.string().nullable(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ status, limit }, ctx) => {
    let q = ctx.supabase
      .from("agentic_scheduled_actions")
      .select("id,skill_id,run_at,status,created_at,error_message")
      .order("run_at", { ascending: false })
      .limit(limit);
    if (status !== "any") q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
};
