import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

const Input = z.object({
  scope: z.enum(["inbox", "single", "stale"]).default("inbox"),
  dev_task_id: z.number().optional(),
  stale_days: z.number().int().min(1).max(90).default(14),
});
const Output = z.object({
  triaged: z.array(
    z.object({
      id: z.number(),
      changes: z.object({
        priority: z.string().nullable(),
        labels_added: z.array(z.number()),
        assignee_id: z.number().nullable(),
        linked_contact_id: z.number().nullable(),
        linked_company_id: z.number().nullable(),
        linked_deal_id: z.number().nullable(),
      }),
      rationale: z.string(),
    }),
  ),
  skipped: z.array(z.object({ id: z.number(), reason: z.string() })),
});

export const triageDevTasksSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "triage_dev_tasks",
  version: "1.0.0",
  model: "claude-sonnet-4-6",
  description:
    "Triage automatique des dev_tasks : attribue une priorité, suggère des labels, et lie au contact/entreprise/deal quand le titre ou la description en mentionne un. Idempotent — n'écrit que sur les champs vides.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [
    "search_dev_tasks",
    "get_dev_task",
    "list_dev_task_labels",
    "search_contacts",
    "search_companies",
    "search_deals",
    "update_dev_task",
  ],
  max_iterations: 14,
  max_writes: 12,
  rate_limit: { per_minute: 2, per_hour: 15 },
  system_prompt: `You triage internal dev_tasks for a small team.

Scope:
- "inbox" (default): search_dev_tasks(status='backlog', priority='none', limit=20)
- "single": get_dev_task(dev_task_id)
- "stale": search_dev_tasks(status in [todo,in_progress], updated before stale_days ago)

For each task:
1. Read title + description.
2. Priority (set ONLY if currently 'none'):
   - bug-related ("bug", "crash", "regression", "broken") → high
   - blocker mention or production reference → urgent
   - "small", "polish", "nice to have" → low
   - else → medium
3. Labels (call list_dev_task_labels once at start):
   - infer 0..2 matching labels by name (e.g. "frontend", "backend", "api")
   - only add labels that exist in the list
4. Linking (set ONLY if currently null):
   - if title/description names a person/company → search_contacts or search_companies (limit=3)
   - if a deal name appears → search_deals (limit=3)
   - require ≥1 strong signal (exact name) — NEVER guess
5. Assignee: do NOT set unless description literally says "for <name>" and that sales exists. Otherwise leave null.
6. Call update_dev_task ONCE per task with the consolidated patch. Never overwrite a non-default field.
7. If no change is justified, push to skipped[].

Constraints:
- Never change status.
- Never archive.
- Max 12 updates per run.

Return JSON in a \`\`\`json block matching the output schema.`,
};
