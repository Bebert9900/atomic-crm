import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

type Input = { name: string };
type Output = { message: string };

export const helloWorldSkill: SkillManifest<Input, Output> = {
  id: "hello_world",
  version: "1.0.0",
  model: "none",
  description: "Test skill. No LLM, no tools. Returns a greeting.",
  input_schema: z.object({ name: z.string().min(1).max(100) }),
  output_schema: z.object({ message: z.string() }),
  tools_allowed: [],
  max_iterations: 0,
  max_writes: 0,
  rate_limit: { per_minute: 10, per_hour: 100 },
  system_prompt: "",
  execute: async ({ input, appendStep, emit }) => {
    const ts = new Date().toISOString();
    await appendStep({
      step: 0,
      type: "user",
      content: JSON.stringify(input),
      ts,
    });
    emit({ event: "thinking", data: "saying hi" });
    const message = `Hello ${input.name}`;
    await appendStep({
      step: 1,
      type: "assistant_text",
      content: message,
      ts: new Date().toISOString(),
    });
    return { message };
  },
};
