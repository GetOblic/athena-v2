import type { GenerationWorkflowType } from "@/services/brain/generationContracts/generationContractTypes";
import type { ExecutiveUnderstanding } from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";

export const EXECUTIVE_STRATEGY_VERSION = "executive_strategy_v1";

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
