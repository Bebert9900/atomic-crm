import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

const Input = z.object({
  recording_id: z.number(),
  refine_insights: z.boolean().default(true),
});
const Output = z.object({
  deal_note_id: z.number().nullable(),
  tasks_created: z.array(z.number()),
  deal_id: z.number().nullable(),
  summary: z.string(),
  sentiment: z.string().nullable(),
  warmth_score: z.number().nullable(),
  warmth_label: z.string().nullable(),
  email_draft: z.string().nullable(),
  sms_draft: z.string().nullable(),
  insights_written: z.boolean(),
  rationale: z.string(),
});

export const processCallRecordingSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "process_call_recording",
  version: "2.0.0",
  model: "claude-opus-4-7",
  description:
    "Une fois l'enregistrement d'appel transcrit, produit une note de deal structurée, des tâches de suivi, un score de sentiment + chaleur, et des brouillons d'email/SMS prêts à envoyer. Met à jour les insights sur le recording lui-même.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [
    "get_recording",
    "get_transcription",
    "get_contact",
    "list_contact_tasks",
    "list_contact_notes",
    "search_deals",
    "get_deal",
    "list_company_deals",
    "add_deal_note",
    "create_task",
    "update_contact",
    "update_recording_insights",
  ],
  max_iterations: 12,
  max_writes: 8,
  rate_limit: { per_minute: 2, per_hour: 20 },
  system_prompt: `You process a recorded sales call.

Steps:
1. get_recording with recording_id.
2. If transcription_status != 'completed' OR transcription is empty: return early
   {"deal_note_id": null, "tasks_created": [], "deal_id": null,
    "summary": "Transcription not ready", "sentiment": null,
    "warmth_score": null, "warmth_label": null, "email_draft": null,
    "sms_draft": null, "insights_written": false,
    "rationale": "recording not yet transcribed"}
3. get_contact for the contact linked to the recording.
4. Read briefly: list_contact_notes(limit=5), list_contact_tasks(limit=5).
5. Identify the most relevant active deal:
   - If contact has company_id → list_company_deals
   - Filter out stages 'won-deal' and 'lost-deal'
   - Pick most recent updated_at, else null
6. Produce a structured deal note with sections: Context (2-3 lines),
   Key points, Objections, Next steps. Skip if transcription < 50 words
   (just create at most 1 generic follow-up task).
7. Score the call:
   - sentiment ∈ {Positif, Neutre, Hésitant, Négatif, Froid}
   - warmth_score 0..100 (0 = not interested, 100 = ready to sign)
   - warmth_label ∈ {Glacé, Froid, Tiède, Chaud, Brûlant}
8. Draft (only if warmth_score >= 40):
   - email_draft (FR if call is in FR, ≤150 words, plain text, one clear next step)
   - sms_draft (FR, ≤300 chars, friendly, no link unless explicitly mentioned)
9. If refine_insights=true:
   - call update_recording_insights with summary, sentiment, warmth_score,
     warmth_label, email_advice (= email_draft), sms_advice (= sms_draft)
   - only include fields you actually computed
   - set insights_written=true on success
10. Create up to 3 follow-up tasks (ISO due dates, default +3 business days).
    Only create tasks justified by the transcript.

Constraints:
- Never invent facts not in the transcript.
- Never move deal stage.
- Never send emails or SMS — only draft.
- If existing email_advice/sms_advice are non-empty and refine_insights=false, do NOT overwrite.

Return JSON in a \`\`\`json code block matching the output schema.`,
};
