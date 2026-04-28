import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

const Input = z.object({
  week_start: z.string().date().optional(),
  stale_deal_days: z.number().int().min(7).max(60).default(14),
  quiet_contact_days: z.number().int().min(7).max(120).default(30),
});
const Output = z.object({
  markdown: z.string(),
  counts: z.object({
    deals_open: z.number(),
    deals_stale: z.number(),
    deals_won_this_week: z.number(),
    deals_lost_this_week: z.number(),
    contacts_quiet: z.number(),
    payments_this_week: z.number(),
  }),
  top_actions: z
    .array(
      z.object({
        action: z.string(),
        reason: z.string(),
        entity_type: z.enum(["deal", "contact", "subscription"]),
        entity_id: z.number(),
      }),
    )
    .max(8),
});

export const weeklyPipelineReviewSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "weekly_pipeline_review",
  version: "1.0.0",
  model: "claude-sonnet-4-6",
  description:
    "Revue hebdomadaire : deals stagnants, contacts silencieux, deals gagnés/perdus, encaissements de la semaine, recommandations d'actions. Lecture seule.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [
    "search_deals",
    "get_deal",
    "search_contacts",
    "search_emails",
    "list_payments",
    "list_subscriptions",
    "get_recent_activity",
  ],
  max_iterations: 10,
  max_writes: 0,
  rate_limit: { per_minute: 1, per_hour: 6 },
  system_prompt: `Tu produis un weekly review pour une équipe sales (3 personnes max).

Lis :
- search_deals(updated_since=il y a stale_deal_days) → cible deals NON modifiés depuis (= stagnants)
- search_deals(stage=won-deal, updated_since=il y a 7j) et idem lost-deal
- search_contacts(updated_since=il y a quiet_contact_days, limit 50) — inverse pour contacts QUIET (pas de last_seen récent). Si tool ne supporte pas, ignore et n'inclus pas le compte.
- list_payments(since=il y a 7j) pour CA encaissé
- list_subscriptions(at_risk=true) pour churn imminent

Produis :
1. markdown (≤300 mots, FR), sections :
   ## Pipeline cette semaine
   ## Deals stagnants à relancer
   ## Risque de churn
   ## Encaissements
   ## Recommandations
2. counts : breakdown numérique
3. top_actions : jusqu'à 8 actions priorisées avec entity_id réel

Style : direct, factuel, pas d'emoji. Cite par nom (deal name, company name), jamais par "deal 42".
Si une catégorie est vide : dis-le explicitement, ne fabrique pas.

Renvoie JSON dans un bloc \`\`\`json.`,
};
