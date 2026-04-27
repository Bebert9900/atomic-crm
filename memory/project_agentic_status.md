---
name: Agentic CRM — implementation status
description: Où en est le projet d'intégration agentique (skills/tools pour Claude + DeepSeek) dans Atomic CRM, localisation du code, et ce qui reste à faire.
type: project
originSessionId: f2852700-d871-4a21-8b78-0046a73b7ba3
---
## Localisation du code

- **Copie du projet** : `/home/marieangelette/atomic-crm-agentic/` (rsync depuis `atomic-crm/`, sans node_modules ni .codex)
- **Branche** : `feat/agentic-foundation`
- **Docs BMAD** : `docs/agentic/` (project-brief, prd, architecture, 16 stories, README, ROLLOUT.md)
- **Docs aussi présentes dans le repo principal** `/home/marieangelette/atomic-crm/docs/agentic/` (non commité, branche main)

## Objectif structurant

Agent IA **autonome, no human-in-the-loop**. Garde-fous architecturaux (whitelists tools par skill, max_writes, circuit breaker, rate limits, kill switch, shadow mode, undo handlers obligatoires sur tous les writes).

L'utilisateur vend du SaaS avec CRM intégré → chaque capacité interne doit être vendable aux clients du SaaS (structure multi-tenant déjà posée via `tenant_settings` + `tenant_id` sur skill_runs, mais JWT multi-tenant réel non encore injecté — reporté v1.1).

## Commits sur la branche (ordre chronologique)

1. `49c1dbb` — A.1 skill_runs foundation (table + RLS + views + types)
2. `7417130` — A.2 agent-runtime edge function skeleton
3. `e30e9cd` — A.3 tool registry (25+ tools dans 9 fichiers de domaine)
4. `2d7a2a2` — A.4 Claude tool_use loop + guardrails
5. `cf98aa9` — A.5 frontend SkillLauncher + SSE client
6. `43027ee` — B.1 à B.5 : 5 skills de production
7. `601b997` — C.1 à D.3 : dashboard ops, circuit breaker, kill switch, tenant settings, usage metering
8. `56bcbc6` — docs BMAD dans la branche
9. `39ad958` — abstraction LLM multi-provider + DeepSeek

## Ce qui tourne (après setup)

Endpoints edge function `agent-runtime` :
- `GET /health`
- `GET /skills` (liste les 7 skills enregistrés)
- `POST /run` (stream SSE)

Skills enregistrés :
- `hello_world` — test, pas de LLM
- `process_call_recording` — opus
- `handle_incoming_email` — opus
- `morning_brief` — sonnet
- `morning_brief_ds` — deepseek-chat (A/B twin de morning_brief)
- `next_best_action_on_deal` — opus
- `qualify_inbound_contact` — sonnet

Providers LLM :
- Anthropic via npm `@anthropic-ai/sdk@^0.33` (prefix `claude-*`, clé `ANTHROPIC_API_KEY`)
- DeepSeek via fetch OpenAI-compat (prefix `deepseek-*`, clé `DEEPSEEK_API_KEY`)

## Ce qui n'a pas été exécuté

**Rien n'a été testé en vrai**. Le code compile mentalement mais :
- `npm install` jamais lancé dans la copie
- Migrations pas appliquées
- Aucun run réel
- Aucune vérification que zod-to-json-schema produit du JSON Schema compatible Claude/DeepSeek
- Aucune vérification que le SDK Anthropic tourne OK en Deno

## Ce qui reste pour que ça marche

**Bloquant** :
1. `cd /home/marieangelette/atomic-crm-agentic && npm install`
2. `npx supabase start && npx supabase migration up --local`
3. Créer `supabase/functions/.env` avec au moins une clé API
4. `npx supabase functions serve agent-runtime --env-file supabase/functions/.env --no-verify-jwt`
5. Test `hello_world` via curl (valide plomberie sans LLM)
6. Test `morning_brief` ou `morning_brief_ds` (premier vrai run LLM)

**Intégration UI (non fait)** :
- Routes `/settings/agentic`, `/settings/agentic/tenants`, `/settings/agentic/usage` à brancher dans `src/App.tsx`
- Entrée menu admin dans `SettingsPage.tsx`
- `<SkillLauncher>` à placer sur les fiches (recordings, deals, contacts, dashboard)

**How to apply** : quand l'utilisateur revient pour reprendre, démarrer par : "est-ce que tu as réussi à lancer le premier test hello_world ?" Si oui → attaquer la valid du premier skill LLM. Si non → débug la plomberie (`supabase start` ? migrations OK ? edge function sert ?).

## Risques connus flagged en review (pas corrigés)

Voir `project_agentic_known_issues.md` pour la liste détaillée des 12 smells.

## Provider LLM — points à savoir

- DeepSeek-reasoner (R1) support tool_use mais est capricieux sur schemas Zod complexes → préférer `deepseek-chat` (V3) en v1
- Anthropic prompt caching explicite (ephemeral breakpoints), DeepSeek caching automatique serveur-side
- DeepSeek impl fait du non-streaming (stream:false), events SSE arrivent en batch par itération — acceptable v1
- Pas de retry sur 429/503 DeepSeek — à ajouter si échecs transitoires
