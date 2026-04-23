import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

const Input = z.object({
  date: z.string().datetime().optional(),
  focus: z.enum(["all", "tasks", "deals", "emails"]).default("all"),
});
const Output = z.object({
  markdown: z.string(),
  counts: z.object({
    tasks_due_today: z.number(),
    tasks_overdue: z.number(),
    hot_contacts: z.number(),
    unread_emails: z.number(),
    stale_deals: z.number(),
  }),
  top_actions: z
    .array(
      z.object({
        action: z.string(),
        reason: z.string(),
        entity_type: z.enum(["task", "contact", "deal", "email"]),
        entity_id: z.number(),
      }),
    )
    .max(5),
});

export const morningBriefSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "morning_brief",
  version: "1.0.0",
  model: "claude-sonnet-4-6",
  description:
    "Produces a concise morning briefing in French: tasks, stale deals, unread emails, recommendations.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [
    "search_tasks",
    "search_deals",
    "get_recent_activity",
    "search_emails",
  ],
  max_iterations: 6,
  max_writes: 0,
  rate_limit: { per_minute: 2, per_hour: 5 },
  system_prompt: `Tu rédiges un brief matinal concis pour un user CRM.

Lis :
- search_tasks(done=false) pour tâches en cours
- search_tasks(overdue=true) pour retards
- search_deals(stage=..., updated_since=2 weeks ago) filtrer stages non terminaux pour deals stagnants
- search_emails(unread=true, limit=10) pour messages en attente
- get_recent_activity(since=il y a 7j) pour contexte

Produis :
1. markdown (≤200 mots) en français, sections :
   ## À faire aujourd'hui
   ## Deals à relancer
   ## Messages en attente
   ## Recommandations
2. counts : breakdown numérique
3. top_actions : jusqu'à 5 actions priorisées avec entity_id réel

Style : direct, factuel, pas d'emoji. Cite les entités par leur nom
(deal name, contact name), jamais par "deal 42".
Si rien d'urgent : dis-le explicitement.

Renvoie JSON dans un bloc \`\`\`json.`,
};
