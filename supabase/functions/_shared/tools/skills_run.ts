import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";
import { skills } from "../skills/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const MAX_DEPTH = 1; // top-level chat (depth 0) may call sub-skills (depth 1). No deeper.

const Input = z.object({
  skill_id: z.string().min(1),
  input: z.unknown(),
});

const Output = z.object({
  run_id: z.number().nullable(),
  status: z.string(),
  output: z.unknown().nullable(),
  error: z.string().nullable(),
});

export const runSkillTool: ToolDefinition = {
  name: "run_skill",
  description:
    "Délègue à une autre skill du CRM (ex: morning_brief, weekly_pipeline_review, triage_dev_tasks). Utilise quand la demande mappe clairement sur une skill existante. Ne s'auto-appelle pas (chat_with_crm interdit).",
  input_schema: Input,
  output_schema: Output,
  kind: "read",
  reversible: false,
  cost_estimate: "high",
  handler: async (args, ctx) => {
    const { skill_id, input } = args;

    // Guards
    const orch = ctx.orchestrator;
    if (!orch) {
      throw new Error("run_skill not allowed outside orchestrator context");
    }
    if (orch.depth >= MAX_DEPTH) {
      throw new Error(`max nesting depth reached (depth=${orch.depth})`);
    }
    if (skill_id === "chat_with_crm") {
      throw new Error("recursion forbidden: chat_with_crm cannot call itself");
    }
    if (!skills[skill_id]) {
      throw new Error(`unknown skill: ${skill_id}`);
    }
    const callKey = `${skill_id}:${JSON.stringify(input ?? {})}`;
    if (orch.calls.has(callKey)) {
      throw new Error(`duplicate sub-skill call rejected: ${skill_id}`);
    }
    if (orch.calls.size >= orch.maxCalls) {
      throw new Error(
        `max sub-skill calls reached (${orch.maxCalls}) for this turn`,
      );
    }
    orch.calls.add(callKey);

    // HTTP self-call to /agent-runtime/run (SSE response)
    const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-runtime/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.auth.token}`,
        "x-skill-depth": String(orch.depth + 1),
      },
      body: JSON.stringify({ skill_id, input }),
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        run_id: null,
        status: "error",
        output: null,
        error: `HTTP ${res.status}: ${text.slice(0, 500)}`,
      };
    }

    // Parse SSE: look for run.done or run.error events
    const body = await res.text();
    const events = body
      .split(/\n\n/)
      .map((b) => b.trim())
      .filter(Boolean);
    let runId: number | null = null;
    let output: unknown = null;
    let errorMsg: string | null = null;
    let status = "unknown";

    for (const block of events) {
      const eventLine = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
      const dataLine = block.match(/^data:\s*(.+)$/m)?.[1]?.trim();
      if (!eventLine || !dataLine) continue;
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(dataLine);
      } catch {
        continue;
      }
      if (eventLine === "run.started" && typeof data.run_id === "number") {
        runId = data.run_id;
      } else if (eventLine === "run.done") {
        status = "success";
        output = data.output ?? null;
      } else if (eventLine === "run.error") {
        status = "error";
        errorMsg = String(data.error ?? "unknown");
      }
    }

    return { run_id: runId, status, output, error: errorMsg };
  },
};
