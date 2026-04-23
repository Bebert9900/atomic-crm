import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SkillRunEvent } from "@/lib/agenticClient";
import { SkillRunTrace } from "./SkillRunTrace";

type Props = {
  runId?: number;
  status: "running" | "success" | "error";
  events: SkillRunEvent[];
  output?: unknown;
  error?: string;
};

export function SkillRunPanel({ runId, status, events, output, error }: Props) {
  return (
    <Card className="text-sm">
      <CardHeader className="py-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <StatusDot status={status} />
          <span>Run {runId ?? "…"}</span>
          <span className="text-muted-foreground">· {status}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <SkillRunTrace events={events} />
        {status === "success" && output !== undefined && (
          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
            {JSON.stringify(output, null, 2)}
          </pre>
        )}
        {status === "error" && (
          <div className="text-xs text-destructive">{error}</div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusDot({ status }: { status: string }) {
  const cls =
    status === "running"
      ? "bg-amber-500 animate-pulse"
      : status === "success"
        ? "bg-emerald-500"
        : "bg-red-500";
  return <span className={`inline-block w-2 h-2 rounded-full ${cls}`} />;
}
