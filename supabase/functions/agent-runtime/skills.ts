import type { AuthInfo } from "./auth.ts";
import { skills } from "../_shared/skills/index.ts";

export function handleListSkills(_auth: AuthInfo): Response {
  const list = Object.values(skills).map((s) => ({
    id: s.id,
    version: s.version,
    description: s.description,
    model: s.model,
    tools_allowed: s.tools_allowed,
    rate_limit: s.rate_limit,
  }));
  return Response.json({ skills: list });
}
