import type { AthenaBrainContext } from "@/services/brain/brainContextTypes";
import type { ExecutiveReasoning } from "@/services/brain/executiveReasoningTypes";
import type { GenerationContract } from "@/services/brain/generationContracts/generationContractTypes";
import {
  GenerationContractOrganizationRequiredError,
  GenerationContractValidationError,
} from "@/services/brain/generationContracts/generationContractTypes";

export function validateGenerationContract(input: {
  contract: GenerationContract;
  brainContext: AthenaBrainContext;
  executiveReasoning: ExecutiveReasoning;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const { contract, brainContext, executiveReasoning } = input;

  if (!contract.metadata.organizationId?.trim()) {
    errors.push("organizationId is required in contract metadata.");
  }

  if (contract.metadata.organizationId !== brainContext.organization.id) {
    errors.push("Contract organization does not match Brain Context organization.");
  }

  if (brainContext.organization.id !== executiveReasoning.metadata.organizationId) {
    errors.push(
      "Executive Reasoning organization does not match Brain Context organization.",
    );
  }

  if (contract.qualityRequirements.requireReasoningAttached && !executiveReasoning) {
    errors.push("Executive Reasoning must be attached.");
  }

  if (contract.requiredSections.sections.length === 0) {
    errors.push("Required sections must be populated.");
  }

  if (contract.validationRules.requiredChecks.length === 0) {
    errors.push("Validation rules must initialize.");
  }

  if (
    contract.evidenceRequirements.requireBusinessContext &&
    !brainContext.identityMemory.aboutYou &&
    !brainContext.identityMemory.expertise &&
    !brainContext.businessMemory.isBrainTrained
  ) {
    errors.push("Business context is unavailable for this contract.");
  }

  if (
    contract.evidenceRequirements.requireMarketEvidence &&
    brainContext.marketEvidence.length <
      contract.evidenceRequirements.minimumEvidenceCount
  ) {
    errors.push("Insufficient market evidence for contract requirements.");
  }

  if (contract.metadata.workflowType !== contract.purpose.workflowType) {
    errors.push("Workflow type mismatch between metadata and purpose.");
  }

  return { valid: errors.length === 0, errors };
}

export function assertValidGenerationContract(input: {
  contract: GenerationContract;
  brainContext: AthenaBrainContext;
  executiveReasoning: ExecutiveReasoning;
}): void {
  const result = validateGenerationContract(input);
  if (!result.valid) {
    throw new GenerationContractValidationError(result.errors.join(" "));
  }
}

export function assertGenerationContractOrganization(
  organizationId: string | null | undefined,
): asserts organizationId is string {
  if (!organizationId?.trim()) {
    throw new GenerationContractOrganizationRequiredError();
  }
}

