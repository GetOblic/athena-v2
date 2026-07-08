import type { AthenaBrainContext } from "@/services/brain/brainContextTypes";
import {
  formatExecutiveReasoningForPrompt,
  formatIdentityFromBrainContext,
} from "@/services/brain/executiveReasoningHelpers";
import type { GenerationContract } from "@/services/brain/generationContracts/generationContractTypes";

export function assembleExecutiveGenerationContextBlock(input: {
  brainContext: AthenaBrainContext;
  generationContract: GenerationContract;
}): string {
  const identityBlock = formatIdentityFromBrainContext(input.brainContext);
  const reasoningBlock = formatExecutiveReasoningForPrompt(
    input.brainContext.executiveReasoning,
  );
  const contractBlock = formatGenerationContractForPrompt(
    input.generationContract,
  );

  return [identityBlock, reasoningBlock, contractBlock].join("\n\n").trim();
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
    "Use Executive Reasoning for priorities; use Brain Context for evidence only.",
  ];

  return sections.filter(Boolean).join("\n").trim();
}
