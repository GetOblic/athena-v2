/**
 * Canonical Prospect Deployment Asset contract — validation for candidate publication.
 * Parser and publish gates share this registry.
 */

import { PROSPECT_DEPLOYMENT_ASSET_KEYS } from "@/services/ai/prompts/prospectDeploymentAssetsConstraints";

/** Labels accepted as aliases for a canonical required key. */
const REQUIRED_KEY_ALIASES: Record<string, string[]> = {
  PERSONALIZED_OUTREACH_EMAIL: ["PERSONALIZED_OUTREACH_EMAIL", "COLD_EMAIL"],
  FOLLOW_UP_EMAIL: ["FOLLOW_UP_EMAIL"],
  LINKEDIN_CONNECTION: ["LINKEDIN_CONNECTION"],
  WHATSAPP_OUTREACH: ["WHATSAPP_OUTREACH"],
  KNOWLEDGE_ENHANCEMENT: ["KNOWLEDGE_ENHANCEMENT"],
  NEWSLETTER_IDEA: ["NEWSLETTER_IDEA"],
  BLOG_POST_IDEA: ["BLOG_POST_IDEA"],
  RECOMMENDED_CTA: ["RECOMMENDED_CTA"],
};

/**
 * Always-required Prospect Deployment Asset keys for Current Version publication.
 * Knowledge Enhancement is mandatory only when stored website intelligence
 * contains usable website / Business Brain content. When no usable stored
 * website knowledge exists, KE must not be invented or required.
 */
export const ALWAYS_REQUIRED_PROSPECT_DEPLOYMENT_KEYS = [
  "PERSONALIZED_OUTREACH_EMAIL",
  "FOLLOW_UP_EMAIL",
  "LINKEDIN_CONNECTION",
  "WHATSAPP_OUTREACH",
  "NEWSLETTER_IDEA",
  "BLOG_POST_IDEA",
  "RECOMMENDED_CTA",
] as const;

export type DeploymentAssetParseReport = {
  parsedKeys: string[];
  missingRequiredKeys: string[];
  unknownLabels: string[];
  warnings: string[];
  complete: boolean;
  assetCount: number;
};

/**
 * Rewrite common human/model label variants into canonical SECTION keys
 * before labeled parsing.
 */
export function canonicalizeDeploymentAssetLabels(text: string): string {
  return text
    .replace(
      /(^|\n)\s*KNOWLEDGE[\s_-]*ENHANCEMENT\s*:/gi,
      "$1KNOWLEDGE_ENHANCEMENT:",
    )
    .replace(
      /(^|\n)\s*WHATSAPP[\s_-]*OUTREACH\s*:/gi,
      "$1WHATSAPP_OUTREACH:",
    )
    .replace(
      /(^|\n)\s*PERSONALIZED[\s_-]*OUTREACH[\s_-]*EMAIL\s*:/gi,
      "$1PERSONALIZED_OUTREACH_EMAIL:",
    )
    .replace(/(^|\n)\s*COLD[\s_-]*EMAIL\s*:/gi, "$1COLD_EMAIL:");
}

const LABELED_KEY_PATTERN = new RegExp(
  `(?:^|\\n)(${[...PROSPECT_DEPLOYMENT_ASSET_KEYS].join("|")}):\\s*`,
  "g",
);

export function extractParsedProspectAssetKeys(
  suggestedCta: string | null | undefined,
): string[] {
  if (!suggestedCta?.trim()) return [];
  const normalized = canonicalizeDeploymentAssetLabels(suggestedCta);
  const matches = [...normalized.matchAll(LABELED_KEY_PATTERN)];
  const keys: string[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const label = match[1];
    const start = (match.index ?? 0) + match[0].length;
    const next = matches[index + 1];
    const end = next?.index ?? normalized.length;
    const content = normalized.slice(start, end).trim();
    if (!content) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    keys.push(label);
  }

  return keys;
}

function hasAnyAlias(parsedKeys: Set<string>, requiredKey: string): boolean {
  const aliases = REQUIRED_KEY_ALIASES[requiredKey] ?? [requiredKey];
  return aliases.some((alias) => parsedKeys.has(alias));
}

export function evaluateProspectDeploymentCompleteness(input: {
  suggestedCta: string | null | undefined;
  requireKnowledgeEnhancement: boolean;
}): DeploymentAssetParseReport {
  const normalized = canonicalizeDeploymentAssetLabels(
    input.suggestedCta ?? "",
  );
  const parsedKeys = extractParsedProspectAssetKeys(normalized);
  const parsedSet = new Set(parsedKeys);

  const required = [
    ...ALWAYS_REQUIRED_PROSPECT_DEPLOYMENT_KEYS,
    ...(input.requireKnowledgeEnhancement
      ? (["KNOWLEDGE_ENHANCEMENT"] as const)
      : []),
  ];

  const missingRequiredKeys = required.filter(
    (key) => !hasAnyAlias(parsedSet, key),
  );

  const warnings: string[] = [];
  if (!normalized.trim()) {
    warnings.push("suggested_cta is empty");
  }
  if (missingRequiredKeys.length > 0) {
    warnings.push(
      `Missing required Prospect deployment assets: ${missingRequiredKeys.join(", ")}`,
    );
  }

  return {
    parsedKeys,
    missingRequiredKeys,
    unknownLabels: [],
    warnings,
    complete: missingRequiredKeys.length === 0 && parsedKeys.length > 0,
    assetCount: parsedKeys.length,
  };
}

export function websiteIntelligenceSupportsKnowledgeEnhancement(
  websiteIntelligence: Record<string, unknown> | null | undefined,
): boolean {
  if (!websiteIntelligence) return false;
  const pages =
    typeof websiteIntelligence.pages_analyzed === "number"
      ? websiteIntelligence.pages_analyzed
      : 0;
  if (pages > 0) return true;

  const knowledge = websiteIntelligence.business_knowledge;
  if (knowledge && typeof knowledge === "object") {
    return Object.values(knowledge as Record<string, unknown>).some(
      (value) => typeof value === "string" && value.trim().length > 0,
    );
  }

  return ["about", "services", "products", "positioning"].some((key) => {
    const value = websiteIntelligence[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

export function websiteIntelligenceHasUsableContent(
  websiteIntelligence: Record<string, unknown> | null | undefined,
): boolean {
  return websiteIntelligenceSupportsKnowledgeEnhancement(websiteIntelligence);
}
