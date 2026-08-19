/**
 * Apply-time structured revision-brief extraction.
 * One model pass. Does not persist. Worker must not rebuild this.
 */

import { generateReview } from "@/services/aiService";
import type { SocialCalendarPackageV1 } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import { parseSocialPlannerStructuredOutput } from "@/services/socialPlanner/generation/socialPlannerGenerationService";
import type { SocialPlannerConversationMessage } from "@/services/socialPlanner/conversation/socialPlannerConversationTypes";
import { boundSocialPlannerConversationHistory } from "@/services/socialPlanner/conversation/socialPlannerConversationTypes";
import {
  SOCIAL_PLANNER_CONVERSATION_REVISION_BRIEF_SCHEMA_VERSION,
  type SocialPlannerConversationRevisionBriefV1,
  type SocialPlannerConversationRevisionContextV1,
} from "@/services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";
import { SOCIAL_PLANNER_CONVERSATION_REVISION_CONTEXT_SCHEMA_VERSION } from "@/services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";
import {
  SocialPlannerRevisionBriefError,
  validateSocialPlannerConversationRevisionBrief,
} from "@/services/socialPlanner/conversationRevision/validateSocialPlannerRevisionBrief";

export const SOCIAL_PLANNER_REVISION_BRIEF_PROMPT_VERSION =
  "social_planner_revision_brief_v1" as const;

const REVISION_BRIEF_STAGE = "social_calendar_revision_brief" as const;

const REVISION_BRIEF_SYSTEM_PROMPT = `
You extract a compact Social Planner conversation-revision brief.
Return strict JSON only. Do not copy the conversation transcript.
Set actionable=true only when the conversation requested a concrete calendar change.
Explanation-only or critique-only conversations are not actionable.
`.trim();

export type ComposeSocialPlannerRevisionBriefDeps = {
  generateReview?: typeof generateReview;
};

export async function composeSocialPlannerRevisionBrief(input: {
  sourceCalendarId: string;
  sourcePackage: SocialCalendarPackageV1;
  messages: SocialPlannerConversationMessage[];
  deps?: ComposeSocialPlannerRevisionBriefDeps;
}): Promise<SocialPlannerConversationRevisionContextV1> {
  if (input.messages.length === 0) {
    throw new SocialPlannerRevisionBriefError(
      "Conversation revision requires at least one saved message.",
    );
  }

  const latestUser = [...input.messages]
    .reverse()
    .find((message) => message.role === "user");
  if (!latestUser) {
    throw new SocialPlannerRevisionBriefError(
      "Conversation revision requires a user message.",
    );
  }

  const history = boundSocialPlannerConversationHistory(input.messages);
  const generate = input.deps?.generateReview ?? generateReview;
  const dates = input.sourcePackage.period.dates;
  const compactPackage = {
    period: input.sourcePackage.period,
    strategySummary: input.sourcePackage.strategySummary,
    assets: input.sourcePackage.assets.map((asset) => ({
      date: asset.date,
      assetType: asset.assetType,
      primaryObjective: asset.primaryObjective,
      topic: asset.topic,
      angle: asset.angle,
      hook: asset.hook,
    })),
  };

  const prompt = `
OBJECTIVE:
Extract a bounded revision brief from this Social Planner conversation.

PROMPT VERSION:
${SOCIAL_PLANNER_REVISION_BRIEF_PROMPT_VERSION}

SOURCE CALENDAR ID:
${input.sourceCalendarId}

ALLOWED DATES:
${dates.join(", ")}

FROZEN WEEK SUMMARY:
${JSON.stringify(compactPackage)}

CONVERSATION (bounded; not to be copied into the brief):
${JSON.stringify(history)}

REQUIRED JSON SHAPE:
{
  "schemaVersion": "${SOCIAL_PLANNER_CONVERSATION_REVISION_BRIEF_SCHEMA_VERSION}",
  "actionable": true,
  "global": {
    "desiredTone": string|null,
    "desiredObjectives": string[],
    "preferredFormats": string[],
    "avoidFormats": string[],
    "avoidConcepts": string[],
    "audienceShift": string|null,
    "keepThemes": string[],
    "changeSummary": string|null
  },
  "dayChanges": [
    {
      "date": "YYYY-MM-DD",
      "requestedAssetType": string|null,
      "requestedObjective": string|null,
      "requestedTone": string|null,
      "requestedConceptDirection": string|null,
      "requestedChangeSummary": string|null
    }
  ],
  "preserve": ["YYYY-MM-DD"],
  "avoid": ["string"]
}

Rules:
- Do not include the raw transcript.
- dayChanges dates must be in ALLOWED DATES.
- preserve dates that should stay compatible with the source week.
- actionable is true only when there is a concrete requested change.
`.trim();

  let raw: Record<string, unknown>;
  try {
    const reply = await generate(prompt, {
      stage: "socialPlanner.revision_brief",
      promptSource:
        "services/socialPlanner/conversationRevision/composeSocialPlannerRevisionBrief.ts",
      athenaStage: REVISION_BRIEF_STAGE,
      reasoningProfile: "BALANCED",
      systemPrompt: REVISION_BRIEF_SYSTEM_PROMPT,
    });
    raw = parseSocialPlannerStructuredOutput(reply, "revision_brief");
  } catch (error) {
    if (error instanceof SocialPlannerRevisionBriefError) throw error;
    throw new SocialPlannerRevisionBriefError(
      error instanceof Error
        ? error.message
        : "Could not extract a conversation revision brief.",
    );
  }

  const brief: SocialPlannerConversationRevisionBriefV1 =
    validateSocialPlannerConversationRevisionBrief({
      raw,
      sourceCalendarId: input.sourceCalendarId,
      allowedDates: dates,
      conversationMessageCount: input.messages.length,
      latestUserMessageId: latestUser.id,
      latestUserMessageAt: latestUser.createdAt,
    });

  if (!brief.actionable) {
    throw new SocialPlannerRevisionBriefError(
      "This conversation does not contain an actionable revision. Ask Athena for a specific change first.",
    );
  }

  return {
    schemaVersion: SOCIAL_PLANNER_CONVERSATION_REVISION_CONTEXT_SCHEMA_VERSION,
    brief,
    appliedAt: new Date().toISOString(),
  };
}
