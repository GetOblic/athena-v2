import type { AthenaBrainContext } from "@/services/brain/brainContextTypes";

export const EXECUTIVE_MEMORY_VERSION = "executive_memory_v1";

export const MAX_EXECUTIVE_MEMORY_ANALYSES = 100;
export const MAX_EXECUTIVE_MEMORY_PAIN_POINTS = 25;
export const MAX_EXECUTIVE_MEMORY_SIGNALS = 25;
export const MAX_EXECUTIVE_MEMORY_TERMS = 50;
export const MAX_EXECUTIVE_MEMORY_COMPETITORS = 25;

export type ExecutiveMemorySourceContext = Omit<
  AthenaBrainContext,
  "executiveMemory"
>;

export type BuildExecutiveMemoryParams = {
  organizationId: string;
  domainId?: string;
  discussionId?: string;
};

export type MemoryMetadata = {
  generatedAt: string;
  organizationId: string;
  focusDomainId: string | null;
  focusDiscussionId: string | null;
  discussionCount: number;
  opportunityCount: number;
  briefingCount: number;
  knowledgeAssetCount: number;
  domainCount: number;
  analysisCount: number;
  memoryVersion: string;
};

export type BusinessKnowledge = {
  description: string | null;
  voice: string | null;
  expertise: string | null;
  website: string | null;
  businessKnowledge: string | null;
  masterProfile: Record<string, unknown> | null;
  masterProfileVersion: string | null;
  homepageLearning: string | null;
  businessConstraints: string[];
  missingFields: string[];
  completenessScore: number;
  isBrainTrained: boolean;
};

export type MarketKnowledgeEntry = {
  domainId: string;
  domainName: string;
  market: string | null;
  discussionCount: number;
  analyzedDiscussionCount: number;
  confidence: number | null;
  isActive: boolean;
};

export type MarketKnowledge = {
  topMarkets: MarketKnowledgeEntry[];
  mostActiveDomains: MarketKnowledgeEntry[];
  domainCoverage: number;
  knowledgeGrowthDelta: number | null;
  recentActivityCount: number;
  totalDomains: number;
};

export type AudienceKnowledge = {
  buyerStageDistribution: Record<string, number>;
  topBuyerStages: Array<{ stage: string; count: number }>;
};

export type PainPointKnowledgeEntry = {
  painPoint: string;
  occurrences: number;
  lastSeen: string | null;
  primaryDomainId: string | null;
  primaryDomainName: string | null;
  confidence: number | null;
};

export type BuyingSignalKnowledgeEntry = {
  signal: string;
  count: number;
  lastSeen: string | null;
  confidence: number | null;
};

export type TerminologyKnowledgeEntry = {
  term: string;
  sources: string[];
  count: number;
};

export type CompetitorKnowledgeEntry = {
  name: string;
  mentions: number;
  lastSeen: string | null;
  domainId: string | null;
  domainName: string | null;
};

export type DecisionKnowledge = {
  briefingsApproved: number;
  briefingsNeedsRevision: number;
  briefingsRejected: number;
  briefingsDraft: number;
  opportunityStatusDistribution: Record<string, number>;
  discussionOutcomeDistribution: Record<string, number>;
  refreshIndicators: {
    staleDiscussions: number;
    analysesConsidered: number;
  };
};

export type ContentKnowledge = {
  deploymentAssetCount: number;
  blueprintCount: number;
  blueprintWithPromptsCount: number;
  knowledgeAssetCount: number;
  approvedBriefingAssetCount: number;
  latestBlueprintAt: string | null;
  latestKnowledgeAssetAt: string | null;
  averageEstimatedReuse: number | null;
  assetTypeCoverage: string[];
};

export type PatternKnowledge = {
  mostCommonBuyerStage: string | null;
  mostCommonObjection: string | null;
  mostCommonOpportunityReason: string | null;
  mostCommonRecommendation: string | null;
  mostCommonDeploymentType: string | null;
  mostActiveDomainId: string | null;
  mostActiveDomainName: string | null;
  highestOpportunityCategory: string | null;
};

export type PerformanceKnowledge = {
  averageOpportunityScore: number | null;
  averageBriefingConfidence: number | null;
  averageAnalysisConfidence: number | null;
  knowledgeConfidence: number | null;
  knowledgeConfidenceDelta: number | null;
};

export type ExecutiveMemory = {
  metadata: MemoryMetadata;
  businessKnowledge: BusinessKnowledge;
  marketKnowledge: MarketKnowledge;
  audienceKnowledge: AudienceKnowledge;
  terminologyKnowledge: TerminologyKnowledgeEntry[];
  competitorKnowledge: CompetitorKnowledgeEntry[];
  painPointKnowledge: PainPointKnowledgeEntry[];
  buyingSignalKnowledge: BuyingSignalKnowledgeEntry[];
  decisionKnowledge: DecisionKnowledge;
  contentKnowledge: ContentKnowledge;
  patternKnowledge: PatternKnowledge;
  performanceKnowledge: PerformanceKnowledge;
};

export type ExecutiveMemoryOrganizationRequiredError = Error & {
  name: "ExecutiveMemoryOrganizationRequiredError";
};
