import type { GenerationWorkflowType } from "@/services/brain/generationContracts/generationContractTypes";
import type { ExecutiveUnderstanding } from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";
import type { ExecutiveRecommendation } from "@/services/brain/executiveReasoningTypes";

export const EXECUTIVE_STRATEGY_VERSION = "executive_strategy_v7_output_quality_gate";

export type MarketingDeliverableRecommendation =
  | "Educational Guide"
  | "Decision Framework"
  | "Comparison Resource"
  | "Diagnostic Checklist"
  | "Authority Whitepaper"
  | "Executive Webinar"
  | "Educational Video"
  | "Trust-Building Landing Page"
  | "Multi-step Email Journey"
  | "Lead Magnet"
  | "FAQ Resource"
  | "Case Study Collection"
  | "Community Campaign"
  | "Interactive Assessment"
  | "Downloadable Toolkit"
  | "Educational Workshop";

export type MarketingRecommendationIntent =
  | "Educate"
  | "Build Trust"
  | "Compare Options"
  | "Reduce Risk"
  | "Increase Authority"
  | "Generate Leads"
  | "Convert Prospects"
  | "Retain Customers"
  | "Strengthen Community"
  | "Support Decision Making";

export type BuyerProgressionGoal = {
  currentStage: string;
  desiredNextStage: string;
  transitionObjective: string;
};

export type MarketingStrategyRefreshGuidance = {
  preserveStrategy: boolean;
  refreshMode: "improve_execution" | "change_direction";
  changeJustification: string | null;
};

export type ExecutiveMarketingStrategy = {
  businessObjective: string;
  marketingObjective: string;
  recommendedPrimaryDeliverable: MarketingDeliverableRecommendation;
  recommendedSupportingDeliverable: MarketingDeliverableRecommendation | null;
  buyerProgressionGoal: BuyerProgressionGoal;
  educationalObjective: string;
  trustObjective: string;
  conversionObjective: string;
  executivePriority: string;
  recommendationConfidence: number;
  strategicRationale: string[];
  primaryIntent: MarketingRecommendationIntent;
  supportingIntent: MarketingRecommendationIntent | null;
  preferredImplementationType: string;
  supportingImplementationType: string | null;
  marketingFingerprint: string;
  refreshGuidance: MarketingStrategyRefreshGuidance;
  executiveRecommendation: ExecutiveRecommendation;
  assetSelectionRationale: string[];
  platformInfluence: string[];
};

export type ExecutiveStrategy = {
  metadata: {
    generatedAt: string;
    organizationId: string;
    discussionId: string | null;
    strategyVersion: string;
    strategyFingerprint: string;
    understandingFingerprint: string;
  };
  primaryObjective: string;
  primaryAudience: string;
  buyerStage: string | null;
  communicationPriority: string;
  recommendedApproach: string;
  relationshipStrategy: string;
  confidence: number;
  supportingEvidence: string[];
  reasoningSummary: string;
  marketingStrategy: ExecutiveMarketingStrategy;
};

export type BuildExecutiveStrategyParams = {
  organizationId: string;
  discussionId?: string;
  executiveUnderstanding: ExecutiveUnderstanding;
};

export type OutputArtifactType = GenerationWorkflowType;

export type OutputResponsibilityVerb =
  | "Understand"
  | "Recommend"
  | "Advise"
  | "Design"
  | "Execute";

export type OutputResponsibility = {
  artifactType: OutputArtifactType;
  purpose: string;
  verb: OutputResponsibilityVerb;
  mustFocus: string[];
  mustAvoid: string[];
  forbiddenOverlapWith: OutputArtifactType[];
  fieldResponsibilities?: Record<string, OutputResponsibilityVerb>;
};

export type OutputDiversityIssue = {
  artifactA: OutputArtifactType;
  artifactB: OutputArtifactType;
  reason: string;
  severity: "warning" | "error";
};

export type OutputDiversityValidationResult = {
  valid: boolean;
  issues: OutputDiversityIssue[];
};

export type StrategyAlignmentValidationResult = {
  aligned: boolean;
  issues: string[];
};
