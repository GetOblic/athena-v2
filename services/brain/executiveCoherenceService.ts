import { validateSharedExecutiveStrategy } from "@/services/brain/executiveCoherence/executiveCoherenceHelpers";
import { validateOutputDiversity } from "@/services/brain/executiveCoherence/outputDiversityGuardrails";
import type {
  ExecutiveStrategy,
  OutputArtifactType,
} from "@/services/brain/executiveCoherence/executiveCoherenceTypes";

export {
  buildExecutiveStrategy,
  buildExecutiveStrategyFromUnderstanding,
} from "@/services/brain/executiveCoherence/executiveStrategyBuilder";

export {
  formatExecutiveStrategyForPrompt,
  validateSharedExecutiveStrategy,
} from "@/services/brain/executiveCoherence/executiveCoherenceHelpers";

export {
  getOutputResponsibility,
  getOutputResponsibilityForWorkflow,
  formatOutputResponsibilityForPrompt,
  listAllOutputResponsibilities,
  getResponsibilityVerb,
} from "@/services/brain/executiveCoherence/outputResponsibilityContracts";

export {
  validateOutputDiversity,
  validateStrategyAlignment,
  extractDeploymentFields,
  extractAdvisoryFields,
} from "@/services/brain/executiveCoherence/outputDiversityGuardrails";

export type {
  ExecutiveStrategy,
  BuildExecutiveStrategyParams,
  OutputArtifactType,
  OutputResponsibility,
  OutputResponsibilityVerb,
  OutputDiversityIssue,
  OutputDiversityValidationResult,
  StrategyAlignmentValidationResult,
} from "@/services/brain/executiveCoherence/executiveCoherenceTypes";

export { EXECUTIVE_STRATEGY_VERSION } from "@/services/brain/executiveCoherence/executiveCoherenceTypes";

export function validateExecutiveOutputCoherence(input: {
  strategies: ExecutiveStrategy[];
  outputs: Array<{ type: OutputArtifactType; text: string }>;
}): {
  strategyConsistent: boolean;
  diversityValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const strategyResult = validateSharedExecutiveStrategy(input.strategies);
  const diversityResult = validateOutputDiversity({ outputs: input.outputs });

  const errors = [...strategyResult.errors];
  const warnings: string[] = [];

  for (const issue of diversityResult.issues) {
    const message = `${issue.artifactA} vs ${issue.artifactB}: ${issue.reason}`;
    if (issue.severity === "error") {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }

  return {
    strategyConsistent: strategyResult.consistent,
    diversityValid: diversityResult.valid,
    errors,
    warnings,
  };
}
