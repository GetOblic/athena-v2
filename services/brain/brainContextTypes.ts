import type { AthenaAssetBlueprint } from "@/services/assetBlueprints/assetBlueprintService";
import type { CommunityIntelligence } from "@/services/communityIntelligenceService";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";
import type { Discussion } from "@/services/discussionService";
import type { DiscussionUpdate } from "@/services/discussionUpdateService";
import type { AthenaIdentity } from "@/services/identity/identityService";
import type { Opportunity } from "@/services/opportunityService";
import type { AthenaReview } from "@/services/reviewService";

export const BRAIN_CONTEXT_LIMITS = {
  domains: 20,
  discussions: 10,
  analysesPerDiscussion: 5,
  opportunities: 10,
  briefings: 10,
  assetBlueprints: 10,
  knowledgeAssets: 20,
  discussionUpdates: 50,
  priorAnalyses: 5,
} as const;

export type BrainContextScope =
  | "organization"
  | "discussion"
  | "opportunity"
  | "briefing";

export type OrganizationContextSlice = {
  id: string;
  name: string;
  slug: string;
};

export type BusinessMemory = {
  identity: {
    userId: string | null;
    greetingName: string | null;
    aboutYou: string | null;
    expertise: string | null;
    website: string | null;
    brainStatus: string | null;
    masterProfile: Record<string, unknown> | null;
    masterProfileVersion: string | null;
    homepageLearning: string | null;
  } | null;
  missingFields: string[];
  isBrainTrained: boolean;
};

export type DomainMemoryEntry = {
  id: string;
  name: string;
  description: string | null;
  market: string | null;
  status: string;
  priority: number | null;
  platform: string;
  terminology: string[];
  competitors: string[];
  recurringQuestions: string | null;
  recurringObjections: string | null;
  emergingTrends: string | null;
  recommendedContentAngles: string | null;
  confidence: number | null;
  healthLabel: string | null;
  latestIntelligence: CommunityIntelligence | null;
};

export type DomainMemory = {
  domains: DomainMemoryEntry[];
  totalDomains: number;
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
};

export type DiscussionMemory = {
  recentDiscussions: DiscussionMemoryEntry[];
  recentAnalyzedDiscussions: DiscussionMemoryEntry[];
  highIntentDiscussions: DiscussionMemoryEntry[];
  recurringThemes: string[];
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
  discussionId: string | null;
};

export type OpportunityMemory = {
  recentOpportunities: OpportunityMemoryEntry[];
  highestScoring: OpportunityMemoryEntry | null;
  immediateAction: OpportunityMemoryEntry[];
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
  summary: string | null;
  opportunityId: string | null;
  discussionId: string | null;
};

export type BriefingMemory = {
  recentBriefings: BriefingMemoryEntry[];
  approvedBriefings: BriefingMemoryEntry[];
  needsRevisionBriefings: BriefingMemoryEntry[];
  statusDistribution: Record<string, number>;
  focus: {
    briefing: AthenaReview | null;
    linkedOpportunity: Opportunity | null;
    linkedDiscussion: Discussion | null;
    linkedBlueprint: AthenaAssetBlueprint | null;
  } | null;
};

export type AssetMemoryEntry = {
  id: string;
  assetTitle: string;
  assetType: string;
  discussionId: string | null;
  opportunityId: string | null;
  briefingId: string | null;
  hasPrompts: boolean;
  createdAt: string;
};

export type AssetMemory = {
  recentBlueprints: AssetMemoryEntry[];
  focusBlueprint: AthenaAssetBlueprint | null;
  deploymentAssetFields: {
    source: "analysis" | "briefing" | "opportunity" | null;
    suggestedCta: string | null;
    recommendedResponse: string | null;
    cta: string | null;
    parsedAssetCount: number;
  };
};

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

export type KnowledgeMemory = {
  assets: KnowledgeAssetEntry[];
  approvedBriefingKnowledgeCount: number;
};

export type FeedbackSignals = {
  briefingStatuses: {
    draft: number;
    approved: number;
    needsRevision: number;
    rejected: number;
  };
  opportunitySalesStatuses: Record<string, number>;
  discussionLifecycleStatuses: Record<string, number>;
  hasGeneratedAssets: boolean;
  missingAssetPrompts: number;
  staleDiscussionCount: number;
  focusSignals: {
    briefingStatus: string | null;
    opportunityStatus: string | null;
    discussionStatus: string | null;
    hasLinkedBlueprint: boolean;
    hasDeploymentAssets: boolean;
  };
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

/** Structured Brain Engine context — distinct from legacy prompt identity context. */
export type BrainEngineContext = {
  organization: OrganizationContextSlice;
  scope: BrainContextScope;
  identity: BusinessMemory;
  businessMemory: BusinessMemory;
  domainMemory: DomainMemory;
  discussionMemory: DiscussionMemory;
  opportunityMemory: OpportunityMemory;
  briefingMemory: BriefingMemory;
  assetMemory: AssetMemory;
  knowledgeMemory: KnowledgeMemory;
  feedbackSignals: FeedbackSignals;
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
