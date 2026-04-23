# Story D.3 — Compteur d'usage pour facturation

**Epic**: D. SaaS enablement
**Status**: Ready
**Estimation**: 4h
**Depends on**: D.1, D.2, C.1
**Blocks**: —

## Contexte business

Les skills coûtent de l'API Claude + du compute. Pour les revendre, on doit mesurer la conso par tenant : nombre de runs, tokens, coût d'infra, coût facturable. Cette story pose la brique usage metering (pas la facturation automatique).

## Contexte technique

- Source unique : table `skill_runs` (déjà a `tenant_id`, `cost_usd`, `started_at`)
- Vue matérialisée rafraîchie quotidiennement pour perf
- Export CSV mensuel par tenant (utilisable pour fac Stripe manuelle v1 ; auto via webhook v1.1)

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `supabase/schemas/03_views.sql` | Ajouter vues `tenant_usage_daily`, `tenant_usage_monthly` |
| `supabase/schemas/05_policies.sql` | Grants admin |
| `supabase/functions/_shared/guardrails/tenantLimits.ts` | Bloquer si limit mois dépassée |
| `src/components/atomic-crm/settings/TenantUsagePage.tsx` | Créer page d'affichage |
| `src/components/atomic-crm/settings/TenantUsageExport.tsx` | Bouton CSV |

## Spec technique

### Vues

```sql
create or replace view public.tenant_usage_daily as
select
  coalesce(tenant_id::text, 'internal') as tenant_key,
  tenant_id,
  date_trunc('day', started_at)::date as day,
  count(*) as runs,
  count(*) filter (where status = 'success') as successes,
  count(*) filter (where status = 'error') as errors,
  count(*) filter (where status = 'shadow') as shadow_runs,
  sum(input_tokens) as input_tokens,
  sum(output_tokens) as output_tokens,
  sum(cache_read_tokens) as cache_read_tokens,
  sum(cache_creation_tokens) as cache_creation_tokens,
  sum(cost_usd) as cost_usd
from public.skill_runs
group by 1, 2, 3;

create or replace view public.tenant_usage_monthly as
select
  coalesce(tenant_id::text, 'internal') as tenant_key,
  tenant_id,
  date_trunc('month', started_at)::date as month,
  count(*) as runs,
  sum(cost_usd) as cost_usd,
  sum(input_tokens + output_tokens) as total_tokens
from public.skill_runs
group by 1, 2, 3;
```

### Enforcement du limit mensuel

`guardrails/tenantLimits.ts` :

```ts
import { createClient } from "npm:@supabase/supabase-js@2";

export async function checkTenantMonthlyLimits(
  userJwt: string, tenantId?: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!tenantId) return { ok: true };
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${userJwt}` } } },
  );

  const [{ data: settings }, { data: usage }] = await Promise.all([
    supa.from("tenant_settings")
      .select("agentic_usage_limits").eq("tenant_id", tenantId).maybeSingle(),
    supa.from("tenant_usage_monthly")
      .select("runs, cost_usd").eq("tenant_id", tenantId)
      .gte("month", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
      .maybeSingle(),
  ]);

  const limits = settings?.agentic_usage_limits ?? {};
  const runs = usage?.runs ?? 0;
  const cost = Number(usage?.cost_usd ?? 0);
  if (limits.per_month && runs >= limits.per_month) {
    return { ok: false, reason: "tenant_monthly_runs_exceeded" };
  }
  if (limits.max_cost_usd_per_month && cost >= limits.max_cost_usd_per_month) {
    return { ok: false, reason: "tenant_monthly_cost_exceeded" };
  }
  return { ok: true };
}
```

Appeler dans `executeSkill.ts` après `checkTenantAccess`.

### UI `TenantUsagePage.tsx`

Pour chaque tenant :
- Graph mensuel : runs + cost (double axe)
- Breakdown par skill (table) sur la période
- Bouton "Export CSV" : dump `tenant_usage_daily` filtré

```tsx
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/components/atomic-crm/providers/supabase/supabase";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function TenantUsagePage() {
  const { tenantId } = useParams();
  const { data = [] } = useQuery({
    queryKey: ["tenant_usage_daily", tenantId],
    queryFn: async () => {
      const q = supabase.from("tenant_usage_daily").select("*")
        .order("day", { ascending: true });
      if (tenantId) q.eq("tenant_id", tenantId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const exportCsv = () => downloadCsv(`usage_${tenantId ?? "internal"}.csv`, data);

  return (
    <div className="space-y-4 p-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Usage — {tenantId ?? "internal"}</h1>
        <Button onClick={exportCsv}>Export CSV</Button>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <XAxis dataKey="day" />
          <YAxis yAxisId="l" orientation="left" />
          <YAxis yAxisId="r" orientation="right" />
          <Tooltip />
          <Legend />
          <Line yAxisId="l" dataKey="runs" stroke="#10b981" />
          <Line yAxisId="r" dataKey="cost_usd" stroke="#f59e0b" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const body = [
    cols.join(","),
    ...rows.map(r => cols.map(c => JSON.stringify(r[c] ?? "")).join(",")),
  ].join("\n");
  const blob = new Blob([body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
```

### Routes

- `/settings/agentic/usage` → liste des tenants avec usage (ou `internal` seul v1)
- `/settings/agentic/usage/:tenantId` → page détail

### Bouton export global

Dans `AgenticPage` C.1, ajouter :
```tsx
<Button onClick={() => downloadCsv("all_runs.csv", recentRuns)}>
  Export last 1000 runs (CSV)
</Button>
```

## Critères d'acceptation

- [ ] Les vues renvoient des lignes cohérentes sur un jeu de test
- [ ] Tenant atteignant `per_month` → tous futurs runs 429 avec `reason=tenant_monthly_runs_exceeded`
- [ ] Tenant atteignant `max_cost_usd_per_month` → 429 avec reason cost
- [ ] Export CSV télécharge un fichier correctement formaté
- [ ] Graph rendu correctement sur 30 jours
- [ ] Performances OK sur 100k lignes `skill_runs` (index existant sur started_at)

## Risques / pièges

- Pas de vue matérialisée en v1 (vue simple) : si `skill_runs` grossit >1M lignes, passer en `matview` + refresh planifié
- Le check `tenantMonthlyLimits` ajoute 1 query par run. OK si `tenant_usage_monthly` est une vue sur un index efficace
- Stripe metering auto : non fait v1, documenter dans README
- CSV export : éventuels soucis RGPD si export contient du trace (PII). En v1, exporter seulement les champs agrégés, pas le `input`/`output`/`trace` brut

## Done

- Commit : `feat(agentic): add tenant usage metering and CSV export`
- Doc : `docs/agentic/saas-billing.md` explique le modèle de facturation v1 (manuel) et v1.1 (Stripe auto)
