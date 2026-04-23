# Story C.1 — Dashboard interne `skill_runs`

**Epic**: C. Observability & ops
**Status**: Ready
**Estimation**: 5h
**Depends on**: A.1 (table + vue), A.5 (composants UI)
**Blocks**: —

## Contexte business

Sans observabilité, impossible de superviser un agent sans humain dans la boucle. Ce dashboard affiche : runs temps réel, coûts cumulés, erreurs par skill, temps d'exécution, taux de succès. Outil de debug quotidien.

## Contexte technique

- Utilise la vue `skill_runs_metrics_1d` et la table `skill_runs`
- Page admin accessible via `/settings/agentic`
- Recharts déjà dans les deps (via `DealsChart`)
- Polling toutes les 10s pour les runs "en cours"

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `src/components/atomic-crm/settings/AgenticPage.tsx` | Créer |
| `src/components/atomic-crm/settings/SettingsPage.tsx` | Ajouter entrée menu admin |
| `src/components/atomic-crm/agentic/SkillRunsTable.tsx` | Créer |
| `src/components/atomic-crm/agentic/SkillMetricsChart.tsx` | Créer |
| `src/components/atomic-crm/agentic/SkillRunDetail.tsx` | Créer (drawer trace) |
| `src/components/atomic-crm/providers/supabase/dataProvider.ts` | Ajouter resource `skill_runs` si pas déjà exposée |

## Spec UI

### Page `/settings/agentic`

Sections :
1. **KPIs du jour** (4 cards) :
   - Runs total (24h)
   - Taux de succès (24h)
   - Coût cumulé (USD, 24h)
   - Latence P95
2. **Graphe par heure** (bar chart) : runs success / error / shadow par heure, 24h
3. **Table runs récents** : 50 derniers, colonnes `id, skill_id, status, started_at, duration, cost_usd, user, input résumé`
4. **Filtres** : skill_id, status, user, période
5. **Drawer détail** au click sur une row : trace complète, input, output, tokens breakdown, bouton "Replay (dry run)"

### `SkillRunsTable.tsx`

```tsx
import { List, ResourceContextProvider } from "ra-core";
import { DataTable } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";

const statusVariant = (s: string) =>
  s === "success" ? "default"
  : s === "error" ? "destructive"
  : s === "running" ? "secondary"
  : "outline";

export function SkillRunsTable({
  onRowClick,
}: { onRowClick: (id: number) => void }) {
  return (
    <ResourceContextProvider value="skill_runs">
      <List perPage={50} sort={{ field: "started_at", order: "DESC" }}>
        <DataTable
          onRowClick={(r) => onRowClick(r.id)}
          columns={[
            { source: "id", label: "Run" },
            { source: "skill_id", label: "Skill" },
            {
              source: "status", label: "Status",
              render: (v: string) => <Badge variant={statusVariant(v)}>{v}</Badge>,
            },
            { source: "started_at", label: "Started" },
            {
              source: "duration_s", label: "Duration",
              render: (_: unknown, r: any) =>
                r.ended_at
                  ? `${((+new Date(r.ended_at) - +new Date(r.started_at))/1000).toFixed(1)}s`
                  : "—",
            },
            {
              source: "cost_usd", label: "Cost",
              render: (v: number) => (v ? `$${Number(v).toFixed(4)}` : "—"),
            },
            { source: "user_id", label: "User" },
          ]}
        />
      </List>
    </ResourceContextProvider>
  );
}
```

### `SkillMetricsChart.tsx`

```tsx
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

type Row = {
  bucket: string; successes: number; errors: number; dry_runs: number;
};

export function SkillMetricsChart({ data }: { data: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data}>
        <XAxis
          dataKey="bucket"
          tickFormatter={(t) => `${new Date(t).getHours()}h`}
        />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Legend />
        <Bar dataKey="successes" stackId="s" fill="#10b981" name="success" />
        <Bar dataKey="errors" stackId="s" fill="#ef4444" name="error" />
        <Bar dataKey="dry_runs" stackId="s" fill="#94a3b8" name="shadow" />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

### `SkillRunDetail.tsx`

Drawer shadcn qui affiche :
- Input (JSON pretty)
- Trace steps (réutilise `SkillRunTrace` de A.5)
- Output (JSON pretty)
- Tokens breakdown + cost
- Bouton "Replay (dry run)" : appelle `agent-runtime/run` avec `dry_run=true` et les mêmes inputs

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SkillRunTrace } from "./SkillRunTrace";
import { useSkillRun } from "@/hooks/useSkillRun";
import { useGetOne } from "ra-core";

export function SkillRunDetail({
  runId, open, onClose,
}: { runId: number | null; open: boolean; onClose: () => void }) {
  const { data } = useGetOne("skill_runs", { id: runId ?? 0 }, { enabled: !!runId });
  const replay = useSkillRun();
  if (!data) return null;
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-[720px] max-w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Run #{data.id} — {data.skill_id}</SheetTitle>
        </SheetHeader>
        <section className="mt-4 space-y-4 text-sm">
          <div>
            <h4 className="font-semibold">Input</h4>
            <pre className="bg-muted p-2 text-xs rounded">
              {JSON.stringify(data.input, null, 2)}
            </pre>
          </div>
          <div>
            <h4 className="font-semibold">Trace</h4>
            <SkillRunTrace events={stepsToEvents(data.trace)} />
          </div>
          <div>
            <h4 className="font-semibold">Output</h4>
            <pre className="bg-muted p-2 text-xs rounded">
              {JSON.stringify(data.output, null, 2)}
            </pre>
          </div>
          <div>
            <h4 className="font-semibold">Usage</h4>
            <p className="text-xs">
              input: {data.input_tokens} · output: {data.output_tokens} ·
              cache_r: {data.cache_read_tokens} · cache_w: {data.cache_creation_tokens} ·
              cost: ${Number(data.cost_usd ?? 0).toFixed(4)}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => replay.run(data.skill_id, data.input, { dry_run: true })}
          >
            Replay (dry run)
          </Button>
        </section>
      </SheetContent>
    </Sheet>
  );
}

function stepsToEvents(trace: any[]): any[] {
  // map trace step types to SkillRunEvent format reused by SkillRunTrace
  return trace.map((s) => {
    if (s.type === "tool_use") return { event: "tool_use", data: { name: s.tool, args: s.args } };
    if (s.type === "tool_result") return { event: "tool_result", data: { name: "", result: s.result } };
    if (s.type === "assistant_text") return { event: "text", data: { content: s.content } };
    return { event: s.type, data: s };
  });
}
```

### `AgenticPage.tsx`

```tsx
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/components/atomic-crm/providers/supabase/supabase";
import { SkillRunsTable } from "../agentic/SkillRunsTable";
import { SkillMetricsChart } from "../agentic/SkillMetricsChart";
import { SkillRunDetail } from "../agentic/SkillRunDetail";

export default function AgenticPage() {
  const [openId, setOpenId] = useState<number | null>(null);

  const { data: metrics = [] } = useQuery({
    queryKey: ["skill_runs_metrics_1d"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("skill_runs_metrics_1d")
        .select("*")
        .order("bucket", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 10_000,
  });

  const kpis = computeKpis(metrics);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Agentic ops</h1>
      <div className="grid grid-cols-4 gap-4">
        <Kpi label="Runs 24h" value={kpis.runs} />
        <Kpi label="Success rate" value={`${kpis.successRate}%`} />
        <Kpi label="Cost 24h" value={`$${kpis.costUsd.toFixed(2)}`} />
        <Kpi label="P95 latency" value={`${kpis.p95.toFixed(1)}s`} />
      </div>
      <Card>
        <CardHeader><CardTitle>Runs / hour</CardTitle></CardHeader>
        <CardContent><SkillMetricsChart data={metrics} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Recent runs</CardTitle></CardHeader>
        <CardContent>
          <SkillRunsTable onRowClick={setOpenId} />
        </CardContent>
      </Card>
      <SkillRunDetail
        runId={openId} open={!!openId} onClose={() => setOpenId(null)}
      />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-2xl font-semibold">{value}</CardContent>
    </Card>
  );
}

function computeKpis(rows: any[]) {
  const runs = rows.reduce((a, r) => a + r.runs, 0);
  const successes = rows.reduce((a, r) => a + r.successes, 0);
  const successRate = runs > 0 ? Math.round((successes / runs) * 100) : 0;
  const costUsd = rows.reduce((a, r) => a + Number(r.total_cost_usd ?? 0), 0);
  const p95 = Math.max(0, ...rows.map((r) => r.p95_duration_s ?? 0));
  return { runs, successRate, costUsd, p95 };
}
```

### Entrée menu (dans `SettingsPage.tsx`)

Ajouter un onglet "Agentic" dans la nav settings, visible uniquement si `sales.administrator = true`. Route : `/settings/agentic` → `AgenticPage`.

## Critères d'acceptation

- [ ] Page charge < 2s avec 1000 lignes de `skill_runs`
- [ ] KPIs se mettent à jour (polling 10s)
- [ ] Un run en `running` apparaît en haut, se met à jour auto
- [ ] Click sur une row ouvre le drawer trace
- [ ] Replay en dry run fonctionne depuis le drawer
- [ ] Non-admins ne voient pas l'onglet
- [ ] Filtres skill_id / status fonctionnent
- [ ] Graphe correct sur 24h

## Risques / pièges

- Trace jsonb peut être lourd : tronquer affichage par défaut, bouton "expand" par step
- Polling 10s × plusieurs users → charge modérée. Si problème, passer à Supabase Realtime subscription
- Les colonnes custom du DataTable doivent matcher le dataProvider : vérifier qu'on peut trier sur `started_at`

## Done

- Commit : `feat(agentic): add agentic ops dashboard`
- Screenshot des KPIs joint à la PR
