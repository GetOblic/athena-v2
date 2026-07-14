import { REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS } from "@/lib/prospectDeploymentAssetContract";
import { OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS } from "@/services/ai/prompts/prospectDeploymentAssetsConstraints";
import {
  DEPLOYMENT_SECTION_LABELS,
  SHARED_PLAIN_TEXT_DEPLOYMENT_OUTPUT_RULES,
} from "@/services/ai/prompts/sharedPromptConstraints";

function formatRequiredHeadingBlock(keys: readonly string[]): string {
  return keys.map((key) => `${key}:`).join("\n");
}

/** All Prospect Deployment Asset headings requested on every generation run (14 Ready + 4 always-generate). */
export function getProspectDeploymentGenerationHeadings(): string[] {
  return [
    ...REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
    ...OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  ];
}

/**
 * Required-output instructions for Deployment Assets (Prospect + Discussion).
 * Prospects: always request all 18 headings; Ready still evaluates only the 14 core keys.
 * Discussion: Discussion channel labels only.
 */
export function buildDeploymentAssetsRequiredOutputInstructions(input: {
  isProspectSource: boolean;
}): string {
  if (!input.isProspectSource) {
    return [
      SHARED_PLAIN_TEXT_DEPLOYMENT_OUTPUT_RULES,
      "Required headings (exact, each once):",
      DEPLOYMENT_SECTION_LABELS,
    ].join("\n\n");
  }

  const generationHeadings = getProspectDeploymentGenerationHeadings();

  return [
    SHARED_PLAIN_TEXT_DEPLOYMENT_OUTPUT_RULES,
    "Generate all of these Prospect headings on every Prospect run (exact, each once):",
    formatRequiredHeadingBlock(generationHeadings),
    `Publication/Ready completeness evaluates only these 14 core headings: ${REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.join(", ")}.`,
    `Always generate these additional Prospect headings as well: ${OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS.join(", ")}. Knowledge Base may be shorter when verified facts are sparse — never invent facts.`,
  ].join("\n\n");
}
