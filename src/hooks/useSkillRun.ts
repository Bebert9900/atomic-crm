import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type SkillRunEvent, streamSkillRun } from "@/lib/agenticClient";

export type SkillRunState = {
  status: "idle" | "running" | "success" | "error";
  runId?: number;
  dryRun?: boolean;
  events: SkillRunEvent[];
  output?: unknown;
  error?: string;
};

export function useSkillRun(options?: { invalidateOnDone?: string[] }) {
  const [state, setState] = useState<SkillRunState>({
    status: "idle",
    events: [],
  });
  const abortRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  const run = useCallback(
    async (skill_id: string, input: unknown, opts?: { dry_run?: boolean }) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setState({ status: "running", events: [] });
      try {
        for await (const ev of streamSkillRun(skill_id, input, {
          ...opts,
          signal: ac.signal,
        })) {
          setState((s) => ({ ...s, events: [...s.events, ev] }));
          if (ev.event === "run.started") {
            setState((s) => ({
              ...s,
              runId: ev.data.run_id,
              dryRun: ev.data.dry_run,
            }));
          }
          if (ev.event === "run.done") {
            setState((s) => ({
              ...s,
              status: "success",
              output: ev.data.output,
            }));
            if (options?.invalidateOnDone) {
              for (const r of options.invalidateOnDone) {
                queryClient.invalidateQueries({ queryKey: [r] });
              }
            }
          }
          if (ev.event === "run.error") {
            setState((s) => ({
              ...s,
              status: "error",
              error: ev.data.error,
            }));
          }
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setState((s) => ({ ...s, status: "error", error: String(e) }));
      }
    },
    [options, queryClient],
  );

  const abort = useCallback(() => abortRef.current?.abort(), []);

  return { ...state, run, abort };
}
