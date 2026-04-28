import type { SkillManifest } from "./types.ts";
import { helloWorldSkill } from "./helloWorld.ts";
import { processCallRecordingSkill } from "./processCallRecording.ts";
import { handleIncomingEmailSkill } from "./handleIncomingEmail.ts";
import { morningBriefSkill } from "./morningBrief.ts";
import { morningBriefDeepseekSkill } from "./morningBriefDeepseek.ts";
import { nextBestActionOnDealSkill } from "./nextBestActionOnDeal.ts";
import { qualifyInboundContactSkill } from "./qualifyInboundContact.ts";
import { chatWithCrmSkill } from "./chatWithCrm.ts";
import { draftOutboundEmailSkill } from "./draftOutboundEmail.ts";
import { prepareMeetingBriefSkill } from "./prepareMeetingBrief.ts";
import { triageDevTasksSkill } from "./triageDevTasks.ts";
import { deduplicateContactsSkill } from "./deduplicateContacts.ts";
import { weeklyPipelineReviewSkill } from "./weeklyPipelineReview.ts";
import { scheduleMeetingAssistantSkill } from "./scheduleMeetingAssistant.ts";
import { onboardSaasSignupSkill } from "./onboardSaasSignup.ts";
import { detectChurnRiskSkill } from "./detectChurnRisk.ts";
import { bulkInboxTriageSkill } from "./bulkInboxTriage.ts";
import { enrichContactFromSignalsSkill } from "./enrichContactFromSignals.ts";
import { suggestSkillFromSessionSkill } from "./suggestSkillFromSession.ts";
import { preMeetingAlertSkill } from "./preMeetingAlert.ts";
import { staleDealWatchdogSkill } from "./staleDealWatchdog.ts";
import { autoReplyDrafterSkill } from "./autoReplyDrafter.ts";
import { callToNoteSkill } from "./callToNote.ts";

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
  [chatWithCrmSkill.id]: chatWithCrmSkill,
  [draftOutboundEmailSkill.id]: draftOutboundEmailSkill,
  [prepareMeetingBriefSkill.id]: prepareMeetingBriefSkill,
  [triageDevTasksSkill.id]: triageDevTasksSkill,
  [deduplicateContactsSkill.id]: deduplicateContactsSkill,
  [weeklyPipelineReviewSkill.id]: weeklyPipelineReviewSkill,
  [scheduleMeetingAssistantSkill.id]: scheduleMeetingAssistantSkill,
  [onboardSaasSignupSkill.id]: onboardSaasSignupSkill,
  [detectChurnRiskSkill.id]: detectChurnRiskSkill,
  [bulkInboxTriageSkill.id]: bulkInboxTriageSkill,
  [enrichContactFromSignalsSkill.id]: enrichContactFromSignalsSkill,
  [suggestSkillFromSessionSkill.id]: suggestSkillFromSessionSkill,
  [preMeetingAlertSkill.id]: preMeetingAlertSkill,
  [staleDealWatchdogSkill.id]: staleDealWatchdogSkill,
  [autoReplyDrafterSkill.id]: autoReplyDrafterSkill,
  [callToNoteSkill.id]: callToNoteSkill,
};
