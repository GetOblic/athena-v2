/**
 * L5 historically-diverse Social Calendar generation.
 *
 * load Social Memory → L4 generate → L5 diversity check →
 * at most one diversity repair → L4 re-validate → L5 re-check.
 *
 * Does not persist, enqueue jobs, or call APIs.
 */

import { generateReview } from "@/services/aiService";
import type { SocialPlannerGenerationContextV1 } from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";
import type { SocialCalendarGenerationMode } from "@/services/socialPlanner/socialCalendarTypes";
import {
  generateSocialCalendarPackage,
  parseSocialPlannerStructuredOutput,
  type SocialPlannerGenerationDeps,
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
  type SocialCalendarDiverseGenerationResult,
  type SocialPlannerDiverseGenerationProvenance,
  type SocialPlannerHistoricalDiversityResult,
  type SocialPlannerHistoryLoader,
  type SocialPlannerSocialMemoryV1,
} from "@/services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";
import {
  loadSocialPlannerSocialMemory,
} from "@/services/socialPlanner/diversity/loadSocialPlannerSocialMemory";
import {
  evaluateHistoricalDiversity,
  formatHistoricalDiversityViolations,
} from "@/services/socialPlanner/diversity/evaluateHistoricalDiversity";
import {
  SOCIAL_PLANNER_DIVERSITY_REPAIR_SYSTEM_PROMPT,
  buildSocialPlannerDiversityRepairPrompt,
} from "@/services/socialPlanner/diversity/socialPlannerDiversityPrompt";

const DIVERSITY_REPAIR_STAGE = "social_calendar_diversity_repair" as const;

export type SocialPlannerDiverseGenerationDeps = SocialPlannerGenerationDeps & {
  historyLoader: SocialPlannerHistoryLoader;
};

function socialMemoryPromptText(
  socialMemory: SocialPlannerSocialMemoryV1,
): string | null {
  if (socialMemory.diagnostics.assetsIncluded === 0) return null;
  return socialMemory.composedText;
}

function buildDiverseProvenance(input: {
  metadata: SocialCalendarDiverseGenerationResult["package"]["generationMetadata"];
  socialMemory: SocialPlannerSocialMemoryV1;
  diversity: SocialPlannerHistoricalDiversityResult;
  historicalDiversityRepairUsed: boolean;
}): SocialPlannerDiverseGenerationProvenance {
  return {
    ...input.metadata,
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
  };
}

async function invokeDiversityRepair(input: {
  generate: typeof generateReview;
  prompt: string;
}): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    raw = await input.generate(input.prompt, {
      stage: "socialPlanner.diversity_repair",
      promptSource:
        "services/socialPlanner/diversity/generateHistoricallyDiverseSocialCalendar.ts",
      athenaStage: DIVERSITY_REPAIR_STAGE,
      reasoningProfile: "BALANCED",
      systemPrompt: SOCIAL_PLANNER_DIVERSITY_REPAIR_SYSTEM_PROMPT,
    });
  } catch (error) {
    if (error instanceof SocialPlannerGenerationError) throw error;
    throw new SocialPlannerGenerationError({
      code: "PROVIDER_FAILURE",
      message:
        error instanceof Error
          ? error.message
          : "Social Planner historical-diversity repair provider call failed.",
      stage: "diversity_repair",
      retryable: true,
    });
  }

  return parseSocialPlannerStructuredOutput(raw, "diversity_repair");
}

export async function generateHistoricallyDiverseSocialCalendar(input: {
  context: SocialPlannerGenerationContextV1;
  userGuidance?: string | null;
  generationMode: SocialCalendarGenerationMode;
  deps: SocialPlannerDiverseGenerationDeps;
}): Promise<SocialCalendarDiverseGenerationResult> {
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

  const l4 = await generateSocialCalendarPackage({
    context: input.context,
    userGuidance: input.userGuidance,
    generationMode: input.generationMode,
    socialMemoryText: socialMemoryPromptText(socialMemory),
    deps: { generateReview: input.deps.generateReview },
  });

  const userGuidance = input.userGuidance ?? null;
  let diversity = evaluateHistoricalDiversity({
    candidatePackage: l4.package,
    socialMemory,
    userGuidance,
  });

  if (diversity.accepted) {
    return {
      package: l4.package,
      generationProvenance: buildDiverseProvenance({
        metadata: l4.generationProvenance,
        socialMemory,
        diversity,
        historicalDiversityRepairUsed: false,
      }),
      socialMemory,
      historicalDiversity: diversity,
    };
  }

  const repairRaw = await invokeDiversityRepair({
    generate: input.deps.generateReview ?? generateReview,
    prompt: buildSocialPlannerDiversityRepairPrompt({
      context: input.context,
      userGuidance,
      socialMemory,
      currentPackage: l4.package as unknown as Record<string, unknown>,
      diversity,
    }),
  });

  let repairedPackage;
  try {
    repairedPackage = validateAndNormalizeSocialCalendarPackage({
      raw: repairRaw,
      context: input.context,
      userGuidance,
      metadata: l4.package.generationMetadata,
    });
  } catch (error) {
    if (error instanceof SocialCalendarPackageValidationError) {
      throw new SocialPlannerGenerationError({
        code: "HISTORICAL_DIVERSITY_REPAIR_FAILED",
        message: error.message,
        stage: "diversity_repair_validation",
        retryable: false,
        failures: error.failures,
      });
    }
    throw error;
  }

  diversity = evaluateHistoricalDiversity({
    candidatePackage: repairedPackage,
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
      failures: formatHistoricalDiversityViolations(diversity),
    });
  }

  return {
    package: repairedPackage,
    generationProvenance: buildDiverseProvenance({
      metadata: repairedPackage.generationMetadata,
      socialMemory,
      diversity,
      historicalDiversityRepairUsed: true,
    }),
    socialMemory,
    historicalDiversity: diversity,
  };
}
