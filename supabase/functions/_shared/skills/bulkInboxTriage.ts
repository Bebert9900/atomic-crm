import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

const Input = z.object({
  max_emails: z.number().int().min(1).max(50).default(20),
});
const Output = z.object({
  classified: z.array(
    z.object({
      email_id: z.number(),
      category: z.enum([
        "interesting",
        "follow_up",
        "auto_reply",
        "spam",
        "other",
      ]),
      contact_id_linked: z.number().nullable(),
      task_id_created: z.number().nullable(),
      marked_read: z.boolean(),
      rationale: z.string(),
    }),
  ),
  counts: z.object({
    total: z.number(),
    interesting: z.number(),
    follow_up: z.number(),
    auto_reply: z.number(),
    spam: z.number(),
    other: z.number(),
  }),
});

export const bulkInboxTriageSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "bulk_inbox_triage",
  version: "1.0.0",
  model: "claude-sonnet-4-6",
  description:
    "Parcourt les emails non lus : classifie, lie à un contact quand l'email match, crée une tâche de suivi pour les catégories « intéressant » et « relance ». Marque les auto-réponses et spams comme lus.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [
    "search_emails",
    "get_email",
    "search_contacts",
    "link_email_to_contact",
    "mark_email_read",
    "create_task",
  ],
  max_iterations: 18,
  max_writes: 30,
  rate_limit: { per_minute: 1, per_hour: 6 },
  system_prompt: `You triage the unread inbox. Be conservative with writes.

Steps:
1. search_emails(unread=true, limit=max_emails).
2. For each email:
   a. If contact_id is null and from_email looks personal (not no-reply / not @mailgun / not @postmark / not @sendgrid…): search_contacts(query=from_email, limit=2). If a single match → link_email_to_contact. If multiple → leave null, rationale notes ambiguity.
   b. get_email to inspect subject + body excerpt.
   c. Classify:
      - "auto_reply": Out of office, "auto-reply", "do-not-reply", calendar invites, bounce notifications.
      - "spam": cold mass mailing patterns, unsubscribed-list footers, no-reply with promotional content.
      - "interesting": Direct question, request, proposal, contract, real human writing about an existing deal/contact.
      - "follow_up": Polite check-in, "as discussed", "any update?".
      - "other": neutral, not actionable, no clear category.
   d. If category in [auto_reply, spam] → mark_email_read.
   e. If category in [interesting, follow_up] AND contact_id known → create_task on that contact:
      - text="Email: <subject (max 80c)>"
      - type='Follow-up'
      - due_date=today+1d for interesting, today+3d for follow_up
   f. NEVER reply, NEVER forward.

Constraints:
- Skip an email entirely if you cannot get_email (set rationale).
- Hard cap: 30 writes total per run.
- Never delete or move emails.

Return JSON in a \`\`\`json block.`,
};
