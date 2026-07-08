export const REASONING_PIPELINE_VERSION = "reasoning_pipeline_v1";

export type EvidenceExtraction = {
  explicitBuyerNeed: string | null;
  statedPainPoints: string[];
  objections: string[];
  urgencySignals: string[];
  buyingIntent: string | null;
  decisionCriteria: string[];
  constraints: string[];
  requestedSolution: string | null;
  emotionalTone: string | null;
  quotedEvidenceSnippets: string[];
  missingInformation: string[];
  confidence: number;
};

export type RelevantMemory = {
  recurringObjections: string[];
  recurringBuyerConcerns: string[];
  priorWinningAngles: string[];
  priorRejectedAngles: string[];
  existingAssets: string[];
  existingPositioning: string | null;
  relevantDomainTerminology: string[];
  hasMemory: boolean;
};

export type BusinessReasoning = {
  realBusinessOpportunity: string;
  whyItMattersNow: string;
  highestLeverageMove: string;
  genericResponseToAvoid: string;
  whyAvoidGenericResponse: string;
  seniorOperatorAction: string;
  supportingEvidence: string[];
  memorySupport: string[];
  memoryContradictions: string[];
  risks: string[];
  confidence: number;
};

export type BusinessDecisionType =
  | "respond_directly"
  | "qualify_privately"
  | "publish_proof_asset"
  | "create_diagnostic"
  | "build_comparison_framework"
  | "create_implementation_teardown"
  | "create_readiness_assessment"
  | "create_case_study"
  | "ignore_monitor";

export type BusinessDecision = {
  decision: BusinessDecisionType;
  rationale: string;
  whyThisBeatsAlternatives: string;
  targetAudience: string;
  intendedOutcome: string;
  primaryCta: string;
  recommendedChannel: string;
  urgency: "low" | "medium" | "high" | "immediate";
  confidence: number;
  successMetric: string;
  whyThisAsset: string;
  recommendedAssetType: string;
};

export type ReasoningPipeline = {
  version: string;
  organizationId: string;
  discussionId: string | null;
  evidence: EvidenceExtraction;
  memory: RelevantMemory;
  reasoning: BusinessReasoning;
  decision: BusinessDecision;
};
