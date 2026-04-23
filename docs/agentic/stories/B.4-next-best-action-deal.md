# Story B.4 — Skill `next_best_action_on_deal`

**Epic**: B. Skills v1
**Status**: Ready
**Estimation**: 6h
**Depends on**: A.1..A.5
**Blocks**: —

## Contexte business

Sur une fiche deal, bouton qui lit tout l'historique (notes, emails liés aux contacts, tasks, recordings) et recommande la prochaine action concrète. Peut créer 1 à 3 tasks pré-remplies.

## Contexte technique

- Skill avec volume de lecture potentiellement élevé → attention aux tokens. Troncature agressive dans les tools.
- Modèle Opus (raisonnement complexe sur historique riche)

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `supabase/functions/_shared/skills/nextBestActionOnDeal.ts` | Créer |
| `supabase/functions/_shared/skills/index.ts` | Register |
| `src/components/atomic-crm/deals/DealShow.tsx` | Ajouter bouton |

## Manifest

```ts
import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

const Input = z.object({ deal_id: z.number() });
const Output = z.object({
  recommendation: z.string(),                // 2-4 lignes
  confidence: z.enum(["low","medium","high"]),
  tasks_created: z.array(z.number()),
  supporting_evidence: z.array(z.string()),  // citations précises de notes/emails
});

export const nextBestActionOnDealSkill: SkillManifest<
  z.infer<typeof Input>, z.infer<typeof Output>
> = {
  id: "next_best_action_on_deal",
  version: "1.0.0",
  model: "claude-opus-4-7",
  description: "Recommends the next action on a deal based on its full history, and creates follow-up tasks.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [
    "get_deal", "list_deal_notes",
    "list_company_contacts", "get_contact",
    "list_contact_notes", "list_contact_tasks",
    "list_contact_emails", "list_contact_recordings",
    "get_recording",
    "create_task", "add_deal_note",
  ],
  max_iterations: 15,
  max_writes: 3,
  rate_limit: { per_minute: 3, per_hour: 30 },
  system_prompt: `You advise on the next best action for a sales deal.

Inputs you will read:
- The deal (stage, amount, dates)
- Deal notes
- Contacts linked via the deal's company
- Notes, tasks, emails, recordings on each contact (focus on newest)

Strategy:
1. Identify the stage and compute how long it has been in that stage (use updated_at vs now).
2. Identify the latest meaningful interaction (note, email, recording).
3. Detect signals: unanswered questions, objections, missed follow-ups, go/no-go signals.
4. Formulate a single recommendation (not a list). Be specific: name the person, reference the last exchange.
5. Create up to 3 tasks that concretely implement the recommendation. Due dates must be reasonable (1-7 business days).
6. Always cite evidence by quoting short excerpts from notes/emails/recordings.

Constraints:
- Never change the deal stage.
- Never send emails.
- If history is thin (< 2 interactions), recommend "discovery" action.
- If deal is in a terminal stage (won/lost), return recommendation="No action: terminal stage" with no tasks.

Return JSON wrapped in \`\`\`json.`,
};
```

## Intégration UI

Dans `DealShow.tsx`, section aside ou header :
```tsx
<SkillLauncher
  skill_id="next_best_action_on_deal"
  input={{ deal_id: Number(record.id) }}
  label="Suggérer la prochaine action"
  invalidateOnDone={["tasks","deal_notes"]}
/>
```

## Tests

- **Deal actif, 3 interactions récentes** → recommendation spécifique, 1-2 tasks, evidence non vide
- **Deal stagnant 30j** → recommendation "relance", 1 task relance
- **Deal nouveau sans interaction** → recommendation "discovery"
- **Deal en `won-deal`** → recommendation "No action: terminal stage", 0 task
- **Deal avec beaucoup d'emails** (>20) → recommendation cohérente, tokens maîtrisés via troncature

## Critères d'acceptation

- [ ] Les 5 cas de test passent
- [ ] `supporting_evidence` cite au moins 1 excerpt pour `confidence != low`
- [ ] Aucune task créée sans base dans l'evidence
- [ ] Coût médian < 0.15 USD (opus, plus lourd en tokens)
- [ ] Latence P95 < 25s
- [ ] Shadow mode obligatoire 30 runs avant promotion

## Risques / pièges

- Volume de lecture : sur un deal avec 50 emails, les tokens explosent. Limiter `list_contact_emails` à 10 derniers messages + tronquer body à 500 chars.
- Hallucination d'evidence : durcir prompt "evidence strings MUST be verbatim excerpts from tool results. Do not paraphrase."
- Recommendation vague : si l'agent dit juste "faire un suivi", ajouter règle "recommendation must name a concrete next step (call, demo, proposal, reminder, introduction, etc.)".

## Done

- Commit : `feat(agentic): add next_best_action_on_deal skill`
- Bouton intégré dans DealShow
- 10 runs sur deals réels loggés en shadow
