import type { z } from "npm:zod@^3.25";
import type { AuthInfo } from "../../agent-runtime/auth.ts";

export type SkillExecCtx<I> = {
  input: I;
  auth: AuthInfo;
  runId: number;
  dryRun: boolean;
  appendStep: (step: unknown) => Promise<void>;
  emit: (e: { event?: string; data: unknown }) => void;
};

export type SkillManifest<I = unknown, O = unknown> = {
  id: string;
  version: string;
  model: string;
  description: string;
  input_schema: z.ZodType<I>;
  output_schema: z.ZodType<O>;
  tools_allowed: string[];
  max_iterations: number;
  max_writes: number;
  rate_limit: { per_minute: number; per_hour: number };
  system_prompt: string;
  /**
   * Optional custom executor. When provided, bypasses the LLM runtime.
   * Used for test/utility skills (e.g. hello_world). Real skills leave
   * this undefined and are executed via the Claude tool_use loop (A.4).
   */
  execute?: (ctx: SkillExecCtx<I>) => Promise<O>;
};
