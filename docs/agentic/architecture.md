# Architecture Document — Agentic CRM Layer

**Owner**: Architect role
**Version**: 1.0
**Target**: devs implémentant les stories

## 1. Vue d'ensemble

```
┌────────────────────────────────────────────────────────────────┐
│                         CRM Frontend                            │
│   <SkillLauncher>, slash commands, buttons, trace panel         │
└────────────────────────────────┬───────────────────────────────┘
                                 │ HTTPS (Bearer: user JWT)
                                 ▼
┌────────────────────────────────────────────────────────────────┐
│        Supabase Edge Function `agent-runtime`                   │
│                                                                 │
│  ┌─────────────┐   ┌────────────────────┐   ┌──────────────┐  │
│  │Skill Router │──▶│ Claude API loop    │◀──│Tool Registry │  │
│  │(resolves    │   │(messages.create    │   │(TS module,   │  │
│  │ manifest)   │   │ tool_use loop)     │   │ whitelist)   │  │
│  └─────────────┘   └──────────┬─────────┘   └──────┬───────┘  │
│         │                     │                    │           │
│         ▼                     ▼                    ▼           │
│  ┌─────────────┐   ┌────────────────────┐   ┌──────────────┐  │
│  │Guardrails   │   │ Trace accumulator  │   │ Tool executor│  │
│  │(rate limit, │   │ (step log +        │   │ (Supabase    │  │
│  │ kill switch,│   │  token/cost acc.)  │   │  w/ user JWT │  │
│  │ thresholds) │   │                    │   │  → RLS)      │  │
│  └─────────────┘   └──────────┬─────────┘   └──────┬───────┘  │
│                               │                    │           │
└───────────────────────────────┼────────────────────┼──────────┘
                                │                    │
                                ▼                    ▼
                        ┌──────────────┐     ┌──────────────┐
                        │ skill_runs   │     │ PostgreSQL   │
                        │ (trace)      │     │ + MCP server │
                        └──────────────┘     └──────────────┘
```

## 2. Composants

### 2.1 `agent-runtime` (nouvelle edge function)

**Path**: `supabase/functions/agent-runtime/`
**Endpoints**:
- `POST /functions/v1/agent-runtime/run` — déclenche un skill (streaming SSE)
- `POST /functions/v1/agent-runtime/rerun/:run_id` — relance un run depuis son trace
- `POST /functions/v1/agent-runtime/undo/:run_id` — rollback des actions d'écriture
- `GET  /functions/v1/agent-runtime/health` — health check
- `GET  /functions/v1/agent-runtime/skills` — liste des skills activés pour l'user

**Auth**: même pattern que `mcp/index.ts` — valide JWT user via JWKS.

**Dispatch**:
```
POST /run
body: { skill_id, input, dry_run?: boolean }

1. Auth: valider JWT → userId
2. Guardrails: rate limits, kill switch, agentic_enabled ?
3. Resolve skill manifest by skill_id
4. Validate input vs skill.input_schema (Zod)
5. Create skill_run row (status='running')
6. Stream SSE: tool_use loop Claude API
7. On each tool_use:
    a. Check tool in skill.tools_allowed → else error
    b. Check cumulative writes vs threshold → else abort
    c. Execute tool via registry (user JWT for RLS)
    d. Append to trace
8. Loop until stop_reason='end_turn' OR max_iterations
9. Validate output vs skill.output_schema
10. Update skill_run (status, output, tokens, cost, ended_at)
11. SSE final event
```

### 2.2 Tool Registry

**Path**: `supabase/functions/_shared/tools/registry.ts`

Fonction unique de résolution :
```ts
type ToolHandler<I, O> = (args: I, ctx: ToolContext) => Promise<O>;

type ToolContext = {
  userJwt: string;       // pour RLS
  userId: string;
  tenantId?: string;
  runId: number;
  supabase: SupabaseClient; // client avec JWT du user
};

type ToolDefinition = {
  name: string;
  description: string;
  input_schema: z.ZodTypeAny;
  output_schema: z.ZodTypeAny;
  handler: ToolHandler<any, any>;
  kind: 'read' | 'write';
  reversible: boolean;   // si write, peut-on undo ?
  cost_estimate?: 'low' | 'medium' | 'high'; // indicatif pour observabilité
};

export const tools: Record<string, ToolDefinition> = { ... };
```

**Tools v1** (≥ 20, couverts par story A.3) :

Reads :
- `search_contacts`, `get_contact`, `list_contact_tasks`, `list_contact_notes`, `list_contact_emails`, `list_contact_recordings`
- `search_companies`, `get_company`, `list_company_deals`, `list_company_contacts`
- `search_deals`, `get_deal`, `list_deal_notes`
- `search_tasks`, `get_task`
- `get_recent_activity`
- `list_tags`
- `get_recording`, `get_transcription`

Writes (tous reversible) :
- `create_contact`, `update_contact`
- `create_task`, `complete_task`, `reschedule_task`
- `add_contact_note`, `add_deal_note`
- `update_deal` (champs non-destructifs uniquement : description, amount, expected_closing_date)
- `move_deal_stage` (stages non terminaux uniquement)
- `apply_tag`, `remove_tag`
- `link_email_to_contact`

Explicitement exclus v1 (non reversible ou trop risqué) :
- `delete_*`, `archive_company`, `move_deal_stage → won/lost`, `send_email`, `merge_contacts`

### 2.3 Skills Catalog

**Path**: `supabase/functions/_shared/skills/`

Un fichier par skill :
```ts
// supabase/functions/_shared/skills/process_call_recording.ts
import { z } from "zod";
import type { SkillManifest } from "./types.ts";

export const processCallRecordingSkill: SkillManifest = {
  id: "process_call_recording",
  version: "1.0.0",
  model: "claude-opus-4-7",
  input_schema: z.object({ recording_id: z.number() }),
  output_schema: z.object({
    deal_note_id: z.number().optional(),
    tasks_created: z.array(z.number()),
    summary: z.string(),
  }),
  tools_allowed: [
    "get_recording", "get_transcription", "get_contact",
    "list_contact_recordings", "search_deals", "get_deal",
    "add_deal_note", "create_task", "update_contact"
  ],
  max_iterations: 10,
  max_writes: 5,
  rate_limit: { per_minute: 2, per_hour: 20 },
  system_prompt: `...`,
};
```

**Registry des skills** dans `_shared/skills/index.ts` — map `id → manifest`.

### 2.4 Guardrails

**Path**: `supabase/functions/_shared/guardrails/`

Modules :
- `rateLimits.ts` — check rate limits en consultant `skill_runs` récents
- `killSwitch.ts` — lit `configuration.agentic_kill_switch` + `agentic_disabled_skills`
- `thresholds.ts` — compte les writes en cours vs `max_writes`
- `tenantAccess.ts` — vérifie `agentic_enabled_skills` du tenant contient le skill

Appelés en pré-flight dans l'edge function + à chaque tool call (threshold).

### 2.5 Claude API wrapper

**Path**: `supabase/functions/_shared/claude/client.ts`

Responsabilités :
- Wrap `@anthropic-ai/sdk` (import Deno npm)
- Prompt caching automatique sur `system` et `tools`
- Stream les events SSE
- Calculer le coût à partir du `usage` block final
- Retry logic sur erreurs transitoires (429, 529, 500-level)
- Timeout global par run (paramétrable, défaut 60s)

### 2.6 Trace / persistence

Table `skill_runs` (story A.1).

Chaque `trace_step` :
```ts
type TraceStep =
  | { step: number; type: 'user'; content: string; ts: string }
  | { step: number; type: 'assistant_text'; content: string; ts: string }
  | { step: number; type: 'assistant_thinking'; content: string; ts: string }
  | { step: number; type: 'tool_use'; tool: string; args: unknown; tool_use_id: string; ts: string }
  | { step: number; type: 'tool_result'; tool_use_id: string; result: unknown;
      duration_ms: number; status: 'ok'|'error'; ts: string }
  | { step: number; type: 'guardrail'; name: string; outcome: 'allow'|'deny'; reason: string; ts: string };
```

Le trace est la source unique de vérité pour : debug, undo, rejeu, audit.

### 2.7 Frontend integration

**Paths**:
- `src/components/atomic-crm/agentic/SkillLauncher.tsx` — bouton/menu qui invoque un skill
- `src/components/atomic-crm/agentic/SkillRunPanel.tsx` — affiche un run en cours (SSE) ou historique
- `src/components/atomic-crm/agentic/SkillRunTrace.tsx` — affiche le trace complet
- `src/hooks/useSkillRun.ts` — hook React pour invoquer + streamer
- `src/lib/agenticClient.ts` — client fetch SSE vers edge function

## 3. Flux d'exécution détaillé

1. User clique "Process recording" sur un contact_recording
2. Frontend `POST /functions/v1/agent-runtime/run` body `{ skill_id: "process_call_recording", input: { recording_id: 42 } }`, header `Authorization: Bearer <user JWT>`
3. Edge function valide JWT, checke rate limits, kill switch, tenant flags
4. Charge manifest `process_call_recording`, valide input
5. Insert `skill_runs` row id=1234, status=running
6. Premier appel `messages.create`:
   - system = manifest.system_prompt + contexte user/tenant (cached)
   - tools = manifest.tools_allowed.map(id => tools[id].toClaudeFormat()) (cached)
   - messages = [{ role: 'user', content: JSON.stringify(input) }]
7. Claude répond avec `stop_reason: "tool_use"` + tool_use blocks
8. Pour chaque tool_use :
   - Log `{type: 'tool_use', ...}` → trace
   - Vérifie tool in allowlist + threshold writes
   - Execute handler avec user JWT (RLS enforced)
   - Log `{type: 'tool_result', ...}` → trace
9. Nouveau `messages.create` avec les tool_results appended
10. Boucle jusqu'à `stop_reason: "end_turn"` ou max_iterations
11. Validate output contre output_schema
12. Update `skill_runs`: status=success, output, tokens, cost, ended_at
13. Stream final SSE event `done`

## 4. Sécurité

### 4.1 Authentification
Pattern identique à `mcp/index.ts` : JWT JWKS verification via `jose`, extraction userId et tenantId.

### 4.2 Authorization — RLS
Chaque tool handler reçoit un `SupabaseClient` initialisé avec le JWT du user :
```ts
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${userJwt}` } }
});
```
→ Les policies RLS existantes s'appliquent automatiquement. Aucun usage de `service_role` côté runtime.

### 4.3 Tool allowlist
Enforced en runtime. Toute tentative de tool hors whitelist → `trace: {guardrail: 'tool_not_allowed'}` + `skill_run.status = 'error'`.

### 4.4 Sandbox injection
- Inputs sanitized via Zod parse strict
- Aucune interpolation SQL (tools appellent le dataProvider ou supabase-js, pas de raw SQL depuis inputs LLM)

### 4.5 Secrets
- `ANTHROPIC_API_KEY` dans env edge function (jamais exposé frontend)
- Rotation documentée

## 5. Observabilité

### 5.1 Logs structurés
Chaque step du trace est aussi `console.log` JSON avec `{run_id, skill_id, step, type, ...}` pour ingestion future.

### 5.2 Metrics
Vue SQL `skill_runs_metrics_1d` :
```sql
create view skill_runs_metrics_1d as
select
  skill_id,
  date_trunc('hour', started_at) as bucket,
  count(*) as runs,
  count(*) filter (where status='success') as successes,
  count(*) filter (where status='error') as errors,
  avg(extract(epoch from ended_at - started_at)) as avg_duration_s,
  sum(cost_usd) as total_cost_usd
from skill_runs
where started_at > now() - interval '24 hours'
group by 1,2;
```

### 5.3 Dashboard
`/settings/agentic` — consomme la vue via dataProvider. Voir story C.1.

## 6. Décisions d'architecture (ADR compressés)

| # | Décision | Alternative rejetée | Justification |
|---|----------|---------------------|---------------|
| 1 | Edge function Deno plutôt que Node séparé | Service Node sur VPS | Cohérence stack, pattern déjà établi (mcp), auth gratuite |
| 2 | Tool registry en TS direct, pas MCP | Tout passer par MCP existant | MCP = SQL générique, pas adapté à la granularité skill. Registry TS = type safety + composition |
| 3 | Claude API direct (pas d'agent SDK tiers) | LangChain, Mastra, etc. | Contrôle total du prompt, caching, trace. Pas de dépendance lourde. |
| 4 | Modèle par skill | Un seul modèle global | Coût/latence : sonnet pour S3/S4, opus pour S1/S2/S5 |
| 5 | SSE streaming | Polling ou websockets | Native edge function, natif fetch côté frontend |
| 6 | Trace en JSONB vs table relationnelle | Table `trace_steps` normalisée | Flexibilité schema, lecture unique ; si besoin analytics → vue sur JSONB |
| 7 | Pas de human-in-the-loop en v1 | Workflow approval | Requirement explicite ; remplacé par guardrails architecturaux |
| 8 | Tools avec user JWT (RLS) vs service_role filtré | Service role + filtre tenant_id | RLS plus robuste, déjà testé, zéro risque d'oubli de filtre |
| 9 | Skills déclaratifs (manifests) | Skills = fonctions TS | Déclaratif = rollout/feature flag + génération doc facile |
| 10 | Shadow mode 2 semaines par défaut | Rollout direct | No HITL = filet de sécurité obligatoire lors du premier déploiement |

## 7. Migration path

1. **A.1** — Migration `skill_runs` + RLS (foundation table)
2. **A.2** — Squelette `agent-runtime` (auth + routing + SSE, pas encore de LLM)
3. **A.3** — Tool registry initial (10-20 tools testables en isolation)
4. **A.4** — Claude API wrapper avec caching
5. **A.5** — Frontend `<SkillLauncher>` + panel trace
6. **B.1** — `process_call_recording` bout-en-bout
7. **C.x** — Observabilité + rate limiting dès qu'un skill tourne
8. **B.2 → B.5** — Parallélisables une fois S1 validé
9. **D.x** — SaaS enablement quand skills stables

## 8. Glossaire

- **Skill** : capacité composite invocable, déclarée par un manifest
- **Tool** : opération atomique exposée à Claude via tool_use
- **Trace** : séquence d'events d'une exécution de skill
- **Run** : une instance d'exécution (1 ligne `skill_runs`)
- **Shadow mode** : exécution dry-run enregistrée, pas d'écriture réelle
- **Undo** : rollback des écritures d'une run via reparcours inverse du trace
- **Tenant** : un client du SaaS (isolé par RLS)
