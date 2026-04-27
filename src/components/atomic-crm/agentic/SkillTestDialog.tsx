import { useEffect, useState } from "react";
import { Play, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useSkillRun } from "@/hooks/useSkillRun";
import { SkillRunPanel } from "./SkillRunPanel";
import type { SkillSummary } from "@/lib/agenticClient";

type Props = {
  skill: SkillSummary;
  exampleInput: Record<string, unknown>;
  onClose: () => void;
};

export function SkillTestDialog({ skill, exampleInput, onClose }: Props) {
  const [inputJson, setInputJson] = useState(
    JSON.stringify(exampleInput, null, 2),
  );
  const [dryRun, setDryRun] = useState(true);
  const [parseError, setParseError] = useState<string | null>(null);
  const { status, events, output, error, run, abort, runId } = useSkillRun();

  useEffect(() => {
    setInputJson(JSON.stringify(exampleInput, null, 2));
  }, [exampleInput, skill.id]);

  const launch = () => {
    setParseError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(inputJson);
    } catch (e) {
      setParseError(`JSON invalide: ${(e as Error).message}`);
      return;
    }
    void run(skill.id, parsed, { dry_run: dryRun });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-sm">{skill.id}</span>
            <span className="text-xs text-muted-foreground font-normal">
              v{skill.version} · {skill.model}
            </span>
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-2 mb-2">
          {skill.description}
        </p>

        <div className="space-y-3">
          <div>
            <Label htmlFor="skill-input" className="text-xs">
              Input JSON
            </Label>
            <Textarea
              id="skill-input"
              value={inputJson}
              onChange={(e) => setInputJson(e.target.value)}
              rows={8}
              className="font-mono text-xs"
              disabled={status === "running"}
            />
            {parseError && (
              <p className="text-[11px] text-destructive mt-1">{parseError}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="dry-run"
                checked={dryRun}
                onCheckedChange={setDryRun}
                disabled={status === "running"}
              />
              <Label htmlFor="dry-run" className="text-xs cursor-pointer">
                Dry run (aucune écriture en base)
              </Label>
            </div>
            <div className="flex-1" />
            {status === "running" ? (
              <Button variant="outline" onClick={abort}>
                <X className="h-4 w-4 mr-1.5" />
                Annuler
              </Button>
            ) : (
              <Button onClick={launch}>
                <Play className="h-4 w-4 mr-1.5" />
                Lancer
              </Button>
            )}
          </div>

          {status !== "idle" && (
            <SkillRunPanel
              runId={runId}
              status={status as "running" | "success" | "error"}
              events={events}
              output={output}
              error={error}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
