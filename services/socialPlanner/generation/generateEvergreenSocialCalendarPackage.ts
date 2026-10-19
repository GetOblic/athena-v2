/**
 * Evergreen Social Planner generation pipeline.
 * One weekly strategy call, then one draft call per day.
 * A structural day failure gets at most one day-only repair.
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
  type SocialCalendarEvergreenDayV1,
  type SocialCalendarEvergreenGenerationResult,
  type SocialCalendarEvergreenPackageV1,
  type SocialPlannerEvergreenGenerationMetadata,
} from "@/services/socialPlanner/generation/socialCalendarEvergreenPackageTypes";
import { planEvergreenRevisionDates } from "@/services/socialPlanner/generation/evergreenAffectedRevision";
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
  compactEvergreenSourceDay,
  compactEvergreenSourceWeek,
} from "@/services/socialPlanner/generation/socialPlannerEvergreenGenerationPrompts";
import {
  planEvergreenWeekFormats,
  type SocialPlannerEvergreenFormatAssignment,
} from "@/services/socialPlanner/generation/socialPlannerEvergreenRotation";
import {
  finalizeSocialCalendarEvergreenPackage,
  validateEvergreenGeneratedDay,
  validateSocialPlannerEvergreenWeeklyStrategy,
  SOCIAL_PLANNER_EVERGREEN_WEEKLY_STRATEGY_SCHEMA_VERSION,
  type SocialPlannerEvergreenWeeklyStrategyV1,
} from "@/services/socialPlanner/generation/validateSocialCalendarEvergreenPackage";
import type { SocialPlannerConversationRevisionContextV1 } from "@/services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";
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
  callStage: "strategy" | "day" | "day_repair";
  parsePass: "strategy" | "assets" | "repair";
  reasoningProfile: "EXECUTIVE" | "BALANCED";
}): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    raw = await input.generate(input.prompt, {
      stage: `socialPlanner.evergreen.${input.callStage}`,
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
          : `Evergreen Social Planner ${input.parsePass} provider call failed.`,
      stage: input.parsePass,
      retryable: true,
    });
  }

  return parseSocialPlannerStructuredOutput(raw, input.parsePass);
}

function assignedFormatsFromSource(
  sourcePackage: SocialCalendarEvergreenPackageV1,
): SocialPlannerEvergreenFormatAssignment[] {
  return sourcePackage.days.map((day) => ({
    date: day.date,
    evergreenFormat: day.evergreenFormat,
  }));
}

function assertSourceDatesMatch(
  sourcePackage: SocialCalendarEvergreenPackageV1,
  dates: readonly string[],
): void {
  const same =
    sourcePackage.period.dates.length === dates.length &&
    sourcePackage.period.dates.every((date, index) => date === dates[index]);
  if (!same || sourcePackage.days.length !== dates.length) {
    throw new SocialPlannerGenerationError({
      code: "INVALID_INPUT_CONTEXT",
      message: "Evergreen source package dates do not match the calendar period.",
      stage: "input",
      retryable: false,
    });
  }
}

function strategyContextFromPackage(
  sourcePackage: SocialCalendarEvergreenPackageV1,
): SocialPlannerEvergreenWeeklyStrategyV1 {
  return {
    schemaVersion: SOCIAL_PLANNER_EVERGREEN_WEEKLY_STRATEGY_SCHEMA_VERSION,
    weeklyObjective: sourcePackage.strategySummary,
    secondaryObjectives: [],
    audiencePlan: [],
    topicPlan: sourcePackage.days.map((day) => ({
      topic: day.topic,
      rationale: day.concept,
    })),
    formatPlan: sourcePackage.days.map((day) => ({
      date: day.date,
      evergreenFormat: day.evergreenFormat,
      contentArchetype: day.creativeFingerprint.contentArchetype,
      primaryObjective: day.creativeFingerprint.objective,
    })),
    calendarOpportunityPlan: { selected: [], ignored: [] },
    contentBalance: {
      promotionalWeight: "low",
      educationalWeight: "moderate",
      communityWeight: "moderate",
      funnelNotes: "",
    },
    narrativeArc: sourcePackage.whyThisWeekWorks,
    creativeDirection: sourcePackage.strategySummary,
    strategySummary: sourcePackage.strategySummary,
    whyThisWeekWorks: sourcePackage.whyThisWeekWorks,
    avoidances: [],
    userGuidanceInterpretation: null,
  };
}

function readGeneratedDay(input: {
  raw: Record<string, unknown>;
  dayIndex: number;
  assignment: SocialPlannerEvergreenFormatAssignment;
  context: SocialPlannerGenerationContextV1;
}):
  | { ok: true; day: SocialCalendarEvergreenDayV1 }
  | { ok: false; failures: string[]; budget: boolean } {
  try {
    return {
      ok: true,
      day: validateEvergreenGeneratedDay({
        raw: input.raw,
        dayIndex: input.dayIndex,
        expectedDate: input.assignment.date,
        assignedFormat: input.assignment.evergreenFormat,
        context: input.context,
      }),
    };
  } catch (error) {
    if (error instanceof SocialCalendarPackageValidationError) {
      return {
        ok: false,
        failures: error.failures,
        budget: error.kind === "budget",
      };
    }
    throw error;
  }
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
  if (input.generationMode === "think_differently" && !input.sourcePackage) {
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

  const dates = context.calendarContext.period.dates;
  const sourcePackage =
    input.sourcePackage && isSocialCalendarEvergreenPackage(input.sourcePackage)
      ? input.sourcePackage
      : null;
  if (
    (input.generationMode === "conversation_revision" ||
      input.generationMode === "think_differently") &&
    sourcePackage
  ) {
    assertSourceDatesMatch(sourcePackage, dates);
  }

  const assignedFormats = sourcePackage
    ? assignedFormatsFromSource(sourcePackage)
    : planEvergreenWeekFormats(dates);

  const revisionPlan =
    input.generationMode === "conversation_revision" && input.revisionContext
      ? planEvergreenRevisionDates({
          brief: input.revisionContext.brief,
          periodDates: dates,
        })
      : null;
  const partialDates =
    revisionPlan?.safePartial === true ? new Set(revisionPlan.dates) : null;

  const generate = input.deps?.generateReview ?? generateReview;
  const generationMode = input.generationMode;
  const systemAddendum =
    generationMode === "think_differently"
      ? `\n\n${SOCIAL_PLANNER_EVERGREEN_THINK_DIFFERENTLY_ADDENDUM}`
      : generationMode === "conversation_revision"
        ? `\n\n${SOCIAL_PLANNER_EVERGREEN_REVISION_ADDENDUM}`
        : "";
  const strategyDerivative =
    generationMode === "think_differently" && sourcePackage
      ? [
          SOCIAL_PLANNER_EVERGREEN_THINK_DIFFERENTLY_ADDENDUM,
          "SOURCE EVERGREEN WEEK — WHAT NOT TO REPEAT:",
          compactEvergreenSourceWeek(sourcePackage),
        ].join("\n\n")
      : generationMode === "conversation_revision" &&
          input.revisionContext &&
          sourcePackage &&
          !partialDates
        ? [
            SOCIAL_PLANNER_EVERGREEN_REVISION_ADDENDUM,
            JSON.stringify(input.revisionContext, null, 2),
            compactEvergreenSourceWeek(sourcePackage),
          ].join("\n\n")
        : null;

  const stages: SocialPlannerGenerationStageRoute[] = [];
  let strategy: SocialPlannerEvergreenWeeklyStrategyV1;

  if (partialDates && sourcePackage) {
    strategy = strategyContextFromPackage(sourcePackage);
  } else {
    stages.push(stageRoute("strategy", STRATEGY_STAGE, "EXECUTIVE"));
    const strategyRaw = await invokeJsonPass({
      generate,
      prompt: buildEvergreenStrategyPrompt({
        context,
        userGuidance,
        assignedFormats,
        socialMemoryText: input.socialMemoryText,
        thinkDifferentlyText: strategyDerivative,
      }),
      systemPrompt: `${SOCIAL_PLANNER_EVERGREEN_STRATEGY_SYSTEM_PROMPT}${systemAddendum}`,
      athenaStage: STRATEGY_STAGE,
      callStage: "strategy",
      parsePass: "strategy",
      reasoningProfile: "EXECUTIVE",
    });
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
  }

  const sourceByDate = new Map(
    (sourcePackage?.days ?? []).map((day) => [day.date, day]),
  );
  const produced = new Map<string, SocialCalendarEvergreenDayV1>();
  if (partialDates && sourcePackage) {
    for (const date of dates) {
      if (partialDates.has(date)) continue;
      const sourceDay = sourceByDate.get(date);
      if (!sourceDay) {
        throw new SocialPlannerGenerationError({
          code: "INVALID_INPUT_CONTEXT",
          message: `Evergreen revision cannot copy ${date} because the source package has no such day.`,
          stage: "input",
          retryable: false,
        });
      }
      produced.set(date, structuredClone(sourceDay));
    }
  }

  const datesToGenerate = partialDates
    ? dates.filter((date) => partialDates.has(date))
    : [...dates];
  const unresolved: string[] = [];
  let repairUsed = false;
  let repairFailed = false;

  for (const date of datesToGenerate) {
    const dayIndex = dates.indexOf(date);
    const assignment = assignedFormats[dayIndex];
    if (!assignment || assignment.date !== date) {
      throw new SocialPlannerGenerationError({
        code: "INVALID_INPUT_CONTEXT",
        message: `Evergreen format assignment is missing for ${date}.`,
        stage: "input",
        retryable: false,
      });
    }

    const sourceDay = sourceByDate.get(date) ?? null;
    const dayDerivative =
      generationMode === "think_differently" && sourceDay
        ? [
            SOCIAL_PLANNER_EVERGREEN_THINK_DIFFERENTLY_ADDENDUM,
            "SOURCE DAY — CHANGE THE ANGLE, TITLE, AND DRAFT:",
            compactEvergreenSourceDay(sourceDay),
          ].join("\n\n")
        : generationMode === "conversation_revision" &&
            input.revisionContext &&
            sourceDay
          ? [
              SOCIAL_PLANNER_EVERGREEN_REVISION_ADDENDUM,
              JSON.stringify(
                {
                  global: partialDates ? {} : input.revisionContext.brief.global,
                  dayChange:
                    input.revisionContext.brief.dayChanges.find(
                      (change) => change.date === date,
                    ) ?? null,
                  avoid: partialDates ? [] : input.revisionContext.brief.avoid,
                },
                null,
                2,
              ),
              "SOURCE DAY TO REVISE:",
              compactEvergreenSourceDay(sourceDay, { includeDraft: true }),
            ].join("\n\n")
          : null;

    stages.push(stageRoute("assets", ASSET_STAGE, "EXECUTIVE"));
    const draftRaw = await invokeJsonPass({
      generate,
      prompt: buildEvergreenDraftPrompt({
        context,
        userGuidance,
        strategy,
        assignment,
        dayIndex,
        socialMemoryText: input.socialMemoryText,
        thinkDifferentlyText: dayDerivative,
      }),
      systemPrompt: `${SOCIAL_PLANNER_EVERGREEN_DRAFT_SYSTEM_PROMPT}${systemAddendum}`,
      athenaStage: ASSET_STAGE,
      callStage: "day",
      parsePass: "assets",
      reasoningProfile: "EXECUTIVE",
    });

    const first = readGeneratedDay({
      raw: draftRaw,
      dayIndex,
      assignment,
      context,
    });
    if (first.ok) {
      produced.set(date, first.day);
      continue;
    }
    if (first.budget) {
      unresolved.push(...first.failures);
      continue;
    }

    repairUsed = true;
    stages.push(stageRoute("repair", REPAIR_STAGE, "BALANCED"));
    const repairRaw = await invokeJsonPass({
      generate,
      prompt: buildEvergreenRepairPrompt({
        context,
        userGuidance,
        strategy,
        assignment,
        dayIndex,
        invalidDay: draftRaw,
        failures: first.failures,
        socialMemoryText: input.socialMemoryText,
        thinkDifferentlyText: dayDerivative,
      }),
      systemPrompt: `${SOCIAL_PLANNER_EVERGREEN_REPAIR_SYSTEM_PROMPT}${systemAddendum}`,
      athenaStage: REPAIR_STAGE,
      callStage: "day_repair",
      parsePass: "repair",
      reasoningProfile: "BALANCED",
    });
    const second = readGeneratedDay({
      raw: repairRaw,
      dayIndex,
      assignment,
      context,
    });
    if (second.ok) {
      produced.set(date, second.day);
      continue;
    }
    if (!second.budget) repairFailed = true;
    unresolved.push(...second.failures);
  }

  if (unresolved.length > 0 || produced.size !== dates.length) {
    const failures =
      unresolved.length > 0
        ? unresolved
        : ["Evergreen week is incomplete and was not persisted."];
    throw new SocialPlannerGenerationError({
      code: repairFailed ? "REPAIR_VALIDATION_FAILED" : "PACKAGE_VALIDATION_FAILED",
      message: failures[0] ?? "Evergreen week is incomplete and was not persisted.",
      stage: repairFailed ? "repair_validation" : "validation",
      retryable: false,
      failures,
    });
  }

  const orderedDays = dates.map((date) => {
    const day = produced.get(date);
    if (!day) {
      throw new SocialPlannerGenerationError({
        code: "PACKAGE_VALIDATION_FAILED",
        message: `Missing Evergreen day for ${date}.`,
        stage: "validation",
        retryable: false,
        failures: [`Missing Evergreen day for ${date}.`],
      });
    }
    return day;
  });

  const metadata = buildEvergreenMetadata({
    context,
    repairUsed,
    stages,
    generationMode,
  });

  try {
    const socialPackage = finalizeSocialCalendarEvergreenPackage({
      days: orderedDays,
      strategySummary: partialDates && sourcePackage
        ? sourcePackage.strategySummary
        : strategy.strategySummary,
      whyThisWeekWorks: partialDates && sourcePackage
        ? sourcePackage.whyThisWeekWorks
        : strategy.whyThisWeekWorks,
      context,
      metadata,
      assignedFormats,
    });
    return {
      package: socialPackage,
      generationProvenance: socialPackage.generationMetadata,
    };
  } catch (error) {
    if (error instanceof SocialCalendarPackageValidationError) {
      throw new SocialPlannerGenerationError({
        code: "PACKAGE_VALIDATION_FAILED",
        message: error.message,
        stage: "validation",
        retryable: false,
        failures: error.failures,
      });
    }
    throw error;
  }
}
