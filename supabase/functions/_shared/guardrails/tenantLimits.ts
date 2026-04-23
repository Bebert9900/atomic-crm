import { makeSupabaseForUser } from "../../agent-runtime/runPersistence.ts";

export async function checkTenantMonthlyLimits(
  userJwt: string,
  tenantId?: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!tenantId) return { ok: true };
  const supa = makeSupabaseForUser(userJwt);

  const [{ data: settings }, { data: usage }] = await Promise.all([
    supa
      .from("tenant_settings")
      .select("agentic_usage_limits")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supa
      .from("tenant_usage_monthly")
      .select("runs, cost_usd")
      .eq("tenant_id", tenantId)
      .gte(
        "month",
        new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          1,
        ).toISOString(),
      )
      .maybeSingle(),
  ]);

  // deno-lint-ignore no-explicit-any
  const limits = ((settings as any)?.agentic_usage_limits ?? {}) as Record<
    string,
    number
  >;
  // deno-lint-ignore no-explicit-any
  const runs = Number((usage as any)?.runs ?? 0);
  // deno-lint-ignore no-explicit-any
  const cost = Number((usage as any)?.cost_usd ?? 0);

  if (limits.per_month && runs >= limits.per_month) {
    return { ok: false, reason: "tenant_monthly_runs_exceeded" };
  }
  if (limits.max_cost_usd_per_month && cost >= limits.max_cost_usd_per_month) {
    return { ok: false, reason: "tenant_monthly_cost_exceeded" };
  }
  return { ok: true };
}
