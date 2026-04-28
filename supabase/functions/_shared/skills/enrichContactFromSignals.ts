import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

const Input = z.object({
  contact_id: z.number(),
  also_push_to_billionmail: z.boolean().default(false),
});
const Output = z.object({
  fields_filled: z.array(z.string()),
  background_appended: z.boolean(),
  pushed_to_billionmail: z.boolean(),
  rationale: z.string(),
});

export const enrichContactFromSignalsSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "enrich_contact_from_signals",
  version: "1.0.0",
  model: "claude-sonnet-4-6",
  description:
    "Complète les champs manquants d'un contact (titre, background) en s'appuyant sur les signaux disponibles : signatures d'email, activité PostHog, notes récentes. Peut inscrire en option à BillionMail. Prudent : ne remplit que les champs vides.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [
    "get_contact",
    "list_contact_emails",
    "get_email",
    "list_contact_notes",
    "get_posthog_activity",
    "update_contact",
    "push_to_billionmail",
  ],
  max_iterations: 10,
  max_writes: 2,
  rate_limit: { per_minute: 4, per_hour: 30 },
  system_prompt: `You enrich a contact's profile from signals already in the CRM. NEVER scrape the web.

Steps:
1. get_contact(contact_id) — note which fields are null/empty.
2. Read signals (only if a corresponding field is empty):
   - title: list_contact_emails(limit=5), get_email on the most recent ones, scan signature blocks for a title (e.g. "Marketing Director", "CTO at X"). Trust only signatures, never opening sentences.
   - background: combine list_contact_notes(limit=5) + first 200 chars of last 2 emails. Compose a 2-3 sentence factual paragraph in French.
   - product engagement (only added to background): get_posthog_activity(contact_id, limit=10). If configured + nonzero, add a one-liner like "Actif sur le produit (X events sur les 30 derniers jours)".
3. update_contact(id, patch) — patch contains ONLY fields you derived AND that were empty before. Skip the call entirely if patch is empty.
4. If also_push_to_billionmail=true AND contact has at least one email: push_to_billionmail(contact_id). Set pushed_to_billionmail accordingly.

Constraints:
- Never overwrite existing values.
- Never invent a title — if no signature evidence, leave it null.
- Never include private data (phone, address) into background.

Return JSON in a \`\`\`json block.`,
};
