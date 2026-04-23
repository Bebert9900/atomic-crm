import {
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type MetricsRow = {
  bucket: string;
  runs: number;
  successes: number;
  errors: number;
  dry_runs: number;
};

export function SkillMetricsChart({ data }: { data: MetricsRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data}>
        <XAxis
          dataKey="bucket"
          tickFormatter={(t: string) => `${new Date(t).getHours()}h`}
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
