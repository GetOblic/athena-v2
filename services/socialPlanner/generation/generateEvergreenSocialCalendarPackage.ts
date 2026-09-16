/**
 * Evergreen Social Planner generation pipeline.
 * Strategy → assigned-format drafts → validate → optional repair.
 * Isolated from Daily generation and from the Deployment Asset batch workflow.
 */

import { generateReview } from "@/services/aiService";
import { resolveModelForStage } from "@/lib/llm/modelRouting";
import { ATHENA_DEFAULT_LLM_TEMPERATURE } from "@/lib/athenaDebugPrompts";
import { validateSocialPlannerIntelligence } from "@/services/socialPlanner/intelligence/validateSocialPlannerIntelligence";
import {
  SocialPlannerIntelligenceError,
  type SocialPlannerGenerationContextV1,
} from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";
import {
  normalizeSocialCalendarUserGuidance,
  type SocialCalendarGenerationMode,
} from "@/services/socialPlanner/socialCalendarTypes";
import type { SocialPlannerGenerationStageRoute } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION,
  SOCIAL_PLANNER_EVERGREEN_PROMPT_VERSION,
  SOCIAL_PLANNER_EVERGREEN_REPAIR_PROMPT_VERSION,
  SOCIAL_PLANNER_EVERGREEN_STRATEGY_PROMPT_VERSION,
  type SocialCalendarEvergreenGenerationResult,
  type SocialPlannerEvergreenGenerationMetadata,
} from "@/services/socialPlanner/generation/socialCalendarEvergreenPackageTypes";
import {
  SocialCalendarPackageValidationError,
  SocialPlannerGenerationError,
  SocialPlannerStrategyValidationError,
} from "@/services/socialPlanner/generation/socialPlannerGenerationErrors";
import {
  parseSocialPlannerStructuredOutput,
  type SocialPlannerGenerationDeps,
} from "@/services/socialPlanner/generation/socialPlannerGenerationService";
import {
  SOCIAL_PLANNER_EVERGREEN_DRAFT_SYSTEM_PROMPT,
  SOCIAL_PLANNER_EVERGREEN_REPAIR_SYSTEM_PROMPT,
  SOCIAL_PLANNER_EVERGREEN_REVISION_ADDENDUM,
  SOCIAL_PLANNER_EVERGREEN_STRATEGY_SYSTEM_PROMPT,
  SOCIAL_PLANNER_EVERGREEN_THINK_DIFFERENTLY_ADDENDUM,
  buildEvergreenDraftPrompt,
  buildEvergreenRepairPrompt,
  buildEvergreenStrategyPrompt,
  compactEvergreenSourceWeek,
} from "@/services/socialPlanner/generation/socialPlannerEvergreenGenerationPrompts";
import {
  planEvergreenWeekFormats,
  type SocialPlannerEvergreenFormatAssignment,
} from "@/services/socialPlanner/generation/socialPlannerEvergreenRotation";
import {
  validateAndNormalizeSocialCalendarEvergreenPackage,
  validateSocialPlannerEvergreenWeeklyStrategy,
} from "@/services/socialPlanner/generation/validateSocialCalendarEvergreenPackage";
import type { SocialPlannerConversationRevisionContextV1 } from "@/services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";
import type { SocialCalendarEvergreenPackageV1 } from "@/services/socialPlanner/generation/socialCalendarEvergreenPackageTypes";
import { isSocialCalendarEvergreenPackage } from "@/services/socialPlanner/generation/socialCalendarPackageUnion";

const STRATEGY_STAGE = "social_calendar_strategy" as const;
const ASSET_STAGE = "social_calendar_assets" as const;
const REPAIR_STAGE = "social_calendar_repair" as const;

function stageRoute(
  pass: SocialPlannerGenerationStageRoute["pass"],
  athenaStage: SocialPlannerGenerationStageRoute["athenaStage"],
  reasoningProfile: SocialPlannerGenerationStageRoute["reasoningProfile"],
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

function buildEvergreenMetadata(input: {
  context: SocialPlannerGenerationContextV1;
  repairUsed: boolean;
  stages: SocialPlannerGenerationStageRoute[];
  generationMode: SocialCalendarGenerationMode;
}): SocialPlannerEvergreenGenerationMetadata {
  return {
    packageSchemaVersion: SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION,
    plannerKind: "evergreen",
    strategyPromptVersion: SOCIAL_PLANNER_EVERGREEN_STRATEGY_PROMPT_VERSION,
    assetPromptVersion: SOCIAL_PLANNER_EVERGREEN_PROMPT_VERSION,
    repairPromptVersion: input.repairUsed
      ? SOCIAL_PLANNER_EVERGREEN_REPAIR_PROMPT_VERSION
      : null,
    repairUsed: input.repairUsed,
    generationMode: input.generationMode,
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

async function invokeJsonPass(input: {
  generate: typeof generateReview;
  prompt: string;
  systemPrompt: string;
  athenaStage: typeof STRATEGY_STAGE | typeof ASSET_STAGE | typeof REPAIR_STAGE;
  pass: "strategy" | "assets" | "repair";
  reasoningProfile: "EXECUTIVE" | "BALANCED";
}): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    raw = await input.generate(input.prompt, {
      stage: `socialPlanner.evergreen.${input.pass}`,
      promptSource:
        "services/socialPlanner/generation/generateEvergreenSocialCalendarPackage.ts",
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
          : `Evergreen Social Planner ${input.pass} provider call failed.`,
      stage: input.pass,
      retryable: true,
    });
  }

  return parseSocialPlannerStructuredOutput(raw, input.pass);
}

function assignedFormatsFromSource(
  sourcePackage: SocialCalendarEvergreenPackageV1,
): SocialPlannerEvergreenFormatAssignment[] {
  return sourcePackage.days.map((day) => ({
    date: day.date,
    evergreenFormat: day.evergreenFormat,
  }));
}

export async function generateEvergreenSocialCalendarPackage(input: {
  context: SocialPlannerGenerationContextV1;
  userGuidance?: string | null;
  generationMode: SocialCalendarGenerationMode;
  socialMemoryText?: string | null;
  revisionContext?: SocialPlannerConversationRevisionContextV1 | null;
  sourcePackage?: SocialCalendarEvergreenPackageV1 | null;
  deps?: SocialPlannerGenerationDeps;
}): Promise<SocialCalendarEvergreenGenerationResult> {
  if (
    input.generationMode === "conversation_revision" &&
    (!input.revisionContext || !input.sourcePackage)
  ) {
    throw new SocialPlannerGenerationError({
      code: "UNSUPPORTED_GENERATION_MODE",
      message:
        "Evergreen conversation revision requires frozen revision context and the source package.",
      stage: "input",
      retryable: false,
    });
  }
  if (
    input.generationMode === "think_differently" &&
    !input.sourcePackage
  ) {
    throw new SocialPlannerGenerationError({
      code: "UNSUPPORTED_GENERATION_MODE",
      message:
        "Evergreen Think Differently requires the source Evergreen package.",
      stage: "input",
      retryable: false,
    });
  }

  let context: SocialPlannerGenerationContextV1;
  try {
    context = validateSocialPlannerIntelligence(input.context);
  } catch (error) {
    throw new SocialPlannerGenerationError({
      code: "INVALID_INPUT_CONTEXT",
      message:
        error instanceof SocialPlannerIntelligenceError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Social Planner generation context is invalid.",
      stage: "input",
      retryable: false,
    });
  }

  let userGuidance: string | null;
  try {
    userGuidance = normalizeSocialCalendarUserGuidance(input.userGuidance ?? null);
  } catch (error) {
    throw new SocialPlannerGenerationError({
      code: "INVALID_INPUT_CONTEXT",
      message:
        error instanceof Error
          ? error.message
          : "Social Calendar user guidance is invalid.",
      stage: "input",
      retryable: false,
    });
  }

  const assignedFormats =
    input.sourcePackage && isSocialCalendarEvergreenPackage(input.sourcePackage)
      ? assignedFormatsFromSource(input.sourcePackage)
      : planEvergreenWeekFormats(context.calendarContext.period.dates);

  const generate = input.deps?.generateReview ?? generateReview;
  const generationMode = input.generationMode;
  const thinkDifferentlyText =
    generationMode === "think_differently" && input.sourcePackage
      ? [
          SOCIAL_PLANNER_EVERGREEN_THINK_DIFFERENTLY_ADDENDUM,
          "SOURCE EVERGREEN WEEK — WHAT NOT TO REPEAT:",
          compactEvergreenSourceWeek(input.sourcePackage),
        ].join("\n\n")
      : generationMode === "conversation_revision" &&
          input.revisionContext &&
          input.sourcePackage
        ? [
            SOCIAL_PLANNER_EVERGREEN_REVISION_ADDENDUM,
            JSON.stringify(input.revisionContext, null, 2),
            compactEvergreenSourceWeek(input.sourcePackage),
          ].join("\n\n")
        : null;
  const systemAddendum =
    generationMode === "think_differently"
      ? `\n\n${SOCIAL_PLANNER_EVERGREEN_THINK_DIFFERENTLY_ADDENDUM}`
      : generationMode === "conversation_revision"
        ? `\n\n${SOCIAL_PLANNER_EVERGREEN_REVISION_ADDENDUM}`
        : "";
  const stages: SocialPlannerGenerationStageRoute[] = [
    stageRoute("strategy", STRATEGY_STAGE, "EXECUTIVE"),
    stageRoute("assets", ASSET_STAGE, "EXECUTIVE"),
  ];

  const strategyRaw = await invokeJsonPass({
    generate,
    prompt: buildEvergreenStrategyPrompt({
      context,
      userGuidance,
      assignedFormats,
      socialMemoryText: input.socialMemoryText,
      thinkDifferentlyText,
    }),
    systemPrompt: `${SOCIAL_PLANNER_EVERGREEN_STRATEGY_SYSTEM_PROMPT}${systemAddendum}`,
    athenaStage: STRATEGY_STAGE,
    pass: "strategy",
    reasoningProfile: "EXECUTIVE",
  });

  let strategy;
  try {
    strategy = validateSocialPlannerEvergreenWeeklyStrategy(
      strategyRaw,
      context,
      assignedFormats,
    );
  } catch (error) {
    if (error instanceof SocialPlannerStrategyValidationError) {
      throw new SocialPlannerGenerationError({
        code: "STRATEGY_VALIDATION_FAILED",
        message: error.message,
        stage: "strategy",
        retryable: true,
        failures: error.failures,
      });
    }
    throw error;
  }

  const draftRaw = await invokeJsonPass({
    generate,
    prompt: buildEvergreenDraftPrompt({
      context,
      userGuidance,
      strategy,
      assignedFormats,
      socialMemoryText: input.socialMemoryText,
      thinkDifferentlyText,
    }),
    systemPrompt: `${SOCIAL_PLANNER_EVERGREEN_DRAFT_SYSTEM_PROMPT}${systemAddendum}`,
    athenaStage: ASSET_STAGE,
    pass: "assets",
    reasoningProfile: "EXECUTIVE",
  });

  const initialMetadata = buildEvergreenMetadata({
    context,
    repairUsed: false,
    stages,
    generationMode,
  });

  try {
    const socialPackage = validateAndNormalizeSocialCalendarEvergreenPackage({
      raw: draftRaw,
      context,
      metadata: initialMetadata,
      assignedFormats,
    });
    return {
      package: socialPackage,
      generationProvenance: socialPackage.generationMetadata,
    };
  } catch (error) {
    if (!(error instanceof SocialCalendarPackageValidationError)) {
      throw error;
    }

    stages.push(stageRoute("repair", REPAIR_STAGE, "BALANCED"));
    const repairRaw = await invokeJsonPass({
      generate,
      prompt: buildEvergreenRepairPrompt({
        context,
        userGuidance,
        strategy,
        assignedFormats,
        invalidPackage: draftRaw,
        failures: error.failures,
        socialMemoryText: input.socialMemoryText,
        thinkDifferentlyText,
      }),
      systemPrompt: `${SOCIAL_PLANNER_EVERGREEN_REPAIR_SYSTEM_PROMPT}${systemAddendum}`,
      athenaStage: REPAIR_STAGE,
      pass: "repair",
      reasoningProfile: "BALANCED",
    });

    const repairedMetadata = buildEvergreenMetadata({
      context,
      repairUsed: true,
      stages,
      generationMode,
    });

    try {
      const repaired = validateAndNormalizeSocialCalendarEvergreenPackage({
        raw: repairRaw,
        context,
        metadata: repairedMetadata,
        assignedFormats,
      });
      return {
        package: repaired,
        generationProvenance: repaired.generationMetadata,
      };
    } catch (repairError) {
      if (repairError instanceof SocialCalendarPackageValidationError) {
        throw new SocialPlannerGenerationError({
          code: "REPAIR_VALIDATION_FAILED",
          message: repairError.message,
          stage: "repair_validation",
          retryable: false,
          failures: repairError.failures,
        });
      }
      throw repairError;
    }
  }
}
