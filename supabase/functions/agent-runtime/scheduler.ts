import {
  create as createJWT,
  getNumericDate,
} from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("SUPABASE_JWT_SECRET");
const SCHEDULER_KEY = Deno.env.get("AGENT_SCHEDULER_KEY");

const BATCH_SIZE = 5;
const MAX_ATTEMPTS = 3;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE);
}

async function userJwt(userId: string): Promise<string> {
  if (!JWT_SECRET) throw new Error("SUPABASE_JWT_SECRET missing");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return await createJWT(
    { alg: "HS256", typ: "JWT" },
    {
      sub: userId,
      role: "authenticated",
      aud: "authenticated",
      exp: getNumericDate(60 * 5),
    },
    key,
  );
}

type ActionRow = {
  id: number;
  skill_id: string;
  input: unknown;
  user_id: string | null;
  attempts: number;
};

async function claimDue(): Promise<ActionRow[]> {
  const { data, error } = await admin().rpc("agentic_claim_due_actions", {
    p_limit: BATCH_SIZE,
  });
  if (error) {
    console.error("claim error", error);
    return [];
  }
  return (data ?? []) as ActionRow[];
}

async function executeOne(row: ActionRow): Promise<void> {
  if (!row.user_id) {
    await admin()
      .from("agentic_scheduled_actions")
      .update({
        status: "error",
        error_message: "missing_user_id",
        ended_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return;
  }
  let token: string;
  try {
    token = await userJwt(row.user_id);
  } catch (err) {
    await admin()
      .from("agentic_scheduled_actions")
      .update({
        status: "error",
        error_message: `jwt_mint_failed: ${err instanceof Error ? err.message : String(err)}`,
        ended_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return;
  }

  const startedAt = new Date().toISOString();
  let finalStatus = "done";
  let result: unknown = null;
  let errorMessage: string | null = null;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-runtime/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ skill_id: row.skill_id, input: row.input ?? {} }),
    });
    if (!res.ok) {
      throw new Error(
        `HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`,
      );
    }
    const body = await res.text();
    const blocks = body
      .split(/\n\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const block of blocks) {
      const eventLine = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
      const dataLine = block.match(/^data:\s*(.+)$/m)?.[1]?.trim();
      if (!eventLine || !dataLine) continue;
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(dataLine);
      } catch {
        continue;
      }
      if (eventLine === "run.done") result = parsed.output ?? null;
      else if (eventLine === "run.error") {
        finalStatus = "error";
        errorMessage = String(parsed.error ?? "unknown");
      }
    }
  } catch (err) {
    finalStatus = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  if (finalStatus === "error" && row.attempts < MAX_ATTEMPTS) {
    // Re-queue with backoff
    const nextRunAt = new Date(
      Date.now() + 60_000 * Math.pow(2, row.attempts),
    ).toISOString();
    await admin()
      .from("agentic_scheduled_actions")
      .update({
        status: "pending",
        run_at: nextRunAt,
        error_message: errorMessage,
        started_at: startedAt,
      })
      .eq("id", row.id);
    return;
  }

  await admin()
    .from("agentic_scheduled_actions")
    .update({
      status: finalStatus,
      result,
      error_message: errorMessage,
      started_at: startedAt,
      ended_at: new Date().toISOString(),
    })
    .eq("id", row.id);
}

export async function handleSchedulerTick(req: Request): Promise<Response> {
  const provided = req.headers.get("x-scheduler-key");
  if (!SCHEDULER_KEY || provided !== SCHEDULER_KEY) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const due = await claimDue();
  if (due.length === 0) return Response.json({ ran: 0 });
  await Promise.all(due.map(executeOne));
  return Response.json({ ran: due.length });
}
