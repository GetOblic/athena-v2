import type { OpportunityPriorityKey } from "@/lib/opportunityPriority";
import type { AthenaBrainContext } from "@/services/brain/brainContextTypes";

export const EXECUTIVE_REASONING_VERSION = "executive_reasoning_v1";

export const REASONING_PRIORITY_THRESHOLDS = {
  immediate: {
    minScore: 75,
    minUrgencyRank: 4,
    activeSalesStatuses: [
      "approved_for_outreach",
      "outreach_started",
      "conversation_active",
    ] as const,
  },
  high: {
    minScore: 50,
    minUrgencyRank: 3,
    salesStatus: "qualified" as const,
  },
  monitor: {
    minScore: 25,
    minUrgencyRank: 2,
  },
} as const;

export type RecommendedDirectionKey =
  | "educational"
  | "consultative"
  | "sales_first"
  | "relationship_first"
  | "monitor"
  | "escalate";

export type BuildExecutiveReasoningParams = {
  organizationId: string;
  discussionId?: string;
  opportunityId?: string;
  briefingId?: string;
  domainId?: string;
};

export type ExecutiveReasoningSourceContext = Omit<
  AthenaBrainContext,
  "executiveReasoning"
>;

export type ReasoningMetadata = {
  generatedAt: string;
  organizationId: string;
  reasoningVersion: string;
  memoryVersion: string | null;
  learningVersion: string | null;
  discussionCountUsed: number;
  knowledgeAssetCountUsed: number;
  scope: AthenaBrainContext["scope"];
};

export type StrategicAssessment = {
  mostRelevantMarketContext: string | null;
  recurringPainPoints: string[];
  knownTerminology: string[];
  executivePreferences: string[];
  previousApprovals: number;
  historicalPatterns: string[];
  supportingEvidenceCount: number;
};

export type BusinessAssessment = {
  expertise: string | null;
  preferredPositioning: string | null;
  voice: string | null;
  website: string | null;
  homepageLearning: string | null;
  businessConstraints: string[];
  knowledgeCompleteness: number;
  isBrainTrained: boolean;
  summary: string;
};

export type MarketAssessment = {
  currentMarketSignals: string[];
  discussionRelevance: string | null;
  domainMaturity: string | null;
  evidenceStrength: "strong" | "moderate" | "weak" | "unknown";
  recurringObjections: string[];
  recurringTerminology: string[];
  marketConfidence: number | null;
  activeDomainCount: number;
};

export type OpportunityAssessment = {
  importance: OpportunityPriorityKey;
  businessRelevance: "high" | "medium" | "low" | "unknown";
  executiveAlignment: "aligned" | "partial" | "unknown";
  supportingEvidence: string[];
  knownObjections: string[];
  relatedHistoricalOpportunities: number;
  historicalOutcomes: Record<string, number>;
  focusDiscussionScore: number | null;
};

export type PriorityAssessment = {
  level: OpportunityPriorityKey;
  rationale: string[];
  thresholdsApplied: string[];
};

export type RiskAssessment = {
  signals: string[];
  lowConfidence: boolean;
  missingInformation: string[];
  conflictingEvidence: string[];
  sparseHistory: boolean;
  revisionHistoryCount: number;
  overallRisk: "low" | "medium" | "high";
};

export type RecommendedDirection = {
  primary: RecommendedDirectionKey;
  secondary: RecommendedDirectionKey | null;
  rationale: string[];
};

export type ExecutiveReasoning = {
  metadata: ReasoningMetadata;
  strategicAssessment: StrategicAssessment;
  businessAssessment: BusinessAssessment;
  marketAssessment: MarketAssessment;
  opportunityAssessment: OpportunityAssessment;
  priorityAssessment: PriorityAssessment;
  riskAssessment: RiskAssessment;
  recommendedDirection: RecommendedDirection;
};
