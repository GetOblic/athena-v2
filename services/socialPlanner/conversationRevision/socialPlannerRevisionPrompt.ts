/**
 * Conversation Revision instruction layer (L9).
 * Apply requested changes. Preserve compatible source days.
 */

import { SHARED_JSON_OUTPUT_RULES } from "@/services/ai/prompts/sharedPromptConstraints";
import type { SocialPlannerGenerationContextV1 } from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";
import type { SocialCalendarPackageV1 } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  buildSocialPlannerGenerationEvidenceBlocks,
  buildSocialPlannerPackageOutputContract,
  buildSocialPlannerProductionSpecContract,
} from "@/services/socialPlanner/generation/socialPlannerGenerationPrompts";
import {
  SOCIAL_PLANNER_CONVERSATION_REVISION_PROMPT_VERSION,
  SOCIAL_PLANNER_CONVERSATION_REVISION_REPAIR_PROMPT_VERSION,
  SOCIAL_PLANNER_CONVERSATION_REVISION_SINGLE_DAY_PROMPT_VERSION,
  SOCIAL_PLANNER_CONVERSATION_REVISION_SINGLE_DAY_REPAIR_PROMPT_VERSION,
  type SocialPlannerConversationRevisionContextV1,
  type SocialPlannerRevisionSatisfactionResult,
} from "@/services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";
import { snapshotPreservedAssets } from "@/services/socialPlanner/conversationRevision/mergeSingleDayRevisionPackage";

export const SOCIAL_PLANNER_CONVERSATION_REVISION_SYSTEM_ADDENDUM = `
CONVERSATION REVISION: apply the specific requested changes and preserve everything else that remains compatible.
A one-day requested change may keep the other six days unchanged.
Do not invent a wholesale new week. Do not use Think Differently divergence.
`.trim();

export const SOCIAL_PLANNER_CONVERSATION_REVISION_SINGLE_DAY_SYSTEM_PROMPT = `
You are Athena Social Planner — a single-day conversation-revision producer.

Return exactly one Social Calendar asset for the requested date.
Do not return a weekly package, strategySummary, whyThisWeekWorks, or the other six days.
Those six days are copied unchanged outside this call.
Return strict JSON only.
`.trim();

export const SOCIAL_PLANNER_CONVERSATION_REVISION_SINGLE_DAY_REPAIR_SYSTEM_PROMPT = `
You are Athena Social Planner — a single-day conversation-revision repair editor.

Return exactly one corrected Social Calendar asset for the requested date.
Do not return the other six days. Do not rewrite them. They stay copied from the source week.
Return strict JSON only.
`.trim();

export const SOCIAL_PLANNER_CONVERSATION_REVISION_REPAIR_SYSTEM_PROMPT = `
You are Athena Social Planner — a conversation-revision editor.

The weekly package is structurally valid but did not satisfy the frozen revision request
or mode-aware historical checks.
Change only the days that must change. Preserve compatible source days that were not asked to change.
Return strict JSON only.
`.trim();

const GUIDANCE_OPEN = "<<<BEGIN_USER_GUIDANCE>>>";
const GUIDANCE_CLOSE = "<<<END_USER_GUIDANCE>>>";
const REVISION_OPEN = "<<<BEGIN_FROZEN_REVISION_CONTEXT>>>";
const REVISION_CLOSE = "<<<END_FROZEN_REVISION_CONTEXT>>>";
const SOURCE_OPEN = "<<<BEGIN_SOURCE_WEEK_TO_PRESERVE>>>";
const SOURCE_CLOSE = "<<<END_SOURCE_WEEK_TO_PRESERVE>>>";

export function buildConversationRevisionInstructionBlock(): string {
  return `
=== CONVERSATION REVISION (APPLY REQUESTED CHANGES) ===
PROMPT VERSION: ${SOCIAL_PLANNER_CONVERSATION_REVISION_PROMPT_VERSION}

The frozen revision context is the request. Original user guidance still applies and is not replaced.

- Apply the specific requested day and global changes.
- Preserve source days that were not asked to change when they remain compatible.
- A single requested day change may leave six days unchanged.
- Do not treat the source week as something to reject wholesale.
- Respect avoidFormats and preserve dates as hard constraints.
- Desired tone / concept direction is guidance, not a license to rewrite the whole week.
- Preserve factual grounding. Do not invent claims, prices, services, credentials, or outcomes.
- Preserve the exact seven calendar dates.
- Respect candidate-only calendar facts.
`.trim();
}

function compactSourceWeek(sourcePackage: SocialCalendarPackageV1): string {
  return JSON.stringify(
    {
      strategySummary: sourcePackage.strategySummary,
      assets: sourcePackage.assets.map((asset) => ({
        date: asset.date,
        assetType: asset.assetType,
        contentArchetype: asset.contentArchetype,
        primaryObjective: asset.primaryObjective,
        topic: asset.topic,
        angle: asset.angle,
        hook: asset.hook,
        audience: asset.audience,
      })),
    },
    null,
    2,
  );
}

function compactCurrentCandidate(currentPackage: SocialCalendarPackageV1): string {
  return JSON.stringify({
    strategySummary: currentPackage.strategySummary,
    whyThisWeekWorks: currentPackage.whyThisWeekWorks,
    assets: currentPackage.assets.map((asset) => ({
      date: asset.date,
      assetType: asset.assetType,
      contentArchetype: asset.contentArchetype,
      primaryObjective: asset.primaryObjective,
      audience: asset.audience,
      personaIds: asset.personaIds,
      topic: asset.topic,
      angle: asset.angle,
      hook: asset.hook,
      concept: asset.concept,
      calendarAnchors: asset.calendarAnchors,
      calendarReason: asset.calendarReason,
      productionSpec: asset.productionSpec,
      socialCopy: asset.socialCopy,
      cta: asset.cta,
      recommendedPlatforms: asset.recommendedPlatforms,
    })),
  });
}

export function buildConversationRevisionPromptExtras(input: {
  revisionContext: SocialPlannerConversationRevisionContextV1;
  sourcePackage: SocialCalendarPackageV1;
}): string {
  return `
${buildConversationRevisionInstructionBlock()}

=== FROZEN REVISION CONTEXT (APPLY-TIME REQUEST; NOT A TRANSCRIPT) ===
${REVISION_OPEN}
${JSON.stringify(input.revisionContext, null, 2)}
${REVISION_CLOSE}

=== SOURCE WEEK — PRESERVE UNLESS A REQUESTED CHANGE SAYS OTHERWISE ===
${SOURCE_OPEN}
${compactSourceWeek(input.sourcePackage)}
${SOURCE_CLOSE}
`.trim();
}

export function buildConversationRevisionRepairPrompt(input: {
  context: SocialPlannerGenerationContextV1;
  userGuidance: string | null;
  sourcePackage: SocialCalendarPackageV1;
  revisionContext: SocialPlannerConversationRevisionContextV1;
  currentPackage: SocialCalendarPackageV1;
  satisfaction: SocialPlannerRevisionSatisfactionResult;
  socialMemoryText?: string | null;
}): string {
  const dates = input.context.calendarContext.period.dates;
  const guidance = input.userGuidance?.trim()
    ? input.userGuidance.trim()
    : "(blank)";
  const memory = input.socialMemoryText?.trim()
    ? `\n=== SOCIAL MEMORY ===\n${input.socialMemoryText.trim()}\n`
    : "";

  return `
OBJECTIVE:
Repair this Conversation Revision week so it applies the frozen requested changes
and preserves compatible source days.

PROMPT VERSION:
${SOCIAL_PLANNER_CONVERSATION_REVISION_REPAIR_PROMPT_VERSION}

Change only what the satisfaction violations require. Do not lose grounded content.
Return the COMPLETE corrected weekly Social Calendar package, not a patch or a partial asset list.
All seven assets must remain present. Every family-specific productionSpec must be valid.
Keep exactly seven assets on these dates in order: ${dates.join(", ")}.

SATISFACTION VIOLATIONS:
${input.satisfaction.violations.map((violation) => `- ${violation.code}: ${violation.message}`).join("\n") || "- none"}

${buildConversationRevisionPromptExtras({
  revisionContext: input.revisionContext,
  sourcePackage: input.sourcePackage,
})}

=== CURRENT CANDIDATE PACKAGE ===
${compactCurrentCandidate(input.currentPackage)}

=== USER GUIDANCE ===
${GUIDANCE_OPEN}
${guidance}
${GUIDANCE_CLOSE}
${memory}
${buildSocialPlannerPackageOutputContract()}

${SHARED_JSON_OUTPUT_RULES}
`.trim();
}

const SINGLE_DAY_ASSET_SHAPE = `
Return ONE JSON object for the target date only. Do not wrap it in a package.
Do not emit strategySummary, whyThisWeekWorks, schemaVersion, or an assets array.

{
  "date": "YYYY-MM-DD",
  "weekday": "Monday",
  "assetType": string,
  "contentArchetype": string,
  "primaryObjective": string,
  "audience": string,
  "personaIds": string[],
  "topic": string,
  "angle": string,
  "hook": string|null,
  "concept": string,
  "calendarAnchors": [{"sourceCandidateId": string, "date": "YYYY-MM-DD", "label": string, "category": string, "scope": string, "reason": string}],
  "calendarReason": string|null,
  "productionSpec": object,
  "socialCopy": string,
  "cta": string|null,
  "recommendedPlatforms": string[],
  "sourceSignals": [{"type": string, "id": string|null}]
}
`.trim();

function preservedDayBlock(
  sourcePackage: SocialCalendarPackageV1,
  preservedDates: readonly string[],
): string {
  return JSON.stringify(
    snapshotPreservedAssets(sourcePackage, preservedDates),
    null,
    2,
  );
}

export function buildConversationRevisionSingleDayPrompt(input: {
  context: SocialPlannerGenerationContextV1;
  userGuidance: string | null;
  sourcePackage: SocialCalendarPackageV1;
  revisionContext: SocialPlannerConversationRevisionContextV1;
  targetDate: string;
  preservedDates: readonly string[];
  socialMemoryText?: string | null;
}): string {
  return `
OBJECTIVE:
Generate exactly one Social Calendar asset for ${input.targetDate}.
The other six days are already frozen and will be copied unchanged.
Do not regenerate strategySummary or whyThisWeekWorks.
Do not emit seven assets.

PROMPT VERSION:
${SOCIAL_PLANNER_CONVERSATION_REVISION_SINGLE_DAY_PROMPT_VERSION}

TARGET DATE:
${input.targetDate}

SOURCE CALENDAR:
${input.revisionContext.brief.sourceCalendarId}
Period ${input.sourcePackage.period.periodStart} through ${input.sourcePackage.period.periodEnd}.
Dates in order: ${input.sourcePackage.period.dates.join(", ")}.

FROZEN WEEK TEXT (copy unchanged; do not rewrite):
strategySummary: ${input.sourcePackage.strategySummary}
whyThisWeekWorks: ${input.sourcePackage.whyThisWeekWorks}

=== FROZEN REVISION BRIEF (AUTHORITY FOR THIS ONE DAY) ===
${JSON.stringify(input.revisionContext, null, 2)}

=== SIX PRESERVED SOURCE ASSETS (DO NOT REWRITE) ===
${preservedDayBlock(input.sourcePackage, input.preservedDates)}

The replacement must not reuse a preserved day's hook, topic/angle pair, or collide with that day's format constraints.
User guidance cannot expand this pass to any other date.

=== HISTORICAL SOCIAL MEMORY ===
${input.socialMemoryText?.trim() || "(none loaded)"}

${buildSocialPlannerGenerationEvidenceBlocks({
  context: input.context,
  userGuidance: input.userGuidance,
  socialMemoryText: null,
})}

${SINGLE_DAY_ASSET_SHAPE}

${buildSocialPlannerProductionSpecContract()}

${SHARED_JSON_OUTPUT_RULES}
`.trim();
}

export function buildConversationRevisionSingleDayRepairPrompt(input: {
  context: SocialPlannerGenerationContextV1;
  userGuidance: string | null;
  sourcePackage: SocialCalendarPackageV1;
  revisionContext: SocialPlannerConversationRevisionContextV1;
  targetDate: string;
  preservedDates: readonly string[];
  currentAsset: Record<string, unknown>;
  failures: string[];
  socialMemoryText?: string | null;
}): string {
  return `
OBJECTIVE:
Repair exactly one Social Calendar asset for ${input.targetDate}.
The failure is limited to this replacement day. The other six days stay copied from the source.
Do not regenerate strategySummary or whyThisWeekWorks.
Do not emit seven assets. Do not rewrite any preserved day.

PROMPT VERSION:
${SOCIAL_PLANNER_CONVERSATION_REVISION_SINGLE_DAY_REPAIR_PROMPT_VERSION}

TARGET DATE:
${input.targetDate}

FAILURES TO FIX ON THIS DATE ONLY:
${input.failures.map((failure) => `- ${failure}`).join("\n") || "- none"}

=== CURRENT REPLACEMENT ASSET ===
${JSON.stringify(input.currentAsset)}

=== FROZEN REVISION BRIEF ===
${JSON.stringify(input.revisionContext, null, 2)}

=== SIX PRESERVED SOURCE ASSETS (IMMUTABLE) ===
${preservedDayBlock(input.sourcePackage, input.preservedDates)}

FROZEN WEEK TEXT (do not rewrite):
strategySummary: ${input.sourcePackage.strategySummary}
whyThisWeekWorks: ${input.sourcePackage.whyThisWeekWorks}

=== HISTORICAL SOCIAL MEMORY ===
${input.socialMemoryText?.trim() || "(none loaded)"}

${buildSocialPlannerGenerationEvidenceBlocks({
  context: input.context,
  userGuidance: input.userGuidance,
  socialMemoryText: null,
})}

${SINGLE_DAY_ASSET_SHAPE}

${buildSocialPlannerProductionSpecContract()}

${SHARED_JSON_OUTPUT_RULES}
`.trim();
}
