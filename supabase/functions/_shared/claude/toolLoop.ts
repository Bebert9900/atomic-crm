import { zodToJsonSchema } from "npm:zod-to-json-schema@^3.23";
import { client, hasApiKey } from "./client.ts";
import { computeCost, type Usage } from "./pricing.ts";
import { isWriteTool, tools as toolRegistry } from "../tools/registry.ts";
import type { SkillExecCtx, SkillManifest } from "../skills/types.ts";
import { makeSupabaseForUser } from "../../agent-runtime/runPersistence.ts";

export type RunUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  cost_usd: number;
};

export type RunResult<O> = {
  output: O;
  usage: RunUsage;
  iterations: number;
};

const zeroUsage = (): RunUsage => ({
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  cost_usd: 0,
});

function toolsForClaude(names: string[]) {
  return names.map((n) => {
    const t = toolRegistry[n];
    if (!t) throw new Error(`Unknown tool: ${n}`);
    return {
      name: t.name,
      description: t.description,
      input_schema: zodToJsonSchema(t.input_schema, {
        target: "jsonSchema7",
        $refStrategy: "none",
      }) as Record<string, unknown>,
    };
  });
}

function tryParseJson(s: string): unknown {
  const match = s.match(/```json\s*([\s\S]+?)\s*```/);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch {
      // fall through
    }
  }
  const brace = s.match(/\{[\s\S]+\}/);
  if (brace) {
    try {
      return JSON.parse(brace[0]);
    } catch {
      // fall through
    }
  }
  return null;
}

export async function runToolLoop<I, O>(
  manifest: SkillManifest<I, O>,
  ctx: SkillExecCtx<I>,
): Promise<RunResult<O>> {
  if (!hasApiKey()) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const messages: Array<
    // deno-lint-ignore no-explicit-any
    { role: "user"; content: any } | { role: "assistant"; content: any }
  > = [
    {
      role: "user",
      content: `Input:\n\`\`\`json\n${JSON.stringify(ctx.input, null, 2)}\n\`\`\``,
    },
  ];

  const systemBlocks = [
    {
      type: "text" as const,
      text: manifest.system_prompt,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  const claudeTools = toolsForClaude(manifest.tools_allowed);
  if (claudeTools.length > 0) {
    // deno-lint-ignore no-explicit-any
    (claudeTools[claudeTools.length - 1] as any).cache_control = {
      type: "ephemeral",
    };
  }

  const usage = zeroUsage();
  let iteration = 0;
  let writes = 0;

  await ctx.appendStep({
    step: iteration,
    type: "user",
    content: JSON.stringify(ctx.input),
    ts: new Date().toISOString(),
  });

  while (iteration < manifest.max_iterations) {
    iteration++;

    const response = await client.messages.create({
      model: manifest.model,
      system: systemBlocks,
      // deno-lint-ignore no-explicit-any
      tools: claudeTools as any,
      messages,
      max_tokens: 4096,
    });

    // deno-lint-ignore no-explicit-any
    const u = (response.usage ?? {}) as Usage & Record<string, any>;
    usage.input_tokens += u.input_tokens ?? 0;
    usage.output_tokens += u.output_tokens ?? 0;
    usage.cache_creation_input_tokens += u.cache_creation_input_tokens ?? 0;
    usage.cache_read_input_tokens += u.cache_read_input_tokens ?? 0;

    messages.push({ role: "assistant", content: response.content });

    for (const block of response.content) {
      if (block.type === "text") {
        await ctx.appendStep({
          step: iteration,
          type: "assistant_text",
          content: block.text,
          ts: new Date().toISOString(),
        });
        ctx.emit({ event: "text", data: { content: block.text } });
      }
    }

    if (response.stop_reason !== "tool_use") {
      usage.cost_usd = computeCost(manifest.model, usage);
      const finalText = response.content
        // deno-lint-ignore no-explicit-any
        .filter((b: any) => b.type === "text")
        // deno-lint-ignore no-explicit-any
        .map((b: any) => b.text)
        .join("\n");
      const parsed = tryParseJson(finalText);
      const output = manifest.output_schema.parse(parsed ?? {});
      return { output, usage, iterations: iteration };
    }

    // deno-lint-ignore no-explicit-any
    const toolResults: any[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      const toolDef = toolRegistry[block.name];
      if (!toolDef) {
        await ctx.appendStep({
          step: iteration,
          type: "guardrail",
          name: "unknown_tool",
          outcome: "deny",
          reason: `tool ${block.name} not registered`,
          ts: new Date().toISOString(),
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Error: unknown tool`,
          is_error: true,
        });
        continue;
      }
      if (!manifest.tools_allowed.includes(block.name)) {
        await ctx.appendStep({
          step: iteration,
          type: "guardrail",
          name: "tool_not_in_allowlist",
          outcome: "deny",
          reason: `tool ${block.name} not allowed for ${manifest.id}`,
          ts: new Date().toISOString(),
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Error: tool ${block.name} is not allowed for this skill`,
          is_error: true,
        });
        continue;
      }
      if (isWriteTool(block.name)) {
        if (writes >= manifest.max_writes) {
          await ctx.appendStep({
            step: iteration,
            type: "guardrail",
            name: "max_writes_exceeded",
            outcome: "deny",
            reason: `max_writes=${manifest.max_writes}`,
            ts: new Date().toISOString(),
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Error: max write actions reached for this skill`,
            is_error: true,
          });
          continue;
        }
        writes++;
      }

      const start = Date.now();
      await ctx.appendStep({
        step: iteration,
        type: "tool_use",
        tool: block.name,
        args: block.input,
        tool_use_id: block.id,
        ts: new Date().toISOString(),
      });
      ctx.emit({
        event: "tool_use",
        data: { name: block.name, args: block.input },
      });

      try {
        const parsedArgs = toolDef.input_schema.parse(block.input);
        const result = await toolDef.handler(parsedArgs, {
          auth: ctx.auth,
          supabase: makeSupabaseForUser(ctx.auth.token),
          runId: ctx.runId,
          dryRun: ctx.dryRun,
        });
        const duration_ms = Date.now() - start;
        await ctx.appendStep({
          step: iteration,
          type: "tool_result",
          tool_use_id: block.id,
          result,
          duration_ms,
          status: "ok",
          ts: new Date().toISOString(),
        });
        ctx.emit({ event: "tool_result", data: { name: block.name, result } });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        const duration_ms = Date.now() - start;
        await ctx.appendStep({
          step: iteration,
          type: "tool_result",
          tool_use_id: block.id,
          result: { error: String(err) },
          duration_ms,
          status: "error",
          ts: new Date().toISOString(),
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Error: ${String(err)}`,
          is_error: true,
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(`max_iterations (${manifest.max_iterations}) reached`);
}
