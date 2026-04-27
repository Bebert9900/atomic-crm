# Brief d'intégration agentique — Atomic CRM

> Document de reproduction. Cible : porter la couche agentique de `~/atomic-crm-agentic` (branche `feat/agentic-foundation`) vers `~/atomic-crm` (branche `main`), en composant proprement avec les features récentes du repo cible.

---

## 0. Méta : ce document est-il suffisant pour reproduire l'intégration ?

**Réponse honnête : la version précédente non, celle-ci oui — sous conditions.**

La version antérieure (résumé exécutif) listait *quoi* est livré, pas *comment* l'assembler. Pour vraiment reproduire, il faut :

| Pré-requis | Couvert ici |
|---|---|
| Inventaire de l'état actuel du repo cible | §2 |
| Carte des décisions architecturales avec rationale | §3 |
| Ordre exact d'application (migrations, types, code, wiring) | §4 |
| Contrats inter-couches (events SSE, JSON shapes, RLS, schémas Zod) | §5 |
| Diff précis CRM.tsx / Layout.tsx / dataProvider | §6 |
| Tests d'acceptation par étape (gate before next) | §7 |
| Risques + mitigations | §8 |
| Hors scope explicite | §9 |

Ce que le doc **ne remplace pas** : la lecture des fichiers source de la copie agentique. Il y a ~2 500 lignes de code (tools + skills + edge fn) qu'il faut copier ou réécrire avec les contrats spécifiés ici. Le brief donne la carte ; les fichiers donnent le détail.

---

## 1. Objectif

Apporter à `~/atomic-crm` :
1. Un agent IA conversationnel (chat plein écran + sidebar flottant Ctrl+L) connecté aux données CRM
2. 19 skills autonomes (no-HITL) avec garde-fous, kill switch, circuit breaker
3. Une page `/agent` à 5 onglets (Chat / Skills / Skills custom / Activité / Runs)
4. La possibilité de **créer des skills depuis l'UI sans déployer** (skills custom DB-backed)
5. Une **télémétrie d'actions utilisateur** servant à bootstrapper de nouveaux skills via un meta-skill `suggest_skill_from_session`

Sans casser : intégrations Google Calendar/PostHog/BillionMail, page Inbox, page Intégrations, dashboard refresh (KpiCards/PipelinePulse/TodayAgenda/TodayTasks), edge fns Stripe (sync_saas_*), recordings sentiment/warmth, dev_tasks, calendar unifié.

---

## 2. Audit du repo cible (`~/atomic-crm`)

### 2.1 Features présentes côté ~/atomic-crm que la copie agentique n'a PAS

À PRÉSERVER intégralement lors du portage :

| Bloc | Fichiers / éléments |
|---|---|
| Dashboard refresh | `src/components/atomic-crm/dashboard/{KpiCards,PipelinePulse,TodayAgenda,TodayTasks}.tsx` + Dashboard.tsx, DashboardActivityLog.tsx, MyDayPage.tsx modifiés |
| Recordings côté company | `companies/CompanyRecordingsList.tsx` |
| Stripe / paiements | `contacts/ContactPayments.tsx`, `companies/CompanyPayments.tsx` (modifiés) |
| Intégrations | `settings/IntegrationsPage` + edge fns `google_oauth_{start,callback}`, `posthog_contact_activity`, `billionmail_push_contact`, `get_stripe_treasury` |
| PostHog activity | `contacts/ContactPostHogActivity.tsx` |
| Inbox & SMTP | `emails/EmailInboxPage`, edge fns `send_email_raw`, `send_email` |
| SaaS sync | edge fns `sync_saas_{plan,signup,user}`, `stripe-webhook` |
| Trésorerie | resources `stripe_payouts`, `finance_metrics` (référencés dans CRM.tsx) |
| Refonte tasks | `tasks/TasksPage` (route remplaçant `Resource list`) |
| Auth admin propagation | `providers/supabase/authProvider.ts` (commit `4ab1f4c`) |

### 2.2 Tools / edge fns que l'agentique appelle et qui existent DÉJÀ côté ~/atomic-crm

Bonne nouvelle : ces tools agentiques étaient déjà câblés sur des edge fns du repo principal :

- `send_email` (tool) → `send_email_raw` (edge fn) ✅ existe
- `merge_contacts` (tool) → `merge_contacts` (edge fn) ✅ existe
- `get_posthog_activity` (tool) → `posthog_contact_activity` (edge fn) ✅ existe
- `push_to_billionmail` (tool) → `billionmail_push_contact` (edge fn) ✅ existe

Aucun travail d'intégration supplémentaire n'est requis sur ces flux.

### 2.3 Schémas DB qui DIVERGENT entre les deux repos

| Élément | ~/atomic-crm | ~/atomic-crm-agentic | Action |
|---|---|---|---|
| `contact_recordings.email_advice / sms_advice` | ✅ présent | ✅ présent | rien |
| `contact_recordings.sentiment / warmth_score / warmth_label` | ❌ absent du schema versionné | référencé par `update_recording_insights` tool + skill | **Migration nécessaire** (cf §4.1) |
| `video_conferences` | ❌ absent du schema versionné, table créée hors migration | non utilisé | hors scope v1 (cf §9) |
| `agentic_circuit_state` | ❌ absent | présent inline dans `01_tables.sql` | migration séparée à créer |
| `tenant_settings` | ❌ absent | présent inline dans `01_tables.sql` | migration séparée à créer |
| `skill_runs` | ❌ absent | présent inline + dans migration `20260423160000` | migration ✅ |
| Tables `chat_*`, `user_oauth_tokens`, `user_api_keys`, `agent_custom_skills`, `user_actions` | ❌ absent | présentes dans migrations | porter migrations |

### 2.4 Versions / dépendances communes

```
React 19 / Vite / TypeScript / ra-core / @supabase/supabase-js / zod ^4.1.12
```

Le `package.json` agentique ajoute uniquement (côté frontend) : `@anthropic-ai/sdk` n'est PAS requis côté frontend (seulement dans les edge fns Deno via npm: imports). Aucune nouvelle dépendance Node n'est nécessaire côté frontend en théorie. *À valider lors du portage* : il y a peut-être des dépendances pour le markdown rendering du chat (`react-markdown`, `remark-gfm`) — vérifier `package-lock.json` agentique pour la liste exacte.

### 2.5 Convention des migrations dans ~/atomic-crm

Le repo cible suit `supabase db diff` : le schema déclaratif (`supabase/schemas/`) est la source de vérité, les migrations en sont dérivées via `npx supabase db diff --local -f <name>`. **Les migrations agentiques doivent suivre la même convention** : ajouter les définitions dans `01_tables.sql` (ou `02_functions.sql`, `05_policies.sql`, `06_grants.sql`) puis générer la migration via diff. Sinon on aura des phantom diffs au prochain `db diff`.

---

## 3. Décisions architecturales (ADR-like)

Chaque décision est nommée, motivée, avec ses alternatives et limites. À garder en tête pendant l'implémentation.

### ADR-1 : edge function unique `agent-runtime` (vs N edge fns par concern)

**Décision :** un seul deployable `supabase/functions/agent-runtime/` avec un router interne (`/run`, `/skills`, `/tools`, `/custom-skills`, `/actions`, `/oauth/*`).

**Pourquoi :**
- Une seule URL d'auth/CORS à gérer
- Partage du code `_shared/` sans bricolage
- Un seul cold start payé par l'utilisateur
- Plus facile à tester en local (`supabase functions serve agent-runtime`)

**Alternatives :** une fn par endpoint (record-actions, run-skill, list-skills…). Rejetée — multiplie les déployables sans bénéfice.

**Limite :** un crash dans une route peut tirer toute la fonction. Mitigation : try/catch top-level dans chaque handler + observabilité (logs Supabase).

---

### ADR-2 : streaming SSE pour `/run`

**Décision :** contrat SSE avec events typés (`run.started`, `text`, `tool_use`, `tool_result`, `run.done`, `run.error`).

**Pourquoi :**
- Le tool_use de Claude est itératif (multiple round-trips). L'utilisateur doit voir l'avancement.
- SSE est plus simple que WebSocket (pas de bidirectionnel nécessaire), plus debug-friendly que long-polling.
- `keepalive: true` côté fetch côté frontend gère les déconnexions tab-fermée.

**Alternatives :** REST polling (mauvais UX), WebSocket (overkill), gRPC streaming (incompatible navigateur).

**Limite :** SSE ne supporte pas les uploads (irrelevant ici). Le proxy Supabase doit ne pas bufferiser — testé OK.

---

### ADR-3 : Zod pour `input_schema` / `output_schema` des tools et skills

**Décision :** chaque tool et skill déclare ses schemas en Zod (`z.object({...})`).

**Pourquoi :**
- Validation runtime gratuite (`safeParse` en pré-flight côté `executeSkill`)
- Génération JSON Schema via `zod-to-json-schema` pour Claude tool definitions
- Inférence TypeScript native (`z.infer<typeof Input>`)
- Cohérent avec ra-core / le reste du repo qui utilise déjà Zod

**Alternatives :** TypeBox (plus rapide mais ergonomie inférieure), JSON Schema brut (verbose). Rejetées.

**Limite :** `zod-to-json-schema` ne traduit PAS `.refine()` — interdire les refines sur les schemas de tools. Pour custom skills DB-backed, on utilise `z.record(z.unknown())` (pass-through) car on ne peut pas reconstruire un Zod schema depuis du JSON Schema stocké en base.

---

### ADR-4 : registre statique des tools, registre dynamique des skills

**Décision :**
- Tools : registry statique `_shared/tools/registry.ts` (1 fichier par domaine, agrégé via `collect()`).
- Skills : merge code (statique) + DB (dynamique) via `_shared/skills/loader.ts`.

**Pourquoi cette asymétrie :**
- Les tools sont **du code typé** qui parle à la base ou à des edge fns. Pas envisageable de laisser un user les définir en runtime — risque d'injection SQL et de bypasser les RLS.
- Les skills sont **du prompt + une whitelist de tools**. Aucun code exécutable. Validable côté serveur (`tools_allowed` doit être un sous-ensemble du registry).

**Conséquence pour les custom skills :**
- Validation stricte de `tools_allowed` à la création (CREATE/PUT) : tout nom inconnu rejette
- Pas de validation de l'`input_schema` au runtime → on accepte `z.record(z.unknown())` et on laisse le LLM gérer via tool_use

**Limite :** les LLM peuvent halluciner des appels de tools incohérents. C'est `max_writes` + `reversible:true + undo handler` qui sécurise.

---

### ADR-5 : RLS-first pour la sécurité des écritures

**Décision :** toutes les tables nouvelles ont des policies RLS strictes. Les edge fns exécutent par défaut sous le JWT de l'utilisateur. Les écritures cross-user passent par service-role.

**Pourquoi :** on ne fait pas confiance au code edge fn pour appliquer les bonnes règles d'autorisation. Si un handler oublie un check, RLS rattrape.

**Conséquences pratiques :**
- `skill_runs` : user voit ses runs, l'edge fn écrit en service-role pour finaliser
- `agent_custom_skills` : SELECT pour tout authenticated (catalogue partagé), INSERT/UPDATE/DELETE pour admin (`sales.administrator = true`)
- `user_actions` : SELECT self ou admin, INSERT self uniquement, batch ingest passe par service-role pour bypasser
- `user_oauth_tokens` : aucune policy authenticated → tokens uniquement lisibles par service-role (edge fn)

---

### ADR-6 : capture telemetry via wrap du dataProvider (vs reverse-engineering events)

**Décision :** `withTracking()` enveloppe le `DataProvider` ra-core et intercepte `create/update/updateMany/delete/deleteMany`.

**Pourquoi :**
- Toute écriture CRUD passe par un seul point (ra-core est centralisé) → un seul wrapper capture l'ensemble du CRM
- Agnostique des composants (pas de modif sur 50+ pages)
- Trivialement désactivable (retirer le wrap)
- Skip resources internes (`skill_runs`, `user_actions`, `agent_custom_skills`, `configuration`) pour éviter les boucles infinies

**Alternatives :** hooks dans chaque composant (touche tous les forms — pas maintenable), trigger PostgreSQL (rate les actions UI sans mutation, ex: filtre, search).

**Limite :** ne capture PAS les *reads* (consultation d'une fiche déclenche aussi `nav.visit` côté `useTrackNavigation`, donc OK). Ne capture pas non plus les actions UI sans mutation (ex: ouvrir une modal). Acceptable v1.

---

### ADR-7 : telemetry à PII-réduit par défaut

**Décision :** le payload tracké pour update/create ne contient PAS la valeur des champs, seulement leurs **noms** (`{fields: ["status", "tags"]}`).

**Pourquoi :**
- Évite la duplication de PII (emails, noms, contenus de notes) dans une table secondaire
- Évite le risque d'exfiltration via export futur de la table `user_actions`
- Suffisant pour reconstruire l'intent ("a modifié le status d'un deal") — la valeur précise est récupérable via `skill_runs.input` ou via la fiche elle-même

**Limite :** le meta-skill `suggest_skill_from_session` doit composer avec ce niveau d'abstraction. Le system prompt en tient compte.

---

### ADR-8 : custom skills override les code skills par `skill_id`

**Décision :** dans `loadSkillsFor()`, un skill custom DB de même `skill_id` qu'un skill code **remplace** ce dernier.

**Pourquoi :**
- Permet de tweaker le system prompt d'un skill prod sans déployer
- Mais garde le code comme baseline qui revient si le custom est désactivé
- Hot-reload effectif (le loader recharge à chaque `/run`)

**Limite :** un admin peut casser un skill prod par erreur. Mitigation : la liste des custom est visible dans l'UI avec badge `custom`, on peut désactiver d'un clic.

---

### ADR-9 : meta-skill `suggest_skill_from_session` est read-only

**Décision :** `max_writes: 0`, `tools_allowed: ["get_user_session", "list_available_tools"]`.

**Pourquoi :**
- Le draft produit doit toujours passer par revue humaine via `CustomSkillFormDialog`
- Évite d'auto-créer un skill exécutable basé sur l'inférence
- L'humain reste le décideur final pour : id, prompt définitif, tools, limites

**Conséquence :** la chaîne UI = (Activity tab) → suggestion → (preview du draft) → bouton "Pré-remplir" → (modal Custom skill) → relecture → save.

---

### ADR-10 : modèles autorisés dans `agent_custom_skills` = liste blanche

**Décision :** validation côté backend (`ALLOWED_MODELS` dans `customSkills.ts`) en plus de la contrainte CHECK Postgres.

**Pourquoi :** empêche un admin de saisir un modèle que le runtime ne sait pas appeler. Le LLM provider router (Anthropic / DeepSeek / OpenRouter) ne supporte que des prefixes connus.

**Liste actuelle :** `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, `deepseek-chat`, `deepseek-reasoner`. À étendre quand un nouveau provider est ajouté.

---

## 4. Plan d'implémentation phasé

7 phases. Chaque phase a un **gate** : un test exécutable qui doit passer avant la suivante.

### Phase 1 — Plomberie DB (1-2h)

#### 4.1 Migrations à porter dans l'ordre exact

```
20260423160000_add_skill_runs.sql
20260423170000_add_agentic_circuit_state.sql
20260423180000_add_tenant_settings.sql
20260424090000_add_chat_conversations.sql
20260424100000_add_user_oauth_tokens.sql
20260427100000_add_user_api_keys.sql
20260427110000_add_recording_insights.sql        # NOUVEAU — voir ci-dessous
20260427120000_add_agent_custom_skills.sql
20260427140000_add_user_actions.sql
```

#### 4.2 Nouvelle migration nécessaire : `add_recording_insights.sql`

Pas dans la copie agentique. Le tool `update_recording_insights` et le skill `process_call_recording` v2 attendent les colonnes `sentiment`, `warmth_score`, `warmth_label` sur `contact_recordings`. À créer :

```sql
alter table public.contact_recordings
    add column if not exists sentiment text
        check (sentiment in ('Positif','Neutre','Hésitant','Négatif','Froid')),
    add column if not exists warmth_score int
        check (warmth_score between 0 and 100),
    add column if not exists warmth_label text
        check (warmth_label in ('Glacé','Froid','Tiède','Chaud','Brûlant'));
```

Aussi mettre à jour `supabase/schemas/01_tables.sql` pour cohérence avec `db diff`.

#### 4.3 Convention schema vs migrations

Choisir l'une des deux options :

**Option A (recommandé) :** ajouter chaque table agentique dans `supabase/schemas/01_tables.sql`, RLS dans `05_policies.sql`, grants dans `06_grants.sql`, puis `npx supabase db diff --local -f add_agentic_baseline` génère UNE migration unique.

**Option B :** copier les 9 fichiers de migrations en l'état et accepter qu'au prochain `db diff` une "migration de réconciliation" sera générée. Plus rapide mais sale.

Préférer **Option A** car le repo cible suit la convention déclarative.

#### Gate Phase 1
```bash
npx supabase migration up --local
# Doit afficher "Applied X migrations"
psql $DATABASE_URL -c "select count(*) from skill_runs;"  # → 0 sans erreur
psql $DATABASE_URL -c "select count(*) from agent_custom_skills;"  # → 0
```

---

### Phase 2 — Backend agentique (3-4h)

#### 4.4 Structure à créer

```
supabase/functions/_shared/
├── llm/
│   ├── anthropic.ts          # SDK + OAuth Claude.ai header beta
│   ├── deepseek.ts           # fetch OpenAI-compat
│   ├── openrouter.ts         # multi-modèles
│   ├── toolLoop.ts           # boucle tool_use avec max_iterations + max_writes
│   ├── types.ts              # NormalizedResponse, ToolResultEntry, LLMProvider
│   └── pricing.ts            # input/output/cache token pricing par modèle
├── tools/
│   ├── types.ts              # ToolDefinition, ToolContext, ToolKind
│   ├── registry.ts           # collect() + isWriteTool()
│   ├── contacts.ts           # 10 tools
│   ├── companies.ts          # 4 tools
│   ├── deals.ts              # 8 tools
│   ├── tasks.ts              # 5 tools
│   ├── notes.ts              # 1 tool
│   ├── recordings.ts         # 3 tools (avec update_recording_insights)
│   ├── emails.ts             # 7 tools (search/get/link/mark + send/draft)
│   ├── tags.ts               # 3 tools
│   ├── activity.ts           # 1 tool
│   ├── appointments.ts       # 7 tools
│   ├── dev_tasks.ts          # 6 tools
│   ├── integrations.ts       # 2 tools (PostHog, BillionMail)
│   ├── subscriptions.ts      # 3 tools
│   └── sessions.ts           # 2 tools (list_available_tools, get_user_session)
├── skills/
│   ├── types.ts              # SkillManifest, SkillExecCtx
│   ├── index.ts              # registry statique (19 skills)
│   ├── loader.ts             # loadSkillsFor(supabase) — merge code+DB
│   ├── helloWorld.ts
│   ├── chatWithCrm.ts        # ~419 lignes (le plus gros)
│   ├── morningBrief.ts
│   ├── morningBriefDeepseek.ts
│   ├── weeklyPipelineReview.ts
│   ├── processCallRecording.ts
│   ├── handleIncomingEmail.ts
│   ├── nextBestActionOnDeal.ts
│   ├── qualifyInboundContact.ts
│   ├── draftOutboundEmail.ts
│   ├── prepareMeetingBrief.ts
│   ├── triageDevTasks.ts
│   ├── deduplicateContacts.ts
│   ├── scheduleMeetingAssistant.ts
│   ├── bulkInboxTriage.ts
│   ├── enrichContactFromSignals.ts
│   ├── onboardSaasSignup.ts
│   ├── detectChurnRisk.ts
│   └── suggestSkillFromSession.ts
├── guardrails/
│   ├── rateLimit.ts          # checkRateLimits + checkGlobalUserLimits + checkTenantLimits
│   ├── killSwitch.ts         # checkKillSwitch + isShadowEnforced
│   ├── tenantAccess.ts       # checkTenantAccess
│   ├── tenantLimits.ts       # checkTenantMonthlyLimits
│   └── circuitBreaker.ts     # checkCircuit + recordOutcome
├── oauth/
│   └── anthropic.ts          # PKCE flow + token storage
└── userKeys/
    └── apiKeys.ts            # CRUD chiffré pour user_api_keys

supabase/functions/agent-runtime/
├── index.ts                  # Deno.serve(dispatch)
├── router.ts                 # path matching → handler
├── auth.ts                   # validateToken (JWT JWKS)
├── sse.ts                    # createSSEStream + sseResponse
├── runPersistence.ts         # createRun + finalizeRun + appendTraceStep + makeSupabaseForUser
├── executeSkill.ts           # /run handler (pré-flight + tool loop)
├── skills.ts                 # /skills handler (liste merged)
├── toolsHandler.ts           # /tools handler
├── customSkills.ts           # CRUD /custom-skills
├── recordActions.ts          # POST /actions batch
└── oauthRoutes.ts            # /oauth/anthropic/{exchange,status,revoke}
```

#### 4.5 Contrats critiques à respecter

**Type `ToolDefinition`** (clé de voûte) :
```ts
export type ToolDefinition<I = any, O = any> = {
  name: string;                   // unique, snake_case
  description: string;            // FR, ≤ 240 chars (utilisé tel quel par Claude)
  input_schema: z.ZodType<I>;     // pas de .refine() (zod-to-json-schema l'ignore)
  output_schema: z.ZodType<O>;
  kind: "read" | "write";
  reversible: boolean;
  cost_estimate: "low" | "medium" | "high";
  handler: (args: I, ctx: ToolContext) => Promise<O>;
  undo?: (original: { args: I; output: O }, ctx: ToolContext) => Promise<void>;
};
```

**Type `SkillManifest`** :
```ts
export type SkillManifest<I = unknown, O = unknown> = {
  id: string;                     // snake_case, /^[a-z][a-z0-9_]{2,63}$/
  version: string;                // semver
  model: string;                  // dans ALLOWED_MODELS
  description: string;            // FR
  input_schema: z.ZodType<I>;
  output_schema: z.ZodType<O>;
  tools_allowed: string[];        // sous-ensemble du registry
  max_iterations: number;         // 1..50
  max_writes: number;             // 0..50
  rate_limit: { per_minute: number; per_hour: number };
  system_prompt: string;
  execute?: (ctx: SkillExecCtx<I>) => Promise<O>;  // bypass LLM (ex: helloWorld)
};
```

**Format SSE** : chaque event = `event: <name>\ndata: <json>\n\n`. Bloc complet par event. Le frontend parse via `split("\n\n")`.

**Pré-flight order** dans `executeSkill.ts` (CRITIQUE) :
1. parse body
2. lookup manifest via `loadSkillsFor()`
3. checkKillSwitch(skill_id)
4. checkCircuit(skill_id)
5. checkTenantMonthlyLimits(tenant_id)
6. checkTenantAccess(skill_id, tenant_id)
7. checkRateLimits(user_id, skill_id, per_min, per_hour)
8. checkGlobalUserLimits(user_id)
9. checkTenantLimits(tenant_id)
10. isShadowEnforced(skill_id) → force dry_run si true
11. `manifest.input_schema.safeParse(input)`
12. `createRun()` → runId
13. SSE stream → execute (custom `execute` ou `runToolLoop`)
14. `finalizeRun()` + `recordOutcome()` (circuit breaker)

#### 4.6 Variables d'environnement

À ajouter à `supabase/functions/.env` :

```env
ANTHROPIC_API_KEY=sk-ant-...        # baseline ; OAuth user prend précédence si présent
DEEPSEEK_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...
ANTHROPIC_OAUTH_CLIENT_ID=...        # à demander à Anthropic (beta OAuth)
ANTHROPIC_OAUTH_REDIRECT_URI=https://crm.fabrik.so/auth/anthropic/callback
SUPABASE_URL=https://luibovhuvqnznucfwvym.supabase.co
SUPABASE_ANON_KEY=...
SB_ADMIN_KEY=...                     # = SUPABASE_SERVICE_ROLE_KEY
SB_JWT_ISSUER=https://luibovhuvqnznucfwvym.supabase.co/auth/v1
```

#### Gate Phase 2
```bash
# 1. Smoke health
curl http://localhost:54321/functions/v1/agent-runtime/health
# → {"ok":true,"ts":"..."}

# 2. Auth required
curl http://localhost:54321/functions/v1/agent-runtime/skills
# → 401 Unauthorized

# 3. Skills list (avec JWT valide)
curl -H "Authorization: Bearer $JWT" http://localhost:54321/functions/v1/agent-runtime/skills
# → {"skills": [{"id":"hello_world", ...}, ... 19 entries]}

# 4. Tools list
curl -H "Authorization: Bearer $JWT" http://localhost:54321/functions/v1/agent-runtime/tools
# → {"tools": [...60+ entries]}

# 5. helloWorld run (pas de LLM)
curl -N -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
     -d '{"skill_id":"hello_world","input":{"name":"world"}}' \
     http://localhost:54321/functions/v1/agent-runtime/run
# → SSE stream: run.started, run.done {"message":"Hello, world!"}
```

---

### Phase 3 — Premier vrai run LLM (30min)

#### 4.7 Vérifications avant de cliquer

- `ANTHROPIC_API_KEY` valide (ou OAuth flow déjà fait)
- `morning_brief` ou `chat_with_crm` ne dépend QUE de tools déjà testés (`search_tasks`, `search_deals`, etc.)
- Au moins 1 contact, 1 deal, 1 task de test dans la DB locale

#### Gate Phase 3
```bash
curl -N -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
     -d '{"skill_id":"morning_brief","input":{}, "dry_run":true}' \
     http://localhost:54321/functions/v1/agent-runtime/run
# → SSE: run.started, plusieurs tool_use/tool_result, run.done avec markdown FR
```

Si échec → 95% des cas c'est :
- Clé API invalide
- `zod-to-json-schema` produit du schema que Claude rejette → retirer `.refine()` du tool incriminé
- Variable `SUPABASE_URL` mal renseignée → les tool handlers ne peuvent pas faire leurs queries

---

### Phase 4 — Frontend de base (2h)

#### 4.8 Fichiers à créer / modifier

À créer :
```
src/lib/
├── agenticClient.ts          # streamSkillRun + listSkills + listTools + custom CRUD
├── userActionsTracker.ts     # track() + flush
├── dataProviderTracking.ts   # withTracking()
├── aiProviders.ts            # listProviderStatuses (statuts API keys)
└── anthropicOAuth.ts         # PKCE client (si OAuth Claude.ai branché)

src/hooks/
├── useAgentChat.ts           # hook chat conversationnel
├── useSkillRun.ts            # hook lancement skill
├── useListSkills.ts          # query skills
├── useCircuitStates.ts       # query circuit breaker (ops)
└── useTrackNavigation.ts     # nav.visit auto

src/components/atomic-crm/agentic/
├── index.ts
├── AgentPage.tsx             # 5 tabs (Chat/Skills/Custom/Activity/Runs)
├── AgentChatFull.tsx         # chat fullscreen avec canvas split
├── SkillsCatalog.tsx         # grille + filtres + Tester
├── SkillTestDialog.tsx       # dialog input JSON + dry-run
├── CustomSkillsPanel.tsx     # liste + form (export CustomSkillDraft)
├── ActivityPanel.tsx         # sessions + Suggérer skill
├── SkillLauncher.tsx         # bouton réutilisable
├── SkillRunPanel.tsx         # affichage live d'un run
├── SkillRunsTable.tsx        # table runs récents
├── SkillRunDetail.tsx        # dialog détail run
├── SkillRunTrace.tsx         # render events SSE
├── SkillMetricsChart.tsx     # graph runs/heure (recharts)
├── AgenticControlsPanel.tsx  # kill switch UI (admin)
└── chat/
    ├── AgentSidebar.tsx      # sidebar flottant Ctrl+L
    ├── AnthropicConnectModal.tsx
    ├── ToolTimeline.tsx      # mini-timeline tool_use → tool_result
    └── blocks/
        ├── parser.ts          # parse les fences ```crm:<kind>
        ├── types.ts           # CrmBlock = TableBlock | DashboardBlock | ...
        ├── MessageContent.tsx # rend markdown + blocs
        ├── TableBlock.tsx
        ├── DashboardBlock.tsx
        ├── KanbanBlock.tsx
        ├── ActionsBlock.tsx
        ├── ApproveBlock.tsx
        └── FullscreenBlock.tsx
```

À modifier :
```
src/components/atomic-crm/providers/supabase/dataProvider.ts
   → import { withTracking } et wrapper le retour de getDataProvider()

src/components/atomic-crm/layout/Layout.tsx
   → mount AgentSidebar + useTrackNavigation

src/components/atomic-crm/layout/FabrikSidebar.tsx
   → ajouter NavItem "Agent" sous Équipe (icône Bot)

src/components/atomic-crm/root/CRM.tsx
   → import AgentPage + Route + Resource agent_custom_skills
   → IMPORTANT: ne pas écraser IntegrationsPage / EmailInboxPage / TasksPage qui existent déjà
```

#### 4.9 Détail du diff CRM.tsx (à appliquer)

```diff
+ import AgentPage from "../agentic/AgentPage";
+ import { AIProvidersPage } from "../settings/AIProvidersPage";   // optionnel : page de gestion des clés API
  import { TasksPage } from "../tasks/TasksPage";
  import { IntegrationsPage } from "../settings/IntegrationsPage"; // ON GARDE
  import { EmailInboxPage } from "../emails/EmailInboxPage";       // ON GARDE

  // ...
        <Route path={IntegrationsPage.path} element={<IntegrationsPage />} />
        <Route path={EmailInboxPage.path} element={<EmailInboxPage />} />
+       <Route path={AIProvidersPage.path} element={<AIProvidersPage />} />
+       <Route path={AgentPage.path} element={<AgentPage />} />
        <Route path={TasksPage.path} element={<TasksPage />} />
      </CustomRoutes>
+     <Resource name="agent_custom_skills" />
      <Resource name="tasks" list={TasksPage} />  // ON GARDE le list custom
      // ...stripe_payouts + finance_metrics ON GARDE
```

#### Gate Phase 4
- `npm run dev` démarre sans erreur TS bloquante
- Naviguer vers `/agent` affiche les 5 onglets
- Chaque onglet charge sans crash (les queries peuvent échouer si JWT manque, OK)
- Sidebar : entrée "Agent" visible

---

### Phase 5 — Telemetry capture (1h)

#### 4.10 Wiring

1. Importer `withTracking` dans `dataProvider.ts` (déjà couvert §4.9)
2. Importer `useTrackNavigation` dans `Layout.tsx` et l'appeler tout en haut de la fn

#### Gate Phase 5
- Naviguer dans le CRM (créer un contact, modifier un deal, ouvrir une fiche)
- `psql -c "select action, resource, occurred_at from user_actions order by occurred_at desc limit 10"`
- Doit afficher : `nav.visit`, `data.create`, `data.update` selon ce qu'on a fait
- Page `/agent` onglet **Activité** doit lister la session et expand → afficher la séquence

---

### Phase 6 — Skills custom + meta-skill (1h)

#### 4.11 Smoke test création skill custom

1. Sur `/agent` onglet **Skills custom**
2. Cliquer **Nouveau skill** → form ouverte
3. Remplir : skill_id=`my_first_custom`, model=sonnet, system_prompt="Tu es un assistant. Renvoie un JSON: {\"echo\": <message>}", tools_allowed=[]
4. Save → apparait dans la liste
5. Onglet **Skills** → la card `my_first_custom` apparaît avec badge `custom`
6. Cliquer **Tester** → input `{"message":"hello"}`, dry-run ON, lancer → run.done

#### 4.12 Smoke test meta-skill suggestion

Pré-requis : avoir au moins une session avec ≥ 5 actions cohérentes.

1. Onglet **Activité** → expand une session
2. Cliquer **Suggérer un skill**, hint "relance contact silencieux"
3. Attendre run.done → draft affiché avec rationale + warnings
4. Cliquer **Pré-remplir le formulaire** → switch sur Skills custom, modal ouverte avec le draft
5. Relire, ajuster, sauver

#### Gate Phase 6
- Skills custom listés via `/skills` avec `source: "custom"`
- Meta-skill produit un JSON valide conforme à son output_schema
- Le draft pré-remplit correctement (model, tools_allowed, system_prompt, rate_limit)

---

### Phase 7 — Production hardening (variable, 0.5j-2j)

Ne pas confondre avec "v1 prod-ready". Cf §8 dette connue.

Items :
- Rate limit côté Caddy/nginx pour `/agent-runtime/*` (eviter spam)
- Log shipping vers la stack obs choisie (Grafana / Datadog / rien)
- Cron quotidien `select cleanup_user_actions(30)` + cleanup `agentic_circuit_state` (fermer les circuits stuck)
- Alertes : circuit ouvert > 30min, taux d'erreur > 20%/heure, coût > limite tenant
- Backup : `agent_custom_skills` doit être inclus dans le dump quotidien (le system_prompt = IP)
- Tests E2E Playwright sur le flow chat (au moins une happy path)

---

## 5. Contrats inter-couches

### 5.1 SSE events (frontend doit savoir parser)

| Event | Data shape |
|---|---|
| `run.started` | `{ run_id: number, dry_run: boolean }` |
| `text` | `{ content: string }` (cumulatif, frontend remplace) |
| `tool_use` | `{ name: string, args: unknown }` |
| `tool_result` | `{ name: string, result: unknown }` |
| `thinking` | `string` (Claude extended thinking) |
| `run.done` | `{ run_id: number, output: unknown, usage?: {...} }` |
| `run.error` | `{ run_id: number, error: string }` |

### 5.2 Blocs `crm:<kind>` (système de rendu riche dans le chat)

Spécifié dans le system prompt de `chatWithCrmSkill`. Contrat parser dans `chat/blocks/parser.ts` qui découpe le markdown sur les fences ```` ```crm:<kind> ... ``` ````. Kinds supportés :

- `crm:table` — `{ title, columns: [{key,label,align?}], rows: [{...}], entityType?, rowLinkKey? }`
- `crm:dashboard` — `{ title, kpis: [{label,value,tone?}], bars?: [{label,value}] }`
- `crm:kanban` — `{ columns: [{key,title,count?,amount?,deals: [{id,name,company?,amount?}]}] }`
- `crm:actions` — `{ title?, items: [{label, reason?, entity?, actions: [{kind, label?, ...}]}] }`
- `crm:approve` — `{ title, description, diff: [{field,before?,after?}], action: {...} }`
- `crm:fullscreen` — `{ title, sections: [{title, content}] }`

Les `actions[].kind` exécutables côté frontend : `open`, `email`, `call`, `update`, `task`, `note`. Tous les destructifs (update/task/note) demandent confirmation utilisateur avant exécution (mutation via dataProvider, ce qui re-déclenche au passage le tracking).

### 5.3 RLS table-by-table

| Table | SELECT (auth) | INSERT (auth) | UPDATE/DELETE (auth) |
|---|---|---|---|
| `skill_runs` | self | self | self (statut/output uniquement) |
| `chat_conversations` | self | self | self |
| `chat_messages` | self (via FK conv) | self | self |
| `agent_custom_skills` | tous | admin | admin |
| `user_actions` | self ou admin | self | aucun |
| `user_oauth_tokens` | aucune | aucune | aucune (service-role only) |
| `user_api_keys` | aucune | aucune | aucune (service-role only) |
| `agentic_circuit_state` | tous (read-only) | aucun | service-role only |
| `tenant_settings` | admin du tenant | admin | admin |

---

## 6. Détails de wiring spécifiques au target repo

### 6.1 Layout.tsx

Le repo cible n'a pas de `useTrackNavigation` ni `AgentSidebar`. Patch :

```diff
+ import { AgentSidebar } from "../agentic/chat/AgentSidebar";
+ import { useTrackNavigation } from "@/hooks/useTrackNavigation";

  export const Layout = ({ children }: { children: ReactNode }) => {
    useConfigurationLoader();
+   useTrackNavigation();
    return (
      <div className="flex h-screen overflow-hidden">
        <FabrikSidebar />
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <FabrikTopBar />
          <main className="flex-1 overflow-auto p-4 md:p-6" id="main-content">
            <ErrorBoundary FallbackComponent={Error}>
              <Suspense fallback={<Skeleton className="h-12 w-12 rounded-full" />}>
                {children}
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
        <Notification />
+       <AgentSidebar />
      </div>
    );
  };
```

### 6.2 FabrikSidebar.tsx

Ajouter une entrée Agent. Placement recommandé : sous "Équipe" pour ne pas perturber l'ordre des sections opérationnelles existantes.

### 6.3 dataProvider.ts

Le repo cible utilise déjà `withLifecycleCallbacks` autour de `getDataProviderWithCustomMethods()`. **Ordre IMPORTANT : tracking doit être l'OUTERMOST wrapper** pour intercepter même les writes générés par les lifecycle callbacks.

```diff
+ import { withTracking } from "@/lib/dataProviderTracking";

  export const getDataProvider = () => {
    // ... env checks
-   return withLifecycleCallbacks(
-     getDataProviderWithCustomMethods(),
-     lifeCycleCallbacks,
-   ) as CrmDataProvider;
+   const wrapped = withLifecycleCallbacks(
+     getDataProviderWithCustomMethods(),
+     lifeCycleCallbacks,
+   ) as CrmDataProvider;
+   return withTracking(wrapped) as CrmDataProvider;
  };
```

### 6.4 CRM.tsx

Cf §4.9. Garder absolument `IntegrationsPage`, `EmailInboxPage`, `TasksPage`, `Resource stripe_payouts`, `Resource finance_metrics`, `Resource list={TasksPage}` pour `tasks`.

### 6.5 Le code des skills/tools nécessite-t-il des modifs pour ~/atomic-crm ?

Audit rapide des dépendances aux schémas :

| Skill / Tool | Table dépendance | Présente dans ~/atomic-crm ? |
|---|---|---|
| `search_contacts` etc. | `contacts`, `contacts_summary` | ✅ |
| `search_deals` etc. | `deals` | ✅ |
| `search_appointments` etc. | `appointments` | ✅ |
| `search_dev_tasks` etc. | `dev_tasks`, `dev_task_labels` | ✅ |
| `list_subscriptions`, `list_payments` | `subscriptions`, `payments` | ✅ |
| `update_recording_insights` | `contact_recordings.{sentiment,warmth_*}` | ❌ → migration §4.2 |
| `process_video_conference` (skill) | `video_conferences` | ❌ → hors scope (§9) |
| `bulk_inbox_triage` | `email_messages` | ✅ |
| `send_email` (tool) | call edge fn `send_email_raw` | ✅ |
| `merge_contacts` (tool) | call edge fn `merge_contacts` | ✅ |
| `get_posthog_activity` | call edge fn `posthog_contact_activity` | ✅ |
| `push_to_billionmail` | call edge fn `billionmail_push_contact` | ✅ |

Le code des skills/tools est portable tel quel à 99%. Seul ajustement : ajouter la migration `add_recording_insights.sql` sinon le skill `process_call_recording` v2 plante au moment de `update_recording_insights`.

---

## 7. Tests d'acceptation par phase

Récap des gates §4 + tests UI clés :

| # | Test | Phase |
|---|---|---|
| T-01 | `npx supabase migration up --local` réussit | 1 |
| T-02 | `select count(*) from skill_runs` = 0 sans erreur | 1 |
| T-03 | `GET /agent-runtime/health` → 200 | 2 |
| T-04 | `GET /agent-runtime/skills` retourne 19 skills | 2 |
| T-05 | `GET /agent-runtime/tools` retourne ≥ 60 tools | 2 |
| T-06 | helloWorld run produit run.done | 2 |
| T-07 | morning_brief dry-run produit du markdown FR | 3 |
| T-08 | `/agent` chat → "fais le brief" → tools appelés visibles | 4 |
| T-09 | Créer un contact → `select * from user_actions` montre `data.create` | 5 |
| T-10 | Onglet Activité → la session apparaît avec ses actions | 5 |
| T-11 | Custom skill `my_first` apparaît dans /skills avec badge custom | 6 |
| T-12 | suggest_skill_from_session retourne un draft conforme au schema | 6 |

Si T-06 échoue, s'arrêter là. Si T-07 échoue, c'est probablement un problème de pricing/JSON schema (cf §8 risque R-1).

---

## 8. Risques & mitigations

| ID | Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | `zod-to-json-schema` produit du schema que Claude rejette | Moyenne | Bloquant pour skills LLM | Tester chaque tool en isolation. Retirer `.refine()` et `.transform()`. Replier sur `additionalProperties:true` si nécessaire. |
| R-2 | Race sur `append_skill_run_trace` (3 tools parallèles → 2 perdus) | Élevée | Corruption trace | Migrer vers table normalisée `skill_run_steps(run_id, seq)` avec `seq = nextval(...)`. À planifier en v1.1. |
| R-3 | Pas de retry / timeout sur appels LLM | Élevée | SSE hang | Wrapper chaque provider avec `p-retry` + `AbortSignal.timeout(60_000)`. Mitigation immédiate : timeout côté navigateur (10min). |
| R-4 | Zéro tests unitaires | Élevée | Régression silencieuse | Cible v1.1 : `deno test` sur chaque tool write + son undo + chaque guardrail. |
| R-5 | DeepSeek `prompt_cache_hit_tokens` change de nom | Faible | Pricing inexact | Logger l'usage brut, n'utiliser pour billing qu'après validation. |
| R-6 | Custom skill avec prompt destructif (admin compromis) | Faible | Données perdues | `tools_allowed` validé contre registry + `max_writes` plafonné. Pas de custom skill ne peut bypasser ces limites. |
| R-7 | Telemetry hits l'edge fn 50× / sec en pic | Faible | Coût + DDoS auto | Buffer + debounce 5s/20events côté client. Bursts de 50 actions = 2-3 batchs. |
| R-8 | Le user supprime sa session avant flush → events perdus | Moyenne | Lacunes telemetry | `pagehide` + `keepalive: true` + `visibilitychange`. Acceptable si <1% pertes. |
| R-9 | OAuth Anthropic beta change | Moyenne | Chat OAuth cassé | Header `anthropic-beta: oauth-2025-04-20` à monitorer ; fallback API key per user via `user_api_keys` qui marche en parallèle. |
| R-10 | Sentiment/warmth columns créées par migration mais le frontend lit le nom anglais | Faible | UI cassée | Coller au schema `contact_recordings` existant (`email_advice`, `sms_advice` snake_case) — déjà fait. |
| R-11 | Conflit avec une migration future `db diff` qui régénère les tables agentiques | Élevée | Diff phantom | Préférer Option A §4.3 (schema déclaratif). Sinon, marquer la baseline migration comme "ne pas régénérer" via convention de nommage. |

---

## 9. Hors scope v1

Explicit pour éviter le scope creep :

- **Multi-tenant JWT injection réel.** La structure (`tenant_id` sur skill_runs, `tenant_settings` table) est posée mais l'extraction du `tenant_id` depuis le JWT n'est pas câblée. Reporté quand le SaaS aura ≥ 3 clients.
- **Skill `process_video_conference`.** Table `video_conferences` pas dans les migrations versionnées (créée hors-piste sur la prod). À régulariser : `npx supabase db pull` puis créer la migration de baseline pour cette table avant d'écrire le skill.
- **Tests E2E Playwright** sur le flow chat. v1.1.
- **Cron quotidien `cleanup_user_actions(30)`.** Doit être créé via `supabase functions deploy cleanup` + scheduled invocations.
- **Macro recording / playback** (Option C de la conversation initiale). Reporté : interpréter intent humain en chaîne de tools est trop fragile pour v1.
- **Anthropic OAuth en prod.** Le flow est codé mais nécessite des credentials beta côté Anthropic. Tant qu'ils ne sont pas obtenus, garder uniquement les API keys per-user via `user_api_keys`.
- **Modèle de coûts par tenant.** Tracking par `skill_runs.cost_usd` existe ; agrégation mensuelle + facturation Stripe à câbler quand la grille tarifaire SaaS sera fixée.
- **Vue admin globale des skills custom inter-tenants.** Pour l'instant chaque tenant voit ses skills (la RLS le permettrait avec `tenant_id`, mais `tenant_id` n'est pas posé sur la table → à faire en même temps que multi-tenant réel).

---

## 10. Ordre d'exécution recommandé pour porter

Suite ordonnée, à exécuter par un dev senior qui a lu le code source de la copie agentique en parallèle :

1. **Snapshot main** : `git checkout -b feat/agentic-port` depuis `main` à jour
2. **Phase 1** : porter les 9 migrations + `01_tables.sql` (Option A) + run `npx supabase migration up --local` → **gate T-01/T-02**
3. **Phase 2.1** : copier `_shared/{llm,tools,skills,guardrails,oauth,userKeys}` depuis la copie agentique (≈ 2 200 lignes)
4. **Phase 2.2** : copier `agent-runtime/*` (≈ 600 lignes)
5. **Phase 2.3** : compléter `.env` edge fn (cf §4.6)
6. **Phase 2.4** : `npx supabase functions serve agent-runtime` → **gates T-03 à T-06**
7. **Phase 3** : configurer une clé Anthropic test, run `morning_brief` → **gate T-07**
8. **Phase 4.1** : copier `src/lib/{agenticClient,userActionsTracker,dataProviderTracking,aiProviders,anthropicOAuth}.ts`
9. **Phase 4.2** : copier `src/hooks/{useAgentChat,useSkillRun,useListSkills,useCircuitStates,useTrackNavigation}.ts`
10. **Phase 4.3** : copier `src/components/atomic-crm/agentic/` entier
11. **Phase 4.4** : merger les diffs Layout.tsx, FabrikSidebar.tsx, CRM.tsx, dataProvider.ts (cf §6) — **un fichier à la fois, en relisant**
12. **Phase 4.5** : `npm run dev` → **gate T-08**
13. **Phase 5** : un peu de navigation + queries → **gates T-09, T-10**
14. **Phase 6** : créer un custom skill + tester suggest_skill → **gates T-11, T-12**
15. **Commits atomiques** : un commit par phase. Permet rollback chirurgical.
16. **Phase 7** : production hardening selon priorité business

Estimation totale : **2-3 jours** pour un dev qui connaît le repo. **5-7 jours** pour quelqu'un qui découvre.

---

## 11. Fichiers de référence dans la copie agentique

À ouvrir quand on a un doute pendant le portage :

| Question | Fichier de référence |
|---|---|
| « Comment Claude consomme les tools ? » | `_shared/llm/toolLoop.ts` |
| « Format exact d'un SkillManifest ? » | `_shared/skills/types.ts` + `morningBrief.ts` |
| « Pré-flight order ? » | `agent-runtime/executeSkill.ts` |
| « Format SSE ? » | `agent-runtime/sse.ts` |
| « Comment intercepter le dataProvider ? » | `src/lib/dataProviderTracking.ts` |
| « Comment parser les blocs `crm:<kind>` ? » | `agentic/chat/blocks/parser.ts` |
| « Schéma RLS des skill_runs ? » | `supabase/migrations/20260423160000_add_skill_runs.sql` |
| « Wrapper OAuth Anthropic ? » | `_shared/oauth/anthropic.ts` |
| « Loader merge code+DB ? » | `_shared/skills/loader.ts` |

---

## 12. Validation finale du brief

Ce document remplit-il les conditions du §0 ?

- ✅ Inventaire de l'état actuel du repo cible (§2)
- ✅ Décisions architecturales avec rationale (§3, 10 ADRs)
- ✅ Ordre exact d'application avec gates (§4, §10, 7 phases)
- ✅ Contrats inter-couches (§5)
- ✅ Diffs précis pour les fichiers modifiés (§6)
- ✅ Tests d'acceptation (§7, 12 tests)
- ✅ Risques + mitigations (§8, 11 risques)
- ✅ Hors scope explicite (§9)
- ✅ Pointeurs vers les fichiers source (§11)

**Conclusion** : un dev senior qui a accès aux deux repos peut reproduire l'intégration en suivant ce brief de bout en bout. Le seul travail créatif restant = écrire les tools/skills domaine-spécifiques s'il souhaite étendre au-delà des 19 skills actuels — et pour ça, le pattern `prepareMeetingBriefSkill` (cf §11) sert de gabarit.
