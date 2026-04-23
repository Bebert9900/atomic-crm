# Story B.5 — Skill `qualify_inbound_contact`

**Epic**: B. Skills v1
**Status**: Ready
**Estimation**: 6h
**Depends on**: A.1..A.5, B.2
**Blocks**: —

## Contexte business

Un contact créé via source externe (`lead_source != 'manual'`) arrive avec peu d'infos (souvent juste un email). Ce skill l'enrichit, tente de rattacher ou créer la company, pose des tags cohérents, crée une task de premier contact.

## Contexte technique

- **Pas d'appel à des services externes d'enrichissement tiers** en v1 — l'agent utilise uniquement les données CRM existantes + inférence à partir du domaine email
- Skill déclenchable manuellement v1 ; v1.1 trigger DB sur insert contact avec source externe

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `supabase/functions/_shared/skills/qualifyInboundContact.ts` | Créer |
| `supabase/functions/_shared/skills/index.ts` | Register |
| `src/components/atomic-crm/contacts/ContactShow.tsx` | Ajouter bouton conditionnel |

## Manifest

```ts
import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

const Input = z.object({ contact_id: z.number() });
const Output = z.object({
  company_id: z.number().nullable(),
  company_created: z.boolean(),
  tags_applied: z.array(z.number()),
  background_set: z.boolean(),
  task_id: z.number().nullable(),
  rationale: z.string(),
});

export const qualifyInboundContactSkill: SkillManifest<
  z.infer<typeof Input>, z.infer<typeof Output>
> = {
  id: "qualify_inbound_contact",
  version: "1.0.0",
  model: "claude-sonnet-4-6",
  description: "Qualifies a newly created inbound contact: attaches or creates company, applies tags, sets background, creates first-touch task.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [
    "get_contact", "update_contact",
    "search_companies", "get_company", "search_contacts",
    "list_tags", "apply_tag",
    "create_task",
  ],
  max_iterations: 10,
  max_writes: 5,
  rate_limit: { per_minute: 10, per_hour: 100 },
  system_prompt: `You qualify a freshly created inbound contact in a CRM.

Steps:
1. get_contact on the provided id.
2. If contact has no company_id, derive the likely company from the email domain (the part after @). Skip public domains (gmail.com, hotmail.com, outlook.com, yahoo.com, icloud.com, proton.me, protonmail.com).
3. search_companies with a query = the domain without tld. If one matches, link via update_contact({company_id}). If none matches and domain is not public, create the company via... WAIT — create_company is NOT in your allowlist in v1. Instead, if company is absent, note it in rationale and skip the create. The human will handle. (This is a deliberate restriction: company creation requires stricter validation.)
4. list_tags to see available tags. Apply at most 2 tags that clearly fit based on:
   - lead_source
   - visible title or domain sector
5. If background is empty and you can reasonably infer a short 1-line background from title + company name, update_contact to set it. Do not invent facts beyond what's inferable from structured data.
6. Create a single task "Premier contact" due in 2 business days.

Constraints:
- Never fabricate attributes not justifiable from existing data.
- Never create more than 1 task.
- If contact already has company_id AND tags AND background, only create the task and return (idempotent-ish).

Return JSON.`,
};
```

> Note : on exclut explicitement `create_company` de v1. Si le besoin devient fréquent, ajouter dans v1.1 avec un tool `create_company` reversible (archive) + une vérification de non-duplication stricte.

## Intégration UI

Dans `ContactShow.tsx`, afficher le bouton si `record.lead_source !== 'manual'` et contact créé < 24h :
```tsx
{record.lead_source !== 'manual' && isRecent(record.created_at) && (
  <SkillLauncher
    skill_id="qualify_inbound_contact"
    input={{ contact_id: Number(record.id) }}
    label="Qualifier le lead"
    invalidateOnDone={["contacts","tasks"]}
  />
)}
```

## Tests

- **Contact avec email pro inconnu** → recherche company, pas de match → pas de link, rationale note l'absence
- **Contact avec email pro dont la company existe** → link via update_contact, tags appliqués
- **Contact avec email personnel (gmail)** → skip company, tags basés sur title si dispo
- **Contact déjà complet** → uniquement création de task
- **Contact avec titre "CTO"** → tag technique appliqué si existe

## Critères d'acceptation

- [ ] Aucun `create_company` appelé en v1 (vérif trace + allowlist)
- [ ] Aucun tag créé (que `apply_tag` sur tags existants)
- [ ] `task_id` jamais null si contact existant
- [ ] Coût médian < 0.02 USD
- [ ] Latence P95 < 10s
- [ ] Shadow mode 20 runs

## Risques / pièges

- Tag prolifération : si tous les tags sont mal choisis, pollue le taxonomie. Limite stricte à 2 + audit hebdo.
- Background halluciné : durcir prompt "background must only include facts visible in existing fields (title, email, company name). Never guess."
- Domaine email avec sous-domaine (dev.acme.com) : l'agent doit savoir extraire acme. Exemple dans le prompt.

## Done

- Commit : `feat(agentic): add qualify_inbound_contact skill`
- 10 contacts de test qualifiés en shadow mode avec review manuelle
