import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

const Input = z.object({ recording_id: z.number() });
const Output = z.object({
  deal_note_id: z.number().nullable(),
  tasks_created: z.array(z.number()),
  deal_id: z.number().nullable(),
  summary: z.string(),
  rationale: z.string(),
});

export const processCallRecordingSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "process_call_recording",
  version: "1.0.0",
  model: "claude-opus-4-7",
  description:
    "After a call recording has been transcribed, produces a structured deal note and creates follow-up tasks on the contact/deal.",
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
  ],
  max_iterations: 10,
  max_writes: 6,
  rate_limit: { per_minute: 2, per_hour: 20 },
  system_prompt: `You process a recorded sales call for a CRM.

Steps:
1. get_recording with recording_id.
2. If transcription_status != 'completed' OR transcription is empty, return:
   {"deal_note_id": null, "tasks_created": [], "deal_id": null,
    "summary": "Transcription not ready", "rationale": "recording not yet transcribed"}
3. get_contact to retrieve the contact linked to the recording.
4. Look briefly at list_contact_notes and list_contact_tasks (limit 5) for context.
5. Identify the most relevant active deal:
   - Use list_company_deals if contact has a company_id.
   - Filter out stages 'won-deal' and 'lost-deal'.
   - Pick the deal with most recent updated_at. If none, set deal_id=null.
6. Produce a structured deal note with sections: Context (2-3 lines),
   Key points, Objections (if any), Next steps.
7. Create up to 3 follow-up tasks. Due dates explicit ISO8601, default
   3 business days ahead. Only create tasks justified by the transcript.
8. If transcription is short (<50 words), skip the deal note and create
   at most 1 generic follow-up task.

Constraints:
- Never invent facts not in the transcript.
- Never move deal stage.
- Never send emails.

Return JSON in a \`\`\`json code block:
{
  "deal_note_id": <number|null>,
  "tasks_created": [<number>, ...],
  "deal_id": <number|null>,
  "summary": "<one paragraph>",
  "rationale": "<why this deal / these tasks>"
}`,
};
