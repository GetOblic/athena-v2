import { REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS } from "@/lib/personaDeploymentAssetContract";
import { getPersonaPublishableDeploymentCatalogKeys } from "@/lib/personaIntelligenceAssetCatalog";
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

/**
 * Persona publishable Deployment catalog — exact Prospect generation headings (26).
 * Derived via getPersonaPublishableDeploymentCatalogKeys (Prospect constants).
 */
export function getPersonaPublishableDeploymentGenerationHeadings(): string[] {
  return getPersonaPublishableDeploymentCatalogKeys();
}

/** Persona Analysis Assets — 14 strategic headings (Call 2). */
export function getPersonaAnalysisGenerationHeadings(): string[] {
  return [...REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS];
}

/**
 * @deprecated Use getPersonaPublishableDeploymentGenerationHeadings or
 * getPersonaAnalysisGenerationHeadings. Kept for older tests that still name
 * the Analysis catalog via this helper — now returns Analysis headings only.
 */
export function getPersonaDeploymentGenerationHeadings(): string[] {
  return getPersonaAnalysisGenerationHeadings();
}

/**
 * Required-output instructions for Deployment Assets (Prospect + Persona + Discussion).
 * Platforms are mutually exclusive: Prospect, Persona, or ordinary Discussion.
 *
 * Persona uses packageKind to select Call 1 (publishable Deployment) or Call 2 (Analysis).
 */
export function buildDeploymentAssetsRequiredOutputInstructions(input: {
  isProspectSource: boolean;
  isPersonaSource?: boolean;
  /**
   * Persona-only: which V15 package this prompt requests.
   * Omitted / ignored for Prospect and Discussion.
   */
  personaPackageKind?: "publishable_deployment" | "analysis";
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
    const packageKind = input.personaPackageKind ?? "analysis";

    if (packageKind === "publishable_deployment") {
      const generationHeadings =
        getPersonaPublishableDeploymentGenerationHeadings();

      return [
        SHARED_PLAIN_TEXT_DEPLOYMENT_OUTPUT_RULES,
        "Generate all of these Persona publish-ready Deployment headings on every Persona run (exact, each once). This catalog equals the Prospect Deployment catalog:",
        formatRequiredHeadingBlock(generationHeadings),
        `Publication/Ready completeness evaluates only these 14 core Deployment headings: ${REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.join(", ")}.`,
        `Always generate these additional Deployment headings as well: ${OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS.join(", ")}. Knowledge Base may be shorter when verified facts are sparse — never invent facts.`,
        "Emit OBJECTION_ANTICIPATION (not OBJECTION_HANDLING) in this Deployment package.",
        "Do not emit Persona Analysis headings (PERSONA_EXECUTIVE_PROFILE, MESSAGING_FRAMEWORK, etc.) in this response.",
        "Do not collapse output into PRIMARY_REPLY or unlabeled prose.",
      ].join("\n\n");
    }

    const generationHeadings = getPersonaAnalysisGenerationHeadings();

    return [
      SHARED_PLAIN_TEXT_DEPLOYMENT_OUTPUT_RULES,
      "Generate all of these Persona Analysis headings on every Persona Analysis run (exact, each once):",
      formatRequiredHeadingBlock(generationHeadings),
      `Publication/Ready completeness requires all 14 Persona Analysis headings: ${REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS.join(", ")}.`,
      "Emit OBJECTION_HANDLING here (strategic Analysis). Do not emit OBJECTION_ANTICIPATION or other Prospect Deployment headings in this Analysis response.",
      "Do not collapse output into PRIMARY_REPLY or unlabeled prose.",
    ].join("\n\n");
  }

  return [
    SHARED_PLAIN_TEXT_DEPLOYMENT_OUTPUT_RULES,
    "Required headings (exact, each once):",
    DEPLOYMENT_SECTION_LABELS,
  ].join("\n\n");
}
