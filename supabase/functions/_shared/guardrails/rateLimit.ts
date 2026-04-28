import { makeSupabaseForUser } from "../../agent-runtime/runPersistence.ts";

export async function checkRateLimits(
  userJwt: string,
  userId: string,
  skillId: string,
  perMinute: number,
  perHour: number,
): Promise<{ ok: true } | { ok: false; retryAfter: number; reason: string }> {
  const supa = makeSupabaseForUser(userJwt);
  const minAgo = new Date(Date.now() - 60_000).toISOString();
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count: cMin } = await supa
    .from("skill_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("skill_id", skillId)
    .gte("started_at", minAgo);
  if ((cMin ?? 0) >= perMinute) {
    return { ok: false, retryAfter: 60, reason: "per_minute" };
  }
  const { count: cHour } = await supa
    .from("skill_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("skill_id", skillId)
    .gte("started_at", hourAgo);
  if ((cHour ?? 0) >= perHour) {
    return { ok: false, retryAfter: 3600, reason: "per_hour" };
  }
  return { ok: true };
}

export async function checkGlobalUserLimits(
  userJwt: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; retryAfter: number; reason: string }> {
  const supa = makeSupabaseForUser(userJwt);
  const minAgo = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supa
    .from("skill_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("started_at", minAgo);
  if ((count ?? 0) >= 10) {
    return { ok: false, retryAfter: 60, reason: "user_global_per_minute" };
  }
  return { ok: true };
}

export async function checkTenantLimits(
  userJwt: string,
  tenantId: string | undefined,
): Promise<{ ok: true } | { ok: false; retryAfter: number; reason: string }> {
  if (!tenantId) return { ok: true };
  const supa = makeSupabaseForUser(userJwt);
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await supa
    .from("skill_runs")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("started_at", hourAgo);
  if ((count ?? 0) >= 500) {
    return { ok: false, retryAfter: 3600, reason: "tenant_per_hour" };
  }
  return { ok: true };
}
