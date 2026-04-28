import { makeSupabaseForUser } from "../../agent-runtime/runPersistence.ts";

export async function checkTenantAccess(
  userJwt: string,
  skillId: string,
  tenantId?: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!tenantId) return { ok: true };
  const supa = makeSupabaseForUser(userJwt);
  const { data } = await supa
    .from("tenant_settings")
    .select("agentic_enabled, agentic_enabled_skills")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) {
    return { ok: false, reason: "no_tenant_settings" };
  }
  // deno-lint-ignore no-explicit-any
  const row = data as any;
  if (!row.agentic_enabled) {
    return { ok: false, reason: "agentic_not_enabled" };
  }
  const skills = (row.agentic_enabled_skills ?? []) as string[];
  if (!skills.includes(skillId)) {
    return { ok: false, reason: "skill_not_enabled_for_tenant" };
  }
  return { ok: true };
}
