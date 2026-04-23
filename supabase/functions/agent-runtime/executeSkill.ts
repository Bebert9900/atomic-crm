import type { AuthInfo } from "./auth.ts";
import { skills } from "../_shared/skills/index.ts";
import type { SkillExecCtx } from "../_shared/skills/types.ts";
import { appendTraceStep, createRun, finalizeRun } from "./runPersistence.ts";
import { createSSEStream, sseResponse } from "./sse.ts";
import { runToolLoop } from "../_shared/claude/toolLoop.ts";
import {
  checkGlobalUserLimits,
  checkRateLimits,
  checkTenantLimits,
} from "../_shared/guardrails/rateLimit.ts";
import {
  checkKillSwitch,
  isShadowEnforced,
} from "../_shared/guardrails/killSwitch.ts";
import { checkTenantAccess } from "../_shared/guardrails/tenantAccess.ts";
import { checkTenantMonthlyLimits } from "../_shared/guardrails/tenantLimits.ts";
import {
  checkCircuit,
  recordOutcome,
} from "../_shared/guardrails/circuitBreaker.ts";

export async function handleRun(
  req: Request,
  auth: AuthInfo,
): Promise<Response> {
  let body: { skill_id?: string; input?: unknown; dry_run?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_body", 400);
  }
  const { skill_id, input } = body;
  let dry_run = body.dry_run ?? false;
  if (!skill_id || typeof skill_id !== "string") {
    return jsonError("missing_skill_id", 400);
  }

  const manifest = skills[skill_id];
  if (!manifest) {
    return Response.json({ error: "unknown_skill", skill_id }, { status: 404 });
  }

  // Pre-flight guardrails
  const kill = await checkKillSwitch(auth.token, manifest.id);
  if (!kill.ok) {
    return Response.json(
      { error: "kill_switch", reason: kill.reason },
      { status: 503 },
    );
  }
  const circuit = await checkCircuit(manifest.id).catch(() => ({
    ok: true as const,
  }));
  if (!circuit.ok) {
    return Response.json(
      { error: "circuit_open", reason: circuit.reason },
      { status: 503 },
    );
  }
  const tenantLim = await checkTenantMonthlyLimits(auth.token, auth.tenantId);
  if (!tenantLim.ok) {
    return Response.json(
      { error: "tenant_limit", reason: tenantLim.reason },
      { status: 429 },
    );
  }
  const tenantAcc = await checkTenantAccess(
    auth.token,
    manifest.id,
    auth.tenantId,
  );
  if (!tenantAcc.ok) {
    return Response.json(
      { error: "not_enabled", reason: tenantAcc.reason },
      { status: 403 },
    );
  }
  const rl = await checkRateLimits(
    auth.token,
    auth.userId,
    manifest.id,
    manifest.rate_limit.per_minute,
    manifest.rate_limit.per_hour,
  );
  if (!rl.ok) {
    return Response.json(
      { error: "rate_limit", reason: rl.reason, retryAfter: rl.retryAfter },
      { status: 429 },
    );
  }
  const globalRl = await checkGlobalUserLimits(auth.token, auth.userId);
  if (!globalRl.ok) {
    return Response.json(
      {
        error: "rate_limit",
        reason: globalRl.reason,
        retryAfter: globalRl.retryAfter,
      },
      { status: 429 },
    );
  }
  const tenantRl = await checkTenantLimits(auth.token, auth.tenantId);
  if (!tenantRl.ok) {
    return Response.json(
      {
        error: "rate_limit",
        reason: tenantRl.reason,
        retryAfter: tenantRl.retryAfter,
      },
      { status: 429 },
    );
  }

  // Shadow-mode enforcement: if skill is globally in shadow, override dry_run
  if (!dry_run) {
    dry_run = await isShadowEnforced(auth.token, manifest.id);
  }

  const parsed = manifest.input_schema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let runId: number;
  try {
    runId = await createRun(auth.token, {
      skill_id: manifest.id,
      skill_version: manifest.version,
      input: parsed.data,
      dry_run,
      model: manifest.model,
      tenant_id: auth.tenantId,
    });
  } catch (err) {
    return Response.json(
      { error: "create_run_failed", message: String(err) },
      { status: 500 },
    );
  }

  const { stream, send, close } = createSSEStream();

  const execCtx: SkillExecCtx<unknown> = {
    input: parsed.data,
    auth,
    runId,
    dryRun: dry_run,
    appendStep: (step) => appendTraceStep(auth.token, runId, step),
    emit: send,
  };

  (async () => {
    send({ event: "run.started", data: { run_id: runId, dry_run } });
    let finalOk = false;
    try {
      if (manifest.execute) {
        const output = await manifest.execute(execCtx);
        const validated = manifest.output_schema.parse(output);
        await finalizeRun(auth.token, runId, {
          status: "success",
          output: validated,
        });
        send({
          event: "run.done",
          data: { run_id: runId, output: validated },
        });
      } else {
        const result = await runToolLoop(manifest, execCtx);
        await finalizeRun(auth.token, runId, {
          status: "success",
          output: result.output,
          input_tokens: result.usage.input_tokens,
          output_tokens: result.usage.output_tokens,
          cache_read_tokens: result.usage.cache_read_input_tokens,
          cache_creation_tokens: result.usage.cache_creation_input_tokens,
          cost_usd: result.usage.cost_usd,
        });
        send({
          event: "run.done",
          data: { run_id: runId, output: result.output, usage: result.usage },
        });
      }
      finalOk = true;
    } catch (err) {
      await finalizeRun(auth.token, runId, {
        status: "error",
        error_code: "runtime_error",
        error_message: String(err),
      }).catch(() => {});
      send({
        event: "run.error",
        data: { run_id: runId, error: String(err) },
      });
    } finally {
      // Circuit breaker: record outcome (non-blocking)
      recordOutcome(manifest.id, finalOk).catch((e) =>
        console.error("circuitBreaker.recordOutcome", e),
      );
      close();
    }
  })();

  return sseResponse(stream);
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}
