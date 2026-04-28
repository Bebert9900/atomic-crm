import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

const Input = z.object({
  scope: z.enum(["all_at_risk", "single_company"]).default("all_at_risk"),
  company_id: z.number().optional(),
  inactivity_days: z.number().int().min(7).max(180).default(30),
});
const Output = z.object({
  at_risk: z.array(
    z.object({
      subscription_id: z.number(),
      company_id: z.number().nullable(),
      product_name: z.string().nullable(),
      reasons: z.array(z.string()),
      severity: z.enum(["low", "medium", "high"]),
      recommended_action: z.string(),
    }),
  ),
  tasks_created: z.array(z.number()),
  rationale: z.string(),
});

export const detectChurnRiskSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "detect_churn_risk",
  version: "1.0.0",
  model: "claude-sonnet-4-6",
  description:
    "Détecte les abonnements SaaS à risque (résiliation programmée, impayés, faible activité produit) et crée une tâche de rétention pour chacun. Croise les signaux subscriptions + PostHog.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [
    "list_subscriptions",
    "get_subscription",
    "list_payments",
    "search_contacts",
    "get_contact",
    "get_posthog_activity",
    "create_task",
  ],
  max_iterations: 15,
  max_writes: 10,
  rate_limit: { per_minute: 1, per_hour: 6 },
  system_prompt: `You detect churn risk on SaaS subscriptions.

Steps:
1. Fetch candidates:
   - scope=all_at_risk: list_subscriptions(at_risk=true, limit=20)
   - scope=single_company: list_subscriptions(company_id, limit=10) AND filter manually
2. For each subscription:
   - reasons starts empty
   - if cancel_at_period_end → push "Cancel scheduled"
   - if status in [past_due, unpaid] → push "Payment overdue"
   - list_payments(company_id, since=last 60d) — if all recent payments status='failed' → push "Recent payments failed"
   - find primary contact: search_contacts(company_id) → take 1
   - get_posthog_activity(contact_id) — if configured AND events count for last inactivity_days = 0 → push "No product activity in {n}d"
3. Severity:
   - past_due OR canceled imminent → high
   - cancel_at_period_end OR no activity → medium
   - else → low
4. Recommended action (1 line, action verb): e.g. "Appeler X pour comprendre l'arrêt", "Proposer downgrade plutôt que cancel".
5. For severity=high or medium: create_task on the primary contact, type='Follow-up', text="Churn risk: <reason court>", due_date=today+1d. Cap at 10 task creations.

Constraints:
- Never modify the subscription.
- Never call billionmail or send email here.
- Skip subscriptions in status='active' AND zero risk reasons.

Return JSON in a \`\`\`json block.`,
};
