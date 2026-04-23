# Story A.4 — Claude API wrapper + tool_use loop

**Epic**: A. Foundation
**Status**: Ready
**Estimation**: 8h
**Depends on**: A.1, A.2, A.3
**Blocks**: B.1 à B.5

## Contexte business

Cœur du runtime. Cette story connecte le squelette agent-runtime au LLM : boucle tool_use, prompt caching, comptage tokens/coût, enforcement des guardrails, persistance du trace. À la fin, on peut déclarer un vrai skill (avec `execute` non défini) et il s'exécute via Claude.

## Contexte technique

- SDK : `npm:@anthropic-ai/sdk@latest` (Deno compatible)
- API : `client.messages.create({ model, system, tools, messages, max_tokens })`
- Prompt caching : cache breakpoints sur `system` et `tools`
- Streaming : on utilise `client.messages.stream()` pour émettre des events SSE temps réel ; le comptage usage arrive sur le message final
- Modèle par défaut : `claude-opus-4-7` ; configurable par skill

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `supabase/functions/_shared/claude/client.ts` | Créer |
| `supabase/functions/_shared/claude/pricing.ts` | Créer (coûts par 1M tokens) |
| `supabase/functions/_shared/claude/toolLoop.ts` | Créer (orchestration) |
| `supabase/functions/_shared/guardrails/threshold.ts` | Créer |
| `supabase/functions/_shared/guardrails/tenantAccess.ts` | Créer |
| `supabase/functions/_shared/guardrails/killSwitch.ts` | Créer |
| `supabase/functions/_shared/guardrails/rateLimit.ts` | Créer |
| `supabase/functions/agent-runtime/executeSkill.ts` | Brancher toolLoop |

## Spec technique

### `pricing.ts`

```ts
// Prices in USD per 1M tokens as of 2026-04
// Update from https://www.anthropic.com/pricing
export const pricing: Record<string, {
  input: number; output: number;
  cache_write: number; cache_read: number;
}> = {
  "claude-opus-4-7":   { input: 15, output: 75, cache_write: 18.75, cache_read: 1.50 },
  "claude-sonnet-4-6": { input: 3,  output: 15, cache_write: 3.75,  cache_read: 0.30 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5, cache_write: 1.25, cache_read: 0.10 },
};

export function computeCost(model: string, usage: {
  input_tokens: number; output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}): number {
  const p = pricing[model];
  if (!p) return 0;
  return (
    usage.input_tokens * p.input +
    usage.output_tokens * p.output +
    (usage.cache_creation_input_tokens ?? 0) * p.cache_write +
    (usage.cache_read_input_tokens ?? 0) * p.cache_read
  ) / 1_000_000;
}
```

### `client.ts`

```ts
import Anthropic from "npm:@anthropic-ai/sdk@latest";

const client = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
});

export { client };
```

### `toolLoop.ts` — cœur du runtime

```ts
import { client } from "./client.ts";
import { computeCost } from "./pricing.ts";
import { tools as toolRegistry, toolsForClaude, isWriteTool } from "../tools/registry.ts";
import type { SkillManifest, SkillExecCtx } from "../skills/types.ts";
import { checkThresholds } from "../guardrails/threshold.ts";

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
  trace_length: number;
};

export async function runToolLoop<I, O>(
  manifest: SkillManifest<I, O>,
  ctx: SkillExecCtx<I>,
): Promise<RunResult<O>> {
  const messages: Array<
    | { role: "user"; content: any }
    | { role: "assistant"; content: any }
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
  // mark last tool as cached (Anthropic caches all tools block when any has cache_control)
  if (claudeTools.length > 0) {
    (claudeTools[claudeTools.length - 1] as any).cache_control = { type: "ephemeral" };
  }

  let iteration = 0;
  let writes = 0;
  const usage: RunUsage = {
    input_tokens: 0, output_tokens: 0,
    cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cost_usd: 0,
  };

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
      tools: claudeTools,
      messages,
      max_tokens: 4096,
    });

    // accumulate usage
    const u = response.usage as any;
    usage.input_tokens += u.input_tokens ?? 0;
    usage.output_tokens += u.output_tokens ?? 0;
    usage.cache_creation_input_tokens += u.cache_creation_input_tokens ?? 0;
    usage.cache_read_input_tokens += u.cache_read_input_tokens ?? 0;

    messages.push({ role: "assistant", content: response.content });

    // emit text blocks
    for (const block of response.content) {
      if (block.type === "text") {
        await ctx.appendStep({
          step: iteration, type: "assistant_text",
          content: block.text, ts: new Date().toISOString(),
        });
        ctx.emit({ event: "text", data: { content: block.text } });
      }
    }

    if (response.stop_reason !== "tool_use") {
      usage.cost_usd = computeCost(manifest.model, usage);
      // extract final output from last text block
      const finalText =
        response.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
      const parsed = tryParseJson(finalText);
      const outputCandidate = parsed ?? {};
      const output = manifest.output_schema.parse(outputCandidate);
      return { output, usage, iterations: iteration, trace_length: messages.length };
    }

    // process tool_use blocks
    const toolResults: any[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      const toolDef = toolRegistry[block.name];
      if (!toolDef) {
        await ctx.appendStep({
          step: iteration, type: "guardrail", name: "unknown_tool",
          outcome: "deny", reason: `tool ${block.name} not registered`,
          ts: new Date().toISOString(),
        });
        toolResults.push({
          type: "tool_result", tool_use_id: block.id,
          content: `Error: unknown tool`, is_error: true,
        });
        continue;
      }

      if (!manifest.tools_allowed.includes(block.name)) {
        await ctx.appendStep({
          step: iteration, type: "guardrail", name: "tool_not_in_allowlist",
          outcome: "deny", reason: `tool ${block.name} not allowed for ${manifest.id}`,
          ts: new Date().toISOString(),
        });
        toolResults.push({
          type: "tool_result", tool_use_id: block.id,
          content: `Error: tool ${block.name} is not allowed for this skill`,
          is_error: true,
        });
        continue;
      }

      if (isWriteTool(block.name)) {
        if (writes >= manifest.max_writes) {
          await ctx.appendStep({
            step: iteration, type: "guardrail", name: "max_writes_exceeded",
            outcome: "deny", reason: `max_writes=${manifest.max_writes}`,
            ts: new Date().toISOString(),
          });
          toolResults.push({
            type: "tool_result", tool_use_id: block.id,
            content: `Error: max write actions reached for this skill`,
            is_error: true,
          });
          continue;
        }
        writes++;
      }

      const start = Date.now();
      await ctx.appendStep({
        step: iteration, type: "tool_use", tool: block.name,
        args: block.input, tool_use_id: block.id,
        ts: new Date().toISOString(),
      });
      ctx.emit({ event: "tool_use", data: { name: block.name, args: block.input } });

      try {
        const parsedArgs = toolDef.input_schema.parse(block.input);
        const result = await toolDef.handler(parsedArgs, {
          auth: ctx.auth,
          supabase: makeSupabase(ctx.auth.token),
          runId: ctx.runId,
          dryRun: ctx.dryRun,
        });
        const duration_ms = Date.now() - start;
        await ctx.appendStep({
          step: iteration, type: "tool_result", tool_use_id: block.id,
          result, duration_ms, status: "ok",
          ts: new Date().toISOString(),
        });
        ctx.emit({ event: "tool_result", data: { name: block.name, result } });

        toolResults.push({
          type: "tool_result", tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        const duration_ms = Date.now() - start;
        await ctx.appendStep({
          step: iteration, type: "tool_result", tool_use_id: block.id,
          result: { error: String(err) }, duration_ms, status: "error",
          ts: new Date().toISOString(),
        });
        toolResults.push({
          type: "tool_result", tool_use_id: block.id,
          content: `Error: ${String(err)}`, is_error: true,
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(`max_iterations (${manifest.max_iterations}) reached`);
}

function tryParseJson(s: string): unknown {
  const match = s.match(/```json\s*([\s\S]+?)\s*```/) ?? s.match(/\{[\s\S]+\}/);
  if (!match) return null;
  try { return JSON.parse(match[1] ?? match[0]); } catch { return null; }
}

import { createClient } from "npm:@supabase/supabase-js@2";
function makeSupabase(userJwt: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${userJwt}` } } },
  );
}
```

### Guardrails

`rateLimit.ts` :
```ts
import { makeSupabase } from "../../agent-runtime/runPersistence.ts";

export async function checkRateLimits(
  userJwt: string, userId: string, skillId: string,
  perMinute: number, perHour: number,
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const supa = makeSupabase(userJwt);
  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count: cMin } = await supa.from("skill_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("skill_id", skillId).gte("started_at", minuteAgo);
  if ((cMin ?? 0) >= perMinute) return { ok: false, retryAfter: 60 };
  const { count: cH } = await supa.from("skill_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("skill_id", skillId).gte("started_at", hourAgo);
  if ((cH ?? 0) >= perHour) return { ok: false, retryAfter: 3600 };
  return { ok: true };
}
```

`killSwitch.ts` :
```ts
export async function checkKillSwitch(
  userJwt: string, skillId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const supa = makeSupabase(userJwt);
  const { data } = await supa.from("configuration").select("config").single();
  const config = (data?.config ?? {}) as Record<string, unknown>;
  if (config.agentic_kill_switch === true) {
    return { ok: false, reason: "global_kill_switch" };
  }
  const disabled = (config.agentic_disabled_skills ?? []) as string[];
  if (disabled.includes(skillId)) {
    return { ok: false, reason: "skill_disabled" };
  }
  return { ok: true };
}
```

`tenantAccess.ts` : (v1 interne permissif ; structure prête pour SaaS)
```ts
export async function checkTenantAccess(
  userJwt: string, skillId: string, tenantId?: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!tenantId) return { ok: true }; // v1 interne
  const supa = makeSupabase(userJwt);
  const { data } = await supa.from("configuration").select("config").single();
  const config = (data?.config ?? {}) as Record<string, unknown>;
  const enabled = (config.agentic_enabled_skills ?? []) as string[];
  if (!enabled.includes(skillId)) {
    return { ok: false, reason: "skill_not_enabled_for_tenant" };
  }
  return { ok: true };
}
```

`threshold.ts` : reçoit trace courant, retourne booléen. Déjà géré inline dans `toolLoop.ts` via le compteur `writes`.

### `executeSkill.ts` mis à jour

Remplacer le bloc `manifest.execute!(...)` par :

```ts
import { runToolLoop } from "../_shared/claude/toolLoop.ts";
import { checkRateLimits } from "../_shared/guardrails/rateLimit.ts";
import { checkKillSwitch } from "../_shared/guardrails/killSwitch.ts";
import { checkTenantAccess } from "../_shared/guardrails/tenantAccess.ts";

// juste après resolving manifest + validating input :
const kill = await checkKillSwitch(auth.token, manifest.id);
if (!kill.ok) return Response.json({ error: "kill_switch", reason: kill.reason }, { status: 503 });
const tenant = await checkTenantAccess(auth.token, manifest.id, auth.tenantId);
if (!tenant.ok) return Response.json({ error: "not_enabled", reason: tenant.reason }, { status: 403 });
const rl = await checkRateLimits(
  auth.token, auth.userId, manifest.id,
  manifest.rate_limit.per_minute, manifest.rate_limit.per_hour,
);
if (!rl.ok) return Response.json({ error: "rate_limit", retryAfter: rl.retryAfter }, { status: 429 });

// puis dans la fonction async IIFE :
const executor = manifest.execute
  ? manifest.execute
  : (ctx: SkillExecCtx<any>) => runToolLoop(manifest, ctx).then((r) => {
      // attach usage to run via finalizeRun later ; for now return output
      (ctx as any).__usage = r.usage;
      return r.output;
    });
const output = await executor(execCtx);
// in finalizeRun, pass usage fields if present :
await finalizeRun(auth.token, runId, {
  status: "success",
  output,
  input_tokens: (execCtx as any).__usage?.input_tokens,
  output_tokens: (execCtx as any).__usage?.output_tokens,
  cache_read_tokens: (execCtx as any).__usage?.cache_read_input_tokens,
  cache_creation_tokens: (execCtx as any).__usage?.cache_creation_input_tokens,
  cost_usd: (execCtx as any).__usage?.cost_usd,
});
```

### Environment

Ajouter dans `.env.local.example` ou `supabase/functions/.env` (selon convention locale) :

```
ANTHROPIC_API_KEY=sk-ant-...
```

## Critères d'acceptation

- [ ] Déclarer un skill `echo_via_claude` sans `execute` custom, avec system_prompt "Return {\"echo\": <input.text>} as JSON.", tools_allowed=[] → run réussit, output conforme au schema
- [ ] Lorsqu'un skill appelle un tool hors allowlist : step guardrail logged, tool_result en erreur retourné à Claude, le run continue
- [ ] Lorsque `max_iterations` atteint : run status=error, error_code='max_iterations'
- [ ] `cost_usd` calculé et stocké > 0 après un run réel
- [ ] Prompt caching : second run consécutif identique montre `cache_read_input_tokens > 0`
- [ ] Rate limit 429 respecté : 6ème run en <60s avec limit 5 → 429
- [ ] Kill switch global : setter `config.agentic_kill_switch=true` → run renvoie 503
- [ ] `make typecheck` passe (import npm SDK côté Deno)

## Tests

### Test fumée
```bash
curl -N -X POST http://127.0.0.1:54321/functions/v1/agent-runtime/run \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"skill_id":"echo_via_claude","input":{"text":"hello"}}'
```

### Test caching
Relancer 2× le même run ; vérifier `skill_runs.cache_read_tokens` > 0 au 2e.

### Test guardrails
Créer un skill dont le system_prompt incite à appeler un tool hors allowlist → vérifier guardrail step + continuation.

## Risques / pièges

- Prompt caching : l'API cache seulement si le bloc cached est ≥ 1024 tokens. Pour un system_prompt court, pas de cache hit. Documenter dans `process_call_recording` (S1) d'avoir un system_prompt assez long (ou inclure le tool block qui est toujours copieux).
- `zod-to-json-schema` produit parfois du JSON Schema avec `additionalProperties: true` par défaut → Claude peut s'y perdre. Passer `target: "jsonSchema7"` et vérifier la sortie.
- Anthropic SDK en Deno via npm: vérifier qu'il tourne sans polyfill. Sinon, fallback fetch manuel vers `https://api.anthropic.com/v1/messages`.
- `messages.create` vs `messages.stream` : pour v1, preférer `create` synchrone et émettre les SSE events nous-mêmes depuis les blocks. Streaming natif Anthropic est plus complexe et pas strictement requis.

## Done

- Commit : `feat(agentic): add Claude API tool_use runtime with guardrails and caching`
- Un vrai skill (echo) tourne bout-en-bout
- Doc `docs/agentic/how-to-add-skill.md` créée (optionnel mais recommandé)
