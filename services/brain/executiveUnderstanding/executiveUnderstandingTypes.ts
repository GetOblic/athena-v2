import type { AthenaBrainContext } from "@/services/brain/brainContextTypes";
import type { ExecutiveReasoning, ExecutiveIntelligencePipeline, RecommendedDirectionKey } from "@/services/brain/executiveReasoningTypes";

import type { ExecutiveStrategy } from "@/services/brain/executiveCoherence/executiveCoherenceTypes";

export const EXECUTIVE_UNDERSTANDING_VERSION = "executive_understanding_v5_initiative_selection";

export type ExecutiveInitiativeCategory =
  | "product_improvement"
  | "curriculum_redesign"
  | "positioning_refinement"
  | "pricing_strategy"
  | "market_education"
  | "sales_enablement"
  | "objection_handling"
  | "trust_building"
  | "competitive_differentiation"
  | "new_service_offering"
  | "certification"
  | "lead_qualification"
  | "diagnostic_assessment"
  | "ai_workflow"
  | "partnership_opportunity"
  | "customer_success"
  | "community_building"
  | "brand_authority"
  | "industry_standard_creation"
  | "thought_leadership"
  | "process_improvement"
  | "revenue_expansion"
  | "retention_improvement";

export type InitiativeCandidateSource =
  | "discussion"
  | "buyer_psychology"
  | "market_pattern"
  | "strategic_direction"
  | "initiative_library";

export type InitiativeCandidate = {
  id: string;
  label: string;
  category: ExecutiveInitiativeCategory;
  archetypeId: string;
  strategicDirection: string;
  source: InitiativeCandidateSource;
  whyChangesBusiness: string;
  expectedLeverage: string;
  revenueImpact: string;
  authorityImpact: string;
  implementationEffort: "low" | "medium" | "high";
  timeHorizon: "near_term" | "long_term";
  risk: "low" | "medium" | "high";
  evidenceFromDiscussion: string[];
  expectedCustomerTransformation: string;
  contentRequired: boolean;
  preferredImplementationTypes: import("@/services/brain/executiveCoherence/executiveCoherenceTypes").MarketingDeliverableRecommendation[];
};

export type InitiativeEvaluationScores = {
  businessLeverage: number;
  customerTransformation: number;
  strategicDifferentiation: number;
  authorityCreation: number;
  revenuePotential: number;
  marketTiming: number;
  defensibility: number;
  scalability: number;
  evidenceStrength: number;
  longTermCompounding: number;
  easeOfExecution: number;
  brandAlignment: number;
  opportunityCost: number;
  competitiveAdvantage: number;
  compositeScore: number;
};

export type EvaluatedInitiativeCandidate = {
  candidate: InitiativeCandidate;
  scores: InitiativeEvaluationScores;
  status: "ranked" | "eliminated";
  eliminationReason: string | null;
};

export type SelectedExecutiveInitiative = {
  initiativeLabel: string;
  initiativeCategory: ExecutiveInitiativeCategory;
  archetypeId: string;
  whyThisInitiative: string;
  whyNotAlternatives: string[];
  whyNow: string;
  expectedBusinessOutcome: string;
  expectedCustomerOutcome: string;
  expectedAuthorityOutcome: string;
  expectedReuse: string;
  primarySuccessMetric: string;
  secondarySuccessMetric: string;
  strategicConfidence: number;
  implementationApproach: string;
  timeHorizon: "near_term" | "long_term";
  revenueImpact: string;
  riskLevel: "low" | "medium" | "high";
  evidenceFromDiscussion: string[];
  decisionMatrixSummary: string;
};

export type InitiativeSelectionTrace = {
  organizationId: string;
  timestamp: string;
  chosenInitiative: string;
  chosenCategory: ExecutiveInitiativeCategory;
  rejectedInitiatives: Array<{
    initiative: string;
    category: ExecutiveInitiativeCategory;
    reason: string;
  }>;
  decisionConfidence: number;
  businessObjective: string;
  expectedOutcome: string;
  diversityApplied: boolean;
  candidateCount: number;
  eliminatedCount: number;
  webinarBiasChecked: boolean;
};

export type BusinessBeforeContentAssessment = {
  businessProblemSolved: string;
  highestLeverageRationale: string;
  businessChangeOutperformsContent: string;
  contentRequired: boolean;
  alternativeValuePaths: string[];
  answeredAt: string;
};

export type ImplementationStrategy = {
  initiativeLabel: string;
  initiativeCategory: ExecutiveInitiativeCategory;
  businessObjective: string;
  implementationDeliverable: import("@/services/brain/executiveCoherence/executiveCoherenceTypes").MarketingDeliverableRecommendation;
  contentRequired: boolean;
  deploymentApproach: string;
  channels: string[];
  revenueMechanisms: string[];
  rationale: string;
};

export type ExecutiveInitiativeSelection = {
  selectionVersion: string;
  candidatesGenerated: number;
  possibilities: EvaluatedInitiativeCandidate[];
  eliminated: EvaluatedInitiativeCandidate[];
  ranked: EvaluatedInitiativeCandidate[];
  selectedInitiative: SelectedExecutiveInitiative;
  implementationStrategy: ImplementationStrategy;
  businessBeforeContent: BusinessBeforeContentAssessment;
  decisionTrace: InitiativeSelectionTrace;
};

export type UnderstandingEvidenceSource =
  | "business_identity"
  | "current_discussion"
  | "executive_memory"
  | "executive_learning"
  | "knowledge_assets"
  | "intelligence_domains";

export type UnderstandingEvidenceEntry = {
  source: UnderstandingEvidenceSource;
  label: string;
  detail: string;
  optional: boolean;
};

export type ExecutiveSummary = {
  headline: string;
  narrative: string;
  primaryObjective: string;
  discussionId: string | null;
  scope: AthenaBrainContext["scope"];
};

export type BusinessUnderstanding = {
  positioning: string | null;
  voice: string | null;
  expertise: string | null;
  website: string | null;
  homepageUnderstanding: string | null;
  businessConstraints: string[];
  knowledgeCompleteness: number;
  isBrainTrained: boolean;
  summary: string;
};

export type MarketUnderstanding = {
  buyerStage: string | null;
  painPoints: string[];
  marketSignals: string[];
  recurringTerminology: string[];
  competitors: string[];
  emergingThemes: string[];
  discussionRelevance: string | null;
  domainRelevance: string | null;
  evidenceStrength: "strong" | "moderate" | "weak" | "unknown";
  historicalEnrichmentAvailable: boolean;
};

export type StrategicUnderstanding = {
  recommendedPositioning: string | null;
  recommendedDirection: RecommendedDirectionKey;
  secondaryDirection: RecommendedDirectionKey | null;
  recommendedExecutiveAction: string;
  recommendedDeploymentDirection: string;
  primaryExecutiveObjective: string;
  rationale: string[];
};

export type OpportunityUnderstanding = {
  businessOpportunity: string | null;
  businessAlignment: string;
  executiveAlignment: string;
  importance: string;
  supportingEvidence: string[];
  historicalEvidence: string[];
  historicalEvidenceAvailable: boolean;
};

export type RiskUnderstanding = {
  overallRisk: "low" | "medium" | "high";
  signals: string[];
  missingInformation: string[];
  sparseHistory: boolean;
};

export type PriorityUnderstanding = {
  level: string;
  rationale: string[];
};

export type SupportingEvidence = {
  entries: UnderstandingEvidenceEntry[];
  totalCount: number;
  historicalCount: number;
};

export type UnderstandingMetadata = {
  generatedAt: string;
  organizationId: string;
  discussionId: string | null;
  understandingVersion: string;
  reasoningVersion: string | null;
  memoryEnriched: boolean;
  learningEnriched: boolean;
  degradationMode: "full" | "identity_and_current_only";
  understandingFingerprint: string;
};

export type ExecutiveUnderstanding = {
  metadata: UnderstandingMetadata;
  executiveSummary: ExecutiveSummary;
  businessUnderstanding: BusinessUnderstanding;
  marketUnderstanding: MarketUnderstanding;
  strategicUnderstanding: StrategicUnderstanding;
  opportunityUnderstanding: OpportunityUnderstanding;
  riskUnderstanding: RiskUnderstanding;
  priorityUnderstanding: PriorityUnderstanding;
  supportingEvidence: SupportingEvidence;
  executiveIntelligence: ExecutiveIntelligencePipeline;
  executiveInitiativeSelection: ExecutiveInitiativeSelection;
};

export type BuildExecutiveUnderstandingParams = {
  organizationId: string;
  discussionId?: string;
  brainContext: AthenaBrainContext;
  executiveReasoning: ExecutiveReasoning;
};

export type ExecutiveUnderstandingBundle = {
  brainContext: AthenaBrainContext;
  executiveReasoning: ExecutiveReasoning;
  executiveUnderstanding: ExecutiveUnderstanding;
  executiveStrategy: ExecutiveStrategy;
};

export type ResolveExecutiveUnderstandingParams = {
  organizationId: string;
  discussionId?: string;
  opportunityId?: string;
  briefingId?: string;
  domainId?: string;
};

export class ExecutiveUnderstandingOrganizationRequiredError extends Error {
  constructor(message = "organizationId is required.") {
    super(message);
    this.name = "ExecutiveUnderstandingOrganizationRequiredError";
  }
}
