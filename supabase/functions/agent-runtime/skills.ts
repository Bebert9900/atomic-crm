import type { AuthInfo } from "./auth.ts";
import { loadSkillsFor } from "../_shared/skills/loader.ts";
import { makeSupabaseForUser } from "./runPersistence.ts";

export async function handleListSkills(auth: AuthInfo): Promise<Response> {
  const supa = makeSupabaseForUser(auth.token);
  const { byId, sourceById } = await loadSkillsFor(supa);
  const list = Object.values(byId).map((s) => ({
    id: s.id,
    version: s.version,
    description: s.description,
    model: s.model,
    tools_allowed: s.tools_allowed,
    rate_limit: s.rate_limit,
    source: sourceById[s.id] ?? "code",
  }));
  return Response.json({ skills: list });
}
