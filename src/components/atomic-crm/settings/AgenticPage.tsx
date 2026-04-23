import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import { SkillRunsTable } from "@/components/atomic-crm/agentic/SkillRunsTable";
import {
  SkillMetricsChart,
  type MetricsRow,
} from "@/components/atomic-crm/agentic/SkillMetricsChart";
import { SkillRunDetail } from "@/components/atomic-crm/agentic/SkillRunDetail";
import { AgenticControlsPanel } from "@/components/atomic-crm/agentic/AgenticControlsPanel";

export default function AgenticPage() {
  const [openId, setOpenId] = useState<number | null>(null);

  const { data: metrics = [] } = useQuery({
    queryKey: ["skill_runs_metrics_1d"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("skill_runs_metrics_1d")
        .select("*")
        .order("bucket", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MetricsRow[];
    },
    refetchInterval: 10_000,
  });

  const kpis = computeKpis(metrics);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Agentic ops</h1>
        <p className="text-sm text-muted-foreground">
          Supervision des skills agentiques.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Kpi label="Runs 24h" value={kpis.runs} />
        <Kpi label="Success rate" value={`${kpis.successRate}%`} />
        <Kpi label="Cost 24h" value={`$${kpis.costUsd.toFixed(2)}`} />
        <Kpi label="P95 latency" value={`${kpis.p95.toFixed(1)}s`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Runs / hour</CardTitle>
        </CardHeader>
        <CardContent>
          <SkillMetricsChart data={metrics} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <AgenticControlsPanel />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
        </CardHeader>
        <CardContent>
          <SkillRunsTable onRowClick={setOpenId} />
        </CardContent>
      </Card>

      <SkillRunDetail
        runId={openId}
        open={!!openId}
        onClose={() => setOpenId(null)}
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

type MetricsRowExt = MetricsRow & {
  total_cost_usd: number | null;
  p95_duration_s: number | null;
};

function computeKpis(rows: MetricsRow[]) {
  const runs = rows.reduce((a, r) => a + r.runs, 0);
  const successes = rows.reduce((a, r) => a + r.successes, 0);
  const successRate = runs > 0 ? Math.round((successes / runs) * 100) : 0;
  const costUsd = rows.reduce(
    (a, r) => a + Number((r as unknown as MetricsRowExt).total_cost_usd ?? 0),
    0,
  );
  const p95 = Math.max(
    0,
    ...rows.map((r) =>
      Number((r as unknown as MetricsRowExt).p95_duration_s ?? 0),
    ),
  );
  return { runs, successRate, costUsd, p95 };
}
