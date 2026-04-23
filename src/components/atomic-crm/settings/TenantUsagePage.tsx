import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";

type UsageRow = {
  tenant_key: string;
  tenant_id: string | null;
  day: string;
  runs: number;
  successes: number;
  errors: number;
  shadow_runs: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_creation_tokens: number | null;
  cost_usd: number | null;
};

export default function TenantUsagePage() {
  const { data = [] } = useQuery({
    queryKey: ["tenant_usage_daily"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("tenant_usage_daily")
        .select("*")
        .order("day", { ascending: true });
      if (error) throw error;
      return (data ?? []) as UsageRow[];
    },
  });

  const total = data.reduce(
    (acc, r) => ({
      runs: acc.runs + r.runs,
      cost: acc.cost + Number(r.cost_usd ?? 0),
    }),
    { runs: 0, cost: 0 },
  );

  return (
    <div className="space-y-4 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">Usage</h1>
          <p className="text-sm text-muted-foreground">
            Total: {total.runs} runs · ${total.cost.toFixed(2)}
          </p>
        </div>
        <Button onClick={() => downloadCsv("usage.csv", data)}>
          Export CSV
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Runs &amp; cost per day</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <XAxis dataKey="day" />
              <YAxis yAxisId="l" orientation="left" />
              <YAxis yAxisId="r" orientation="right" />
              <Tooltip />
              <Legend />
              <Line yAxisId="l" dataKey="runs" stroke="#10b981" name="runs" />
              <Line
                yAxisId="r"
                dataKey="cost_usd"
                stroke="#f59e0b"
                name="cost (USD)"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const body = [
    cols.join(","),
    ...rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(",")),
  ].join("\n");
  const blob = new Blob([body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
