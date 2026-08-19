/**
 * L8 Think Differently generation.
 *
 * L4 generate → L5 historical diversity/repair → L8 source divergence →
 * at most one source-divergence repair → L4 validate → L5 re-check → L8 re-check.
 *
 * Does not persist, enqueue jobs, or call APIs.
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
  SOCIAL_PLANNER_DIVERSITY_REPAIR_PROMPT_VERSION,
  SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION,
  type SocialPlannerHistoricalDiversityResult,
  type SocialPlannerSocialMemoryV1,
} from "@/services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";
import type { SocialPlannerDiverseGenerationDeps } from "@/services/socialPlanner/diversity/generateHistoricallyDiverseSocialCalendar";
import { loadSocialPlannerSocialMemory } from "@/services/socialPlanner/diversity/loadSocialPlannerSocialMemory";
import {
  evaluateHistoricalDiversity,
} from "@/services/socialPlanner/diversity/evaluateHistoricalDiversity";
import {
  SOCIAL_PLANNER_DIVERSITY_REPAIR_SYSTEM_PROMPT,
  buildSocialPlannerDiversityRepairPrompt,
} from "@/services/socialPlanner/diversity/socialPlannerDiversityPrompt";
import type { SocialCalendarPackageV1 } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  buildSourceNegativeContext,
  evaluateThinkDifferentlyDivergence,
  formatThinkDifferentlyViolations,
} from "@/services/socialPlanner/thinkDifferently/socialPlannerSourceDivergence";
import {
  SOCIAL_PLANNER_THINK_DIFFERENTLY_REPAIR_SYSTEM_PROMPT,
  buildThinkDifferentlyRepairPrompt,
} from "@/services/socialPlanner/thinkDifferently/socialPlannerThinkDifferentlyPrompt";
import {
  SOCIAL_PLANNER_SOURCE_DIVERGENCE_ALGORITHM_VERSION,
  SOCIAL_PLANNER_THINK_DIFFERENTLY_PROMPT_VERSION,
  SOCIAL_PLANNER_THINK_DIFFERENTLY_REPAIR_PROMPT_VERSION,
  type SocialPlannerThinkDifferentlyGenerationResult,
  type SocialPlannerThinkDifferentlyProvenance,
} from "@/services/socialPlanner/thinkDifferently/socialPlannerThinkDifferentlyTypes";

const DIVERSITY_REPAIR_STAGE = "social_calendar_diversity_repair" as const;
const THINK_DIFFERENTLY_REPAIR_STAGE =
  "social_calendar_think_differently_repair" as const;

function socialMemoryPromptText(
  socialMemory: SocialPlannerSocialMemoryV1,
): string | null {
  if (socialMemory.diagnostics.assetsIncluded === 0) return null;
  return socialMemory.composedText;
}

function buildThinkDifferentlyProvenance(input: {
  metadata: SocialCalendarPackageV1["generationMetadata"];
  socialMemory: SocialPlannerSocialMemoryV1;
  diversity: SocialPlannerHistoricalDiversityResult;
  historicalDiversityRepairUsed: boolean;
  sourceCalendar: Pick<
    SocialCalendar,
    "id" | "root_calendar_id" | "version_number"
  >;
  derivativeVersionNumber: number;
  sourceDivergence: SocialPlannerThinkDifferentlyGenerationResult["sourceDivergence"];
  sourceDivergenceRepairUsed: boolean;
}): SocialPlannerThinkDifferentlyProvenance {
  return {
    ...input.metadata,
    generationMode: "think_differently",
    socialMemorySchemaVersion: SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION,
    diversityAlgorithmVersion: SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION,
    historicalDiversityCheckVersion: SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION,
    historicalCalendarsConsidered: input.socialMemory.diagnostics.calendarsConsidered,
    historicalAssetsConsidered: input.socialMemory.diagnostics.assetsIncluded,
    highestHistoricalSimilarity: input.diversity.highestAssetSimilarity,
    weekHistoricalSimilarity: input.diversity.weekSimilarity,
    historicalDiversityRepairUsed: input.historicalDiversityRepairUsed,
    diversityRepairPromptVersion: input.historicalDiversityRepairUsed
      ? SOCIAL_PLANNER_DIVERSITY_REPAIR_PROMPT_VERSION
      : null,
    thinkDifferentlyPromptVersion: SOCIAL_PLANNER_THINK_DIFFERENTLY_PROMPT_VERSION,
    thinkDifferentlyRepairPromptVersion: input.sourceDivergenceRepairUsed
      ? SOCIAL_PLANNER_THINK_DIFFERENTLY_REPAIR_PROMPT_VERSION
      : null,
    sourceDivergenceAlgorithmVersion:
      SOCIAL_PLANNER_SOURCE_DIVERGENCE_ALGORITHM_VERSION,
    sourceCalendarId: input.sourceCalendar.id,
    rootCalendarId: input.sourceCalendar.root_calendar_id ?? input.sourceCalendar.id,
    sourceVersionNumber: input.sourceCalendar.version_number,
    newVersionNumber: input.derivativeVersionNumber,
    sourceWeekSimilarity: input.sourceDivergence.sourceWeekSimilarity,
    highestSourceAssetSimilarity: input.sourceDivergence.highestSourceAssetSimilarity,
    sourceDivergenceRepairUsed: input.sourceDivergenceRepairUsed,
  };
}

async function invokeJsonRepair(input: {
  generate: typeof generateReview;
  prompt: string;
  systemPrompt: string;
  athenaStage: typeof DIVERSITY_REPAIR_STAGE | typeof THINK_DIFFERENTLY_REPAIR_STAGE;
  pass: "diversity_repair" | "think_differently_repair";
}): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    raw = await input.generate(input.prompt, {
      stage: `socialPlanner.${input.pass}`,
      promptSource:
        "services/socialPlanner/thinkDifferently/generateThinkDifferentlySocialCalendar.ts",
      athenaStage: input.athenaStage,
      reasoningProfile: "BALANCED",
      systemPrompt: input.systemPrompt,
    });
  } catch (error) {
    if (error instanceof SocialPlannerGenerationError) throw error;
    throw new SocialPlannerGenerationError({
      code: "PROVIDER_FAILURE",
      message:
        error instanceof Error
          ? error.message
          : `Social Planner ${input.pass} provider call failed.`,
      stage: input.pass,
      retryable: true,
    });
  }

  return parseSocialPlannerStructuredOutput(raw, input.pass);
}

function validateRepairedPackage(input: {
  raw: Record<string, unknown>;
  context: SocialPlannerGenerationContextV1;
  userGuidance: string | null;
  metadata: SocialCalendarPackageV1["generationMetadata"];
  failureCode: "HISTORICAL_DIVERSITY_REPAIR_FAILED" | "THINK_DIFFERENTLY_REPAIR_FAILED";
  stage: "diversity_repair_validation" | "source_divergence_repair_validation";
}): SocialCalendarPackageV1 {
  try {
    return validateAndNormalizeSocialCalendarPackage({
      raw: input.raw,
      context: input.context,
      userGuidance: input.userGuidance,
      metadata: input.metadata,
    });
  } catch (error) {
    if (error instanceof SocialCalendarPackageValidationError) {
      throw new SocialPlannerGenerationError({
        code: input.failureCode,
        message: error.message,
        stage: input.stage,
        retryable: false,
        failures: error.failures,
      });
    }
    throw error;
  }
}

export async function generateThinkDifferentlySocialCalendar(input: {
  context: SocialPlannerGenerationContextV1;
  userGuidance?: string | null;
  sourceCalendar: Pick<
    SocialCalendar,
    "id" | "root_calendar_id" | "version_number"
  >;
  sourcePackage: SocialCalendarPackageV1;
  derivativeVersionNumber: number;
  deps: SocialPlannerDiverseGenerationDeps;
}): Promise<SocialPlannerThinkDifferentlyGenerationResult> {
  const organizationId = input.context.organization.id;
  const sourceNegativeContext = buildSourceNegativeContext(input.sourcePackage);
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

  const l4 = await generateSocialCalendarPackage({
    context: input.context,
    userGuidance,
    generationMode: "think_differently",
    socialMemoryText: memoryText,
    sourceNegativeContext,
    deps: { generateReview: generate },
  });

  let candidate = l4.package;
  let historicalDiversityRepairUsed = false;
  let diversity = evaluateHistoricalDiversity({
    candidatePackage: candidate,
    socialMemory,
    userGuidance,
  });

  if (!diversity.accepted) {
    const repairRaw = await invokeJsonRepair({
      generate,
      prompt: buildSocialPlannerDiversityRepairPrompt({
        context: input.context,
        userGuidance,
        socialMemory,
        currentPackage: candidate as unknown as Record<string, unknown>,
        diversity,
      }),
      systemPrompt: SOCIAL_PLANNER_DIVERSITY_REPAIR_SYSTEM_PROMPT,
      athenaStage: DIVERSITY_REPAIR_STAGE,
      pass: "diversity_repair",
    });
    candidate = validateRepairedPackage({
      raw: repairRaw,
      context: input.context,
      userGuidance,
      metadata: l4.package.generationMetadata,
      failureCode: "HISTORICAL_DIVERSITY_REPAIR_FAILED",
      stage: "diversity_repair_validation",
    });
    diversity = evaluateHistoricalDiversity({
      candidatePackage: candidate,
      socialMemory,
      userGuidance,
    });
    if (!diversity.accepted) {
      throw new SocialPlannerGenerationError({
        code: "HISTORICAL_DIVERSITY_REPAIR_FAILED",
        message:
          diversity.violations[0]?.message ??
          "Historical-diversity repair still repeated recent Social Planner creative combinations.",
        stage: "diversity_repair",
        retryable: false,
      });
    }
    historicalDiversityRepairUsed = true;
  }

  let sourceDivergence = evaluateThinkDifferentlyDivergence({
    candidatePackage: candidate,
    sourcePackage: input.sourcePackage,
  });
  let sourceDivergenceRepairUsed = false;

  if (!sourceDivergence.accepted) {
    const repairRaw = await invokeJsonRepair({
      generate,
      prompt: buildThinkDifferentlyRepairPrompt({
        context: input.context,
        userGuidance,
        sourcePackage: input.sourcePackage,
        sourceNegativeContext,
        currentPackage: candidate,
        divergence: sourceDivergence,
        socialMemoryText: memoryText,
      }),
      systemPrompt: SOCIAL_PLANNER_THINK_DIFFERENTLY_REPAIR_SYSTEM_PROMPT,
      athenaStage: THINK_DIFFERENTLY_REPAIR_STAGE,
      pass: "think_differently_repair",
    });
    candidate = validateRepairedPackage({
      raw: repairRaw,
      context: input.context,
      userGuidance,
      metadata: {
        ...candidate.generationMetadata,
        generationMode: "think_differently",
      },
      failureCode: "THINK_DIFFERENTLY_REPAIR_FAILED",
      stage: "source_divergence_repair_validation",
    });

    diversity = evaluateHistoricalDiversity({
      candidatePackage: candidate,
      socialMemory,
      userGuidance,
    });
    if (!diversity.accepted) {
      throw new SocialPlannerGenerationError({
        code: "THINK_DIFFERENTLY_REPAIR_FAILED",
        message:
          diversity.violations[0]?.message ??
          "Think Differently repair lost historical diversity.",
        stage: "source_divergence_repair",
        retryable: false,
      });
    }

    sourceDivergence = evaluateThinkDifferentlyDivergence({
      candidatePackage: candidate,
      sourcePackage: input.sourcePackage,
    });
    if (!sourceDivergence.accepted) {
      throw new SocialPlannerGenerationError({
        code: "THINK_DIFFERENTLY_DIVERGENCE_FAILED",
        message:
          sourceDivergence.violations[0]?.message ??
          "Think Differently repair was still too similar to the source calendar.",
        stage: "source_divergence_repair",
        retryable: false,
        failures: formatThinkDifferentlyViolations(sourceDivergence),
      });
    }
    sourceDivergenceRepairUsed = true;
  }

  return {
    package: candidate,
    generationProvenance: buildThinkDifferentlyProvenance({
      metadata: {
        ...candidate.generationMetadata,
        generationMode: "think_differently",
      },
      socialMemory,
      diversity,
      historicalDiversityRepairUsed,
      sourceCalendar: input.sourceCalendar,
      derivativeVersionNumber: input.derivativeVersionNumber,
      sourceDivergence,
      sourceDivergenceRepairUsed,
    }),
    socialMemory,
    historicalDiversity: diversity,
    sourcePackage: input.sourcePackage,
    sourceNegativeContext,
    sourceDivergence,
    sourceDivergenceRepairUsed,
  };
}
