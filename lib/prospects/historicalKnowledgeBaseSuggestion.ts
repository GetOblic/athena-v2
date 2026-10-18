/**
 * Reads the current Executive Version Knowledge Base as display text.
 * Does not write suggested_cta or any Executive Version.
 */

import { parseLabeledDeploymentAssets } from "@/lib/deploymentAssets";

const KNOWLEDGE_BASE_ASSET_KEY = "knowledge_base_enhancement";

export function readHistoricalKnowledgeBaseSuggestion(
  intelligence: unknown,
): string | null {
  if (!intelligence || typeof intelligence !== "object" || Array.isArray(intelligence)) {
    return null;
  }
  const analysis = (intelligence as { analysis?: unknown }).analysis;
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) {
    return null;
  }
  const suggestedCta = (analysis as { suggested_cta?: unknown }).suggested_cta;
  if (typeof suggestedCta !== "string") return null;
  const matches = parseLabeledDeploymentAssets(suggestedCta).filter(
    (asset) => asset.assetKey === KNOWLEDGE_BASE_ASSET_KEY && asset.content.trim(),
  );
  if (matches.length !== 1) return null;
  const text = matches[0].content.trim();
  return text.length > 0 ? text : null;
}

/**
 * Historical Knowledge Base is only a starting suggestion when no saved
 * artifact row was loaded. A failed read must not pretend the artifact is absent.
 */
export function knowledgeBaseSuggestionForEditor(input: {
  directoryArtifactsAvailable: boolean;
  savedKnowledgeBase: { content: string } | null;
  currentKnowledgeBase: string | null;
}): string | null {
  if (!input.directoryArtifactsAvailable || input.savedKnowledgeBase) return null;
  const text = input.currentKnowledgeBase?.trim() ?? "";
  return text.length > 0 ? text : null;
}
