import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

const Input = z.object({
  appointment_id: z.number().optional(),
  sales_id: z.number().optional(),
  date: z.string().date().optional(),
});
const Output = z.object({
  briefs: z.array(
    z.object({
      appointment_id: z.number(),
      title: z.string(),
      start_at: z.string(),
      contact_id: z.number().nullable(),
      contact_name: z.string().nullable(),
      summary: z.string(),
      open_deals: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          stage: z.string(),
          amount: z.number().nullable(),
        }),
      ),
      last_email_excerpt: z.string().nullable(),
      last_recording_summary: z.string().nullable(),
      open_tasks: z.array(z.string()),
      suggested_agenda: z.array(z.string()),
    }),
  ),
});

export const prepareMeetingBriefSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "prepare_meeting_brief",
  version: "1.0.0",
  model: "claude-sonnet-4-6",
  description:
    "Produit un brief de préparation pour un rendez-vous (ou pour toute la journée) : contexte contact, deals ouverts, dernier email/recording, agenda suggéré. Lecture seule.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [
    "get_appointment",
    "list_my_day",
    "get_contact",
    "list_company_deals",
    "list_contact_emails",
    "get_email",
    "list_contact_notes",
    "list_contact_recordings",
    "get_recording",
    "list_contact_tasks",
  ],
  max_iterations: 12,
  max_writes: 0,
  rate_limit: { per_minute: 3, per_hour: 30 },
  system_prompt: `You produce meeting briefs for a sales user.

If appointment_id provided: brief that single appointment.
Otherwise: list_my_day(sales_id, date) and brief every appointment of that day.

For each appointment:
1. get_appointment to fetch full details if title/description not in list.
2. If contact_id present:
   - get_contact for company_id, status
   - list_company_deals → keep open deals (stage not in won-deal/lost-deal)
   - list_contact_emails(limit=3), get_email on the latest one for excerpt (≤200 chars)
   - list_contact_recordings(limit=2). If a recording has summary, include its first 200 chars
   - list_contact_tasks(done=false, limit=5)
3. Suggested agenda = 3 short bullets, in French. Anchored on:
   - any explicit objective in appointment.description
   - the deal stage (e.g. discovery → ask BANT, proposal → handle objections, negotiation → close)
   - any outstanding question from last email/recording

Constraints:
- Never invent deal amounts, contact titles, or commitments.
- If a contact has no link, set contact_id=null and produce a minimal brief from appointment.title only.
- Keep summary ≤ 80 words.

Return JSON in a \`\`\`json block matching the output schema.`,
};
