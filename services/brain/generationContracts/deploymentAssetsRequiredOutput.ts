import { REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS } from "@/lib/prospectDeploymentAssetContract";
import {
  DEPLOYMENT_SECTION_LABELS,
  SHARED_PLAIN_TEXT_DEPLOYMENT_OUTPUT_RULES,
} from "@/services/ai/prompts/sharedPromptConstraints";

function formatRequiredHeadingBlock(keys: readonly string[]): string {
  return keys.map((key) => `${key}:`).join("\n");
}

/**
 * Required-output instructions for Deployment Assets (Prospect + Discussion).
 * Uses the canonical Prospect key list for Prospects; Discussion channel labels otherwise.
 */
export function buildDeploymentAssetsRequiredOutputInstructions(input: {
  isProspectSource: boolean;
}): string {
  const headingBlock = input.isProspectSource
    ? formatRequiredHeadingBlock(REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS)
    : DEPLOYMENT_SECTION_LABELS;

  return [
    SHARED_PLAIN_TEXT_DEPLOYMENT_OUTPUT_RULES,
    "Required headings (exact, each once):",
    headingBlock,
  ].join("\n\n");
}
