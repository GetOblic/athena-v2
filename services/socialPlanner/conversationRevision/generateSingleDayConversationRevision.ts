/**
 * Cost-optimized Daily conversation revision.
 * One model asset, six copied source assets, then the existing full-package checks.
 * Never falls back to a seven-asset generation after this path starts.
 */

import { generateReview } from "@/services/aiService";
import { ATHENA_DEFAULT_LLM_TEMPERATURE } from "@/lib/athenaDebugPrompts";
import { resolveModelForStage } from "@/lib/llm/modelRouting";
import { isDeepStrictEqual } from "node:util";
import type { SocialPlannerGenerationContextV1 } from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";
import type { SocialCalendar } from "@/services/socialPlanner/socialCalendarTypes";
import { parseSocialPlannerStructuredOutput } from "@/services/socialPlanner/generation/socialPlannerGenerationService";
import { validateAndNormalizeSocialCalendarPackage } from "@/services/socialPlanner/generation/validateSocialCalendarPackage";
import {
  SocialCalendarPackageValidationError,
  SocialPlannerGenerationError,
} from "@/services/socialPlanner/generation/socialPlannerGenerationErrors";
import {
  SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION,
  type SocialCalendarPackageV1,
  type SocialPlannerGenerationMetadata,
  type SocialPlannerGenerationStageRoute,
} from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION,
  SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION,
  type SocialPlannerSocialMemoryV1,
} from "@/services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";
import type { SocialPlannerDiverseGenerationDeps } from "@/services/socialPlanner/diversity/generateHistoricallyDiverseSocialCalendar";
import { evaluateHistoricalDiversity } from "@/services/socialPlanner/diversity/evaluateHistoricalDiversity";
import {
  SOCIAL_PLANNER_CONVERSATION_REVISION_PROMPT_VERSION,
  SOCIAL_PLANNER_CONVERSATION_REVISION_SINGLE_DAY_PROMPT_VERSION,
  SOCIAL_PLANNER_CONVERSATION_REVISION_SINGLE_DAY_REPAIR_PROMPT_VERSION,
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
  SOCIAL_PLANNER_CONVERSATION_REVISION_SINGLE_DAY_REPAIR_SYSTEM_PROMPT,
  SOCIAL_PLANNER_CONVERSATION_REVISION_SINGLE_DAY_SYSTEM_PROMPT,
  buildConversationRevisionSingleDayPrompt,
  buildConversationRevisionSingleDayRepairPrompt,
} from "@/services/socialPlanner/conversationRevision/socialPlannerRevisionPrompt";
import {
  buildMergedSingleDayPackageRaw,
  isSingleDayAssetShapedOutput,
  isSingleDayPackageShapedOutput,
  preservedAssetsMatchSource,
} from "@/services/socialPlanner/conversationRevision/mergeSingleDayRevisionPackage";

const SINGLE_DAY_ASSET_STAGE = "social_calendar_assets" as const;
const SINGLE_DAY_REPAIR_STAGE = "social_calendar_repair" as const;

function stageRoute(
  pass: "assets" | "repair",
  athenaStage: typeof SINGLE_DAY_ASSET_STAGE | typeof SINGLE_DAY_REPAIR_STAGE,
  reasoningProfile: "EXECUTIVE" | "BALANCED",
): SocialPlannerGenerationStageRoute {
  const resolved = resolveModelForStage(athenaStage);
  return {
    pass,
    athenaStage,
    role: resolved.role,
    model: resolved.model,
    reasoningProfile,
    temperature: ATHENA_DEFAULT_LLM_TEMPERATURE,
  };
}

function buildMetadata(input: {
  context: SocialPlannerGenerationContextV1;
  sourcePackage: SocialCalendarPackageV1;
  repairUsed: boolean;
  stages: SocialPlannerGenerationStageRoute[];
}): SocialPlannerGenerationMetadata {
  return {
    packageSchemaVersion: SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION,
    strategyPromptVersion: input.sourcePackage.generationMetadata.strategyPromptVersion,
    assetPromptVersion: SOCIAL_PLANNER_CONVERSATION_REVISION_SINGLE_DAY_PROMPT_VERSION,
    repairPromptVersion: input.repairUsed
      ? SOCIAL_PLANNER_CONVERSATION_REVISION_SINGLE_DAY_REPAIR_PROMPT_VERSION
      : null,
    repairUsed: input.repairUsed,
    generationMode: "conversation_revision",
    provider: "openrouter",
    stages: input.stages,
    trendSocialPrompt: {
      key: input.context.trendSocialPrompt.key,
      configured: input.context.trendSocialPrompt.configured,
      revisionId: input.context.trendSocialPrompt.revisionId,
    },
    calendarResolverVersion: input.context.calendarContext.provenance.resolverVersion,
    calendarSchemaVersion: input.context.calendarContext.provenance.schemaVersion,
    intelligenceComposerVersion: input.context.provenance.composerVersion,
    intelligenceSchemaVersion: input.context.provenance.schemaVersion,
  };
}

async function invokeSingleDay(input: {
  generate: typeof generateReview;
  prompt: string;
  systemPrompt: string;
  athenaStage: typeof SINGLE_DAY_ASSET_STAGE | typeof SINGLE_DAY_REPAIR_STAGE;
  pass: "assets" | "repair";
  reasoningProfile: "EXECUTIVE" | "BALANCED";
  stage: "conversation_revision_single_day" | "conversation_revision_single_day_repair";
}): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    raw = await input.generate(input.prompt, {
      stage:
        input.pass === "repair"
          ? "socialPlanner.conversation_revision_single_day_repair"
          : "socialPlanner.conversation_revision_single_day",
      promptSource:
        "services/socialPlanner/conversationRevision/generateSingleDayConversationRevision.ts",
      athenaStage: input.athenaStage,
      reasoningProfile: input.reasoningProfile,
      systemPrompt: input.systemPrompt,
    });
  } catch (error) {
    if (error instanceof SocialPlannerGenerationError) throw error;
    throw new SocialPlannerGenerationError({
      code: "PROVIDER_FAILURE",
      message:
        error instanceof Error
          ? error.message
          : "Social Planner single-day revision provider call failed.",
      stage: input.stage,
      retryable: true,
    });
  }

  return parseSocialPlannerStructuredOutput(raw, input.stage);
}

function rejectWeeklyPackage(input: {
  raw: Record<string, unknown>;
  repaired: boolean;
}): Record<string, unknown> {
  const weekly = isSingleDayPackageShapedOutput(input.raw);
  const asset = isSingleDayAssetShapedOutput(input.raw);
  if (weekly || !asset) {
    throw new SocialPlannerGenerationError({
      code: input.repaired
        ? "CONVERSATION_REVISION_REPAIR_FAILED"
        : "MALFORMED_STRUCTURED_OUTPUT",
      message: input.repaired
        ? "Single-day repair must return one asset. Preserved days were not rewritten."
        : "Single-day conversation revision must return one asset, not a weekly package.",
      stage: input.repaired
        ? "conversation_revision_single_day_repair"
        : "conversation_revision_single_day",
      retryable: !input.repaired,
    });
  }
  return input.raw;
}

function buildProvenance(input: {
  metadata: SocialPlannerGenerationMetadata;
  socialMemory: SocialPlannerSocialMemoryV1;
  diversity: SocialPlannerConversationRevisionGenerationResult["historicalDiversity"];
  sourceCalendar: Pick<SocialCalendar, "id" | "root_calendar_id" | "version_number">;
  derivativeVersionNumber: number;
  revisionContext: SocialPlannerConversationRevisionContextV1;
  revisionSatisfaction: SocialPlannerConversationRevisionGenerationResult["revisionSatisfaction"];
  revisionRepairUsed: boolean;
  targetDate: string;
  preservedDates: string[];
  generatedAssetModel: string;
}): SocialPlannerConversationRevisionProvenance {
  const dateSets = resolveRevisionDateSets({
    brief: input.revisionContext.brief,
    periodDates: [
      ...input.revisionSatisfaction.preservedDates,
      ...input.revisionSatisfaction.revisedDates,
    ],
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
      ? SOCIAL_PLANNER_CONVERSATION_REVISION_SINGLE_DAY_REPAIR_PROMPT_VERSION
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
    singleDayRevision: true,
    generatedDates: [input.targetDate],
    copiedDates: [...input.preservedDates],
    generatedAssetModel: input.generatedAssetModel,
    conversationRevisionSingleDayPromptVersion:
      SOCIAL_PLANNER_CONVERSATION_REVISION_SINGLE_DAY_PROMPT_VERSION,
  };
}

export async function generateSingleDayConversationRevision(input: {
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
  socialMemory: SocialPlannerSocialMemoryV1;
  socialMemoryText: string | null;
  targetDate: string;
  preservedDates: string[];
}): Promise<SocialPlannerConversationRevisionGenerationResult> {
  const sourceSnapshot = structuredClone(input.sourcePackage);
  const assertSourceUntouched = () => {
    if (!isDeepStrictEqual(input.sourcePackage, sourceSnapshot)) {
      throw new SocialPlannerGenerationError({
        code: "CONVERSATION_REVISION_REPAIR_FAILED",
        message: "Single-day revision must leave the source package immutable.",
        stage: "conversation_revision_single_day",
        retryable: false,
      });
    }
  };

  const generate = input.deps.generateReview ?? generateReview;
  const userGuidance = input.userGuidance ?? null;
  const assetStage = stageRoute("assets", SINGLE_DAY_ASSET_STAGE, "EXECUTIVE");
  const stages: SocialPlannerGenerationStageRoute[] = [assetStage];

  const generatedRaw = rejectWeeklyPackage({
    raw: await invokeSingleDay({
      generate,
      prompt: buildConversationRevisionSingleDayPrompt({
        context: input.context,
        userGuidance,
        sourcePackage: input.sourcePackage,
        revisionContext: input.revisionContext,
        targetDate: input.targetDate,
        preservedDates: input.preservedDates,
        socialMemoryText: input.socialMemoryText,
      }),
      systemPrompt: SOCIAL_PLANNER_CONVERSATION_REVISION_SINGLE_DAY_SYSTEM_PROMPT,
      athenaStage: SINGLE_DAY_ASSET_STAGE,
      pass: "assets",
      reasoningProfile: "EXECUTIVE",
      stage: "conversation_revision_single_day",
    }),
    repaired: false,
  });

  const revisionMode = {
    sourceCalendarId: input.sourceCalendar.id,
    preservedDates: input.preservedDates,
  };

  const mergeOnce = (replacement: Record<string, unknown>, repairUsed: boolean) => {
    const metadata = buildMetadata({
      context: input.context,
      sourcePackage: input.sourcePackage,
      repairUsed,
      stages,
    });
    try {
      const merged = validateAndNormalizeSocialCalendarPackage({
        raw: buildMergedSingleDayPackageRaw({
          sourcePackage: input.sourcePackage,
          targetDate: input.targetDate,
          replacementAsset: replacement,
        }),
        context: input.context,
        userGuidance,
        metadata,
      });
      return { merged, failures: [] as string[] };
    } catch (error) {
      if (error instanceof SocialCalendarPackageValidationError) {
        return { merged: null, failures: error.failures };
      }
      throw error;
    }
  };

  let replacement = generatedRaw;
  let repairUsed = false;
  let generatedAssetModel = assetStage.model;
  let mergedResult = mergeOnce(replacement, false);
  let candidate = mergedResult.merged;

  const diversityOf = (socialPackage: SocialCalendarPackageV1) =>
    evaluateHistoricalDiversity({
      candidatePackage: socialPackage,
      socialMemory: input.socialMemory,
      userGuidance,
      revisionMode,
    });
  const satisfactionOf = (socialPackage: SocialCalendarPackageV1) =>
    evaluateRevisionSatisfaction({
      candidatePackage: socialPackage,
      sourcePackage: input.sourcePackage,
      brief: input.revisionContext.brief,
    });

  let diversity = candidate ? diversityOf(candidate) : null;
  let satisfaction = candidate ? satisfactionOf(candidate) : null;
  const preservedOk =
    candidate != null &&
    preservedAssetsMatchSource({
      sourcePackage: input.sourcePackage,
      mergedPackage: candidate,
      preservedDates: input.preservedDates,
    });

  const needsRepair =
    !candidate ||
    !preservedOk ||
    !diversity?.accepted ||
    !satisfaction?.accepted;

  if (needsRepair) {
    if (candidate && !preservedOk) {
      assertSourceUntouched();
      throw new SocialPlannerGenerationError({
        code: "CONVERSATION_REVISION_REPAIR_FAILED",
        message:
          "Single-day merge changed a preserved day. Preserved assets are not rewritten.",
        stage: "conversation_revision_repair_validation",
        retryable: false,
      });
    }

    const failures = [
      ...mergedResult.failures,
      ...(diversity?.violations.map((violation) => violation.message) ?? []),
      ...(satisfaction?.violations.map((violation) => violation.message) ?? []),
    ];
    const repairStage = stageRoute("repair", SINGLE_DAY_REPAIR_STAGE, "BALANCED");
    stages.push(repairStage);
    replacement = rejectWeeklyPackage({
      raw: await invokeSingleDay({
        generate,
        prompt: buildConversationRevisionSingleDayRepairPrompt({
          context: input.context,
          userGuidance,
          sourcePackage: input.sourcePackage,
          revisionContext: input.revisionContext,
          targetDate: input.targetDate,
          preservedDates: input.preservedDates,
          currentAsset: replacement,
          failures,
          socialMemoryText: input.socialMemoryText,
        }),
        systemPrompt:
          SOCIAL_PLANNER_CONVERSATION_REVISION_SINGLE_DAY_REPAIR_SYSTEM_PROMPT,
        athenaStage: SINGLE_DAY_REPAIR_STAGE,
        pass: "repair",
        reasoningProfile: "BALANCED",
        stage: "conversation_revision_single_day_repair",
      }),
      repaired: true,
    });
    repairUsed = true;
    generatedAssetModel = repairStage.model;
    mergedResult = mergeOnce(replacement, true);
    candidate = mergedResult.merged;
    if (!candidate) {
      assertSourceUntouched();
      throw new SocialPlannerGenerationError({
        code: "CONVERSATION_REVISION_REPAIR_FAILED",
        message:
          mergedResult.failures[0] ??
          "Single-day repair did not produce a valid seven-day package.",
        stage: "conversation_revision_repair_validation",
        retryable: false,
        failures: mergedResult.failures,
      });
    }
    if (
      !preservedAssetsMatchSource({
        sourcePackage: input.sourcePackage,
        mergedPackage: candidate,
        preservedDates: input.preservedDates,
      })
    ) {
      assertSourceUntouched();
      throw new SocialPlannerGenerationError({
        code: "CONVERSATION_REVISION_REPAIR_FAILED",
        message:
          "Single-day repair cannot change the six preserved days.",
        stage: "conversation_revision_repair_validation",
        retryable: false,
      });
    }

    diversity = diversityOf(candidate);
    if (!diversity.accepted) {
      assertSourceUntouched();
      throw new SocialPlannerGenerationError({
        code: "CONVERSATION_REVISION_REPAIR_FAILED",
        message:
          diversity.violations[0]?.message ??
          "Single-day repair lost historical diversity.",
        stage: "conversation_revision_repair",
        retryable: false,
      });
    }
    satisfaction = satisfactionOf(candidate);
    if (!satisfaction.accepted) {
      assertSourceUntouched();
      throw new SocialPlannerGenerationError({
        code: "CONVERSATION_REVISION_SATISFACTION_FAILED",
        message:
          satisfaction.violations[0]?.message ??
          "Single-day repair did not apply the requested change.",
        stage: "revision_satisfaction",
        retryable: false,
      });
    }
  }

  if (!candidate || !diversity || !satisfaction) {
    assertSourceUntouched();
    throw new SocialPlannerGenerationError({
      code: "CONVERSATION_REVISION_REPAIR_FAILED",
      message: "Single-day revision did not produce a validated package.",
      stage: "conversation_revision_single_day",
      retryable: false,
    });
  }

  assertSourceUntouched();
  const metadata = {
    ...candidate.generationMetadata,
    generationMode: "conversation_revision" as const,
  };

  return {
    package: candidate,
    generationProvenance: buildProvenance({
      metadata,
      socialMemory: input.socialMemory,
      diversity,
      sourceCalendar: input.sourceCalendar,
      derivativeVersionNumber: input.derivativeVersionNumber,
      revisionContext: input.revisionContext,
      revisionSatisfaction: satisfaction,
      revisionRepairUsed: repairUsed,
      targetDate: input.targetDate,
      preservedDates: input.preservedDates,
      generatedAssetModel,
    }),
    socialMemory: input.socialMemory,
    historicalDiversity: diversity,
    sourcePackage: input.sourcePackage,
    revisionContext: input.revisionContext,
    revisionSatisfaction: satisfaction,
    revisionRepairUsed: repairUsed,
  };
}
