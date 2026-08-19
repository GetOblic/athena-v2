/**
 * Versioned Social Planner Generation Context (L3).
 * Trusted evidence only — no weekly strategy, asset copy, or LLM summarization.
 */

import type { SocialCalendarContext } from "@/services/socialPlanner/calendar/socialCalendarContextTypes";
import type { IdentityBusinessModelMap } from "@/services/identity/identityExecutiveIntelligence";
import { TREND_SOCIAL_PROMPT_CONFIG_KEY } from "@/services/superAdmin/strategicBlueprintInstructionConstants";
import {
  SOCIAL_PLANNER_INTELLIGENCE_COMPOSER_VERSION,
  SOCIAL_PLANNER_INTELLIGENCE_SCHEMA_VERSION,
} from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceBudgets";

export {
  SOCIAL_PLANNER_INTELLIGENCE_COMPOSER_VERSION,
  SOCIAL_PLANNER_INTELLIGENCE_SCHEMA_VERSION,
};

export const SOCIAL_PLANNER_INTELLIGENCE_UNAVAILABLE_REASONS = [
  "absent",
  "load_failed",
  "empty",
] as const;

export type SocialPlannerIntelligenceUnavailableReason =
  (typeof SOCIAL_PLANNER_INTELLIGENCE_UNAVAILABLE_REASONS)[number];

export const SOCIAL_PLANNER_ADS_REFERENCE_ROLE =
  "existing_campaign_reference" as const;

export type SocialPlannerSectionBudgetDiagnostic = {
  source: string;
  available: boolean;
  itemsConsidered: number;
  itemsIncluded: number;
  charactersIncluded: number;
  truncated: boolean;
  unavailableReason?: SocialPlannerIntelligenceUnavailableReason;
};

export type SocialPlannerBudgetDiagnostics = {
  sections: SocialPlannerSectionBudgetDiagnostic[];
  composedTextChars: number;
  structuredChars: number;
  composedTextTruncated: boolean;
  structuredTruncated: boolean;
};

export type SocialPlannerOrganizationFacts = {
  id: string;
  name: string | null;
  slug: string | null;
  website: string | null;
  aboutYou: string | null;
  expertise: string | null;
  brainStatus: string | null;
  isBrainTrained: boolean;
};

export type SocialPlannerBrainIntelligence = {
  available: boolean;
  isBrainTrained: boolean;
  completenessScore: number | null;
  masterProfileVersion: string | null;
  homepageLearning: string | null;
  contextWarnings: string[];
  missingSetupFields: string[];
  domains: Array<{
    name: string;
    market: string | null;
    niche: string | null;
    description: string | null;
  }>;
  targetAudiences: string[];
  businessGoals: string[];
};

export type SocialPlannerIdentityExecutiveIntelligence = {
  available: boolean;
  executiveSummary: string | null;
  confidenceLevel: string | null;
  businessModel: IdentityBusinessModelMap;
  hiddenSignals: Array<{ finding: string; whyItMatters: string }>;
};

export type SocialPlannerWebsiteIntelligence = {
  available: boolean;
  provider: "deep_v1" | null;
  url: string | null;
  scrapedAt: string | null;
  pagesAnalyzed: number | null;
  businessKnowledge: Record<string, string>;
  crawlSummary: {
    pagesAnalyzed: number;
    servicesDiscovered: number;
    faqsDiscovered: number;
    testimonialsDiscovered: number;
  } | null;
  pageThemes: Array<{
    url: string;
    title: string | null;
    pageType: string;
  }>;
};

export type SocialPlannerSeoIntelligenceItem = {
  id: string;
  name: string;
  generationType: "intelligence" | "technical";
  role: "current_strategic_seo" | "current_technical_seo_reference";
  summary: string | null;
  priorityTopics: string[];
  keywordThemes: string[];
  contentOpportunities: string[];
  targetServices: string[];
  questionsAndProblems: string[];
};

export type SocialPlannerDiscussionIntelligence = {
  id: string;
  title: string;
  status: string;
  summary: string | null;
  sourceType: "discussion";
  currentExecutiveVersion: {
    id: string;
    versionNumber: number;
    generatedAt: string;
    analysisId: string | null;
    summary: string | null;
    intent: string | null;
    buyerStage: string | null;
    painPoints: string | null;
    recommendedAction: string | null;
  } | null;
};

export type SocialPlannerPersonaIntelligence = {
  id: string;
  name: string;
  category: string | null;
  occupation: string | null;
  seniority: string | null;
  audienceSegment: string | null;
  needs: string | null;
  painPoints: string | null;
  motivations: string | null;
  objections: string | null;
  contentInterests: string | null;
  decisionDrivers: string | null;
  communicationPreferences: string | null;
  audienceGeography: string | null;
  status: string;
  lifecycleStatus: string;
};

export type SocialPlannerPersonaPortfolio = {
  consideredCount: number;
  includedCount: number;
  distinctCategories: string[];
  distinctOccupations: string[];
  distinctAudienceGeographies: string[];
  personas: SocialPlannerPersonaIntelligence[];
};

export type SocialPlannerProspectIntelligence = {
  id: string;
  businessName: string;
  industry: string | null;
  category: string | null;
  geography: string | null;
  commercialNeed: string | null;
  painPoints: string | null;
  status: string;
  lifecycleStatus: string;
};

export type SocialPlannerProspectPortfolio = {
  consideredCount: number;
  includedCount: number;
  prospects: SocialPlannerProspectIntelligence[];
};

export type SocialPlannerOpportunityIntelligence = {
  id: string;
  title: string;
  status: string;
  urgency: string | null;
  score: number | null;
};

export type SocialPlannerAdsCampaignReference = {
  id: string;
  name: string;
  role: typeof SOCIAL_PLANNER_ADS_REFERENCE_ROLE;
  objective: string | null;
  audience: string | null;
  offer: string | null;
  positioning: string | null;
  messageAngle: string | null;
  keywordThemes: string[];
};

export type SocialPlannerBlueprintIntelligence = {
  id: string;
  contextType: "discussion" | "opportunity" | "briefing" | "organization";
  discussionId: string | null;
  opportunityId: string | null;
  briefingId: string | null;
  assetTitle: string;
  assetType: string;
  businessGoal: string | null;
  targetAudience: string | null;
  imagePromptTheme: string | null;
  pdfPromptTheme: string | null;
  socialPromptTheme: string | null;
  /** Historical generated output — not the current Super Admin instruction. */
  historicalTrendSocialOutput: string | null;
  notes: string | null;
};

export type SocialPlannerTrendSocialPrompt = {
  key: typeof TREND_SOCIAL_PROMPT_CONFIG_KEY;
  configured: boolean;
  revisionId: string | null;
  updatedAt: string | null;
  instructionText: string;
};

export type SocialPlannerIntelligenceProvenance = {
  composerVersion: typeof SOCIAL_PLANNER_INTELLIGENCE_COMPOSER_VERSION;
  schemaVersion: typeof SOCIAL_PLANNER_INTELLIGENCE_SCHEMA_VERSION;
  organizationId: string;
  brainAvailable: boolean;
  masterProfileVersion: string | null;
  websiteIntelligenceScrapedAt: string | null;
  websitePagesAnalyzed: number | null;
  discussionIds: string[];
  currentExecutiveVersionIds: string[];
  personaIds: string[];
  prospectIds: string[];
  opportunityIds: string[];
  seoReportIds: string[];
  adCampaignIds: string[];
  blueprintIds: string[];
  trendSocialPrompt: {
    key: typeof TREND_SOCIAL_PROMPT_CONFIG_KEY;
    configured: boolean;
    revisionId: string | null;
  };
  calendar: {
    resolverVersion: string;
    schemaVersion: string;
    holidayCoverage: string;
    holidayProvider: string;
    holidayProviderVersion: string;
    geographySource: string | null;
  };
};

export type SocialPlannerGenerationContextV1 = {
  schemaVersion: typeof SOCIAL_PLANNER_INTELLIGENCE_SCHEMA_VERSION;
  organization: SocialPlannerOrganizationFacts;
  brain: SocialPlannerBrainIntelligence;
  identityExecutiveIntelligence: SocialPlannerIdentityExecutiveIntelligence;
  websiteIntelligence: SocialPlannerWebsiteIntelligence;
  seoIntelligence: SocialPlannerSeoIntelligenceItem[];
  discussions: SocialPlannerDiscussionIntelligence[];
  personas: SocialPlannerPersonaPortfolio;
  prospects: SocialPlannerProspectPortfolio;
  opportunities: SocialPlannerOpportunityIntelligence[];
  ads: SocialPlannerAdsCampaignReference[];
  strategicAssetBlueprints: SocialPlannerBlueprintIntelligence[];
  trendSocialPrompt: SocialPlannerTrendSocialPrompt;
  calendarContext: SocialCalendarContext;
  provenance: SocialPlannerIntelligenceProvenance;
  budgetDiagnostics: SocialPlannerBudgetDiagnostics;
  composedText: string;
};

export class SocialPlannerIntelligenceError extends Error {
  readonly code:
    | "INVALID_ORGANIZATION"
    | "INVALID_CALENDAR_CONTEXT"
    | "CROSS_TENANT_CONTAMINATION"
    | "INVALID_CONTEXT";

  constructor(
    code:
      | "INVALID_ORGANIZATION"
      | "INVALID_CALENDAR_CONTEXT"
      | "CROSS_TENANT_CONTAMINATION"
      | "INVALID_CONTEXT",
    message: string,
  ) {
    super(message);
    this.name = "SocialPlannerIntelligenceError";
    this.code = code;
  }
}
