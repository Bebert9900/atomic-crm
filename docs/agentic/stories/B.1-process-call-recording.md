# Story B.1 — Skill `process_call_recording`

**Epic**: B. Skills v1
**Status**: Ready
**Estimation**: 6h
**Depends on**: A.1..A.5
**Blocks**: —

## Contexte business

Skill le plus haut ROI : la pipeline IA est déjà partiellement en place (`contact_recordings.transcription`, `.summary`, `.email_advice`, `.sms_advice`). L'agent orchestre l'après-transcription : lecture des métadonnées, recherche du deal associé, création d'une deal note structurée, et création des tasks de follow-up.

## Contexte technique

- La transcription est déjà produite par `supabase/functions/transcribe_recording`. Le skill **suppose que `transcription_status = 'completed'`**.
- L'agent ne regénère pas la transcription mais peut reformuler le summary si absent.
- Le skill doit lier au bon deal : règle = deal `stage != 'won-deal'` et `stage != 'lost-deal'` le plus récent du contact ; sinon pas de deal note, just tasks.

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `supabase/functions/_shared/skills/processCallRecording.ts` | Créer |
| `supabase/functions/_shared/skills/index.ts` | Register skill |
| `src/components/atomic-crm/recordings/ContactRecordingsList.tsx` | Ajouter `<SkillLauncher>` |

## Manifest

```ts
import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

const Input = z.object({ recording_id: z.number() });
const Output = z.object({
  deal_note_id: z.number().nullable(),
  tasks_created: z.array(z.number()),
  deal_id: z.number().nullable(),
  summary: z.string(),
  rationale: z.string(),
});

export const processCallRecordingSkill: SkillManifest<
  z.infer<typeof Input>, z.infer<typeof Output>
> = {
  id: "process_call_recording",
  version: "1.0.0",
  model: "claude-opus-4-7",
  description:
    "After a call recording has been transcribed, creates a structured deal note and follow-up tasks on the relevant contact/deal.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [
    "get_recording", "get_transcription",
    "get_contact", "list_contact_tasks", "list_contact_notes",
    "search_deals", "get_deal",
    "add_deal_note", "create_task", "update_contact",
  ],
  max_iterations: 10,
  max_writes: 6,
  rate_limit: { per_minute: 2, per_hour: 20 },
  system_prompt: `You are a CRM assistant that processes a recorded call on a contact.

Your job:
1. Fetch the recording and its transcription using the recording_id.
2. Fetch the contact. Read their existing notes and tasks briefly for context.
3. Identify the most relevant active deal for this contact (stage not in 'won-deal', 'lost-deal'). If multiple, pick the one with the most recent update.
4. Produce a structured deal note containing:
   - Context (2-3 lines)
   - Key points discussed
   - Objections raised (if any)
   - Next steps agreed
5. Create follow-up tasks based on next steps. Dates must be explicit ISO timestamps. Default due in 3 business days unless transcript says otherwise.
6. Only write data AFTER reading enough context. Never invent people, companies, amounts, dates.
7. Be concise. Never create more than 3 tasks.
8. If the transcription is short (<50 words) or seems unrelated to a deal, only create one follow-up task and no deal note.

Return your final answer as JSON matching this schema:
{
  "deal_note_id": <number or null>,
  "tasks_created": [<number>, ...],
  "deal_id": <number or null>,
  "summary": "<one paragraph>",
  "rationale": "<why you chose this deal and these tasks>"
}
Wrap the JSON in a \`\`\`json code block.`,
};
```

## Intégration UI

Dans `ContactRecordingsList.tsx`, pour chaque recording avec `transcription_status === 'completed'` et pas encore de `deal_note_id` associé (heuristique ou flag à ajouter) :

```tsx
import { SkillLauncher } from "@/components/atomic-crm/agentic";

// dans le rendu d'une row :
{r.transcription_status === "completed" && (
  <SkillLauncher
    skill_id="process_call_recording"
    input={{ recording_id: r.id }}
    label="Process"
    variant="outline"
    invalidateOnDone={["tasks", "deal_notes", "contacts"]}
  />
)}
```

## Tests

### Cas nominal
- Recording existant, transcription complète mentionnant un deal actif, contact rattaché
- Attendu : 1 deal note + 1 à 3 tasks + rationale explicite
- Vérifier que `skill_runs.trace` contient `get_recording`, `get_contact`, `search_deals`, `add_deal_note`, `create_task`

### Cas sans deal actif
- Contact sans deal ou tous deals clos
- Attendu : `deal_note_id = null`, 1 task, `rationale` explique "no active deal"

### Cas transcription pauvre
- Transcription < 50 mots
- Attendu : `deal_note_id = null`, max 1 task

### Cas transcription manquante
- `transcription_status = 'pending'`
- Attendu : run en erreur "transcription_not_ready" (retourné propre, pas crash)

## Critères d'acceptation

- [ ] 10 cas réels testés manuellement (inclure edge cases : pas de deal, deal unique, plusieurs deals, transcription très courte, transcription sans next step)
- [ ] Aucune hallucination : si le summary cite un nom/date/montant, il doit venir de la transcription
- [ ] `tasks_created` rempli uniquement avec de vrais IDs retournés par `create_task`
- [ ] Trace lisible : un dev peut comprendre la décision en <1 min en lisant le trace
- [ ] Coût médian par run < 0.08 USD (opus)
- [ ] Shadow mode activé par défaut au déploiement (flag `configuration.agentic_shadow_skills` contient `process_call_recording`) — retiré après 20 runs validés
- [ ] Latence P95 < 20s

## Risques / pièges

- Transcriptions longues (>30 min) : coût tokens élevé. Ajouter troncature à 20k tokens dans `get_transcription` output.
- Hallucination de next steps : durcir le system prompt avec "If no next step is explicitly stated, create at most one generic follow-up task 'Suivi post-call' without inventing details."
- Deal wrong match : si plusieurs deals actifs, l'agent peut choisir le mauvais. Pour v1 accepté, mais tracer le rationale. Si feedback négatif → ajouter règle "select deal most mentioned in transcription".

## Done

- Commit : `feat(agentic): add process_call_recording skill`
- Dashboard ops montre les runs S1 avec coût et latence
- Note dans `docs/agentic/README.md` sur comment promouvoir le skill hors shadow mode
