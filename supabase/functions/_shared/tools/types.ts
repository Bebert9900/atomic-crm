import type { z } from "npm:zod@^3.25";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { AuthInfo } from "../../agent-runtime/auth.ts";

export type OrchestratorState = {
  /** Sub-skill calls already issued in this chat turn (key = skill_id + JSON args). */
  calls: Set<string>;
  /** Max distinct sub-skill calls per chat turn. */
  maxCalls: number;
  /** Depth of the current skill run (0 = top-level, 1 = sub-skill). */
  depth: number;
};

export type ToolContext = {
  auth: AuthInfo;
  supabase: SupabaseClient;
  runId: number;
  dryRun: boolean;
  /** Present only when the parent skill (e.g. chat_with_crm) acts as orchestrator. */
  orchestrator?: OrchestratorState;
};

export type ToolKind = "read" | "write";

// deno-lint-ignore no-explicit-any
export type ToolDefinition<I = any, O = any> = {
  name: string;
  description: string;
  input_schema: z.ZodType<I>;
  output_schema: z.ZodType<O>;
  kind: ToolKind;
  reversible: boolean;
  cost_estimate: "low" | "medium" | "high";
  handler: (args: I, ctx: ToolContext) => Promise<O>;
  undo?: (original: { args: I; output: O }, ctx: ToolContext) => Promise<void>;
};
