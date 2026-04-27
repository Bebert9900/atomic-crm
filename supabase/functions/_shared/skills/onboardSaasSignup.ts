import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

const Input = z.object({
  email: z.string().email(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company_name: z.string().optional(),
  stripe_customer_id: z.string().optional(),
  product_name: z.string().optional(),
  send_welcome: z.boolean().default(false),
  email_account_id: z.number().optional(),
});
const Output = z.object({
  contact_id: z.number().nullable(),
  company_id: z.number().nullable(),
  deal_id: z.number().nullable(),
  followup_task_id: z.number().nullable(),
  welcome_sent: z.boolean(),
  rationale: z.string(),
});

export const onboardSaasSignupSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "onboard_saas_signup",
  version: "1.0.0",
  model: "claude-sonnet-4-6",
  description:
    "Déclenché après un signup SaaS (webhook Stripe) : crée le contact + l'entreprise + un deal d'onboarding + une tâche de suivi à J+3. Peut envoyer un mail de bienvenue.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [
    "search_contacts",
    "search_companies",
    "create_contact",
    "create_task",
    "search_deals",
    "list_email_accounts",
    "send_email",
  ],
  max_iterations: 10,
  max_writes: 4,
  rate_limit: { per_minute: 5, per_hour: 60 },
  system_prompt: `You onboard a fresh SaaS signup into the CRM.

Steps:
1. Idempotency: search_contacts(query=email, limit=5). If a contact with this email already exists, set contact_id and SKIP creation.
2. If new contact: create_contact with first_name, last_name, email_jsonb=[{email, type:'Work'}], lead_source='other', background='Self-signed up via SaaS'. company_id stays null unless step 3 finds one.
3. If company_name provided: search_companies(query=company_name, limit=3). If exact-ish match exists, capture company_id. Do NOT create the company in v1.
4. Create a follow-up task on the contact with type='Follow-up', text="Onboarding J+3 — vérifier activation, proposer démo si bloqué", due_date = today+3 days (skip weekends).
5. If send_welcome=true:
   - Pick email_account_id (input or list_email_accounts first one)
   - Compose welcome email FR, ≤120 words: bienvenue, lien d'accès au produit (NE PAS inventer d'URL — dis "lien envoyé séparément"), proposer un créneau de démo, sign-off.
   - send_email
6. deal_id stays null in v1 (deals are created by sales after first contact, not auto).

Constraints:
- Never create duplicate contacts.
- Never invent URLs, prices, or features.
- Idempotent: re-running with same email must not create new tasks if one already exists for "Onboarding J+3" today.

Return JSON in a \`\`\`json block.`,
};
