import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";
import { makeSupabaseForUser } from "../../agent-runtime/runPersistence.ts";

const Input = z.object({
  days_stale: z.number().int().min(1).max(60).default(7),
  exclude_stages: z.array(z.string()).default(["won", "lost"]),
});
const Output = z.object({
  stale_deals: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      stage: z.string(),
      sales_id: z.number().nullable(),
      days_since_update: z.number(),
    }),
  ),
  task_ids: z.array(z.number()),
});

export const staleDealWatchdogSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "stale_deal_watchdog",
  version: "1.0.0",
  model: "claude-sonnet-4-6",
  description:
    "Détecte les deals sans activité depuis N jours (par défaut 7) et crée une tâche de relance pour le sales owner. Cron quotidien.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [],
  max_iterations: 0,
  max_writes: 0,
  rate_limit: { per_minute: 5, per_hour: 50 },
  system_prompt: "",
  execute: async (ctx) => {
    const supa = makeSupabaseForUser(ctx.auth.token);
    const { days_stale, exclude_stages } = ctx.input;
    const cutoff = new Date(Date.now() - days_stale * 86400_000).toISOString();

    const { data: deals, error } = await supa
      .from("deals")
      .select("id,name,stage,sales_id,updated_at,company_id")
      .lt("updated_at", cutoff)
      .is("archived_at", null)
      .not("stage", "in", `(${exclude_stages.map((s) => `"${s}"`).join(",")})`)
      .order("updated_at", { ascending: true })
      .limit(50);
    if (error) throw error;

    const stale = (deals ?? []) as Array<{
      id: number;
      name: string;
      stage: string;
      sales_id: number | null;
      updated_at: string;
      company_id: number | null;
    }>;
    const taskIds: number[] = [];

    for (const d of stale) {
      const days = Math.floor(
        (Date.now() - new Date(d.updated_at).getTime()) / 86400_000,
      );
      // Need a contact to attach the task. Use first contact of the company.
      let contactId: number | null = null;
      if (d.company_id) {
        const { data: c } = await supa
          .from("contacts")
          .select("id")
          .eq("company_id", d.company_id)
          .limit(1)
          .maybeSingle();
        contactId = (c as { id: number } | null)?.id ?? null;
      }
      if (!contactId) continue;
      // Dedupe: skip if a meeting_prep or stale_followup task exists & open for this deal
      const { data: existing } = await supa
        .from("tasks")
        .select("id")
        .eq("contact_id", contactId)
        .is("done_date", null)
        .ilike("text", `%[stale_deal_watchdog deal_id=${d.id}]%`)
        .limit(1)
        .maybeSingle();
      if (existing) continue;
      const text = `🔔 Relancer le deal "${d.name}" (stage ${d.stage}) — sans activité depuis ${days} jours.\n[stale_deal_watchdog deal_id=${d.id}]`;
      const { data: created, error: terr } = await supa
        .from("tasks")
        .insert({
          contact_id: contactId,
          type: "follow_up",
          text,
          due_date: new Date(Date.now() + 86400_000).toISOString(),
          sales_id: d.sales_id,
        })
        .select("id")
        .single();
      if (!terr && created) taskIds.push((created as { id: number }).id);
    }

    return {
      stale_deals: stale.map((d) => ({
        id: d.id,
        name: d.name,
        stage: d.stage,
        sales_id: d.sales_id,
        days_since_update: Math.floor(
          (Date.now() - new Date(d.updated_at).getTime()) / 86400_000,
        ),
      })),
      task_ids: taskIds,
    };
  },
};
