import { makeSupabaseForUser } from "../../agent-runtime/runPersistence.ts";

export async function checkKillSwitch(
  userJwt: string,
  skillId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const supa = makeSupabaseForUser(userJwt);
  const { data } = await supa.from("configuration").select("config").single();
  const config = ((data as { config?: Record<string, unknown> } | null)
    ?.config ?? {}) as Record<string, unknown>;
  if (config.agentic_kill_switch === true) {
    return { ok: false, reason: "global_kill_switch" };
  }
  const disabled = (config.agentic_disabled_skills ?? []) as string[];
  if (Array.isArray(disabled) && disabled.includes(skillId)) {
    return { ok: false, reason: "skill_disabled" };
  }
  return { ok: true };
}

export async function isShadowEnforced(
  userJwt: string,
  skillId: string,
): Promise<boolean> {
  const supa = makeSupabaseForUser(userJwt);
  const { data } = await supa.from("configuration").select("config").single();
  const config = ((data as { config?: Record<string, unknown> } | null)
    ?.config ?? {}) as Record<string, unknown>;
  const shadow = (config.agentic_shadow_skills ?? []) as string[];
  return Array.isArray(shadow) && shadow.includes(skillId);
}
