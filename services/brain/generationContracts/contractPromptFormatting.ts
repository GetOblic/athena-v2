import { formatExecutiveStrategyForPrompt } from "@/services/brain/executiveCoherence/executiveCoherenceHelpers";
import { formatOutputResponsibilityForPrompt } from "@/services/brain/executiveCoherence/outputResponsibilityContracts";
import type { ExecutiveStrategy } from "@/services/brain/executiveCoherence/executiveCoherenceTypes";
import {
  formatExecutiveCampaignNarrativeForPrompt,
  formatExecutiveOutputReviewForPrompt,
} from "@/services/brain/executiveOutputReviewHelpers";
import type { ExecutiveUnderstanding } from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";
import type { GenerationContract } from "@/services/brain/generationContracts/generationContractTypes";

export function assembleExecutiveGenerationContextBlock(input: {
  executiveStrategy: ExecutiveStrategy;
  generationContract: GenerationContract;
  executiveUnderstanding?: ExecutiveUnderstanding;
  qualityRefinementSuffix?: string;
}): string {
  const strategyBlock = formatExecutiveStrategyForPrompt(input.executiveStrategy);
  const responsibilityBlock = formatOutputResponsibilityForPrompt(
    input.generationContract.purpose.workflowType,
  );
  const contractBlock = formatGenerationContractForPrompt(
    input.generationContract,
  );

  const campaignBlock =
    input.executiveUnderstanding?.executiveCampaignNarrative
      ? formatExecutiveCampaignNarrativeForPrompt(
          input.executiveUnderstanding.executiveCampaignNarrative,
        )
      : "";

  const reviewBlock =
    input.executiveUnderstanding?.executiveOutputReview &&
    input.executiveUnderstanding.executiveCampaignNarrative
      ? formatExecutiveOutputReviewForPrompt(
          input.executiveUnderstanding.executiveOutputReview,
          input.executiveUnderstanding.executiveCampaignNarrative,
        )
      : "";

  const refinementBlock = input.qualityRefinementSuffix?.trim()
    ? input.qualityRefinementSuffix.trim()
    : "";

  return [
    strategyBlock,
    campaignBlock,
    reviewBlock,
    responsibilityBlock,
    contractBlock,
    refinementBlock,
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function formatGenerationContractForPrompt(
  contract: GenerationContract,
): string {
  const sections = [
    "ATHENA GENERATION CONTRACT:",
    "",
    "PURPOSE:",
    `- Workflow: ${contract.purpose.workflowType}`,
    `- Summary: ${contract.purpose.summary}`,
    `- Audience: ${contract.purpose.audience}`,
    "",
    "REQUIRED SECTIONS:",
    ...contract.requiredSections.sections.map((section) => `- ${section}`),
    "",
    "OUTPUT REQUIREMENTS:",
    `- Format: ${contract.requiredSections.outputFormat}`,
    `- JSON only: ${contract.outputRequirements.jsonOnly ? "yes" : "no"}`,
    `- No markdown: ${contract.outputRequirements.noMarkdown ? "yes" : "no"}`,
    contract.outputRequirements.deploymentSections?.length
      ? `- Deployment sections: ${contract.outputRequirements.deploymentSections.join(", ")}`
      : "",
    "",
    "EVIDENCE REQUIREMENTS:",
    `- Minimum evidence count: ${contract.evidenceRequirements.minimumEvidenceCount}`,
    `- Executive reasoning required: ${contract.evidenceRequirements.requireExecutiveReasoning ? "yes" : "no"}`,
    `- Business context required: ${contract.evidenceRequirements.requireBusinessContext ? "yes" : "no"}`,
    contract.evidenceRequirements.requiredTerminology.length
      ? `- Preferred terminology: ${contract.evidenceRequirements.requiredTerminology.join(", ")}`
      : "- Preferred terminology: none recorded",
    "",
    "TONE REQUIREMENTS:",
    `- Recommended direction: ${contract.toneRequirements.recommendedDirection}`,
    `- Non-salesy: ${contract.toneRequirements.nonSalesy ? "yes" : "no"}`,
    `- No overpromise: ${contract.toneRequirements.noOverpromise ? "yes" : "no"}`,
    "",
    "FORBIDDEN BEHAVIORS:",
    ...contract.forbiddenBehaviors.behaviors.map((behavior) => `- ${behavior}`),
    "",
    "VALIDATION RULES:",
    ...contract.validationRules.rules.map((rule) => `- ${rule}`),
    "",
    "INSTRUCTIONS:",
    "Follow this contract exactly. Do not invent structure outside required sections.",
    "Express the shared Executive Strategy through this deliverable's unique responsibility.",
    "Do not copy wording or structure from other deliverable types.",
  ];

  return sections.filter(Boolean).join("\n").trim();
}
