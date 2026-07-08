import type { OpportunityStatusKey } from "@/lib/opportunityStatus";
import type { BriefingStatusKey } from "@/lib/briefingStatus";

export const EXECUTIVE_LEARNING_VERSION = "executive_learning_v1";

export const MAX_EXECUTIVE_LEARNING_EVENTS = 100;
export const MAX_MARKET_EVIDENCE_ENTRIES = 50;
export const MAX_PROMOTION_CANDIDATES = 30;

export const PROMOTION_LOW_MIN_OCCURRENCES = 2;
export const PROMOTION_MEDIUM_MIN_OCCURRENCES = 3;
export const PROMOTION_MEDIUM_MIN_DOMAINS = 2;
export const PROMOTION_HIGH_MIN_OCCURRENCES = 5;
export const PROMOTION_HIGH_MIN_DOMAINS = 2;
export const PROMOTION_HIGH_MIN_CONFIDENCE = 40;

export type PromotionReadiness = "low" | "medium" | "high" | "none";

export type BuildExecutiveLearningParams = {
  organizationId: string;
  discussionId?: string;
  opportunityId?: string;
  briefingId?: string;
  domainId?: string;
};

export type LearningMetadata = {
  generatedAt: string;
  organizationId: string;
  focusDomainId: string | null;
  focusDiscussionId: string | null;
  focusOpportunityId: string | null;
  focusBriefingId: string | null;
  learningVersion: string;
  discussionEvents: number;
  briefingEvents: number;
  salesEvents: number;
  refreshEvents: number;
  marketEvidenceEvents: number;
};

export type ExecutiveLearningEvent = {
  event: string;
  timestamp: string | null;
  linkedObjectType: "discussion" | "opportunity" | "briefing" | "domain" | "organization";
  linkedObjectId: string | null;
  frequency: number;
  latestOccurrence: string | null;
};

export type DecisionLearning = {
  events: ExecutiveLearningEvent[];
  briefingDecisions: Record<BriefingStatusKey, number>;
  opportunityProgressions: Record<OpportunityStatusKey, number>;
  latestBriefingDecision: ExecutiveLearningEvent | null;
  latestSalesProgression: ExecutiveLearningEvent | null;
  totalValidatedDecisions: number;
};

export type DiscussionLearning = {
  refreshCount: number;
  lifecycleDistribution: Record<string, number>;
  repeatedAnalysisCount: number;
  reprocessingCount: number;
  latestActivity: string | null;
  averageAgeDays: number | null;
  stateDistribution: Record<string, number>;
  events: ExecutiveLearningEvent[];
};

export type BriefingLearning = {
  approved: number;
  needsRevision: number;
  rejected: number;
  draft: number;
  approvalFrequency: number;
  revisionFrequency: number;
  approvalHistory: ExecutiveLearningEvent[];
  latestDecision: ExecutiveLearningEvent | null;
};

export type SalesLearning = {
  statusCounts: Record<OpportunityStatusKey, number>;
  events: ExecutiveLearningEvent[];
  latestProgression: ExecutiveLearningEvent | null;
  qualifiedCount: number;
  wonCount: number;
  lostCount: number;
};

export type MarketEvidenceEntry = {
  category:
    | "pain_point"
    | "objection"
    | "terminology"
    | "buyer_stage"
    | "opportunity_category"
    | "competitor"
    | "recommendation"
    | "deployment_pattern"
    | "content_request";
  value: string;
  occurrences: number;
  domainsInvolved: string[];
  domainIds: string[];
  lastSeen: string | null;
  confidence: number | null;
  promotionReadiness: PromotionReadiness;
};

export type MarketLearning = {
  evidence: MarketEvidenceEntry[];
  totalEvidenceItems: number;
  repeatedEvidenceCount: number;
};

export type RefreshLearningEntry = {
  objectType: "discussion" | "analysis" | "opportunity" | "briefing";
  linkedObjectId: string;
  count: number;
  latestRefresh: string | null;
};

export type RefreshLearning = {
  discussionRefreshes: RefreshLearningEntry[];
  analysisRefreshes: RefreshLearningEntry[];
  opportunityRefreshes: RefreshLearningEntry[];
  briefingRefreshes: RefreshLearningEntry[];
  totalRefreshEvents: number;
};

export type PatternLearning = {
  mostApprovedBuyerStage: string | null;
  mostRevisedBuyerStage: string | null;
  mostCommonOpportunityOutcome: string | null;
  mostCommonDeploymentCompletion: string | null;
  mostCommonObjection: string | null;
  mostCommonTerminology: string | null;
  mostCommonOpportunityReason: string | null;
};

export type PromotionCandidate = {
  category: MarketEvidenceEntry["category"];
  value: string;
  occurrences: number;
  domainsAffected: number;
  confidence: number | null;
  promotionReadiness: PromotionReadiness;
  lastSeen: string | null;
};

export type ExecutiveLearningSummary = {
  metadata: LearningMetadata;
  decisionLearning: DecisionLearning;
  discussionLearning: DiscussionLearning;
  briefingLearning: BriefingLearning;
  salesLearning: SalesLearning;
  marketLearning: MarketLearning;
  refreshLearning: RefreshLearning;
  patternLearning: PatternLearning;
  promotionCandidates: PromotionCandidate[];
};

export type ExecutiveLearningSourceContext = {
  organizationId: string;
  domainId?: string;
  discussionId?: string;
  opportunityId?: string;
  briefingId?: string;
};
