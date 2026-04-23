import type { AuthInfo } from "./auth.ts";
import { skills } from "../_shared/skills/index.ts";
import type { SkillExecCtx } from "../_shared/skills/types.ts";
import { appendTraceStep, createRun, finalizeRun } from "./runPersistence.ts";
import { createSSEStream, sseResponse } from "./sse.ts";

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
  const { skill_id, input, dry_run = false } = body;
  if (!skill_id || typeof skill_id !== "string") {
    return jsonError("missing_skill_id", 400);
  }

  const manifest = skills[skill_id];
  if (!manifest) {
    return Response.json({ error: "unknown_skill", skill_id }, { status: 404 });
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
    send({ event: "run.started", data: { run_id: runId } });
    try {
      if (!manifest.execute) {
        // A.2: only manifests with a custom executor can run.
        // The Claude tool_use loop is wired in A.4.
        throw new Error(
          `Skill ${manifest.id} has no custom executor. The LLM runtime is not wired yet (story A.4).`,
        );
      }
      const output = await manifest.execute(execCtx);
      const validated = manifest.output_schema.parse(output);
      await finalizeRun(auth.token, runId, {
        status: "success",
        output: validated,
      });
      send({ event: "run.done", data: { run_id: runId, output: validated } });
    } catch (err) {
      await finalizeRun(auth.token, runId, {
        status: "error",
        error_code: "runtime_error",
        error_message: String(err),
      }).catch(() => {});
      send({ event: "run.error", data: { run_id: runId, error: String(err) } });
    } finally {
      close();
    }
  })();

  return sseResponse(stream);
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}
