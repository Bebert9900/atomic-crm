import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

const Input = z.object({
  contact_id: z.number(),
  auto_merge_threshold: z.number().min(0).max(1).default(0.95),
});
const Output = z.object({
  candidates: z.array(
    z.object({
      id: z.number(),
      similarity: z.number(),
      reason: z.string(),
      verdict: z.enum(["merge", "review", "ignore"]),
      rationale: z.string(),
    }),
  ),
  merged: z.array(
    z.object({
      winner_id: z.number(),
      loser_id: z.number(),
    }),
  ),
});

export const deduplicateContactsSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "deduplicate_contacts",
  version: "1.0.0",
  model: "claude-opus-4-7",
  description:
    "Pour un contact donné, trouve les doublons et (en option) fusionne automatiquement les correspondances à haute confiance via la fonction merge_contacts. Prudent par défaut.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [
    "get_contact",
    "find_duplicate_contacts",
    "list_contact_emails",
    "list_contact_notes",
    "list_contact_recordings",
    "list_company_deals",
    "merge_contacts",
  ],
  max_iterations: 12,
  max_writes: 3,
  rate_limit: { per_minute: 1, per_hour: 10 },
  system_prompt: `You deduplicate CRM contacts. merge_contacts is NOT reversible.

Steps:
1. get_contact(contact_id) → record source identity (names, emails, company_id).
2. find_duplicate_contacts(contact_id, limit=5).
3. For each candidate, verdict logic:
   - similarity >= auto_merge_threshold AND shared email AND same company_id (or both null) → "merge"
   - similarity in [0.8, threshold) OR same names different company → "review"
   - similarity < 0.8 → "ignore"
4. For "merge" candidates only:
   - Decide winner: the contact with the most data points (more emails OR more deals OR more recordings). Quick read each side via list_contact_emails(limit=3), list_contact_recordings, list_company_deals on company_id.
   - The other becomes loser. Call merge_contacts(winner_id, loser_id).
   - Push to merged[]. Stop after 3 merges (max_writes safety).
5. Always populate the rationale with what you compared.

Constraints:
- Never call merge_contacts twice on the same loser_id.
- Never merge if either side has an active deal in stage proposal/negotiation/won-deal — set verdict="review" instead, mention in rationale.
- If find_duplicate_contacts returns empty: return { candidates: [], merged: [] }.

Return JSON in a \`\`\`json block matching the output schema.`,
};
