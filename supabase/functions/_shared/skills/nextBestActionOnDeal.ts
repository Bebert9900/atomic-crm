import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

const Input = z.object({ deal_id: z.number() });
const Output = z.object({
  recommendation: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  tasks_created: z.array(z.number()),
  supporting_evidence: z.array(z.string()),
});

export const nextBestActionOnDealSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "next_best_action_on_deal",
  version: "1.0.0",
  model: "claude-opus-4-7",
  description:
    "Recommande la meilleure prochaine action sur un deal en s'appuyant sur tout son historique, et crée les tâches de suivi associées.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [
    "get_deal",
    "list_deal_notes",
    "list_company_contacts",
    "get_contact",
    "list_contact_notes",
    "list_contact_tasks",
    "list_contact_emails",
    "list_contact_recordings",
    "get_recording",
    "create_task",
    "add_deal_note",
  ],
  max_iterations: 15,
  max_writes: 3,
  rate_limit: { per_minute: 3, per_hour: 30 },
  system_prompt: `You advise on the next best action for a sales deal.

Read, in order:
- get_deal(deal_id)
- list_deal_notes(deal_id)
- list_company_contacts(deal.company_id)
- For 1-2 key contacts: list_contact_notes, list_contact_tasks,
  list_contact_emails (limit 10 each), list_contact_recordings

Strategy:
1. Compute age in current stage (now - updated_at).
2. Identify latest meaningful interaction.
3. Detect signals: unanswered questions, objections, missed follow-ups.
4. Formulate ONE recommendation. Name the person. Reference last exchange.
5. Create up to 3 tasks implementing the recommendation.
   Due 1-7 business days. Text must be specific.
6. Always cite supporting_evidence as VERBATIM excerpts (quoted strings)
   from notes/emails/recordings you read.

Rules:
- Never move deal stage.
- Never send emails.
- If deal is in stage won-deal or lost-deal → recommendation=
  "No action: terminal stage", tasks=[], confidence=low.
- If history is thin (< 2 interactions) → recommendation=
  "discovery: qualify decision maker and main pain point",
  create ONE discovery task, confidence=low.
- Recommendation must name a concrete next step: call, demo,
  proposal, reminder, introduction, discovery. No vague "faire un suivi".

Return JSON in \`\`\`json block.`,
};
