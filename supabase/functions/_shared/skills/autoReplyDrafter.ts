import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";
import { makeSupabaseForUser } from "../../agent-runtime/runPersistence.ts";

const Input = z.object({
  hours_overdue: z.number().int().min(1).max(72).default(4),
  limit: z.number().int().min(1).max(50).default(20),
});
const Output = z.object({
  candidates: z.array(
    z.object({
      email_id: z.number(),
      from_email: z.string().nullable(),
      subject: z.string().nullable(),
      contact_id: z.number().nullable(),
      hours_overdue: z.number(),
    }),
  ),
  task_ids: z.array(z.number()),
});

export const autoReplyDrafterSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "auto_reply_drafter",
  version: "1.0.0",
  model: "claude-sonnet-4-6",
  description:
    "Identifie les emails entrants non lus depuis >N heures et crée une tâche de réponse pour le sales en charge du contact. Cron horaire.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [],
  max_iterations: 0,
  max_writes: 0,
  rate_limit: { per_minute: 5, per_hour: 60 },
  system_prompt: "",
  execute: async (ctx) => {
    const supa = makeSupabaseForUser(ctx.auth.token);
    const { hours_overdue, limit } = ctx.input;
    const cutoff = new Date(
      Date.now() - hours_overdue * 3600_000,
    ).toISOString();

    const { data: emails, error } = await supa
      .from("email_messages")
      .select("id,from_email,subject,date,contact_id,sales_id,folder,is_read")
      .ilike("folder", "%inbox%")
      .eq("is_read", false)
      .lt("date", cutoff)
      .order("date", { ascending: true })
      .limit(limit);
    if (error) throw error;

    const candidates = (emails ?? []) as Array<{
      id: number;
      from_email: string | null;
      subject: string | null;
      date: string;
      contact_id: number | null;
      sales_id: number | null;
    }>;
    const taskIds: number[] = [];

    for (const e of candidates) {
      if (!e.contact_id) continue;
      // Dedupe by email_id marker
      const marker = `[auto_reply_drafter email_id=${e.id}]`;
      const { data: existing } = await supa
        .from("tasks")
        .select("id")
        .eq("contact_id", e.contact_id)
        .is("done_date", null)
        .ilike("text", `%${marker}%`)
        .limit(1)
        .maybeSingle();
      if (existing) continue;

      const hoursLate = Math.floor(
        (Date.now() - new Date(e.date).getTime()) / 3600_000,
      );
      const text = `📧 Répondre à : "${e.subject ?? "(sans sujet)"}" de ${e.from_email ?? "expéditeur inconnu"} — non répondu depuis ${hoursLate}h.\n${marker}`;
      const { data: created, error: terr } = await supa
        .from("tasks")
        .insert({
          contact_id: e.contact_id,
          type: "email",
          text,
          due_date: new Date(Date.now() + 3600_000 * 4).toISOString(),
          sales_id: e.sales_id,
        })
        .select("id")
        .single();
      if (!terr && created) taskIds.push((created as { id: number }).id);
    }

    return {
      candidates: candidates.map((e) => ({
        email_id: e.id,
        from_email: e.from_email,
        subject: e.subject,
        contact_id: e.contact_id,
        hours_overdue: Math.floor(
          (Date.now() - new Date(e.date).getTime()) / 3600_000,
        ),
      })),
      task_ids: taskIds,
    };
  },
};
