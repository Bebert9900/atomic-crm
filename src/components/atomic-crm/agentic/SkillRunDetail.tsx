import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import { useSkillRun } from "@/hooks/useSkillRun";
import { SkillRunTrace } from "./SkillRunTrace";
import type { SkillRunEvent } from "@/lib/agenticClient";

type Props = {
  runId: number | null;
  open: boolean;
  onClose: () => void;
};

export function SkillRunDetail({ runId, open, onClose }: Props) {
  const { data } = useQuery({
    queryKey: ["skill_run_detail", runId],
    queryFn: async () => {
      if (!runId) return null;
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("skill_runs")
        .select("*")
        .eq("id", runId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!runId,
  });

  const replay = useSkillRun();

  if (!data) return null;
  // deno-lint-ignore no-explicit-any
  const d = data as any;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent
        side="right"
        className="w-[720px] max-w-full overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>
            Run #{d.id} — {d.skill_id}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4 text-sm">
          <Section title="Status">
            <p>
              {d.status} {d.dry_run && "(shadow)"}
            </p>
            {d.error_message && (
              <p className="text-destructive">{d.error_message}</p>
            )}
          </Section>
          <Section title="Input">
            <pre className="bg-muted p-2 text-xs rounded">
              {JSON.stringify(d.input, null, 2)}
            </pre>
          </Section>
          <Section title="Trace">
            <SkillRunTrace events={stepsToEvents(d.trace ?? [])} />
          </Section>
          <Section title="Output">
            <pre className="bg-muted p-2 text-xs rounded">
              {JSON.stringify(d.output, null, 2)}
            </pre>
          </Section>
          <Section title="Usage">
            <p className="text-xs">
              input: {d.input_tokens ?? "?"} · output: {d.output_tokens ?? "?"}{" "}
              · cache_r: {d.cache_read_tokens ?? "?"} · cache_w:{" "}
              {d.cache_creation_tokens ?? "?"} · cost: $
              {Number(d.cost_usd ?? 0).toFixed(4)}
            </p>
          </Section>
          <Button
            variant="outline"
            onClick={() => replay.run(d.skill_id, d.input, { dry_run: true })}
          >
            Replay (dry run)
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="font-semibold">{title}</h4>
      {children}
    </div>
  );
}

// deno-lint-ignore no-explicit-any
function stepsToEvents(trace: any[]): SkillRunEvent[] {
  // deno-lint-ignore no-explicit-any
  return trace.map((s: any) => {
    if (s.type === "tool_use") {
      return {
        event: "tool_use",
        data: { name: s.tool, args: s.args },
      } as SkillRunEvent;
    }
    if (s.type === "tool_result") {
      return {
        event: "tool_result",
        data: { name: "", result: s.result },
      } as SkillRunEvent;
    }
    if (s.type === "assistant_text") {
      return {
        event: "text",
        data: { content: s.content },
      } as SkillRunEvent;
    }
    return { event: s.type, data: s } as SkillRunEvent;
  });
}
