/**
 * Narrow planner-kind generation boundary.
 * Daily and Evergreen never share a generator.
 */

import type { SocialPlannerGenerationContextV1 } from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";
import type { SocialCalendarGenerationMode } from "@/services/socialPlanner/socialCalendarTypes";
import {
  generateSocialCalendarPackage,
  type SocialPlannerGenerationDeps,
} from "@/services/socialPlanner/generation/socialPlannerGenerationService";
import { generateEvergreenSocialCalendarPackage } from "@/services/socialPlanner/generation/generateEvergreenSocialCalendarPackage";
import type { SocialCalendarGenerationResult } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import type { SocialCalendarEvergreenGenerationResult } from "@/services/socialPlanner/generation/socialCalendarEvergreenPackageTypes";
import {
  isSocialCalendarDailyPackage,
  isSocialCalendarEvergreenPackage,
  type SocialCalendarGeneratedPackage,
} from "@/services/socialPlanner/generation/socialCalendarPackageUnion";
import type { SocialPlannerSourceNegativeContext } from "@/services/socialPlanner/thinkDifferently/socialPlannerThinkDifferentlyTypes";
import type { SocialPlannerConversationRevisionContextV1 } from "@/services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";
import {
  SocialCalendarPlannerKindError,
  type SocialCalendarPlannerKind,
} from "@/services/socialPlanner/socialCalendarPlannerKind";
import { SocialPlannerGenerationError } from "@/services/socialPlanner/generation/socialPlannerGenerationErrors";

export type SocialPlannerDispatchedGenerationResult =
  | SocialCalendarGenerationResult
  | SocialCalendarEvergreenGenerationResult;

export async function generateSocialPlannerPackageByKind(input: {
  plannerKind: SocialCalendarPlannerKind;
  context: SocialPlannerGenerationContextV1;
  userGuidance?: string | null;
  generationMode: SocialCalendarGenerationMode;
  socialMemoryText?: string | null;
  sourceNegativeContext?: SocialPlannerSourceNegativeContext | null;
  revisionContext?: SocialPlannerConversationRevisionContextV1 | null;
  sourcePackage?: SocialCalendarGeneratedPackage | null;
  deps?: SocialPlannerGenerationDeps;
}): Promise<SocialPlannerDispatchedGenerationResult> {
  if (input.plannerKind === "daily_social") {
    if (input.sourcePackage && !isSocialCalendarDailyPackage(input.sourcePackage)) {
      throw new SocialPlannerGenerationError({
        code: "UNSUPPORTED_GENERATION_MODE",
        message: "Daily generation cannot consume an Evergreen source package.",
        stage: "input",
        retryable: false,
      });
    }
    return generateSocialCalendarPackage({
      context: input.context,
      userGuidance: input.userGuidance,
      generationMode: input.generationMode,
      socialMemoryText: input.socialMemoryText,
      sourceNegativeContext: input.sourceNegativeContext,
      revisionContext: input.revisionContext,
      sourcePackage: input.sourcePackage ?? null,
      deps: input.deps,
    });
  }

  if (input.plannerKind === "evergreen") {
    if (input.sourcePackage && !isSocialCalendarEvergreenPackage(input.sourcePackage)) {
      throw new SocialPlannerGenerationError({
        code: "UNSUPPORTED_GENERATION_MODE",
        message: "Evergreen generation cannot consume a Daily source package.",
        stage: "input",
        retryable: false,
      });
    }
    return generateEvergreenSocialCalendarPackage({
      context: input.context,
      userGuidance: input.userGuidance,
      generationMode: input.generationMode,
      socialMemoryText: input.socialMemoryText,
      revisionContext: input.revisionContext,
      sourcePackage: input.sourcePackage ?? null,
      deps: input.deps,
    });
  }

  throw new SocialCalendarPlannerKindError(
    "PLANNER_KIND_NOT_IMPLEMENTED",
    "Unsupported Social Planner kind.",
  );
}
