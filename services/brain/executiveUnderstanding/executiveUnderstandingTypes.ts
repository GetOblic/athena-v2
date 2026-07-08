import type { AthenaBrainContext } from "@/services/brain/brainContextTypes";
import type { ExecutiveReasoning, ExecutiveIntelligencePipeline, RecommendedDirectionKey } from "@/services/brain/executiveReasoningTypes";

import type { ExecutiveStrategy } from "@/services/brain/executiveCoherence/executiveCoherenceTypes";

export const EXECUTIVE_UNDERSTANDING_VERSION = "executive_understanding_v4_decision_synthesis";

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
