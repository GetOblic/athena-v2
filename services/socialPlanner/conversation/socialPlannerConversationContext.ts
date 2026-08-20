/**
 * Bounded Social Planner Ask Athena context composer.
 *
 * Trust classes remain semantically distinct:
 * 1. FROZEN SOCIAL CALENDAR PACKAGE
 * 2. SELECTED DAILY ASSET FOCUS (optional turn-level slice of the frozen package)
 * 3. FROZEN CALENDAR CONTEXT
 * 4. CURRENT TREND SOCIAL PROMPT
 * 5. CURRENT ORGANIZATION INTELLIGENCE
 */

import { truncateText } from "@/services/athenaConversation/athenaConversationPromptShared";
import type { AthenaConversationContextSection } from "@/services/athenaConversation/athenaConversationTypes";
import type { SocialCalendarContext } from "@/services/socialPlanner/calendar/socialCalendarContextTypes";
import type {
  SocialCalendarAssetV1,
  SocialCalendarPackageV1,
} from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import type { SocialPlannerGenerationContextV1 } from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";
import { SOCIAL_PLANNER_CONVERSATION_LIMITS } from "@/services/socialPlanner/conversation/socialPlannerConversationTypes";

export type SocialPlannerConversationAssembledContext = {
  calendarId: string;
  frozenPackage: string;
  frozenCalendarContext: string;
  selectedDailyAsset: string | null;
  selectedDailyAssetDate: string | null;
  trendSocialPrompt: string;
  liveIntelligenceSections: AthenaConversationContextSection[];
  missingNotes: string[];
};

function clamp(value: string, max: number): string {
  return truncateText(value.trim(), max);
}

export function formatFrozenSocialCalendarPackage(
  socialPackage: SocialCalendarPackageV1,
): string {
  const compact = {
    period: socialPackage.period,
    strategySummary: socialPackage.strategySummary,
    whyThisWeekWorks: socialPackage.whyThisWeekWorks,
    assets: socialPackage.assets.map((asset) => ({
      date: asset.date,
      weekday: asset.weekday,
      assetType: asset.assetType,
      contentArchetype: asset.contentArchetype,
      primaryObjective: asset.primaryObjective,
      audience: asset.audience,
      topic: asset.topic,
      angle: asset.angle,
      hook: asset.hook,
      concept: asset.concept,
      calendarReason: asset.calendarReason,
      recommendedPlatforms: asset.recommendedPlatforms,
      cta: asset.cta,
    })),
  };
  return clamp(
    JSON.stringify(compact, null, 2),
    SOCIAL_PLANNER_CONVERSATION_LIMITS.maxFrozenPackageChars,
  );
}

export function formatFrozenSocialCalendarContext(
  calendarContext: SocialCalendarContext,
): string {
  const compact = {
    period: calendarContext.period,
    geography: {
      countryCode: calendarContext.geography.countryCode,
      regionCode: calendarContext.geography.regionCode,
      hemisphere: calendarContext.geography.hemisphere,
      status: calendarContext.geography.status,
    },
    opportunities: calendarContext.opportunities.map((opportunity) => ({
      id: opportunity.id,
      label: opportunity.label,
      date: opportunity.date,
      category: opportunity.category,
      selectionStatus: opportunity.selectionStatus,
    })),
  };
  return clamp(
    JSON.stringify(compact, null, 2),
    SOCIAL_PLANNER_CONVERSATION_LIMITS.maxFrozenCalendarContextChars,
  );
}

export function formatSelectedSocialPlannerDailyAsset(
  asset: SocialCalendarAssetV1,
): string {
  const compact = {
    date: asset.date,
    weekday: asset.weekday,
    assetType: asset.assetType,
    contentArchetype: asset.contentArchetype,
    primaryObjective: asset.primaryObjective,
    audience: asset.audience,
    topic: asset.topic,
    angle: asset.angle,
    hook: asset.hook,
    concept: asset.concept,
    calendarReason: asset.calendarReason,
    calendarAnchors: asset.calendarAnchors.map((anchor) => ({
      date: anchor.date,
      label: anchor.label,
      category: anchor.category,
    })),
    productionSpec: asset.productionSpec,
    socialCopy: asset.socialCopy,
    cta: asset.cta,
    recommendedPlatforms: asset.recommendedPlatforms,
  };
  return clamp(
    JSON.stringify(compact, null, 2),
    SOCIAL_PLANNER_CONVERSATION_LIMITS.maxSelectedDailyAssetChars,
  );
}

export function composeSocialPlannerConversationContext(input: {
  calendarId: string;
  socialPackage: SocialCalendarPackageV1;
  calendarContext: SocialCalendarContext;
  intelligence: SocialPlannerGenerationContextV1;
  selectedDailyAsset?: SocialCalendarAssetV1 | null;
}): SocialPlannerConversationAssembledContext {
  const missingNotes: string[] = [];
  const trend = input.intelligence.trendSocialPrompt;
  const trendSocialPrompt = trend.configured
    ? clamp(
        [
          `key: ${trend.key}`,
          `revisionId: ${trend.revisionId ?? "null"}`,
          trend.instructionText,
        ].join("\n"),
        SOCIAL_PLANNER_CONVERSATION_LIMITS.maxTrendSocialChars,
      )
    : "No current GetOblic Trend Social Prompt is configured.";

  if (!trend.configured) {
    missingNotes.push("Current Trend Social Prompt is not configured.");
  }
  if (!input.intelligence.brain.available) {
    missingNotes.push("Current Brain intelligence was unavailable.");
  }

  const liveIntelligenceCandidates: AthenaConversationContextSection[] = [
    {
      type: "COMPACT_BRAIN_IDENTITY",
      trust: "athena_analysis",
      label: "Current Brain / identity",
      content: clamp(
        JSON.stringify(
          {
            organization: input.intelligence.organization,
            brain: input.intelligence.brain,
            identityExecutiveIntelligence:
              input.intelligence.identityExecutiveIntelligence,
          },
          null,
          2,
        ),
        3_000,
      ),
    },
    {
      type: "WEBSITE_INTELLIGENCE",
      trust: "athena_analysis",
      label: "Current Website intelligence",
      content: clamp(
        JSON.stringify(input.intelligence.websiteIntelligence, null, 2),
        3_000,
      ),
    },
    {
      type: "PERSONA_PROSPECT_PORTFOLIO",
      trust: "athena_analysis",
      label: "Current Personas and Prospects",
      content: clamp(
        JSON.stringify(
          {
            personas: input.intelligence.personas,
            prospects: input.intelligence.prospects,
          },
          null,
          2,
        ),
        3_000,
      ),
    },
    {
      type: "ADS_BLUEPRINTS_SEO",
      trust: "athena_analysis",
      label: "Current Ads, Blueprints, and SEO",
      content: clamp(
        JSON.stringify(
          {
            ads: input.intelligence.ads,
            strategicAssetBlueprints: input.intelligence.strategicAssetBlueprints,
            seoIntelligence: input.intelligence.seoIntelligence,
          },
          null,
          2,
        ),
        3_000,
      ),
    },
  ];
  const liveIntelligenceSections = liveIntelligenceCandidates.filter((section) =>
    Boolean(section.content.trim()),
  );

  return {
    calendarId: input.calendarId,
    frozenPackage: formatFrozenSocialCalendarPackage(input.socialPackage),
    frozenCalendarContext: formatFrozenSocialCalendarContext(input.calendarContext),
    selectedDailyAsset: input.selectedDailyAsset
      ? formatSelectedSocialPlannerDailyAsset(input.selectedDailyAsset)
      : null,
    selectedDailyAssetDate: input.selectedDailyAsset?.date ?? null,
    trendSocialPrompt,
    liveIntelligenceSections,
    missingNotes,
  };
}
