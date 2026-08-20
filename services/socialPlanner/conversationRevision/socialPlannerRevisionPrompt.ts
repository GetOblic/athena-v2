/**
 * Conversation Revision instruction layer (L9).
 * Apply requested changes. Preserve compatible source days.
 */

import { SHARED_JSON_OUTPUT_RULES } from "@/services/ai/prompts/sharedPromptConstraints";
import type { SocialPlannerGenerationContextV1 } from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";
import type { SocialCalendarPackageV1 } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import { buildSocialPlannerPackageOutputContract } from "@/services/socialPlanner/generation/socialPlannerGenerationPrompts";
import {
  SOCIAL_PLANNER_CONVERSATION_REVISION_PROMPT_VERSION,
  SOCIAL_PLANNER_CONVERSATION_REVISION_REPAIR_PROMPT_VERSION,
  type SocialPlannerConversationRevisionContextV1,
  type SocialPlannerRevisionSatisfactionResult,
} from "@/services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";

export const SOCIAL_PLANNER_CONVERSATION_REVISION_SYSTEM_ADDENDUM = `
CONVERSATION REVISION: apply the specific requested changes and preserve everything else that remains compatible.
A one-day requested change may keep the other six days unchanged.
Do not invent a wholesale new week. Do not use Think Differently divergence.
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
