# PRD — Agentic CRM Layer v1

**Owner**: PM role
**Version**: 1.0
**Status**: Ready for architecture

## 1. Scope v1

Cinq skills prioritaires, une infrastructure foundation, un volet observability, un volet SaaS enablement.

### 1.1 Skills prioritaires

| ID | Skill | Trigger | Output attendu | Priorité |
|----|-------|---------|----------------|----------|
| S1 | `process_call_recording` | Fin d'un enregistrement audio dans `contact_recordings` | Transcription stockée, résumé structuré, deal note créée, tasks de follow-up créées | P0 |
| S2 | `handle_incoming_email` | Nouveau `email_messages` sans `contact_id` | Contact matché/créé, email lié, tasks proposées créées, deal associé si pertinent | P0 |
| S3 | `morning_brief` | Ouverture app entre 6h et 11h (1×/jour/user max) ou commande explicite | Message structuré : tâches du jour priorisées, hot contacts, emails urgents, deals à relancer | P1 |
| S4 | `next_best_action_on_deal` | Bouton sur fiche deal | Recommandation textuelle + 1 à 3 tasks pré-remplies créées | P1 |
| S5 | `qualify_inbound_contact` | Contact créé avec `lead_source != 'manual'` | Contact enrichi (title, background, tags), company rattachée/créée, 1 task follow-up | P2 |

### 1.2 Foundation

Infrastructure partagée par tous les skills :
- Runtime d'exécution (edge function)
- Tool registry central
- Trace/persistence (`skill_runs`)
- Client Claude API avec prompt caching
- Frontend d'invocation + affichage des traces

### 1.3 Observability & ops

- Dashboard interne des `skill_runs`
- Rate limiting
- Kill-switch global et par skill

### 1.4 SaaS enablement

- Flag d'activation par tenant
- UI admin pour enabler/disabler des skills par tenant
- Compteur d'usage pour facturation future

## 2. Exigences fonctionnelles

- **FR1** — Chaque skill déclare son input schema (Zod/JSON Schema) et son output schema. Le runtime valide les deux.
- **FR2** — Chaque skill s'exécute avec le JWT du user déclencheur. Aucune tool call ne peut dépasser les permissions RLS de ce user.
- **FR3** — Les actions destructives (delete, email vers adresse inconnue, deal→lost, archivage de masse) ne sont **jamais** dans la whitelist de tools d'un skill v1.
- **FR4** — Chaque exécution produit un `skill_run` : inputs, trace complète (tool calls, results, thoughts), output, tokens, coût, durée, statut.
- **FR5** — Activation d'un skill par tenant via flag `agentic_enabled_skills` (jsonb) dans `configuration`.
- **FR6** — Tout skill doit exposer un mode `dry_run` qui liste les actions qu'il *aurait* prises sans les exécuter.
- **FR7** — Toute action d'écriture effectuée par l'agent est marquée dans la cible via `_agent_run_id` (convention ou table d'annotation), pour rendre possible le rollback granulaire.
- **FR8** — Un skill dont le trace atteint `max_iterations` s'arrête et marque `status='error'` sans écriture partielle non traçable.

## 3. Exigences non-fonctionnelles

- **NFR1** — Time-to-first-token < 3s (hors latence Claude API hors de notre contrôle)
- **NFR2** — Durée totale médiane d'un skill-run < 10s, P95 < 15s
- **NFR3** — Prompt caching activé sur system prompt + tool definitions (TTL minimum 5 min)
- **NFR4** — Coût calculé et stocké par run (input_tokens, output_tokens, cache_hit_tokens, cache_creation_tokens, cost_usd)
- **NFR5** — Aucune PII (emails, noms contacts, contenus notes) ne sort vers un service tiers autre qu'Anthropic. Pour les tenants du SaaS, consentement explicite requis.
- **NFR6** — Isolation multi-tenant : un skill-run d'un tenant ne peut jamais lire les données d'un autre (enforced via RLS + tenant_id dans `skill_runs`).
- **NFR7** — Reproductibilité : un `skill_run` peut être rejoué en mode "shadow" (tool calls mockés) sur demande dev.

## 4. Guardrails remplaçant le human-in-the-loop

### 4.1 Whitelist de tools par skill

Chaque skill déclare explicitement les tools qu'il peut appeler. Le runtime refuse toute autre tool call.

### 4.2 Rate limits

Par défaut :
- Max 5 skill-runs / user / minute
- Max 50 skill-runs / user / heure
- Max 1 `morning_brief` / user / 24h
- Max 500 tool calls / skill-run (pour éviter boucles)

Configurables dans `_shared/skills/limits.ts`.

### 4.3 Réversibilité

Toute action d'écriture doit être rollback-able par un `undo` du runtime :
- `create` → `archive`/`delete`
- `update` → revert au `before_snapshot` stocké dans le trace
- `move_deal_stage` → remettre le stage précédent
- `merge_contacts` → interdit (non réversible) → pas dans whitelist v1

### 4.4 Thresholds de sanité

Si un skill tente d'écrire >20 enregistrements en une run → abort. Paramètre par skill dans son manifest.

### 4.5 Kill-switch

- Global : flag `configuration.agentic_kill_switch = true` → tous les runtimes refusent les nouvelles runs
- Par skill : flag `configuration.agentic_disabled_skills = [id,...]`

### 4.6 Shadow mode

Pendant les 2 premières semaines en prod d'un nouveau skill : exécution automatique en `dry_run=true`, résultats loggés mais aucune écriture réelle. Promotion vers exécution réelle quand 95% des dry runs sont validés par un dev.

## 5. Critères d'acceptation globaux

- Les 5 skills passent un test manuel sur 10 cas réels chacun (inputs variés, edge cases)
- Le dashboard ops affiche en temps réel les runs en cours, runs échoués, coût cumulé
- Un dev peut ajouter un 6ème skill en < 1 jour en suivant le gabarit story
- Aucune fuite cross-tenant détectée en test d'intrusion

## 6. Hors scope v1

- Fine-tuning / évals automatisées multi-scénarios (passera en v2)
- Skills analytics avancés (revenue_snapshot, weekly_ops_review)
- Interface no-code de skill-building pour clients SaaS
- Planification autonome multi-step longue (> 10 iterations)
- Skills déclenchés par cron (triggers planifiés) — uniquement déclenchés par action user ou DB trigger v1

## 7. Risques produit identifiés

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Agent se trompe sur une classification (ex: spam vs vrai email) | Action d'écriture inutile | Toute action réversible, shadow mode initial |
| Coût Claude API explose | Budget | Rate limits, prompt caching, modèle haiku/sonnet par défaut sur skills simples |
| Hallucination sur données métier | Recommandations erronées | Forcer `search_*` avant toute action, jamais d'inférence d'ID |
| Boucle infinie de tool calls | Coût + latence | `max_iterations` dur à 20, monitoring boucles répétitives |
| Fuite cross-tenant | Critique | RLS à chaque appel + test automatisé multi-tenant |
