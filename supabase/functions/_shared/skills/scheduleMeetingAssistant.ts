import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

const Input = z.object({
  contact_id: z.number(),
  sales_id: z.number(),
  duration_minutes: z.number().int().min(15).max(180).default(30),
  preferred_window: z
    .object({
      start: z.string().datetime(),
      end: z.string().datetime(),
    })
    .optional(),
  topic_hint: z.string().max(500).optional(),
  email_account_id: z.number().optional(),
  send_invite: z.boolean().default(false),
});
const Output = z.object({
  proposed_slots: z.array(
    z.object({ start_at: z.string(), end_at: z.string() }),
  ),
  appointment_id: z.number().nullable(),
  invite_sent: z.boolean(),
  email_subject: z.string().nullable(),
  email_body: z.string().nullable(),
  rationale: z.string(),
});

export const scheduleMeetingAssistantSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "schedule_meeting_assistant",
  version: "1.0.0",
  model: "claude-sonnet-4-6",
  description:
    "Propose 3 créneaux libres pour un rendez-vous avec un contact, et peut créer l'appointment + envoyer le mail d'invitation. Prudent : n'envoie que si send_invite=true.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [
    "get_contact",
    "find_free_slots",
    "create_appointment",
    "list_email_accounts",
    "send_email",
  ],
  max_iterations: 10,
  max_writes: 2,
  rate_limit: { per_minute: 3, per_hour: 30 },
  system_prompt: `You assist a sales user in scheduling a meeting.

Steps:
1. get_contact(contact_id) → name, primary email.
2. Determine search window:
   - If preferred_window provided, use it.
   - Else: from now+24h to now+10 working days (≈14 calendar days), 09:00–18:00 UTC.
3. find_free_slots(sales_id, range_start, range_end, duration_minutes). Take the first 3 distinct slots, prefer Tue/Wed/Thu.
4. Build the email:
   - Subject: "Proposition de créneau — <topic if provided else generic>"
   - Body (FR by default, plain text, ≤120 words): greet by first_name, propose 3 slots in human format
     ("mardi 14 mai à 14:00 (UTC)"), ask which works, end with a sober sign-off.
5. If send_invite=true:
   - Pick email_account_id from input or list_email_accounts (first owned by sales)
   - Pick recipient: first email of contact.email_jsonb
   - send_email with subject + body. NO appointment created at this step (wait for confirmation).
6. If send_invite=false:
   - Optionally create_appointment for the FIRST proposed slot tagged status='proposed' (so it shows on the calendar). Skip if you cannot determine a sensible title.

Constraints:
- Never create more than 1 appointment per run.
- Never send if no recipient email.
- If find_free_slots returns 0 slots: set proposed_slots=[], rationale explains why, no email sent.

Return JSON in a \`\`\`json block.`,
};
