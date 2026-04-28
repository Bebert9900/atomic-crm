import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export function makeSupabaseForUser(userJwt: string): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${userJwt}` } } },
  );
}

export type CreateRunRow = {
  skill_id: string;
  skill_version: string;
  input: unknown;
  dry_run: boolean;
  model?: string;
  tenant_id?: string;
  user_id: string;
};

export async function createRun(
  userJwt: string,
  row: CreateRunRow,
): Promise<number> {
  const supabase = makeSupabaseForUser(userJwt);
  const { data, error } = await supabase
    .from("skill_runs")
    .insert({
      ...row,
      status: row.dry_run ? "shadow" : "running",
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: number }).id;
}

export async function appendTraceStep(
  userJwt: string,
  runId: number,
  step: unknown,
): Promise<void> {
  const supabase = makeSupabaseForUser(userJwt);
  const { error } = await supabase.rpc("append_skill_run_trace", {
    p_run_id: runId,
    p_step: step,
  });
  if (error) {
    // Log but do not throw — trace append is best-effort
    console.error("append_skill_run_trace failed", error);
  }
}

export type FinalizePatch = {
  status: "success" | "error" | "cancelled";
  output?: unknown;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  cost_usd?: number;
  error_code?: string;
  error_message?: string;
};

export async function finalizeRun(
  userJwt: string,
  runId: number,
  patch: FinalizePatch,
): Promise<void> {
  const supabase = makeSupabaseForUser(userJwt);
  const { error } = await supabase
    .from("skill_runs")
    .update({ ...patch, ended_at: new Date().toISOString() })
    .eq("id", runId);
  if (error) throw error;
}
