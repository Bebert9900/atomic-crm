# Story A.1 — Migration `skill_runs` + RLS

**Epic**: A. Foundation
**Status**: Ready
**Estimation**: 2h
**Depends on**: —
**Blocks**: A.2, A.3, A.4, A.5, tout le reste

## Contexte business

Table de persistence centrale pour tous les runs de skills. Sans elle, aucune exécution ne peut être loggée, rejouée, ou rollback.

## Contexte technique

- Schéma déclaratif dans `supabase/schemas/` (source de vérité)
- Pattern de migration : éditer `01_tables.sql`, puis `npx supabase db diff --local -f <name>`
- RLS utilisé partout (voir `05_policies.sql`)
- `tenant_id` préparatoire multi-tenant SaaS, nullable en v1 interne
- Le champ `trace` accumule l'historique complet d'une exécution ; doit rester JSONB pour flexibilité

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `supabase/schemas/01_tables.sql` | Ajouter table `skill_runs` |
| `supabase/schemas/03_views.sql` | Ajouter vue `skill_runs_metrics_1d` |
| `supabase/schemas/05_policies.sql` | Ajouter policies RLS |
| `supabase/schemas/06_grants.sql` | Grants `authenticated` |
| `supabase/migrations/<ts>_add_skill_runs.sql` | Auto-généré |
| `src/components/atomic-crm/types.ts` | Ajouter types TS |

## Spec technique

### Table (à coller en fin de `01_tables.sql`)

```sql
create table public.skill_runs (
  id bigint generated always as identity primary key,
  skill_id text not null,
  skill_version text not null,
  user_id uuid not null references auth.users(id),
  tenant_id uuid,
  input jsonb not null default '{}'::jsonb,
  trace jsonb not null default '[]'::jsonb,
  output jsonb,
  status text not null default 'running'
    check (status in ('running','success','error','cancelled','shadow')),
  dry_run boolean not null default false,
  input_tokens int,
  output_tokens int,
  cache_read_tokens int,
  cache_creation_tokens int,
  cost_usd numeric(10,6),
  error_code text,
  error_message text,
  model text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index skill_runs_user_id_started_at_idx
  on public.skill_runs (user_id, started_at desc);
create index skill_runs_skill_id_started_at_idx
  on public.skill_runs (skill_id, started_at desc);
create index skill_runs_status_running_idx
  on public.skill_runs (status) where status = 'running';
create index skill_runs_tenant_id_started_at_idx
  on public.skill_runs (tenant_id, started_at desc) where tenant_id is not null;
```

### Vue (à coller dans `03_views.sql`)

```sql
create or replace view public.skill_runs_metrics_1d as
select
  skill_id,
  date_trunc('hour', started_at) as bucket,
  count(*) as runs,
  count(*) filter (where status = 'success') as successes,
  count(*) filter (where status = 'error') as errors,
  count(*) filter (where status = 'cancelled') as cancellations,
  count(*) filter (where dry_run) as dry_runs,
  avg(extract(epoch from ended_at - started_at))
    filter (where ended_at is not null) as avg_duration_s,
  percentile_disc(0.95) within group (order by extract(epoch from ended_at - started_at))
    filter (where ended_at is not null) as p95_duration_s,
  sum(cost_usd) as total_cost_usd,
  sum(input_tokens) as total_input_tokens,
  sum(output_tokens) as total_output_tokens
from public.skill_runs
where started_at > now() - interval '24 hours'
group by 1, 2;
```

### RLS (à coller dans `05_policies.sql`)

```sql
alter table public.skill_runs enable row level security;

create policy skill_runs_select_own on public.skill_runs
  for select to authenticated
  using (user_id = auth.uid());

create policy skill_runs_insert_own on public.skill_runs
  for insert to authenticated
  with check (user_id = auth.uid());

create policy skill_runs_update_own on public.skill_runs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

### Grants (à coller dans `06_grants.sql`)

```sql
grant select, insert, update on public.skill_runs to authenticated;
grant usage on sequence public.skill_runs_id_seq to authenticated;
grant select on public.skill_runs_metrics_1d to authenticated;
```

### Types TS (à coller dans `src/components/atomic-crm/types.ts`)

```ts
export type SkillRunStatus =
  | 'running'
  | 'success'
  | 'error'
  | 'cancelled'
  | 'shadow';

export type SkillRunTraceStep =
  | { step: number; type: 'user'; content: string; ts: string }
  | { step: number; type: 'assistant_text'; content: string; ts: string }
  | { step: number; type: 'assistant_thinking'; content: string; ts: string }
  | { step: number; type: 'tool_use';
      tool: string; args: unknown; tool_use_id: string; ts: string }
  | { step: number; type: 'tool_result';
      tool_use_id: string; result: unknown;
      duration_ms: number; status: 'ok' | 'error'; ts: string }
  | { step: number; type: 'guardrail';
      name: string; outcome: 'allow' | 'deny'; reason: string; ts: string };

export type SkillRun = {
  id: number;
  skill_id: string;
  skill_version: string;
  user_id: string;
  tenant_id?: string | null;
  input: Record<string, unknown>;
  trace: SkillRunTraceStep[];
  output?: unknown;
  status: SkillRunStatus;
  dry_run: boolean;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_tokens?: number | null;
  cache_creation_tokens?: number | null;
  cost_usd?: number | null;
  error_code?: string | null;
  error_message?: string | null;
  model?: string | null;
  started_at: string;
  ended_at?: string | null;
};
```

## Critères d'acceptation

- [ ] Migration générée via `npx supabase db diff --local -f add_skill_runs`
- [ ] `npx supabase migration up --local` passe sans erreur
- [ ] Un user authentifié peut insérer/lire ses propres lignes via le dataProvider
- [ ] Test RLS manuel : user A ne peut pas lire les `skill_runs` de user B
- [ ] `make typecheck` passe
- [ ] `make lint` passe
- [ ] La vue `skill_runs_metrics_1d` retourne des lignes après insertion de test

## Tests

### Test RLS manuel
```sql
-- En tant que user A
insert into skill_runs (skill_id, skill_version, user_id, input)
values ('test', '1.0.0', auth.uid(), '{}');
-- OK

-- En tant que user A, essayer de lire en forçant user_id d'un autre
select * from skill_runs where user_id = '<user_B_uuid>';
-- Doit retourner 0 rows
```

### Test insertion trace
```sql
insert into skill_runs (skill_id, skill_version, user_id, trace)
values ('test', '1.0.0', auth.uid(),
  '[{"step":0,"type":"user","content":"hello","ts":"2026-04-23T10:00:00Z"}]');
```

## Risques / pièges

- Le pre-commit hook exécute `make registry-gen` — pas d'impact, juste le savoir
- Relire la migration générée avant commit (peut être verbeuse)
- Ne pas oublier les grants : sans eux, l'insertion échoue silencieusement en RLS
- Le champ `trace` peut devenir gros sur runs longs. Prévoir en v1.x un GIN index si on filtre dessus

## Done

- Commit unique : `feat(agentic): add skill_runs table with RLS and metrics view`
- Les types sont exportés depuis `types.ts`
- Pas de PR séparée si workflow trunk-based ; sinon PR titrée idem
