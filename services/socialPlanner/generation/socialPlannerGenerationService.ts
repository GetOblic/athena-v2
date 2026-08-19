/**
 * Social Planner L4 generation pipeline.
 *
 * Pass 1: weekly strategy
 * Pass 2: seven daily assets
 * Deterministic validation
 * Optional single repair pass
 *
 * Returns a validated package. Does not persist, enqueue jobs, or call APIs.
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
import {
  SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION,
  SOCIAL_PLANNER_ASSET_PROMPT_VERSION,
  SOCIAL_PLANNER_REPAIR_PROMPT_VERSION,
  type SocialCalendarGenerationResult,
  type SocialCalendarPackageV1,
  type SocialPlannerGenerationMetadata,
  type SocialPlannerGenerationStageRoute,
} from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import { SOCIAL_PLANNER_STRATEGY_PROMPT_VERSION } from "@/services/socialPlanner/generation/socialPlannerWeeklyStrategyTypes";
import type { SocialPlannerWeeklyStrategyV1 } from "@/services/socialPlanner/generation/socialPlannerWeeklyStrategyTypes";
import {
  SocialCalendarPackageValidationError,
  SocialPlannerGenerationError,
  SocialPlannerStrategyValidationError,
} from "@/services/socialPlanner/generation/socialPlannerGenerationErrors";
import {
  SOCIAL_PLANNER_ASSET_SYSTEM_PROMPT,
  SOCIAL_PLANNER_REPAIR_SYSTEM_PROMPT,
  SOCIAL_PLANNER_STRATEGY_SYSTEM_PROMPT,
  buildSocialPlannerAssetPrompt,
  buildSocialPlannerRepairPrompt,
  buildSocialPlannerStrategyPrompt,
} from "@/services/socialPlanner/generation/socialPlannerGenerationPrompts";
import {
  SOCIAL_PLANNER_THINK_DIFFERENTLY_SYSTEM_ADDENDUM,
  buildThinkDifferentlyPromptExtras,
} from "@/services/socialPlanner/thinkDifferently/socialPlannerThinkDifferentlyPrompt";
import type { SocialPlannerSourceNegativeContext } from "@/services/socialPlanner/thinkDifferently/socialPlannerThinkDifferentlyTypes";
import type { SocialPlannerConversationRevisionContextV1 } from "@/services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";
import {
  SOCIAL_PLANNER_CONVERSATION_REVISION_SYSTEM_ADDENDUM,
  buildConversationRevisionPromptExtras,
} from "@/services/socialPlanner/conversationRevision/socialPlannerRevisionPrompt";
import {
  validateAndNormalizeSocialCalendarPackage,
  validateSocialPlannerWeeklyStrategy,
} from "@/services/socialPlanner/generation/validateSocialCalendarPackage";

export type SocialPlannerGenerationDeps = {
  generateReview?: typeof generateReview;
};

const STRATEGY_STAGE = "social_calendar_strategy" as const;
const ASSET_STAGE = "social_calendar_assets" as const;
const REPAIR_STAGE = "social_calendar_repair" as const;

function stripJsonFence(rawText: string): string {
  return rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function extractBalancedJsonObject(rawText: string): string | null {
  const start = rawText.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < rawText.length; index += 1) {
    const char = rawText[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return rawText.slice(start, index + 1);
    }
  }
  return null;
}

function repairJsonText(rawText: string): string {
  return rawText
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
}

export function parseSocialPlannerStructuredOutput(
  rawText: string,
  stage:
    | "strategy"
    | "assets"
    | "repair"
    | "diversity_repair"
    | "think_differently_repair"
    | "revision_brief"
    | "conversation_revision_repair",
): Record<string, unknown> {
  const candidates = [stripJsonFence(rawText)];
  const extracted = extractBalancedJsonObject(rawText);
  if (extracted) candidates.push(extracted);

  for (const candidate of candidates) {
    for (const text of [candidate, repairJsonText(candidate)]) {
      try {
        const parsed = JSON.parse(text) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // try next candidate
      }
    }
  }

  throw new SocialPlannerGenerationError({
    code: "MALFORMED_STRUCTURED_OUTPUT",
    message: `Social Planner ${stage} generation produced malformed JSON.`,
    stage,
    retryable: true,
  });
}

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

function buildMetadata(input: {
  context: SocialPlannerGenerationContextV1;
  repairUsed: boolean;
  stages: SocialPlannerGenerationStageRoute[];
  generationMode: SocialCalendarGenerationMode;
}): SocialPlannerGenerationMetadata {
  return {
    packageSchemaVersion: SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION,
    strategyPromptVersion: SOCIAL_PLANNER_STRATEGY_PROMPT_VERSION,
    assetPromptVersion: SOCIAL_PLANNER_ASSET_PROMPT_VERSION,
    repairPromptVersion: input.repairUsed
      ? SOCIAL_PLANNER_REPAIR_PROMPT_VERSION
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
      stage: `socialPlanner.${input.pass}`,
      promptSource: "services/socialPlanner/generation/socialPlannerGenerationService.ts",
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
          : `Social Planner ${input.pass} provider call failed.`,
      stage: input.pass,
      retryable: true,
    });
  }

  return parseSocialPlannerStructuredOutput(raw, input.pass);
}

export async function generateSocialCalendarPackage(input: {
  context: SocialPlannerGenerationContextV1;
  userGuidance?: string | null;
  generationMode: SocialCalendarGenerationMode;
  socialMemoryText?: string | null;
  sourceNegativeContext?: SocialPlannerSourceNegativeContext | null;
  revisionContext?: SocialPlannerConversationRevisionContextV1 | null;
  sourcePackage?: SocialCalendarPackageV1 | null;
  deps?: SocialPlannerGenerationDeps;
}): Promise<SocialCalendarGenerationResult> {
  if (
    input.generationMode === "conversation_revision" &&
    (!input.revisionContext || !input.sourcePackage)
  ) {
    throw new SocialPlannerGenerationError({
      code: "UNSUPPORTED_GENERATION_MODE",
      message:
        "Conversation Revision generation requires frozen revision context and the source package.",
      stage: "input",
      retryable: false,
    });
  }
  if (
    input.generationMode === "think_differently" &&
    !input.sourceNegativeContext
  ) {
    throw new SocialPlannerGenerationError({
      code: "UNSUPPORTED_GENERATION_MODE",
      message:
        "Think Differently generation requires source negative creative context.",
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

  const generate = input.deps?.generateReview ?? generateReview;
  const generationMode = input.generationMode;
  const thinkDifferentlyText =
    generationMode === "think_differently" && input.sourceNegativeContext
      ? buildThinkDifferentlyPromptExtras({
          sourceNegativeContext: input.sourceNegativeContext,
        })
      : generationMode === "conversation_revision" &&
          input.revisionContext &&
          input.sourcePackage
        ? buildConversationRevisionPromptExtras({
            revisionContext: input.revisionContext,
            sourcePackage: input.sourcePackage,
          })
        : null;
  const systemAddendum =
    generationMode === "think_differently"
      ? `\n\n${SOCIAL_PLANNER_THINK_DIFFERENTLY_SYSTEM_ADDENDUM}`
      : generationMode === "conversation_revision"
        ? `\n\n${SOCIAL_PLANNER_CONVERSATION_REVISION_SYSTEM_ADDENDUM}`
        : "";
  const stages: SocialPlannerGenerationStageRoute[] = [
    stageRoute("strategy", STRATEGY_STAGE, "EXECUTIVE"),
    stageRoute("assets", ASSET_STAGE, "EXECUTIVE"),
  ];

  const strategyRaw = await invokeJsonPass({
    generate,
    prompt: buildSocialPlannerStrategyPrompt({
      context,
      userGuidance,
      socialMemoryText: input.socialMemoryText,
      thinkDifferentlyText,
    }),
    systemPrompt: `${SOCIAL_PLANNER_STRATEGY_SYSTEM_PROMPT}${systemAddendum}`,
    athenaStage: STRATEGY_STAGE,
    pass: "strategy",
    reasoningProfile: "EXECUTIVE",
  });

  let strategy: SocialPlannerWeeklyStrategyV1;
  try {
    strategy = validateSocialPlannerWeeklyStrategy(strategyRaw, context);
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

  const assetRaw = await invokeJsonPass({
    generate,
    prompt: buildSocialPlannerAssetPrompt({
      context,
      userGuidance,
      strategy,
      socialMemoryText: input.socialMemoryText,
      thinkDifferentlyText,
    }),
    systemPrompt: `${SOCIAL_PLANNER_ASSET_SYSTEM_PROMPT}${systemAddendum}`,
    athenaStage: ASSET_STAGE,
    pass: "assets",
    reasoningProfile: "EXECUTIVE",
  });

  const initialMetadata = buildMetadata({
    context,
    repairUsed: false,
    stages,
    generationMode,
  });

  try {
    const socialPackage = validateAndNormalizeSocialCalendarPackage({
      raw: assetRaw,
      context,
      userGuidance,
      metadata: initialMetadata,
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
      prompt: buildSocialPlannerRepairPrompt({
        context,
        userGuidance,
        strategy,
        invalidPackage: assetRaw,
        failures: error.failures,
        socialMemoryText: input.socialMemoryText,
        thinkDifferentlyText,
      }),
      systemPrompt: `${SOCIAL_PLANNER_REPAIR_SYSTEM_PROMPT}${systemAddendum}`,
      athenaStage: REPAIR_STAGE,
      pass: "repair",
      reasoningProfile: "BALANCED",
    });

    const repairedMetadata = buildMetadata({
      context,
      repairUsed: true,
      stages,
      generationMode,
    });

    try {
      const repaired = validateAndNormalizeSocialCalendarPackage({
        raw: repairRaw,
        context,
        userGuidance,
        metadata: repairedMetadata,
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
