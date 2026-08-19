/**
 * L9 Conversation Revision generation.
 *
 * revision generation → L4 validation/repair → L5 mode-aware history →
 * revision satisfaction → optional one L9 repair → L4 / L5 / satisfaction re-check.
 *
 * Does not persist, enqueue jobs, or rebuild the revision brief.
 */

import { generateReview } from "@/services/aiService";
import type { SocialPlannerGenerationContextV1 } from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";
import type { SocialCalendar } from "@/services/socialPlanner/socialCalendarTypes";
import {
  generateSocialCalendarPackage,
  parseSocialPlannerStructuredOutput,
} from "@/services/socialPlanner/generation/socialPlannerGenerationService";
import { validateAndNormalizeSocialCalendarPackage } from "@/services/socialPlanner/generation/validateSocialCalendarPackage";
import {
  SocialCalendarPackageValidationError,
  SocialPlannerGenerationError,
  SocialPlannerSocialMemoryError,
} from "@/services/socialPlanner/generation/socialPlannerGenerationErrors";
import {
  SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION,
  SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION,
  type SocialPlannerHistoricalDiversityResult,
  type SocialPlannerSocialMemoryV1,
} from "@/services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";
import type { SocialPlannerDiverseGenerationDeps } from "@/services/socialPlanner/diversity/generateHistoricallyDiverseSocialCalendar";
import { loadSocialPlannerSocialMemory } from "@/services/socialPlanner/diversity/loadSocialPlannerSocialMemory";
import { evaluateHistoricalDiversity } from "@/services/socialPlanner/diversity/evaluateHistoricalDiversity";
import type { SocialCalendarPackageV1 } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  SOCIAL_PLANNER_CONVERSATION_REVISION_PROMPT_VERSION,
  SOCIAL_PLANNER_CONVERSATION_REVISION_REPAIR_PROMPT_VERSION,
  SOCIAL_PLANNER_REVISION_SATISFACTION_ALGORITHM_VERSION,
  type SocialPlannerConversationRevisionContextV1,
  type SocialPlannerConversationRevisionGenerationResult,
  type SocialPlannerConversationRevisionProvenance,
} from "@/services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";
import {
  evaluateRevisionSatisfaction,
  resolveRevisionDateSets,
} from "@/services/socialPlanner/conversationRevision/evaluateRevisionSatisfaction";
import {
  SOCIAL_PLANNER_CONVERSATION_REVISION_REPAIR_SYSTEM_PROMPT,
  buildConversationRevisionRepairPrompt,
} from "@/services/socialPlanner/conversationRevision/socialPlannerRevisionPrompt";

const CONVERSATION_REVISION_REPAIR_STAGE =
  "social_calendar_conversation_revision_repair" as const;

function socialMemoryPromptText(
  socialMemory: SocialPlannerSocialMemoryV1,
): string | null {
  if (socialMemory.diagnostics.assetsIncluded === 0) return null;
  return socialMemory.composedText;
}

function buildConversationRevisionProvenance(input: {
  metadata: SocialCalendarPackageV1["generationMetadata"];
  socialMemory: SocialPlannerSocialMemoryV1;
  diversity: SocialPlannerHistoricalDiversityResult;
  sourceCalendar: Pick<
    SocialCalendar,
    "id" | "root_calendar_id" | "version_number"
  >;
  derivativeVersionNumber: number;
  revisionContext: SocialPlannerConversationRevisionContextV1;
  revisionSatisfaction: SocialPlannerConversationRevisionGenerationResult["revisionSatisfaction"];
  revisionRepairUsed: boolean;
}): SocialPlannerConversationRevisionProvenance {
  const dateSets = resolveRevisionDateSets({
    brief: input.revisionContext.brief,
    periodDates: input.revisionContext.brief.dayChanges.length
      ? [
          ...input.revisionSatisfaction.preservedDates,
          ...input.revisionSatisfaction.revisedDates,
        ]
      : input.revisionSatisfaction.preservedDates,
  });
  return {
    ...input.metadata,
    generationMode: "conversation_revision",
    socialMemorySchemaVersion: SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION,
    diversityAlgorithmVersion: SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION,
    historicalDiversityCheckVersion: SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION,
    historicalCalendarsConsidered: input.socialMemory.diagnostics.calendarsConsidered,
    historicalAssetsConsidered: input.socialMemory.diagnostics.assetsIncluded,
    highestHistoricalSimilarity: input.diversity.highestAssetSimilarity,
    weekHistoricalSimilarity: input.diversity.weekSimilarity,
    historicalDiversityRepairUsed: false,
    diversityRepairPromptVersion: null,
    conversationRevisionPromptVersion:
      SOCIAL_PLANNER_CONVERSATION_REVISION_PROMPT_VERSION,
    conversationRevisionRepairPromptVersion: input.revisionRepairUsed
      ? SOCIAL_PLANNER_CONVERSATION_REVISION_REPAIR_PROMPT_VERSION
      : null,
    revisionSatisfactionAlgorithmVersion:
      SOCIAL_PLANNER_REVISION_SATISFACTION_ALGORITHM_VERSION,
    revisionBriefSchemaVersion: input.revisionContext.brief.schemaVersion,
    sourceCalendarId: input.sourceCalendar.id,
    rootCalendarId:
      input.sourceCalendar.root_calendar_id ?? input.sourceCalendar.id,
    sourceVersionNumber: input.sourceCalendar.version_number,
    newVersionNumber: input.derivativeVersionNumber,
    conversationMessageCount: input.revisionContext.brief.conversationMessageCount,
    latestUserMessageId: input.revisionContext.brief.latestUserMessageId,
    latestUserMessageAt: input.revisionContext.brief.latestUserMessageAt,
    revisionSatisfactionAccepted: input.revisionSatisfaction.accepted,
    revisionRepairUsed: input.revisionRepairUsed,
    preservedDateCount: dateSets.preservedDates.length,
    revisedDateCount: dateSets.revisedDates.length,
  };
}

async function invokeRevisionRepair(input: {
  generate: typeof generateReview;
  prompt: string;
}): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    raw = await input.generate(input.prompt, {
      stage: "socialPlanner.conversation_revision_repair",
      promptSource:
        "services/socialPlanner/conversationRevision/generateConversationRevisionSocialCalendar.ts",
      athenaStage: CONVERSATION_REVISION_REPAIR_STAGE,
      reasoningProfile: "BALANCED",
      systemPrompt: SOCIAL_PLANNER_CONVERSATION_REVISION_REPAIR_SYSTEM_PROMPT,
    });
  } catch (error) {
    if (error instanceof SocialPlannerGenerationError) throw error;
    throw new SocialPlannerGenerationError({
      code: "PROVIDER_FAILURE",
      message:
        error instanceof Error
          ? error.message
          : "Social Planner conversation-revision repair provider call failed.",
      stage: "conversation_revision_repair",
      retryable: true,
    });
  }

  return parseSocialPlannerStructuredOutput(raw, "conversation_revision_repair");
}

export async function generateConversationRevisionSocialCalendar(input: {
  context: SocialPlannerGenerationContextV1;
  userGuidance?: string | null;
  sourceCalendar: Pick<
    SocialCalendar,
    "id" | "root_calendar_id" | "version_number"
  >;
  sourcePackage: SocialCalendarPackageV1;
  revisionContext: SocialPlannerConversationRevisionContextV1;
  derivativeVersionNumber: number;
  deps: SocialPlannerDiverseGenerationDeps;
}): Promise<SocialPlannerConversationRevisionGenerationResult> {
  const organizationId = input.context.organization.id;
  let socialMemory: SocialPlannerSocialMemoryV1;
  try {
    socialMemory = await loadSocialPlannerSocialMemory({
      organizationId,
      historyLoader: input.deps.historyLoader,
    });
  } catch (error) {
    if (error instanceof SocialPlannerSocialMemoryError) throw error;
    throw new SocialPlannerSocialMemoryError({
      reason: "LOADER_FAILED",
      message: "Social Planner historical memory could not be loaded.",
      retryable: true,
    });
  }

  const memoryText = socialMemoryPromptText(socialMemory);
  const generate = input.deps.generateReview ?? generateReview;
  const userGuidance = input.userGuidance ?? null;
  const dateSets = resolveRevisionDateSets({
    brief: input.revisionContext.brief,
    periodDates: input.sourcePackage.period.dates,
  });
  const revisionMode = {
    sourceCalendarId: input.sourceCalendar.id,
    preservedDates: dateSets.preservedDates,
  };

  const l4 = await generateSocialCalendarPackage({
    context: input.context,
    userGuidance,
    generationMode: "conversation_revision",
    socialMemoryText: memoryText,
    revisionContext: input.revisionContext,
    sourcePackage: input.sourcePackage,
    deps: { generateReview: generate },
  });

  let candidate = l4.package;
  let diversity = evaluateHistoricalDiversity({
    candidatePackage: candidate,
    socialMemory,
    userGuidance,
    revisionMode,
  });
  let satisfaction = evaluateRevisionSatisfaction({
    candidatePackage: candidate,
    sourcePackage: input.sourcePackage,
    brief: input.revisionContext.brief,
  });
  let revisionRepairUsed = false;

  if (!diversity.accepted || !satisfaction.accepted) {
    const repairRaw = await invokeRevisionRepair({
      generate,
      prompt: buildConversationRevisionRepairPrompt({
        context: input.context,
        userGuidance,
        sourcePackage: input.sourcePackage,
        revisionContext: input.revisionContext,
        currentPackage: candidate,
        satisfaction: {
          ...satisfaction,
          violations: [
            ...satisfaction.violations,
            ...diversity.violations.map((violation) => ({
              code: violation.code,
              message: violation.message,
              candidateDate: violation.candidateDate,
            })),
          ],
        },
        socialMemoryText: memoryText,
      }),
    });

    try {
      candidate = validateAndNormalizeSocialCalendarPackage({
        raw: repairRaw,
        context: input.context,
        userGuidance,
        metadata: {
          ...candidate.generationMetadata,
          generationMode: "conversation_revision",
        },
      });
    } catch (error) {
      if (error instanceof SocialCalendarPackageValidationError) {
        throw new SocialPlannerGenerationError({
          code: "CONVERSATION_REVISION_REPAIR_FAILED",
          message: error.message,
          stage: "conversation_revision_repair_validation",
          retryable: false,
          failures: error.failures,
        });
      }
      throw error;
    }

    diversity = evaluateHistoricalDiversity({
      candidatePackage: candidate,
      socialMemory,
      userGuidance,
      revisionMode,
    });
    if (!diversity.accepted) {
      throw new SocialPlannerGenerationError({
        code: "CONVERSATION_REVISION_REPAIR_FAILED",
        message:
          diversity.violations[0]?.message ??
          "Conversation Revision repair lost historical diversity.",
        stage: "conversation_revision_repair",
        retryable: false,
      });
    }

    satisfaction = evaluateRevisionSatisfaction({
      candidatePackage: candidate,
      sourcePackage: input.sourcePackage,
      brief: input.revisionContext.brief,
    });
    if (!satisfaction.accepted) {
      throw new SocialPlannerGenerationError({
        code: "CONVERSATION_REVISION_SATISFACTION_FAILED",
        message:
          satisfaction.violations[0]?.message ??
          "Conversation Revision repair did not apply the requested changes.",
        stage: "revision_satisfaction",
        retryable: false,
      });
    }
    revisionRepairUsed = true;
  }

  return {
    package: candidate,
    generationProvenance: buildConversationRevisionProvenance({
      metadata: {
        ...candidate.generationMetadata,
        generationMode: "conversation_revision",
      },
      socialMemory,
      diversity,
      sourceCalendar: input.sourceCalendar,
      derivativeVersionNumber: input.derivativeVersionNumber,
      revisionContext: input.revisionContext,
      revisionSatisfaction: satisfaction,
      revisionRepairUsed,
    }),
    socialMemory,
    historicalDiversity: diversity,
    sourcePackage: input.sourcePackage,
    revisionContext: input.revisionContext,
    revisionSatisfaction: satisfaction,
    revisionRepairUsed,
  };
}
