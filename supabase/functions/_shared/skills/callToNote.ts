import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";
import { makeSupabaseForUser } from "../../agent-runtime/runPersistence.ts";

const Input = z.object({
  recording_id: z.number().int(),
});
const Output = z.object({
  note_id: z.number().nullable(),
  recording_id: z.number(),
  contact_id: z.number().nullable(),
});

export const callToNoteSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "call_to_note",
  version: "1.0.0",
  model: "claude-sonnet-4-6",
  description:
    "Convertit une transcription d'appel terminée en note sur le contact (résumé + sentiment + warmth). Déclenchée par DB trigger sur contact_recordings.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [],
  max_iterations: 0,
  max_writes: 0,
  rate_limit: { per_minute: 30, per_hour: 200 },
  system_prompt: "",
  execute: async (ctx) => {
    const supa = makeSupabaseForUser(ctx.auth.token);
    const { recording_id } = ctx.input;

    const { data: rec, error } = await supa
      .from("contact_recordings")
      .select("*")
      .eq("id", recording_id)
      .maybeSingle();
    if (error) throw error;
    if (!rec) throw new Error(`recording ${recording_id} not found`);
    const r = rec as {
      id: number;
      contact_id: number;
      summary: string | null;
      sentiment: string | null;
      warmth_label: string | null;
      warmth_score: number | null;
      duration_seconds: number | null;
      transcription_status: string | null;
      sales_id: number | null;
    };
    if (
      r.transcription_status !== "ready" &&
      r.transcription_status !== "completed"
    ) {
      return { note_id: null, recording_id, contact_id: r.contact_id };
    }
    if (!r.summary) {
      return { note_id: null, recording_id, contact_id: r.contact_id };
    }

    // Dedupe: skip if a note already references this recording
    const marker = `[call_to_note recording_id=${recording_id}]`;
    const { data: existing } = await supa
      .from("contact_notes")
      .select("id")
      .eq("contact_id", r.contact_id)
      .ilike("text", `%${marker}%`)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return {
        note_id: (existing as { id: number }).id,
        recording_id,
        contact_id: r.contact_id,
      };
    }

    const lines: string[] = [];
    lines.push(`# 📞 Compte-rendu d'appel`);
    if (r.duration_seconds) {
      const m = Math.floor(r.duration_seconds / 60);
      const s = r.duration_seconds % 60;
      lines.push(`**Durée** : ${m}min${s.toString().padStart(2, "0")}s`);
    }
    if (r.warmth_label) {
      lines.push(
        `**Chaleur** : ${r.warmth_label}${r.warmth_score !== null ? ` (${r.warmth_score}/10)` : ""}`,
      );
    }
    if (r.sentiment) lines.push(`**Sentiment** : ${r.sentiment}`);
    lines.push(`\n## Résumé\n${r.summary}`);
    lines.push(`\n${marker}`);
    const noteText = lines.join("\n");

    const { data: created, error: ierr } = await supa
      .from("contact_notes")
      .insert({
        contact_id: r.contact_id,
        text: noteText,
        date: new Date().toISOString(),
        sales_id: r.sales_id,
        status: null,
      })
      .select("id")
      .single();
    if (ierr) throw ierr;
    return {
      note_id: (created as { id: number }).id,
      recording_id,
      contact_id: r.contact_id,
    };
  },
};
