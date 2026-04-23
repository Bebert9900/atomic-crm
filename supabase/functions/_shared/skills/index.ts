import type { SkillManifest } from "./types.ts";
import { helloWorldSkill } from "./helloWorld.ts";
import { processCallRecordingSkill } from "./processCallRecording.ts";
import { handleIncomingEmailSkill } from "./handleIncomingEmail.ts";
import { morningBriefSkill } from "./morningBrief.ts";
import { morningBriefDeepseekSkill } from "./morningBriefDeepseek.ts";
import { nextBestActionOnDealSkill } from "./nextBestActionOnDeal.ts";
import { qualifyInboundContactSkill } from "./qualifyInboundContact.ts";

// Registry of all skills available to the agent-runtime.
// deno-lint-ignore no-explicit-any
export const skills: Record<string, SkillManifest<any, any>> = {
  [helloWorldSkill.id]: helloWorldSkill,
  [processCallRecordingSkill.id]: processCallRecordingSkill,
  [handleIncomingEmailSkill.id]: handleIncomingEmailSkill,
  [morningBriefSkill.id]: morningBriefSkill,
  [morningBriefDeepseekSkill.id]: morningBriefDeepseekSkill,
  [nextBestActionOnDealSkill.id]: nextBestActionOnDealSkill,
  [qualifyInboundContactSkill.id]: qualifyInboundContactSkill,
};
