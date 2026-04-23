# Story D.1 — Flag `agentic_enabled` par tenant

**Epic**: D. SaaS enablement
**Status**: Ready
**Estimation**: 3h
**Depends on**: A.1, A.4 (tenantAccess.ts existe)
**Blocks**: D.2, D.3

## Contexte business

Pour le SaaS, l'agentique est une feature payante / optionnelle. Chaque tenant doit pouvoir l'activer ou non, et choisir quels skills lui sont disponibles. Cette story pose la structure de données et la logique de gating côté runtime.

## Contexte technique

- En v1 interne, `tenant_id` est null partout (single-tenant). Cette story prépare le multi-tenant SaaS.
- Gating déjà en place côté runtime (`checkTenantAccess` en A.4) ; cette story crée la source de données (table `tenant_settings`)
- Ne pas confondre avec la table `configuration` (singleton global) — ici on a une ligne par tenant

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `supabase/schemas/01_tables.sql` | Ajouter table `tenant_settings` |
| `supabase/schemas/05_policies.sql` | RLS |
| `supabase/schemas/06_grants.sql` | Grants |
| `supabase/functions/_shared/guardrails/tenantAccess.ts` | Lire tenant_settings |
| `src/components/atomic-crm/types.ts` | Ajouter `TenantSettings` |

## Spec technique

### Table

```sql
create table public.tenant_settings (
  tenant_id uuid primary key,
  agentic_enabled boolean not null default false,
  agentic_enabled_skills text[] not null default '{}'::text[],
  agentic_usage_limits jsonb not null default '{
    "per_day": 500,
    "per_month": 10000,
    "max_cost_usd_per_month": 100
  }'::jsonb,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tenant_settings_agentic_enabled_idx
  on public.tenant_settings (agentic_enabled) where agentic_enabled;
```

### RLS

```sql
alter table public.tenant_settings enable row level security;

-- Un user voit son propre tenant (récupéré via sales.tenant_id futur, ou JWT claim)
-- En v1 interne, sales n'a pas de tenant_id ; on reporte à v1.1
-- Pour l'instant : lecture réservée à service_role et admins
create policy tenant_settings_select_admin on public.tenant_settings
  for select to authenticated using (
    exists (select 1 from public.sales where user_id = auth.uid() and administrator)
  );
create policy tenant_settings_update_admin on public.tenant_settings
  for update to authenticated using (
    exists (select 1 from public.sales where user_id = auth.uid() and administrator)
  );
```

> **Note de roadmap** : le modèle tenant-aware complet (sales.tenant_id, RLS croisée, auth.users claim tenant_id) est hors scope v1. Cette table est structurelle ; l'appariement user → tenant se fera en v1.1. En attendant, `tenantAccess` est un no-op pour `tenant_id = null`.

### Grants

```sql
grant select, update on public.tenant_settings to authenticated;
grant all on public.tenant_settings to service_role;
```

### `tenantAccess.ts` mis à jour

```ts
import { createClient } from "npm:@supabase/supabase-js@2";

export async function checkTenantAccess(
  userJwt: string, skillId: string, tenantId?: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!tenantId) return { ok: true }; // v1 interne single-tenant

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${userJwt}` } } },
  );
  const { data } = await supa.from("tenant_settings")
    .select("agentic_enabled, agentic_enabled_skills")
    .eq("tenant_id", tenantId).maybeSingle();

  if (!data || !data.agentic_enabled) {
    return { ok: false, reason: "agentic_not_enabled_for_tenant" };
  }
  if (!data.agentic_enabled_skills.includes(skillId)) {
    return { ok: false, reason: "skill_not_enabled_for_tenant" };
  }
  return { ok: true };
}
```

### Types

```ts
export type TenantSettings = {
  tenant_id: string;
  agentic_enabled: boolean;
  agentic_enabled_skills: string[];
  agentic_usage_limits: {
    per_day: number;
    per_month: number;
    max_cost_usd_per_month: number;
  };
  stripe_subscription_id?: string | null;
  created_at: string;
  updated_at: string;
};
```

## Critères d'acceptation

- [ ] Migration passe sans erreur
- [ ] En v1 interne (tenant_id=null partout), aucun comportement régressé
- [ ] Sur une simulation multi-tenant (seed manuel) : un run avec tenant_id sans row `tenant_settings` → 403
- [ ] Un tenant avec `agentic_enabled=true` mais `agentic_enabled_skills=[]` → 403 pour tout skill
- [ ] `make typecheck` passe

## Risques / pièges

- Le modèle tenant complet n'existe pas encore dans ce repo. Assumer que cette story est **préparatoire**. Ne pas tenter d'y ajouter `sales.tenant_id` ou de refacto RLS des autres tables — ça serait une vraie milestone séparée.
- RLS temporaire admin-only : c'est OK tant qu'on n'a qu'un tenant. En multi-tenant réel, il faudra une policy croisée via claim JWT.

## Done

- Commit : `feat(agentic): add tenant_settings table for SaaS enablement`
- Doc dans `docs/agentic/saas-rollout.md` précisant le path multi-tenant complet (futur)
