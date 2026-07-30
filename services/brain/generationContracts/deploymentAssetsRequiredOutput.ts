import { REQUIRED_PERSONA_DEPLOYMENT_ASSET_KEYS } from "@/lib/personaDeploymentAssetContract";
import { REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS } from "@/lib/prospectDeploymentAssetContract";
import { OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS } from "@/services/ai/prompts/prospectDeploymentAssetsConstraints";
import {
  DEPLOYMENT_SECTION_LABELS,
  SHARED_PLAIN_TEXT_DEPLOYMENT_OUTPUT_RULES,
} from "@/services/ai/prompts/sharedPromptConstraints";

function formatRequiredHeadingBlock(keys: readonly string[]): string {
  return keys.map((key) => `${key}:`).join("\n");
}

/** All Prospect Deployment Asset headings requested on every generation run (14 Ready + always-generate extras including visual prompts). */
export function getProspectDeploymentGenerationHeadings(): string[] {
  return [
    ...REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
    ...OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  ];
}

/** Persona Stage 4: exactly the 14 required Ready headings (optional extras omitted). */
export function getPersonaDeploymentGenerationHeadings(): string[] {
  return [...REQUIRED_PERSONA_DEPLOYMENT_ASSET_KEYS];
}

/**
 * Required-output instructions for Deployment Assets (Prospect + Persona + Discussion).
 * Platforms are mutually exclusive: Prospect, Persona, or ordinary Discussion.
 */
export function buildDeploymentAssetsRequiredOutputInstructions(input: {
  isProspectSource: boolean;
  isPersonaSource?: boolean;
}): string {
  if (input.isProspectSource) {
    const generationHeadings = getProspectDeploymentGenerationHeadings();

    return [
      SHARED_PLAIN_TEXT_DEPLOYMENT_OUTPUT_RULES,
      "Generate all of these Prospect headings on every Prospect run (exact, each once):",
      formatRequiredHeadingBlock(generationHeadings),
      `Publication/Ready completeness evaluates only these 14 core headings: ${REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.join(", ")}.`,
      `Always generate these additional Prospect headings as well: ${OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS.join(", ")}. Knowledge Base may be shorter when verified facts are sparse — never invent facts.`,
    ].join("\n\n");
  }

  if (input.isPersonaSource) {
    const generationHeadings = getPersonaDeploymentGenerationHeadings();

    return [
      SHARED_PLAIN_TEXT_DEPLOYMENT_OUTPUT_RULES,
      "Generate all of these Persona headings on every Persona run (exact, each once):",
      formatRequiredHeadingBlock(generationHeadings),
      `Publication/Ready completeness requires all 14 Persona headings: ${REQUIRED_PERSONA_DEPLOYMENT_ASSET_KEYS.join(", ")}.`,
      "Do not emit Prospect outreach headings. Do not collapse output into PRIMARY_REPLY or unlabeled prose.",
    ].join("\n\n");
  }

  return [
    SHARED_PLAIN_TEXT_DEPLOYMENT_OUTPUT_RULES,
    "Required headings (exact, each once):",
    DEPLOYMENT_SECTION_LABELS,
  ].join("\n\n");
}
