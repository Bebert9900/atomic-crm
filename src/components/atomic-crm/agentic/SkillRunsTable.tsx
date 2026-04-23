import { useQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import { Badge } from "@/components/ui/badge";

type Row = {
  id: number;
  skill_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  cost_usd: number | null;
  user_id: string;
  dry_run: boolean;
};

const variant = (s: string) =>
  s === "success"
    ? "default"
    : s === "error"
      ? "destructive"
      : s === "running"
        ? "secondary"
        : "outline";

export function SkillRunsTable({
  onRowClick,
}: {
  onRowClick: (id: number) => void;
}) {
  const { data = [] } = useQuery({
    queryKey: ["skill_runs_recent"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("skill_runs")
        .select(
          "id,skill_id,status,started_at,ended_at,cost_usd,user_id,dry_run",
        )
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: 10_000,
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="text-left p-2">Run</th>
            <th className="text-left p-2">Skill</th>
            <th className="text-left p-2">Status</th>
            <th className="text-left p-2">Started</th>
            <th className="text-left p-2">Duration</th>
            <th className="text-left p-2">Cost</th>
            <th className="text-left p-2">User</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr
              key={r.id}
              className="border-t hover:bg-muted/50 cursor-pointer"
              onClick={() => onRowClick(r.id)}
            >
              <td className="p-2 font-mono">#{r.id}</td>
              <td className="p-2">{r.skill_id}</td>
              <td className="p-2">
                <Badge variant={variant(r.status)}>{r.status}</Badge>
                {r.dry_run && (
                  <Badge variant="outline" className="ml-1">
                    shadow
                  </Badge>
                )}
              </td>
              <td className="p-2 text-xs">{formatTs(r.started_at)}</td>
              <td className="p-2 text-xs">
                {formatDuration(r.started_at, r.ended_at)}
              </td>
              <td className="p-2 text-xs">
                {r.cost_usd ? `$${Number(r.cost_usd).toFixed(4)}` : "—"}
              </td>
              <td className="p-2 text-xs font-mono">{r.user_id.slice(0, 8)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatTs(s: string) {
  return new Date(s).toLocaleString();
}

function formatDuration(start: string, end: string | null) {
  if (!end) return "—";
  const ms = +new Date(end) - +new Date(start);
  return `${(ms / 1000).toFixed(1)}s`;
}
