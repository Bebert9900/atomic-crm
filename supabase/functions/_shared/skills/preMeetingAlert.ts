import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";
import { makeSupabaseForUser } from "../../agent-runtime/runPersistence.ts";

const Input = z.object({
  appointment_id: z.number().int(),
});
const Output = z.object({
  task_id: z.number().nullable(),
  brief: z.string(),
  appointment_id: z.number(),
  contact_id: z.number().nullable(),
});

export const preMeetingAlertSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "pre_meeting_alert",
  version: "1.0.0",
  model: "claude-sonnet-4-6",
  description:
    "Génère un brief de préparation pour un RDV imminent et le push comme tâche dans le 'My Day' du sales concerné. Déclenchée par le scheduler 30min avant un appointment.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [],
  max_iterations: 0,
  max_writes: 0,
  rate_limit: { per_minute: 30, per_hour: 200 },
  system_prompt: "",
  execute: async (ctx) => {
    const supa = makeSupabaseForUser(ctx.auth.token);
    const { appointment_id } = ctx.input;

    const { data: appt, error: aerr } = await supa
      .from("appointments")
      .select("*")
      .eq("id", appointment_id)
      .maybeSingle();
    if (aerr) throw aerr;
    if (!appt) throw new Error(`appointment ${appointment_id} not found`);

    const contactId: number | null = appt.contact_id ?? null;
    let contactName = "(contact inconnu)";
    let companyName: string | null = null;
    let openDeals: Array<{
      id: number;
      name: string;
      stage: string;
      amount: number | null;
    }> = [];
    let lastNoteText: string | null = null;
    let openTaskTexts: string[] = [];

    if (contactId) {
      const { data: c } = await supa
        .from("contacts")
        .select("first_name,last_name,company_id")
        .eq("id", contactId)
        .maybeSingle();
      if (c) {
        contactName =
          `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || contactName;
        if (c.company_id) {
          const { data: comp } = await supa
            .from("companies")
            .select("name")
            .eq("id", c.company_id)
            .maybeSingle();
          companyName = comp?.name ?? null;

          const { data: deals } = await supa
            .from("deals")
            .select("id,name,stage,amount")
            .eq("company_id", c.company_id)
            .is("archived_at", null)
            .order("updated_at", { ascending: false })
            .limit(5);
          openDeals = (deals ?? []) as typeof openDeals;
        }
      }
      const { data: notes } = await supa
        .from("contact_notes")
        .select("text,date")
        .eq("contact_id", contactId)
        .order("date", { ascending: false })
        .limit(1);
      lastNoteText = notes?.[0]?.text ?? null;

      const { data: tasks } = await supa
        .from("tasks")
        .select("text")
        .eq("contact_id", contactId)
        .is("done_date", null)
        .limit(5);
      openTaskTexts = (tasks ?? []).map((t: { text: string }) => t.text);
    }

    const startStr = new Date(appt.start_at).toLocaleString("fr-FR", {
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    });

    const lines: string[] = [];
    lines.push(`# 🎯 Brief RDV : ${appt.title ?? "Sans titre"}`);
    lines.push(`**Quand** : ${startStr}`);
    if (appt.location) lines.push(`**Lieu** : ${appt.location}`);
    lines.push(
      `**Avec** : ${contactName}${companyName ? ` (${companyName})` : ""}`,
    );
    if (openDeals.length) {
      lines.push(`\n## Deals ouverts`);
      for (const d of openDeals) {
        const amt = d.amount
          ? ` — ${(d.amount / 100).toLocaleString("fr-FR")} €`
          : "";
        lines.push(`- ${d.name} · ${d.stage}${amt}`);
      }
    }
    if (lastNoteText) {
      const excerpt =
        lastNoteText.length > 300
          ? lastNoteText.slice(0, 300) + "…"
          : lastNoteText;
      lines.push(`\n## Dernière note\n${excerpt}`);
    }
    if (openTaskTexts.length) {
      lines.push(`\n## Tâches en cours`);
      for (const t of openTaskTexts) lines.push(`- ${t}`);
    }
    lines.push(
      `\n_Brief auto-généré par l'agent ${new Date().toLocaleString("fr-FR")}._`,
    );
    const brief = lines.join("\n");

    let taskId: number | null = null;
    if (contactId) {
      const { data: created, error: terr } = await supa
        .from("tasks")
        .insert({
          contact_id: contactId,
          type: "meeting_prep",
          text: `🎯 Préparer RDV : ${appt.title ?? "Sans titre"}\n\n${brief}`,
          due_date: appt.start_at,
          sales_id: appt.sales_id,
        })
        .select("id")
        .single();
      if (terr) {
        await ctx.appendStep({
          type: "error",
          message: `task insert failed: ${terr.message}`,
        });
      } else {
        taskId = (created as { id: number }).id;
      }
    }

    return {
      task_id: taskId,
      brief,
      appointment_id,
      contact_id: contactId,
    };
  },
};
