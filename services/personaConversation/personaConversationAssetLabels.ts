/**
 * Client-safe Persona asset labels for Discuss badge / UI copy.
 * No Executive Version I/O — catalog membership only.
 */

import { getPersonaAnalysisCatalogKeys } from "@/lib/personaIntelligenceAssetCatalog";
import type {
  PersonaConversationAssetKind,
  PersonaConversationResolvedAsset,
} from "@/services/personaConversation/personaConversationTypes";

const ANALYSIS_KEY_SET = new Set(
  getPersonaAnalysisCatalogKeys().map((key) => key.toLowerCase()),
);

export function isPersonaAnalysisAssetReferenceKey(key: string): boolean {
  return ANALYSIS_KEY_SET.has(key.trim().toLowerCase());
}

export function describePersonaAssetKind(
  kind: PersonaConversationAssetKind,
  group?: PersonaConversationResolvedAsset["group"],
): string {
  if (group === "analysis") return "Analysis Asset";
  if (kind === "blueprint" || group === "blueprint") {
    return "Strategic Blueprint";
  }
  return "Deployment Asset";
}
