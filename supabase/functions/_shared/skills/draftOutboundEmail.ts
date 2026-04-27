import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

const Input = z.object({
  contact_id: z.number(),
  intent: z.enum([
    "follow_up",
    "reply_to_last",
    "intro",
    "nudge_quiet_deal",
    "schedule_meeting",
    "send_proposal_recap",
  ]),
  in_reply_to_email_id: z.number().optional(),
  notes_for_agent: z.string().max(2000).optional(),
  send: z.boolean().default(false),
  email_account_id: z.number().optional(),
});

const Output = z.object({
  drafted: z.boolean(),
  sent: z.boolean(),
  subject: z.string(),
  text_body: z.string(),
  rationale: z.string(),
  message_id: z.string().nullable(),
});

export const draftOutboundEmailSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "draft_outbound_email",
  version: "1.0.0",
  model: "claude-sonnet-4-6",
  description:
    "Rédige un email sortant contextualisé pour un contact (relance, réponse, intro, nudge). Renvoie le brouillon. N'envoie que si send=true et email_account_id est fourni.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [
    "get_contact",
    "list_contact_emails",
    "list_contact_notes",
    "list_contact_recordings",
    "list_company_deals",
    "search_deals",
    "get_deal",
    "list_email_accounts",
    "draft_email_reply",
    "send_email",
  ],
  max_iterations: 10,
  max_writes: 1,
  rate_limit: { per_minute: 4, per_hour: 60 },
  system_prompt: `You draft a professional outbound email to a CRM contact.

Steps:
1. get_contact(contact_id) for name, title, company.
2. list_contact_emails(limit=10) to read tone + last exchange. If in_reply_to_email_id provided, base reply on that thread.
3. list_contact_notes(limit=5) and list_contact_recordings for ground truth on relationship.
4. If contact has company_id, list_company_deals — pick the active deal (not won/lost) most recently updated.
5. Compose:
   - Subject: short, specific, no clickbait. For replies: keep "Re:" prefix.
   - Body: plain text, 80-150 words, French if all prior emails are in French else English.
   - Open with a concrete reference to the last interaction. Avoid generic openers.
   - One clear ask or next step. No multi-question dumps.
   - Sign off naturally; do not invent a sender name (the SMTP layer adds it).
6. Validate: never invent prices, deadlines, or commitments not present in notes/emails/deal.
7. Always call draft_email_reply with the final subject + text_body to record the trace, even when send=false.
8. If send=true:
   - require email_account_id (input or list_email_accounts to pick first owned by current user)
   - require a recipient: pick the first email from the contact's email_jsonb
   - call send_email with that account, recipient, subject, text_body
   - if in_reply_to_email_id present, find the original message-id (from get_email if needed) and pass in_reply_to
9. Never send if confidence is low (e.g. no recent context, or proposal recap without a deal). In that case set sent=false and explain in rationale.

Return JSON in a \`\`\`json block:
{
  "drafted": true,
  "sent": <bool>,
  "subject": "...",
  "text_body": "...",
  "rationale": "<why this content, what context anchored it>",
  "message_id": <string|null>
}`,
};
