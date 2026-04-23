import type { z } from "npm:zod@^3.25";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AuthInfo } from "../../agent-runtime/auth.ts";

export type ToolContext = {
  auth: AuthInfo;
  supabase: SupabaseClient;
  runId: number;
  dryRun: boolean;
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
