import { createClient } from "npm:@supabase/supabase-js@2";

const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

function admin() {
  if (!SERVICE_ROLE) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY missing on edge function");
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE);
}

const OPEN_DURATION_MS = 3600_000; // 1h
const OPEN_THRESHOLD = 5;

export async function checkCircuit(
  skillId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const supa = admin();
  const { data } = await supa
    .from("agentic_circuit_state")
    .select("state, opened_at, consecutive_errors")
    .eq("skill_id", skillId)
    .maybeSingle();
  if (!data) return { ok: true };
  // deno-lint-ignore no-explicit-any
  const row = data as any;
  if (row.state === "open") {
    const since = row.opened_at ? Date.now() - +new Date(row.opened_at) : 0;
    if (since < OPEN_DURATION_MS) {
      return { ok: false, reason: "circuit_open" };
    }
    await supa
      .from("agentic_circuit_state")
      .update({
        state: "half_open",
        last_check_at: new Date().toISOString(),
      })
      .eq("skill_id", skillId);
  }
  return { ok: true };
}

export async function recordOutcome(
  skillId: string,
  success: boolean,
): Promise<void> {
  const supa = admin();
  const { data } = await supa
    .from("agentic_circuit_state")
    .select("state, consecutive_errors, opened_at")
    .eq("skill_id", skillId)
    .maybeSingle();
  if (!data) {
    await supa.from("agentic_circuit_state").insert({
      skill_id: skillId,
      consecutive_errors: success ? 0 : 1,
      state: "closed",
    });
    return;
  }
  // deno-lint-ignore no-explicit-any
  const row = data as any;
  if (success) {
    await supa
      .from("agentic_circuit_state")
      .update({
        consecutive_errors: 0,
        state: "closed",
        opened_at: null,
        last_check_at: new Date().toISOString(),
      })
      .eq("skill_id", skillId);
  } else {
    const next = row.consecutive_errors + 1;
    const shouldOpen = next >= OPEN_THRESHOLD;
    await supa
      .from("agentic_circuit_state")
      .update({
        consecutive_errors: next,
        state: shouldOpen ? "open" : row.state,
        opened_at: shouldOpen ? new Date().toISOString() : row.opened_at,
        last_check_at: new Date().toISOString(),
      })
      .eq("skill_id", skillId);
  }
}
