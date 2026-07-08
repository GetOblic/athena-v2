import type { OpportunityPriorityKey } from "@/lib/opportunityPriority";
import type { MarketingDeliverableRecommendation } from "@/services/brain/executiveCoherence/executiveCoherenceTypes";
import type { AthenaBrainContext } from "@/services/brain/brainContextTypes";

export const EXECUTIVE_REASONING_VERSION = "executive_reasoning_v3_cognition";

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

export type MarketUnderstandingAssessment = {
  marketPattern: string | null;
  industryContext: string | null;
  discussionMaturity: "early" | "developing" | "mature";
  platform: string | null;
  surfaceTopic: string | null;
};

export type HiddenProblemAssessment = {
  hiddenMarketProblem: string;
  surfaceInterpretation: string;
  foundationalInsight: string;
  confidence: number;
};

export type BuyerPsychologyAssessment = {
  coreFear: string | null;
  desiredTransformation: string | null;
  emotionalBlocker: string | null;
  decisionTrigger: string | null;
  trustRequirement: string | null;
  perceivedRisk: string | null;
  hiddenMotivation: string | null;
  missingConfidence: string | null;
  urgencySource: string | null;
  primarySuccessMetric: string | null;
};

export type StrategicDifferentiationAssessment = {
  uniquePositioning: string[];
  competitiveAdvantage: string[];
  executiveBrainSignals: string[];
  differentiationStatement: string;
  recommendationsMustReflect: string[];
};

export type ContrarianThinkingAssessment = {
  conventionalAssumption: string;
  assumptionChallenge: string;
  overlookedOpportunity: string;
  surpriseInsight: string;
  strategicReframe: string;
  emergingTrend: string | null;
};

export type AssetStrategyAssessment = {
  selectedAssetType: MarketingDeliverableRecommendation;
  selectionRationale: string[];
  platformInfluence: string[];
  alternativeAssetsConsidered: string[];
  diversityAdjustment: string | null;
};

export type ExecutiveRecommendation = {
  whyThisAsset: string;
  whyNow: string;
  expectedBusinessOutcome: string;
  targetAudience: string;
  conversionMechanism: string;
  estimatedEffort: "low" | "medium" | "high";
  estimatedReusePotential: "low" | "medium" | "high";
  strategicRationale: string;
};

export type OpportunityQualityDimensions = {
  businessImpact: number;
  revenuePotential: number;
  marketFrequency: number;
  competitiveDifferentiation: number;
  authorityPositioning: number;
  contentLeverage: number;
  executiveUrgency: number;
  reusability: number;
  buyerIntent: number;
  psychologicalImportance: number;
  compositeScore: number;
};

export type ExecutiveIntelligencePipeline = {
  pipelineVersion: string;
  marketUnderstanding: MarketUnderstandingAssessment;
  hiddenProblem: HiddenProblemAssessment;
  buyerPsychology: BuyerPsychologyAssessment;
  strategicDifferentiation: StrategicDifferentiationAssessment;
  contrarianThinking: ContrarianThinkingAssessment;
  assetStrategy: AssetStrategyAssessment;
  executiveRecommendation: ExecutiveRecommendation;
  opportunityQuality: OpportunityQualityDimensions;
  suggestedOpportunityTitle: string;
  executiveCognition: ExecutiveCognitionLayers;
};

export type ExecutiveReflection = {
  whatSurprised: string | null;
  whatMattersMost: string | null;
  realBusinessProblem: string | null;
  marketMisunderstanding: string | null;
  conventionalAssumption: string | null;
  assumptionIsTrue: boolean | null;
  indirectConcern: string | null;
  strategistNotice: string | null;
  longTermOpportunity: string | null;
  reusableAssetOpportunity: string | null;
};

export type ExecutiveMemoryComparison = {
  historicalDataAvailable: boolean;
  recurringObjections: string[];
  recurringMisconceptions: string[];
  repeatedBuyingSignals: string[];
  repeatedEmotionalPatterns: string[];
  repeatedContentOpportunities: string[];
  repeatedPositioningOpportunities: string[];
  previousSimilarDiscussions: number;
  previousApprovedDecisions: number;
};

export type MarketPatternKind =
  | "recurring_market_trend"
  | "isolated_question"
  | "emerging_opportunity"
  | "misconception"
  | "competitive_weakness"
  | "positioning_opportunity"
  | "product_opportunity"
  | "curriculum_opportunity"
  | "reputation_opportunity";

export type MarketPatternClassification = {
  primaryPattern: MarketPatternKind;
  secondaryPatterns: MarketPatternKind[];
  analystSummary: string;
};

export type ContentGenerationObjectives = {
  businessObjective: string;
  psychologicalObjective: string;
  positioningObjective: string;
  conversationObjective: string;
  callToActionObjective: string;
};

export type ReusabilityAssessment = {
  evergreenPotential: "low" | "medium" | "high";
  reuseFormats: string[];
  longTermLeverage: string;
  curriculumImprovement: string | null;
  salesEnablementPotential: string | null;
};

export type StrategicCriticAssessment = {
  isGeneric: boolean;
  wouldAnotherBusinessReceiveSame: boolean;
  isDifferentiated: boolean;
  leveragesExecutiveBrain: boolean;
  strategistWouldApprove: boolean;
  critiqueNotes: string[];
  revisedRecommendation: string | null;
  assetRevised: boolean;
  finalAssetType: MarketingDeliverableRecommendation;
};

export type ExecutiveDecisionDocument = {
  hiddenMarketProblem: string;
  strategicInsight: string;
  businessOpportunity: string;
  competitiveAdvantage: string;
  buyerPsychologySummary: string;
  businessObjective: string;
  recommendedAssetType: MarketingDeliverableRecommendation;
  assetSelectionReason: string;
  positioningStrategy: string;
  successMetric: string;
  marketPattern: string;
  generationObjectives: ContentGenerationObjectives;
  reusability: ReusabilityAssessment;
};

export type ExecutiveCognitionLayers = {
  cognitionVersion: string;
  executiveReflection: ExecutiveReflection;
  executiveMemoryComparison: ExecutiveMemoryComparison;
  marketPatternClassification: MarketPatternClassification;
  strategicCritic: StrategicCriticAssessment;
  generationObjectives: ContentGenerationObjectives;
  reusabilityAssessment: ReusabilityAssessment;
  executiveDecisionDocument: ExecutiveDecisionDocument;
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
  executiveIntelligence: ExecutiveIntelligencePipeline;
};
