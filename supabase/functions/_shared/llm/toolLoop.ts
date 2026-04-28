import { zodToJsonSchema } from "npm:zod-to-json-schema@^3.23";
import { isWriteTool, tools as toolRegistry } from "../tools/registry.ts";
import type { SkillExecCtx, SkillManifest } from "../skills/types.ts";
import { makeSupabaseForUser } from "../../agent-runtime/runPersistence.ts";
import { resolveProvider } from "./registry.ts";
import type { ToolResultEntry } from "./types.ts";

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

function toolDescriptors(names: string[]) {
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
  const provider = resolveProvider(manifest.model);
  const descriptors = toolDescriptors(manifest.tools_allowed);

  const userContent = `Input:\n\`\`\`json\n${JSON.stringify(
    ctx.input,
    null,
    2,
  )}\n\`\`\``;
  let messages = provider.buildInitialMessages(userContent);

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

    const response = await provider.createCompletion({
      model: manifest.model,
      system: manifest.system_prompt,
      messages,
      tools: descriptors,
      maxTokens: 4096,
    });

    usage.input_tokens += response.usage.input_tokens;
    usage.output_tokens += response.usage.output_tokens;
    usage.cache_creation_input_tokens +=
      response.usage.cache_creation_input_tokens ?? 0;
    usage.cache_read_input_tokens +=
      response.usage.cache_read_input_tokens ?? 0;

    messages = [...messages, response.rawAssistantMessage];

    if (response.text) {
      await ctx.appendStep({
        step: iteration,
        type: "assistant_text",
        content: response.text,
        ts: new Date().toISOString(),
      });
      ctx.emit({ event: "text", data: { content: response.text } });
    }

    if (response.finishReason !== "tool_use") {
      usage.cost_usd = provider.computeCost(manifest.model, response.usage);
      const parsed = tryParseJson(response.text);
      const output = manifest.output_schema.parse(parsed ?? {});
      return { output, usage, iterations: iteration };
    }

    const toolResults: ToolResultEntry[] = [];
    for (const call of response.toolCalls) {
      const toolDef = toolRegistry[call.name];
      if (!toolDef) {
        await ctx.appendStep({
          step: iteration,
          type: "guardrail",
          name: "unknown_tool",
          outcome: "deny",
          reason: `tool ${call.name} not registered`,
          ts: new Date().toISOString(),
        });
        toolResults.push({
          toolCallId: call.id,
          toolName: call.name,
          content: `Error: unknown tool`,
          isError: true,
        });
        continue;
      }
      if (!manifest.tools_allowed.includes(call.name)) {
        await ctx.appendStep({
          step: iteration,
          type: "guardrail",
          name: "tool_not_in_allowlist",
          outcome: "deny",
          reason: `tool ${call.name} not allowed for ${manifest.id}`,
          ts: new Date().toISOString(),
        });
        toolResults.push({
          toolCallId: call.id,
          toolName: call.name,
          content: `Error: tool ${call.name} is not allowed for this skill`,
          isError: true,
        });
        continue;
      }
      if (isWriteTool(call.name)) {
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
            toolCallId: call.id,
            toolName: call.name,
            content: `Error: max write actions reached`,
            isError: true,
          });
          continue;
        }
        writes++;
      }

      const start = Date.now();
      await ctx.appendStep({
        step: iteration,
        type: "tool_use",
        tool: call.name,
        args: call.args,
        tool_use_id: call.id,
        ts: new Date().toISOString(),
      });
      ctx.emit({
        event: "tool_use",
        data: { name: call.name, args: call.args },
      });

      try {
        const parsedArgs = toolDef.input_schema.parse(call.args);
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
          tool_use_id: call.id,
          result,
          duration_ms,
          status: "ok",
          ts: new Date().toISOString(),
        });
        ctx.emit({
          event: "tool_result",
          data: { name: call.name, result },
        });
        toolResults.push({
          toolCallId: call.id,
          toolName: call.name,
          content: JSON.stringify(result),
          isError: false,
        });
      } catch (err) {
        const duration_ms = Date.now() - start;
        await ctx.appendStep({
          step: iteration,
          type: "tool_result",
          tool_use_id: call.id,
          result: { error: String(err) },
          duration_ms,
          status: "error",
          ts: new Date().toISOString(),
        });
        toolResults.push({
          toolCallId: call.id,
          toolName: call.name,
          content: `Error: ${String(err)}`,
          isError: true,
        });
      }
    }

    messages = provider.appendToolResults(messages, toolResults);
  }

  throw new Error(`max_iterations (${manifest.max_iterations}) reached`);
}
