import type { SkillManifest } from "./types.ts";
import { helloWorldSkill } from "./helloWorld.ts";

// Registry of all skills available to the agent-runtime.
// Real skills (B.1 … B.5) will be registered here as they come online.
export const skills: Record<string, SkillManifest> = {
  [helloWorldSkill.id]: helloWorldSkill,
};
