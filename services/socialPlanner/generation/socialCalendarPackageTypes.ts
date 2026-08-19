/**
 * Persisted Social Calendar generated-package contract (L4).
 * JSON-serializable only. L6 writes this into package_json.
 */

import type {
  SocialCalendarDayName,
  SocialCalendarOpportunityCategory,
  SocialCalendarOpportunityScope,
} from "@/services/socialPlanner/calendar/socialCalendarContextTypes";
import type { SocialPlannerHemisphere } from "@/services/socialPlanner/geography/socialPlannerGeographyTypes";
import type { SocialCalendarGenerationMode } from "@/services/socialPlanner/socialCalendarTypes";
import { TREND_SOCIAL_PROMPT_CONFIG_KEY } from "@/services/superAdmin/strategicBlueprintInstructionConstants";

export const SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION =
  "social_calendar_package_v1" as const;

export const SOCIAL_PLANNER_ASSET_PROMPT_VERSION =
  "social_planner_assets_v1" as const;

export const SOCIAL_PLANNER_REPAIR_PROMPT_VERSION =
  "social_planner_repair_v1" as const;

export const SOCIAL_PLANNER_ASSET_TYPES = [
  "image",
  "photo",
  "branded_graphic",
  "infographic",
  "quote_visual",
  "meme_or_humor",
  "testimonial_visual",
  "before_after",
  "carousel",
  "story_sequence",
  "storyboard",
  "comparison",
  "step_by_step",
  "talking_head_video",
  "explainer_video",
  "scenario_video",
  "skit_video",
  "pov_video",
  "interview_or_qa_video",
  "testimonial_video",
  "demonstration_video",
  "behind_the_scenes_video",
  "cinematic_brand_video",
  "pdf_guide",
  "checklist",
  "cheat_sheet",
  "mini_report",
  "poll",
  "question_post",
  "challenge",
  "quiz",
  "myth_vs_fact",
] as const;

export type SocialPlannerAssetType = (typeof SOCIAL_PLANNER_ASSET_TYPES)[number];

export const SOCIAL_PLANNER_ASSET_FAMILIES = [
  "static",
  "multi_frame",
  "video",
  "document",
  "engagement",
] as const;

export type SocialPlannerAssetFamily =
  (typeof SOCIAL_PLANNER_ASSET_FAMILIES)[number];

export const SOCIAL_PLANNER_OBJECTIVES = [
  "educate",
  "build_authority",
  "engage",
  "nurture",
  "convert",
  "promote",
  "community",
  "entertain",
  "trust",
  "thought_leadership",
] as const;

export type SocialPlannerObjective = (typeof SOCIAL_PLANNER_OBJECTIVES)[number];

export const SOCIAL_PLANNER_PROMOTIONAL_OBJECTIVES = [
  "convert",
  "promote",
] as const;

export const SOCIAL_PLANNER_AUTHORITY_OBJECTIVES = [
  "educate",
  "build_authority",
  "trust",
  "thought_leadership",
  "community",
] as const;

export const SOCIAL_PLANNER_CONTENT_ARCHETYPES = [
  "educational",
  "story",
  "problem_solution",
  "myth_fact",
  "checklist",
  "opinion",
  "behind_the_scenes",
  "testimonial",
  "offer",
  "community",
  "trend_adaptation",
  "humor",
  "data_point",
  "how_to",
  "question",
  "comparison",
] as const;

export type SocialPlannerContentArchetype =
  (typeof SOCIAL_PLANNER_CONTENT_ARCHETYPES)[number];

export const SOCIAL_PLANNER_PLATFORMS = [
  "instagram",
  "facebook",
  "linkedin",
  "tiktok",
  "youtube_shorts",
  "x",
  "threads",
] as const;

export type SocialPlannerPlatform = (typeof SOCIAL_PLANNER_PLATFORMS)[number];

export const SOCIAL_PLANNER_SOURCE_SIGNAL_TYPES = [
  "persona",
  "website",
  "brain",
  "calendar_opportunity",
  "seo",
  "ads",
  "blueprint",
  "discussion",
  "organization",
  "prospect_portfolio",
] as const;

export type SocialPlannerSourceSignalType =
  (typeof SOCIAL_PLANNER_SOURCE_SIGNAL_TYPES)[number];

export const SOCIAL_PLANNER_PRODUCTION_SPEC_KINDS = [
  "static",
  "carousel",
  "video",
  "document",
  "engagement",
] as const;

export type SocialPlannerProductionSpecKind =
  (typeof SOCIAL_PLANNER_PRODUCTION_SPEC_KINDS)[number];

export const SOCIAL_PLANNER_ENGAGEMENT_TYPES = [
  "poll",
  "question",
  "challenge",
  "quiz",
  "myth_vs_fact",
] as const;

export type SocialPlannerEngagementType =
  (typeof SOCIAL_PLANNER_ENGAGEMENT_TYPES)[number];

export const SOCIAL_PLANNER_HOOK_TYPES = [
  "question",
  "statistic",
  "command",
  "statement",
  "none",
] as const;

export type SocialPlannerHookType = (typeof SOCIAL_PLANNER_HOOK_TYPES)[number];

export const SOCIAL_PLANNER_CTA_TYPES = [
  "book",
  "purchase",
  "learn",
  "engage",
  "other",
  "none",
] as const;

export type SocialPlannerCtaType = (typeof SOCIAL_PLANNER_CTA_TYPES)[number];

export const SOCIAL_PLANNER_ASSET_TYPE_FAMILY: Record<
  SocialPlannerAssetType,
  SocialPlannerAssetFamily
> = {
  image: "static",
  photo: "static",
  branded_graphic: "static",
  infographic: "static",
  quote_visual: "static",
  meme_or_humor: "static",
  testimonial_visual: "static",
  before_after: "static",
  carousel: "multi_frame",
  story_sequence: "multi_frame",
  storyboard: "multi_frame",
  comparison: "multi_frame",
  step_by_step: "multi_frame",
  talking_head_video: "video",
  explainer_video: "video",
  scenario_video: "video",
  skit_video: "video",
  pov_video: "video",
  interview_or_qa_video: "video",
  testimonial_video: "video",
  demonstration_video: "video",
  behind_the_scenes_video: "video",
  cinematic_brand_video: "video",
  pdf_guide: "document",
  checklist: "document",
  cheat_sheet: "document",
  mini_report: "document",
  poll: "engagement",
  question_post: "engagement",
  challenge: "engagement",
  quiz: "engagement",
  myth_vs_fact: "engagement",
};

export const SOCIAL_PLANNER_FAMILY_PRODUCTION_KIND: Record<
  SocialPlannerAssetFamily,
  SocialPlannerProductionSpecKind
> = {
  static: "static",
  multi_frame: "carousel",
  video: "video",
  document: "document",
  engagement: "engagement",
};

export const SOCIAL_PLANNER_HOLIDAY_ANCHOR_CATEGORIES = [
  "public_holiday",
  "civic_observance",
  "cultural_religious_observance",
  "commercial_event",
  "awareness_event",
  "seasonal_event",
] as const;

export type ImageProductionSpec = {
  kind: "static";
  imagePrompt: string;
  composition: string;
  setting: string;
  subjects: string;
  overlayCopyGuidance: string | null;
  visualTone: string;
};

export type CarouselProductionSpec = {
  kind: "carousel";
  visualDirection: string;
  slideCount: number;
  slides: Array<{
    index: number;
    headline: string;
    body: string;
    visualNote: string;
  }>;
  designPrompt: string;
};

export type VideoProductionSpec = {
  kind: "video";
  videoConcept: string;
  hook: string;
  shotPlan: Array<{
    shot: number;
    action: string;
    framing: string;
  }>;
  dialogue: string | null;
  environment: string;
  productionDirection: string;
  visualTone: string;
};

export type DocumentProductionSpec = {
  kind: "document";
  documentConcept: string;
  sections: Array<{
    heading: string;
    content: string;
  }>;
  designPrompt: string;
};

export type EngagementProductionSpec = {
  kind: "engagement";
  engagementType: SocialPlannerEngagementType;
  prompt: string;
  options: string[] | null;
  visualSupport: string | null;
};

export type SocialPlannerProductionSpec =
  | ImageProductionSpec
  | CarouselProductionSpec
  | VideoProductionSpec
  | DocumentProductionSpec
  | EngagementProductionSpec;

export type SocialCalendarSelectedAnchor = {
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

export type SocialPlannerSourceSignal = {
  type: SocialPlannerSourceSignalType;
  id: string | null;
};

export type SocialPlannerAssetFingerprint = {
  assetType: SocialPlannerAssetType;
  family: SocialPlannerAssetFamily;
  contentArchetype: SocialPlannerContentArchetype;
  topic: string;
  angle: string;
  hookType: SocialPlannerHookType;
  hookNormalized: string | null;
  objective: SocialPlannerObjective;
  audience: string;
  personaIds: string[];
  ctaType: SocialPlannerCtaType;
  visualStyle: string;
  calendarAnchorIds: string[];
};

export type SocialPlannerWeekFingerprint = {
  assetTypes: SocialPlannerAssetType[];
  families: SocialPlannerAssetFamily[];
  objectives: SocialPlannerObjective[];
  archetypes: SocialPlannerContentArchetype[];
  personaIds: string[];
  topics: string[];
  calendarAnchorIds: string[];
};

export type SocialCalendarAssetV1 = {
  date: string;
  weekday: SocialCalendarDayName;
  assetType: SocialPlannerAssetType;
  contentArchetype: SocialPlannerContentArchetype;
  primaryObjective: SocialPlannerObjective;
  audience: string;
  personaIds: string[];
  topic: string;
  angle: string;
  hook: string | null;
  concept: string;
  calendarAnchors: SocialCalendarSelectedAnchor[];
  calendarReason: string | null;
  productionSpec: SocialPlannerProductionSpec;
  socialCopy: string;
  cta: string | null;
  recommendedPlatforms: SocialPlannerPlatform[];
  sourceSignals: SocialPlannerSourceSignal[];
  creativeFingerprint: SocialPlannerAssetFingerprint;
};

export type SocialPlannerGenerationStageRoute = {
  pass: "strategy" | "assets" | "repair";
  athenaStage:
    | "social_calendar_strategy"
    | "social_calendar_assets"
    | "social_calendar_repair";
  role: "analysis" | "premiumStrategicOutput";
  model: string;
  reasoningProfile: "EXECUTIVE" | "BALANCED";
  temperature: number;
};

export type SocialPlannerGenerationMetadata = {
  packageSchemaVersion: typeof SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION;
  strategyPromptVersion: string;
  assetPromptVersion: string;
  repairPromptVersion: string | null;
  repairUsed: boolean;
  generationMode: SocialCalendarGenerationMode;
  provider: "openrouter";
  stages: SocialPlannerGenerationStageRoute[];
  trendSocialPrompt: {
    key: typeof TREND_SOCIAL_PROMPT_CONFIG_KEY;
    configured: boolean;
    revisionId: string | null;
  };
  calendarResolverVersion: string;
  calendarSchemaVersion: string;
  intelligenceComposerVersion: string;
  intelligenceSchemaVersion: string;
};

export type SocialCalendarPackageV1 = {
  schemaVersion: typeof SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION;
  period: {
    periodStart: string;
    periodEnd: string;
    dates: string[];
  };
  strategySummary: string;
  whyThisWeekWorks: string;
  assets: SocialCalendarAssetV1[];
  weekFingerprint: SocialPlannerWeekFingerprint;
  generationMetadata: SocialPlannerGenerationMetadata;
};

export type SocialPlannerGenerationProvenance = SocialPlannerGenerationMetadata;

export type SocialCalendarGenerationResult = {
  package: SocialCalendarPackageV1;
  generationProvenance: SocialPlannerGenerationProvenance;
};

export const SOCIAL_PLANNER_PACKAGE_LIMITS = {
  packageMaxChars: 96_000,
  assetMaxChars: 12_000,
  strategySummaryMaxChars: 500,
  whyThisWeekWorksMinChars: 80,
  whyThisWeekWorksMaxChars: 700,
  whyThisWeekWorksMinSentences: 2,
  whyThisWeekWorksMaxSentences: 4,
  weeklyObjectiveMaxChars: 280,
  secondaryObjectiveMaxChars: 220,
  secondaryObjectivesMax: 4,
  audiencePlanMax: 6,
  topicPlanMax: 8,
  avoidancesMax: 8,
  narrativeArcMaxChars: 600,
  creativeDirectionMaxChars: 400,
  userGuidanceInterpretationMaxChars: 400,
  conceptMaxChars: 600,
  topicMaxChars: 240,
  angleMaxChars: 240,
  audienceMaxChars: 220,
  hookMaxChars: 220,
  socialCopyMaxChars: 1_200,
  ctaMaxChars: 200,
  calendarReasonMaxChars: 280,
  productionPromptMaxChars: 3_000,
  videoDialogueMaxChars: 2_500,
  carouselSlideMaxChars: 400,
  carouselSlidesMin: 3,
  carouselSlidesMax: 8,
  videoShotsMin: 2,
  videoShotsMax: 8,
  documentSectionsMin: 2,
  documentSectionsMax: 8,
  pollOptionsMin: 2,
  pollOptionsMax: 4,
  platformsMin: 1,
  platformsMax: 3,
  sourceSignalsMax: 6,
  personaIdsPerAssetMax: 2,
  anchorsPerAssetMax: 2,
  stringFieldDefaultMaxChars: 400,
} as const;

export const SOCIAL_PLANNER_DIVERSITY_DEFAULTS = {
  minDistinctAssetTypes: 4,
  maxRepeatsPerAssetType: 2,
  minNonStaticAssets: 1,
  maxPromotionalAssets: 3,
  minDistinctObjectives: 2,
  minAuthorityAssets: 1,
  maxSameTopic: 3,
  maxSameTopicAngle: 2,
  maxHolidayAnchorDays: 3,
  maxSharedHookPrefix: 3,
  minDistinctAudiencesWhenMultiplePersonas: 2,
} as const;

export const SOCIAL_PLANNER_DIVERSITY_GUIDED = {
  minDistinctAssetTypes: 3,
  maxRepeatsPerAssetType: 3,
  minNonStaticAssets: 1,
  maxPromotionalAssets: 5,
  minDistinctObjectives: 2,
  minAuthorityAssets: 0,
  maxSameTopic: 5,
  maxSameTopicAngle: 3,
  maxHolidayAnchorDays: 5,
  maxSharedHookPrefix: 4,
  minDistinctAudiencesWhenMultiplePersonas: 1,
} as const;
