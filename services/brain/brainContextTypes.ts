import type { AthenaAssetBlueprint } from "@/services/assetBlueprints/assetBlueprintService";
import type { CommunityIntelligence } from "@/services/communityIntelligenceService";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";
import type { Discussion } from "@/services/discussionService";
import type { DiscussionUpdate } from "@/services/discussionUpdateService";
import type { AthenaIdentity } from "@/services/identity/identityService";
import type { Opportunity } from "@/services/opportunityService";
import type { ProductionIntelligence } from "@/services/productionIntelligenceService";
import type { AthenaReview } from "@/services/reviewService";
import type { DashboardStats } from "@/services/dashboardService";
import type { TodaysIntelligence } from "@/services/todaysIntelligenceService";
import type { ExecutiveMemory } from "@/services/brain/executiveMemoryTypes";
import type {
  ExecutiveLearningSummary,
  MarketEvidenceEntry,
  PromotionCandidate,
} from "@/services/brain/executiveLearningTypes";
import type { ExecutiveReasoning } from "@/services/brain/executiveReasoningTypes";

export const MAX_DISCUSSIONS_CONTEXT = 10;
export const MAX_BRIEFINGS_CONTEXT = 10;
export const MAX_OPPORTUNITIES_CONTEXT = 10;
export const MAX_BLUEPRINTS_CONTEXT = 10;
export const MAX_KNOWLEDGE_CONTEXT = 20;
export const MAX_DOMAINS_CONTEXT = 20;
export const MAX_COMMUNITY_INTELLIGENCE_CONTEXT = 5;
export const MAX_PRODUCTION_INTELLIGENCE_CONTEXT = 5;
export const MAX_PRIOR_ANALYSES_CONTEXT = 5;
export const MAX_DISCUSSION_UPDATES_CONTEXT = 50;

/** @deprecated Use MAX_* constants — retained for Sprint 2 compatibility */
export const BRAIN_CONTEXT_LIMITS = {
  domains: MAX_DOMAINS_CONTEXT,
  discussions: MAX_DISCUSSIONS_CONTEXT,
  analysesPerDiscussion: MAX_PRIOR_ANALYSES_CONTEXT,
  opportunities: MAX_OPPORTUNITIES_CONTEXT,
  briefings: MAX_BRIEFINGS_CONTEXT,
  assetBlueprints: MAX_BLUEPRINTS_CONTEXT,
  knowledgeAssets: MAX_KNOWLEDGE_CONTEXT,
  discussionUpdates: MAX_DISCUSSION_UPDATES_CONTEXT,
  priorAnalyses: MAX_PRIOR_ANALYSES_CONTEXT,
} as const;

export type BrainContextScope =
  | "organization"
  | "discussion"
  | "opportunity"
  | "briefing"
  | "domain";

export type BuildBrainContextParams = {
  organizationId: string;
  discussionId?: string;
  opportunityId?: string;
  briefingId?: string;
  domainId?: string;
};

export type OrganizationMemory = {
  id: string;
  name: string;
  slug: string;
};

export type OrganizationContextSlice = OrganizationMemory;

export type IdentityProfileSlice = {
  userId: string | null;
  greetingName: string | null;
  aboutYou: string | null;
  expertise: string | null;
  website: string | null;
  brainStatus: string | null;
  masterProfile: Record<string, unknown> | null;
  masterProfileVersion: string | null;
  homepageLearning: string | null;
};

export type IdentityMemory = IdentityProfileSlice & {
  missingFields: string[];
  isBrainTrained: boolean;
  completenessScore: number;
};

export type BusinessMemory = {
  identity: IdentityProfileSlice | null;
  missingFields: string[];
  isBrainTrained: boolean;
  completenessScore: number;
};

export type DomainLearningTimelineSummary = {
  eventCount: number;
  latestEventTitle: string | null;
  latestEventTimestamp: string | null;
};

export type DomainMemoryEntry = {
  id: string;
  name: string;
  description: string | null;
  market: string | null;
  niche: string | null;
  status: string;
  priority: number | null;
  platform: string;
  isActive: boolean;
  terminology: string[];
  competitors: string[];
  recurringQuestions: string | null;
  recurringObjections: string | null;
  emergingTrends: string | null;
  recommendedContentAngles: string | null;
  athenaUnderstanding: string | null;
  confidence: number | null;
  healthLabel: string | null;
  healthTone: string | null;
  learningTimelineSummary: DomainLearningTimelineSummary | null;
  latestIntelligence: CommunityIntelligence | null;
};

export type DomainMemory = {
  domains: DomainMemoryEntry[];
  totalDomains: number;
  activeDomainCount: number;
  focusDomainId: string | null;
};

export type DiscussionMemoryEntry = {
  id: string;
  title: string;
  status: string;
  opportunityScore: number;
  communityId: string | null;
  hasAnalysis: boolean;
  summary: string | null;
  lastActivity: string | null;
  ageDays: number | null;
};

export type DiscussionMemory = {
  recentDiscussions: DiscussionMemoryEntry[];
  recentAnalyzedDiscussions: DiscussionMemoryEntry[];
  highIntentDiscussions: DiscussionMemoryEntry[];
  monitoringDiscussions: DiscussionMemoryEntry[];
  recurringThemes: string[];
  lifecycleDistribution: Record<string, number>;
  focus: {
    discussion: Discussion | null;
    threadUpdates: DiscussionUpdate[];
    latestAnalysis: DiscussionAnalysis | null;
    priorAnalyses: DiscussionAnalysis[];
    linkedOpportunity: Opportunity | null;
    linkedBriefing: AthenaReview | null;
    linkedBlueprint: AthenaAssetBlueprint | null;
  } | null;
};

export type OpportunityMemoryEntry = {
  id: string;
  title: string;
  score: number;
  status: string;
  urgency: string | null;
  confidence: number | null;
  discussionId: string | null;
  latestActivity: string | null;
};

export type OpportunityQueueMemory = {
  immediateAction: OpportunityMemoryEntry[];
  highIntent: OpportunityMemoryEntry[];
  monitor: OpportunityMemoryEntry[];
  lowPriority: OpportunityMemoryEntry[];
};

export type OpportunityMemory = {
  recentOpportunities: OpportunityMemoryEntry[];
  highestScoring: OpportunityMemoryEntry | null;
  queues: OpportunityQueueMemory;
  statusDistribution: Record<string, number>;
  focus: {
    opportunity: Opportunity | null;
    linkedDiscussion: Discussion | null;
    linkedBriefing: AthenaReview | null;
    deploymentReadinessKey: string | null;
    deploymentAssetsAvailable: boolean;
    linkedBlueprint: AthenaAssetBlueprint | null;
  } | null;
};

export type BriefingMemoryEntry = {
  id: string;
  status: string;
  confidence: number;
  buyerStage: string | null;
  summary: string | null;
  opportunityId: string | null;
  discussionId: string | null;
  updatedAt: string | null;
};

export type BriefingMemory = {
  recentBriefings: BriefingMemoryEntry[];
  approvedBriefings: BriefingMemoryEntry[];
  needsRevisionBriefings: BriefingMemoryEntry[];
  rejectedBriefings: BriefingMemoryEntry[];
  draftBriefings: BriefingMemoryEntry[];
  statusDistribution: Record<string, number>;
  buyerStageDistribution: Record<string, number>;
  focus: {
    briefing: AthenaReview | null;
    linkedOpportunity: Opportunity | null;
    linkedDiscussion: Discussion | null;
    linkedBlueprint: AthenaAssetBlueprint | null;
  } | null;
};

export type BlueprintMemoryEntry = {
  id: string;
  assetTitle: string;
  assetType: string;
  businessGoal: string | null;
  targetAudience: string | null;
  estimatedReuse: number | null;
  discussionId: string | null;
  opportunityId: string | null;
  briefingId: string | null;
  hasPrompts: boolean;
  createdAt: string;
};

export type BlueprintMemory = {
  recentBlueprints: BlueprintMemoryEntry[];
  focusBlueprint: AthenaAssetBlueprint | null;
  assetTypes: string[];
  businessGoals: string[];
  targetAudiences: string[];
  averageEstimatedReuse: number | null;
  deploymentAssetFields: {
    source: "analysis" | "briefing" | "opportunity" | null;
    suggestedCta: string | null;
    recommendedResponse: string | null;
    cta: string | null;
    parsedAssetCount: number;
  };
};

/** @deprecated Use BlueprintMemory — Sprint 2 alias */
export type AssetMemory = BlueprintMemory;

export type AssetMemoryEntry = BlueprintMemoryEntry;

export type KnowledgeAssetEntry = {
  id: string;
  title: string;
  category: string;
  assetType: string;
  summary: string | null;
  communityId: string | null;
  sourceType: string | null;
  sourceId: string | null;
  rating: number | null;
  timesUsed: number;
  tags: string[];
};

export type CommunityIntelligenceEntry = {
  id: string;
  communityId: string | null;
  executiveSummary: string | null;
  confidence: number | null;
  createdAt: string;
};

export type ProductionIntelligenceEntry = {
  id: string;
  communityId: string | null;
  contentTheme: string | null;
  confidence: number | null;
  createdAt: string;
};

export type KnowledgeMemory = {
  assets: KnowledgeAssetEntry[];
  approvedBriefingKnowledgeCount: number;
  communityIntelligence: CommunityIntelligenceEntry[];
  productionIntelligence: ProductionIntelligenceEntry[];
  knowledgeConfidence: number | null;
  knowledgeConfidenceDelta: number | null;
};

export type FeedbackMemory = {
  briefingStatuses: {
    draft: number;
    approved: number;
    needsRevision: number;
    rejected: number;
  };
  opportunitySalesStatuses: Record<string, number>;
  discussionLifecycleStatuses: Record<string, number>;
  approvalCount: number;
  revisionRequestCount: number;
  hasGeneratedAssets: boolean;
  missingAssetPrompts: number;
  staleDiscussionCount: number;
  deploymentReadinessDistribution: Record<string, number>;
  focusSignals: {
    briefingStatus: string | null;
    opportunityStatus: string | null;
    discussionStatus: string | null;
    hasLinkedBlueprint: boolean;
    hasDeploymentAssets: boolean;
  };
};

/** @deprecated Use FeedbackMemory — Sprint 2 alias */
export type FeedbackSignals = FeedbackMemory;

export type OperationalMemory = {
  dashboard: DashboardStats;
  todaysIntelligence: TodaysIntelligence;
  queueCounts: {
    immediateActionOpportunities: number;
    highIntentOpportunities: number;
    monitorOpportunities: number;
    lowPriorityOpportunities: number;
    draftBriefings: number;
    needsRevisionBriefings: number;
    approvedBriefings: number;
    rejectedBriefings: number;
    pendingEditorialTotal: number;
    newDiscussions: number;
    strategicBlueprints: number;
  };
};

export type ContextWarnings = {
  codes: string[];
  messages: string[];
};

export type BrainSnapshot = {
  brainHealth: "ready" | "partial" | "untrained";
  organizationSummary: string;
  businessSummary: string;
  marketSummary: string;
  activeDomains: number;
  priorityOpportunities: number;
  editorialQueue: number;
  deploymentQueue: number;
  knowledgeSummary: string;
  feedbackSummary: string;
  warnings: string[];
};

export type ContextSummary = {
  scope: BrainContextScope;
  totalDomains: number;
  totalDiscussionsConsidered: number;
  totalOpportunitiesConsidered: number;
  totalBriefingsConsidered: number;
  totalKnowledgeAssetsConsidered: number;
  highestOpportunityScore: number | null;
  pendingBriefingCount: number;
  approvedBriefingCount: number;
  needsRevisionCount: number;
  missingBrainSetupFields: string[];
  warnings: string[];
};

export type AthenaBrainContext = {
  organization: OrganizationMemory;
  scope: BrainContextScope;
  businessMemory: BusinessMemory;
  identityMemory: IdentityMemory;
  domainMemory: DomainMemory;
  discussionMemory: DiscussionMemory;
  opportunityMemory: OpportunityMemory;
  briefingMemory: BriefingMemory;
  blueprintMemory: BlueprintMemory;
  knowledgeMemory: KnowledgeMemory;
  feedbackMemory: FeedbackMemory;
  operationalMemory: OperationalMemory;
  executiveMemory: ExecutiveMemory;
  executiveLearning: ExecutiveLearningSummary;
  marketEvidence: MarketEvidenceEntry[];
  promotionCandidates: PromotionCandidate[];
  executiveReasoning: ExecutiveReasoning;
  contextWarnings: ContextWarnings;
  snapshot: BrainSnapshot;
  contextSummary: ContextSummary;
  builtAt: string;
};

/** Sprint 2 core context — use AthenaBrainContext for the executive layer */
export type BrainEngineContext = {
  organization: OrganizationMemory;
  scope: BrainContextScope;
  identity: BusinessMemory;
  businessMemory: BusinessMemory;
  domainMemory: DomainMemory;
  discussionMemory: DiscussionMemory;
  opportunityMemory: OpportunityMemory;
  briefingMemory: BriefingMemory;
  assetMemory: BlueprintMemory;
  knowledgeMemory: KnowledgeMemory;
  feedbackSignals: FeedbackMemory;
  contextSummary: ContextSummary;
  builtAt: string;
};

export type BuildBrainContextForDiscussionParams = {
  organizationId: string;
  discussionId: string;
};

export type BuildBrainContextForOpportunityParams = {
  organizationId: string;
  opportunityId: string;
};

export type BuildBrainContextForBriefingParams = {
  organizationId: string;
  briefingId: string;
};

export type IdentityRecord = AthenaIdentity;

export type { ProductionIntelligence };
