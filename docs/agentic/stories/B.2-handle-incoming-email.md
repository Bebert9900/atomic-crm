# Story B.2 — Skill `handle_incoming_email`

**Epic**: B. Skills v1
**Status**: Ready
**Estimation**: 8h
**Depends on**: A.1..A.5, B.1 (valide le pattern)
**Blocks**: —

## Contexte business

Le sync IMAP arrose `email_messages`, souvent sans `contact_id` (expéditeur non reconnu). Ce skill analyse un email entrant non lié, tente de matcher/créer un contact, lie l'email, crée les tasks de suivi pertinentes, et rattache à un deal existant si le contenu l'indique.

## Contexte technique

- Trigger : peut être déclenché manuellement (bouton sur l'email) en v1, par trigger DB/cron en v1.1
- Le skill est **idempotent** : si l'email a déjà un `contact_id`, il ne fait que proposer de nouvelles tasks (pas de duplication)
- Ne renvoie **pas** d'email automatiquement (hors scope v1)

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `supabase/functions/_shared/skills/handleIncomingEmail.ts` | Créer |
| `supabase/functions/_shared/skills/index.ts` | Register |
| `src/components/atomic-crm/contacts/ContactEmails.tsx` | Ajouter bouton Launcher |
| `src/components/atomic-crm/dashboard/UnreadEmailsList.tsx` | Ajouter bouton par email non lié |

## Manifest

```ts
import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

const Input = z.object({ email_id: z.number() });
const Output = z.object({
  contact_id: z.number(),
  contact_created: z.boolean(),
  email_linked: z.boolean(),
  deal_id: z.number().nullable(),
  tasks_created: z.array(z.number()),
  classification: z.enum([
    "lead_inbound","existing_customer_request","existing_customer_update",
    "internal","unrelated","spam",
  ]),
  rationale: z.string(),
});

export const handleIncomingEmailSkill: SkillManifest<
  z.infer<typeof Input>, z.infer<typeof Output>
> = {
  id: "handle_incoming_email",
  version: "1.0.0",
  model: "claude-opus-4-7",
  description:
    "Processes an incoming email: classifies it, finds or creates the related contact, links the email, and creates follow-up tasks.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [
    "get_email", "search_contacts", "get_contact",
    "search_companies", "get_company",
    "list_contact_tasks", "list_contact_emails",
    "search_deals", "get_deal",
    "create_contact", "update_contact",
    "link_email_to_contact", "mark_email_read",
    "create_task", "apply_tag", "list_tags",
  ],
  max_iterations: 12,
  max_writes: 6,
  rate_limit: { per_minute: 5, per_hour: 100 },
  system_prompt: `You are a CRM agent that handles incoming emails for a sales team.

Steps:
1. get_email with the given email_id. Read from, subject, body excerpt.
2. Try to find the sender as an existing contact via search_contacts (email substring match, then full name).
3. If not found, decide whether to create a contact:
   - Create if the email looks like a lead, a business inquiry, a customer message.
   - Do NOT create for: automated notifications, newsletters, internal emails to yourself, obvious spam.
4. If a contact is identified or created, link the email to them via link_email_to_contact.
5. Classify the email into one of:
   lead_inbound | existing_customer_request | existing_customer_update | internal | unrelated | spam.
6. If the email mentions an ongoing deal/project, search_deals on the contact's company to identify the deal_id. Do not create a deal.
7. Create follow-up tasks based on classification:
   - lead_inbound: 1 task "Qualify lead" due in 1 business day
   - existing_customer_request: 1 task "Respond to request" due today
   - existing_customer_update: 1 task "Review update" due in 2 business days
   - internal / unrelated / spam: no tasks
8. Mark the email read at the end.

Rules:
- Never send an email.
- Never invent company, deal, or contact attributes not in the email body.
- Max 2 tasks total.
- If classification is spam and no contact was matched, skip link_email_to_contact and return contact_id = 0 with contact_created=false, email_linked=false. (return 0 is a sentinel; the output_schema must still pass — adjust so contact_id is nullable).

Return final JSON matching the schema, wrapped in a \`\`\`json block.`,
};
```

> Note : l'output_schema doit refléter la possibilité `contact_id=null` pour le cas spam. Ajuster avec `contact_id: z.number().nullable()`.

## Intégration UI

Dans `UnreadEmailsList.tsx`, pour les emails sans `contact_id` :
```tsx
<SkillLauncher
  skill_id="handle_incoming_email"
  input={{ email_id: email.id }}
  label="Triage"
  variant="ghost"
  invalidateOnDone={["email_messages","tasks","contacts"]}
/>
```

## Tests

- **Lead inbound d'un inconnu** → contact créé, email lié, 1 task "Qualify lead"
- **Email d'un client existant** (`search_contacts` match) → pas de create, email lié, 1 task
- **Newsletter automatique** (from: no-reply@) → classified `spam`, aucun contact créé ni lié, 0 task
- **Email interne** (from: un des sales.email) → classified `internal`, aucun write sauf mark_read
- **Email déjà lié** → aucun create ni link, classification retournée
- **Plusieurs emails consécutifs même expéditeur** → pas de duplication de contact (vérifier search_contacts + dedup)

## Critères d'acceptation

- [ ] Les 6 cas de test ci-dessus passent
- [ ] Zéro doublon de contact créé sur 100 emails test
- [ ] `email_linked=true` implique `mark_email_read` appelé
- [ ] Coût médian par run < 0.04 USD
- [ ] Latence P95 < 15s
- [ ] Shadow mode initial obligatoire (50 runs min avant promotion)

## Risques / pièges

- Les faux positifs "create contact" sont coûteux en nettoyage → mieux vaut pecher par sous-création
- Les bots de rebond (bounces, auto-reply) peuvent tromper l'agent → tester au moins 5 cas de auto-reply
- Les emails multi-adresses (cc/bcc multiples) : l'agent doit se concentrer sur `from_email` seulement pour le contact principal
- Attention à la clause spam + contact_id : le schéma doit accepter null

## Done

- Commit : `feat(agentic): add handle_incoming_email skill`
- Intégration dans UnreadEmailsList visible sur dashboard
- Doc d'usage ajoutée à `docs/agentic/skills/handle_incoming_email.md` (optionnel)
