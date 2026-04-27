import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { useSkillRun } from "@/hooks/useSkillRun";
import { SkillRunPanel } from "./SkillRunPanel";

type Props = {
  skill_id: string;
  input: Record<string, unknown>;
  label?: string;
  invalidateOnDone?: string[];
  variant?: "default" | "outline" | "ghost" | "secondary";
  dryRun?: boolean;
};

export function SkillLauncher({
  skill_id,
  input,
  label,
  invalidateOnDone,
  variant = "default",
  dryRun,
}: Props) {
  const { status, events, output, error, run, abort, runId } = useSkillRun({
    invalidateOnDone,
  });

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          variant={variant}
          disabled={status === "running"}
          onClick={() => run(skill_id, input, { dry_run: dryRun })}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {label ?? skill_id}
        </Button>
        {status === "running" && (
          <Button variant="ghost" onClick={abort}>
            Cancel
          </Button>
        )}
      </div>
      {status !== "idle" && (
        <SkillRunPanel
          runId={runId}
          status={status}
          events={events}
          output={output}
          error={error}
        />
      )}
    </div>
  );
}
