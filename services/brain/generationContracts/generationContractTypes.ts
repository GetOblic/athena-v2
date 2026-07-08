import type { AthenaBrainContext } from "@/services/brain/brainContextTypes";
import type { ExecutiveReasoning } from "@/services/brain/executiveReasoningTypes";
import type { ExecutiveUnderstanding } from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";
import type { ExecutiveStrategy } from "@/services/brain/executiveCoherence/executiveCoherenceTypes";
import type { ReasoningPipeline } from "@/services/brain/reasoningPipeline/reasoningPipelineTypes";

export const GENERATION_CONTRACT_VERSION = "generation_contract_v1";

export type GenerationWorkflowType =
  | "discussion_analysis"
  | "opportunity"
  | "executive_briefing"
  | "deployment_asset"
  | "strategic_blueprint";

export type GenerationPurpose = {
  workflowType: GenerationWorkflowType;
  summary: string;
  audience: string;
};

export type RequiredSections = {
  sections: string[];
  outputFormat: "json" | "structured_text";
};

export type EvidenceRequirements = {
  minimumEvidenceCount: number;
  requireExecutiveReasoning: boolean;
  requireBusinessContext: boolean;
  requireMarketEvidence: boolean;
  requiredTerminology: string[];
};

export type OutputRequirements = {
  requiredFields: string[];
  deploymentSections?: string[];
  jsonOnly: boolean;
  noMarkdown: boolean;
};

export type QualityRequirements = {
  minimumCompletenessScore: number;
  requireReasoningAttached: boolean;
  requireOrganizationMatch: boolean;
  mandatorySections: string[];
};

export type ToneRequirements = {
  voice: string | null;
  positioning: string | null;
  recommendedDirection: string;
  nonSalesy: boolean;
  noOverpromise: boolean;
};

export type ForbiddenBehaviors = {
  behaviors: string[];
};

export type ValidationRules = {
  rules: string[];
  requiredChecks: string[];
};

export type ContractMetadata = {
  generatedAt: string;
  organizationId: string;
  workflowType: GenerationWorkflowType;
  contractVersion: string;
  reasoningVersion: string | null;
  memoryVersion: string | null;
  learningVersion: string | null;
  scope: AthenaBrainContext["scope"];
};

export type GenerationContract = {
  metadata: ContractMetadata;
  purpose: GenerationPurpose;
  requiredSections: RequiredSections;
  evidenceRequirements: EvidenceRequirements;
  outputRequirements: OutputRequirements;
  qualityRequirements: QualityRequirements;
  toneRequirements: ToneRequirements;
  forbiddenBehaviors: ForbiddenBehaviors;
  validationRules: ValidationRules;
};

export type BuildGenerationContractParams = {
  workflowType: GenerationWorkflowType;
  organizationId: string;
  brainContext: AthenaBrainContext;
  executiveReasoning: ExecutiveReasoning;
};

export type GenerationBundle = {
  brainContext: AthenaBrainContext;
  executiveReasoning: ExecutiveReasoning;
  executiveUnderstanding: ExecutiveUnderstanding;
  executiveStrategy: ExecutiveStrategy;
  generationContract: GenerationContract;
  reasoningPipeline: ReasoningPipeline;
};

export type ResolveGenerationBundleParams = {
  workflowType: GenerationWorkflowType;
  organizationId: string;
  discussionId?: string;
  opportunityId?: string;
  briefingId?: string;
  domainId?: string;
};

export class GenerationContractOrganizationRequiredError extends Error {
  constructor(message = "organizationId is required.") {
    super(message);
    this.name = "GenerationContractOrganizationRequiredError";
  }
}

export class GenerationContractValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationContractValidationError";
  }
}
