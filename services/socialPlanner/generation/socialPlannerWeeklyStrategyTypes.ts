/**
 * Internal weekly campaign architecture (L4 Pass 1).
 * Not persisted on the user-facing Social Calendar package.
 */

import type {
  SocialCalendarOpportunityCategory,
  SocialCalendarOpportunityScope,
} from "@/services/socialPlanner/calendar/socialCalendarContextTypes";
import type { SocialPlannerHemisphere } from "@/services/socialPlanner/geography/socialPlannerGeographyTypes";
import type {
  SocialPlannerAssetType,
  SocialPlannerContentArchetype,
  SocialPlannerObjective,
} from "@/services/socialPlanner/generation/socialCalendarPackageTypes";

export const SOCIAL_PLANNER_WEEKLY_STRATEGY_SCHEMA_VERSION =
  "social_planner_weekly_strategy_v1" as const;

export const SOCIAL_PLANNER_STRATEGY_PROMPT_VERSION =
  "social_planner_strategy_v1" as const;

export type SocialPlannerAudienceRole = "primary" | "secondary";

export type SocialPlannerContentWeight = "low" | "moderate" | "high";

export type SocialPlannerAudiencePlanEntry = {
  audience: string;
  personaId: string | null;
  role: SocialPlannerAudienceRole;
};

export type SocialPlannerTopicPlanEntry = {
  topic: string;
  rationale: string;
};

export type SocialPlannerFormatPlanEntry = {
  date: string;
  assetType: SocialPlannerAssetType;
  contentArchetype: SocialPlannerContentArchetype;
  primaryObjective: SocialPlannerObjective;
};

export type SocialPlannerSelectedOpportunityPlan = {
  sourceCandidateId: string;
  date: string;
  label: string;
  category: SocialCalendarOpportunityCategory;
  scope: SocialCalendarOpportunityScope;
  jurisdictionCountryCode: string | null;
  jurisdictionRegionCode: string | null;
  jurisdictionHemisphere: SocialPlannerHemisphere | null;
  reason: string;
};

export type SocialPlannerIgnoredOpportunityPlan = {
  sourceCandidateId: string;
  reason: string;
};

export type SocialPlannerWeeklyStrategyV1 = {
  schemaVersion: typeof SOCIAL_PLANNER_WEEKLY_STRATEGY_SCHEMA_VERSION;
  weeklyObjective: string;
  secondaryObjectives: string[];
  audiencePlan: SocialPlannerAudiencePlanEntry[];
  topicPlan: SocialPlannerTopicPlanEntry[];
  formatPlan: SocialPlannerFormatPlanEntry[];
  calendarOpportunityPlan: {
    selected: SocialPlannerSelectedOpportunityPlan[];
    ignored: SocialPlannerIgnoredOpportunityPlan[];
  };
  contentBalance: {
    promotionalWeight: SocialPlannerContentWeight;
    educationalWeight: SocialPlannerContentWeight;
    communityWeight: SocialPlannerContentWeight;
    funnelNotes: string;
  };
  narrativeArc: string;
  creativeDirection: string;
  avoidances: string[];
  userGuidanceInterpretation: string | null;
};
