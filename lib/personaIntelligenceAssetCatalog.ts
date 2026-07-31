/**
 * V15 Persona Intelligence dual-package catalog.
 *
 * Persona publishable Deployment Assets reuse the exact Prospect generation
 * catalog (26 keys). Persona Analysis Assets keep the existing 14 strategic keys.
 *
 * Combined suggested_cta order (deterministic):
 * 1. 14 required Prospect Deployment Assets
 * 2. 12 optional Prospect Deployment Assets (Prospect catalog order)
 * 3. 14 Persona Analysis Assets
 *
 * Key collision: OBJECTION_ANTICIPATION is Deployment-only;
 * OBJECTION_HANDLING is Analysis-only. Never apply the Prospect alias when
 * splitting a Persona combined blob.
 */

import {
  REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS,
  type RequiredPersonaAnalysisAssetKey,
  IncompletePersonaDeploymentAssetsError,
  IncompletePersonaPublicationError,
  validatePersonaAnalysisAssetPayload,
} from "@/lib/personaDeploymentAssetContract";
import {
  REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  type RequiredProspectDeploymentAssetKey,
  validateProspectDeploymentAssetPayload,
} from "@/lib/prospectDeploymentAssetContract";
import { OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS } from "@/services/ai/prompts/prospectDeploymentAssetsConstraints";

/**
 * Exact Prospect generation catalog (14 required + 12 optional).
 * Derived from Prospect contract constants — not a divergent hardcoded list.
 */
export function getPersonaPublishableDeploymentCatalogKeys(): string[] {
  return [
    ...REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
    ...OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  ];
}

export function getPersonaAnalysisCatalogKeys(): string[] {
  return [...REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS];
}

/** Ready/publication gating Deployment keys for Persona (same 14 as Prospect). */
export const PERSONA_DEPLOYMENT_READY_KEYS = [
  ...REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
] as const;

export type PersonaIntelligencePackageKind =
  | "v15_dual"
  | "legacy_analysis_only"
  | "empty"
  | "unrecognized";

export type PersonaIntelligenceSplit = {
  deploymentCta: string;
  analysisCta: string;
  deploymentKeys: string[];
  analysisKeys: RequiredPersonaAnalysisAssetKey[];
  packageKind: PersonaIntelligencePackageKind;
};

const ANALYSIS_KEY_SET = new Set<string>(REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS);

/**
 * All headings that may appear in a Persona suggested_cta blob.
 * Longer keys first so FOLLOW_UP_EMAIL wins over FOLLOW_UP if ever present.
 */
function personaCombinedHeadingPattern(): RegExp {
  const keys = [
    ...getPersonaPublishableDeploymentCatalogKeys(),
    ...REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS,
  ].sort((a, b) => b.length - a.length);
  return new RegExp(`(?:^|\\n)(${keys.join("|")}):[ \\t]*`, "g");
}

type ExtractedBlock = { key: string; content: string };

function extractExactCanonicalBlocks(value?: string | null): ExtractedBlock[] {
  if (!value?.trim()) return [];

  const pattern = personaCombinedHeadingPattern();
  const matches = [...value.matchAll(pattern)];
  const seen = new Set<string>();
  const blocks: ExtractedBlock[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const key = match[1];
    if (!key || seen.has(key)) continue;

    const start = (match.index ?? 0) + match[0].length;
    const next = matches[index + 1];
    const end = next?.index ?? value.length;
    const content = value.slice(start, end).trim();
    if (!content) continue;

    seen.add(key);
    blocks.push({ key, content });
  }

  return blocks;
}

function composeLabeledBlocks(
  order: readonly string[],
  byKey: Map<string, string>,
): string {
  const parts: string[] = [];
  for (const key of order) {
    const content = byKey.get(key);
    if (!content?.trim()) continue;
    parts.push(`${key}:\n${content.trim()}`);
  }
  return parts.join("\n\n");
}

/**
 * Split a Persona suggested_cta using exact canonical key membership.
 * Does not alias OBJECTION_HANDLING → OBJECTION_ANTICIPATION.
 */
export function splitPersonaIntelligenceSuggestedCta(
  value?: string | null,
): PersonaIntelligenceSplit {
  const blocks = extractExactCanonicalBlocks(value);
  const deploymentSet = new Set(getPersonaPublishableDeploymentCatalogKeys());
  const deploymentByKey = new Map<string, string>();
  const analysisByKey = new Map<string, string>();

  for (const block of blocks) {
    // Analysis membership wins for OBJECTION_HANDLING (collision rule).
    if (ANALYSIS_KEY_SET.has(block.key)) {
      if (!analysisByKey.has(block.key)) {
        analysisByKey.set(block.key, block.content);
      }
      continue;
    }
    if (deploymentSet.has(block.key)) {
      if (!deploymentByKey.has(block.key)) {
        deploymentByKey.set(block.key, block.content);
      }
    }
  }

  const deploymentOrder = getPersonaPublishableDeploymentCatalogKeys();
  const analysisOrder = [...REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS];
  const deploymentCta = composeLabeledBlocks(deploymentOrder, deploymentByKey);
  const analysisCta = composeLabeledBlocks(analysisOrder, analysisByKey);
  const deploymentKeys = deploymentOrder.filter((key) =>
    deploymentByKey.has(key),
  );
  const analysisKeys = analysisOrder.filter((key) =>
    analysisByKey.has(key),
  ) as RequiredPersonaAnalysisAssetKey[];

  let packageKind: PersonaIntelligencePackageKind = "empty";
  if (deploymentKeys.length === 0 && analysisKeys.length === 0) {
    packageKind = blocks.length > 0 ? "unrecognized" : "empty";
  } else if (deploymentKeys.length === 0 && analysisKeys.length > 0) {
    packageKind = "legacy_analysis_only";
  } else if (deploymentKeys.length > 0 && analysisKeys.length > 0) {
    packageKind = "v15_dual";
  } else {
    packageKind = "unrecognized";
  }

  return {
    deploymentCta,
    analysisCta,
    deploymentKeys,
    analysisKeys,
    packageKind,
  };
}

/**
 * Normalize Call-1 Deployment aliases to canonical Prospect Deployment headings
 * before package combination. OBJECTION_HANDLING → OBJECTION_ANTICIPATION.
 * Does not modify Analysis packages. First occurrence wins on duplicates.
 */
export function normalizePersonaPublishableDeploymentAliases(
  deploymentCta: string,
): string {
  if (!deploymentCta?.trim()) {
    return deploymentCta ?? "";
  }

  const rewritten = deploymentCta.replace(
    /(^|\n)OBJECTION_HANDLING:([ \t]*)/g,
    "$1OBJECTION_ANTICIPATION:$2",
  );

  const deploymentOrder = getPersonaPublishableDeploymentCatalogKeys();
  const deploymentSet = new Set(deploymentOrder);
  const byKey = new Map<string, string>();

  for (const block of extractExactCanonicalBlocks(rewritten)) {
    if (!deploymentSet.has(block.key)) continue;
    if (!byKey.has(block.key)) {
      byKey.set(block.key, block.content);
    }
  }

  return composeLabeledBlocks(deploymentOrder, byKey);
}

/**
 * Deterministic combine after each package is independently validated.
 * Order: 14 required Deployment → 12 optional Deployment → 14 Analysis.
 * Callers must normalize Call-1 aliases before combining when the Deployment
 * package may still contain OBJECTION_HANDLING.
 */
export function combinePersonaIntelligencePackages(input: {
  deploymentCta: string;
  analysisCta: string;
}): string {
  const deploymentSet = new Set(getPersonaPublishableDeploymentCatalogKeys());
  const deploymentByKey = new Map<string, string>();
  const analysisByKey = new Map<string, string>();

  for (const block of extractExactCanonicalBlocks(input.deploymentCta)) {
    // Never classify Analysis keys as Deployment (collision rule).
    if (ANALYSIS_KEY_SET.has(block.key)) continue;
    if (deploymentSet.has(block.key) && !deploymentByKey.has(block.key)) {
      deploymentByKey.set(block.key, block.content);
    }
  }

  for (const block of extractExactCanonicalBlocks(input.analysisCta)) {
    if (ANALYSIS_KEY_SET.has(block.key) && !analysisByKey.has(block.key)) {
      analysisByKey.set(block.key, block.content);
    }
  }

  const parts = [
    composeLabeledBlocks(
      [...REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS],
      deploymentByKey,
    ),
    composeLabeledBlocks(
      [...OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS],
      deploymentByKey,
    ),
    composeLabeledBlocks(
      [...REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS],
      analysisByKey,
    ),
  ].filter(Boolean);

  return parts.join("\n\n");
}

/**
 * Final integrity gate for Persona V15 dual packages:
 * normalize Call-1 aliases → combine → require V15 completeness.
 * Throws IncompletePersonaDeploymentAssetsError on incomplete packages.
 * Callers must never persist or mark the stage successful after this throw.
 */
export function finalizePersonaV15CombinedPackage(input: {
  deploymentCta: string;
  analysisCta: string;
}): string {
  const deploymentCta = normalizePersonaPublishableDeploymentAliases(
    input.deploymentCta,
  );
  const combinedCta = combinePersonaIntelligencePackages({
    deploymentCta,
    analysisCta: input.analysisCta,
  });

  if (!isCompleteV15PersonaIntelligenceCta(combinedCta)) {
    const missing = missingV15PersonaIntelligenceKeys(combinedCta);
    const parts: string[] = [];
    if (missing.missingDeploymentKeys.length > 0) {
      parts.push(
        `Missing Deployment: ${missing.missingDeploymentKeys.join(", ")}`,
      );
    }
    if (missing.missingAnalysisKeys.length > 0) {
      parts.push(
        `Missing Analysis: ${missing.missingAnalysisKeys.join(", ")}`,
      );
    }
    const detail = parts.length > 0 ? ` ${parts.join(". ")}.` : "";
    throw new IncompletePersonaDeploymentAssetsError(
      `Persona V15 combined intelligence package incomplete.${detail}`,
      {
        rawCharacterCount: combinedCta.length,
        unwrappedCharacterCount: combinedCta.length,
        parsedAssetCount: 0,
        parsedCanonicalKeys: [],
        missingCanonicalKeys: missing.missingAnalysisKeys,
        validationResult: "incomplete",
        failureReason: "incomplete_v15_combined_package",
      },
    );
  }

  return combinedCta;
}

export function isLegacyPersonaAnalysisOnlyCta(value?: string | null): boolean {
  return (
    splitPersonaIntelligenceSuggestedCta(value).packageKind ===
    "legacy_analysis_only"
  );
}

/**
 * V15 Ready completeness for newly generated Persona intelligence:
 * 14 required Prospect Deployment keys + 14 Analysis keys.
 * Optional Deployment extras are non-gating.
 */
export function isCompleteV15PersonaIntelligenceCta(
  value?: string | null,
): boolean {
  const split = splitPersonaIntelligenceSuggestedCta(value);
  if (split.packageKind === "legacy_analysis_only") {
    return false;
  }

  const deployment = validateProspectDeploymentAssetPayload(split.deploymentCta);
  const analysis = validatePersonaAnalysisAssetPayload(split.analysisCta);
  return deployment.isComplete && analysis.isComplete;
}

export function missingV15PersonaIntelligenceKeys(value?: string | null): {
  missingDeploymentKeys: RequiredProspectDeploymentAssetKey[];
  missingAnalysisKeys: RequiredPersonaAnalysisAssetKey[];
} {
  const split = splitPersonaIntelligenceSuggestedCta(value);
  const deployment = validateProspectDeploymentAssetPayload(split.deploymentCta);
  const analysis = validatePersonaAnalysisAssetPayload(split.analysisCta);
  return {
    missingDeploymentKeys: deployment.missingKeys,
    missingAnalysisKeys: analysis.missingKeys,
  };
}

/**
 * Publication completeness for newly generated V15 Persona Executive Versions.
 * Requires Strategic Blueprint + 14 required Prospect Deployment keys +
 * 14 Persona Analysis keys. Optional Deployment extras are non-gating.
 */
export function requirePersonaCompleteness(input: {
  suggestedCta?: string | null;
  blueprintId?: string | null;
}): void {
  if (!input.blueprintId) {
    throw new IncompletePersonaPublicationError(
      "Persona publication needs a linked Strategic Blueprint.",
    );
  }

  // Legacy Analysis-only CTAs are never treated as newly Ready under V15.
  if (isLegacyPersonaAnalysisOnlyCta(input.suggestedCta)) {
    throw new IncompletePersonaPublicationError(
      "Persona publication needs V15 Deployment Assets and Analysis Assets. Legacy Analysis-only packages are display-compatible only.",
    );
  }

  if (!isCompleteV15PersonaIntelligenceCta(input.suggestedCta)) {
    const missing = missingV15PersonaIntelligenceKeys(input.suggestedCta);
    const parts: string[] = [];
    if (missing.missingDeploymentKeys.length > 0) {
      parts.push(
        `Missing Deployment: ${missing.missingDeploymentKeys.join(", ")}`,
      );
    }
    if (missing.missingAnalysisKeys.length > 0) {
      parts.push(
        `Missing Analysis: ${missing.missingAnalysisKeys.join(", ")}`,
      );
    }
    const detail = parts.length > 0 ? ` ${parts.join(". ")}.` : "";
    throw new IncompletePersonaPublicationError(
      `Persona publication needs complete V15 Deployment + Analysis packages.${detail}`,
    );
  }
}
