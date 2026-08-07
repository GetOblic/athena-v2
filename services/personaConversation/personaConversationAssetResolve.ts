/**
 * Pure server-side Persona asset resolution from an Executive Version payload.
 * No I/O — content is never taken from the client.
 *
 * Distinguishes Persona Analysis keys from publishable Deployment keys even
 * when the client sends assetKind "deployment" for both (DeploymentAssets UI).
 */

import {
  buildDiscussionDeploymentAssets,
  buildPersonaAnalysisAssets,
} from "@/lib/deploymentAssets";
import { BLUEPRINT_ASSET_TYPES } from "@/services/assetInteractions/assetInteractionKeys";
import {
  composeBlueprintPromptWithBrandDirection,
  type BlueprintBrandDirectionInput,
} from "@/services/identity/blueprintBrandDirection";
import type { ExecutiveIntelligencePayload } from "@/services/executiveVersions/executiveVersionTypes";
import {
  PersonaConversationError,
  type PersonaConversationAssetReference,
  type PersonaConversationResolvedAsset,
} from "@/services/personaConversation/personaConversationTypes";
import {
  describePersonaAssetKind,
  isPersonaAnalysisAssetReferenceKey,
} from "@/services/personaConversation/personaConversationAssetLabels";

export { describePersonaAssetKind, isPersonaAnalysisAssetReferenceKey };

const BLUEPRINT_KEY_TO_FIELD: Record<
  string,
  | "image_prompt"
  | "pdf_prompt"
  | "social_prompt"
  | "trend_social_prompt"
  | "notes"
> = {
  [BLUEPRINT_ASSET_TYPES.image_prompt]: "image_prompt",
  [BLUEPRINT_ASSET_TYPES.pdf_prompt]: "pdf_prompt",
  [BLUEPRINT_ASSET_TYPES.social_prompt]: "social_prompt",
  [BLUEPRINT_ASSET_TYPES.trend_social_prompt]: "trend_social_prompt",
  [BLUEPRINT_ASSET_TYPES.notes]: "notes",
  image_prompt: "image_prompt",
  pdf_prompt: "pdf_prompt",
  social_prompt: "social_prompt",
  trend_social_prompt: "trend_social_prompt",
  notes: "notes",
};

const BLUEPRINT_FIELD_TITLES: Record<string, string> = {
  image_prompt: "Image Prompt",
  pdf_prompt: "PDF Prompt",
  social_prompt: "Social Prompt",
  trend_social_prompt: "Trend Social Prompt",
  notes: "Notes",
};

function matchesAssetKey(
  asset: { assetKey?: string; title: string },
  normalized: string,
): boolean {
  const assetKey = (asset.assetKey ?? "").trim().toLowerCase();
  const titleKey = asset.title.toLowerCase().replace(/\s+/g, "_");
  return assetKey === normalized || titleKey === normalized;
}

function resolveAnalysisAsset(
  payload: ExecutiveIntelligencePayload,
  key: string,
): PersonaConversationResolvedAsset | null {
  const assets = buildPersonaAnalysisAssets(
    payload.analysis?.suggested_cta ?? null,
  );
  const normalized = key.trim().toLowerCase();
  const match = assets.find((asset) => matchesAssetKey(asset, normalized));
  if (!match?.content.trim()) {
    return null;
  }
  return {
    kind: "deployment",
    key: match.assetKey ?? match.title.toLowerCase().replace(/\s+/g, "_"),
    title: match.title,
    content: match.content.trim(),
    group: "analysis",
  };
}

function resolveDeploymentAsset(
  payload: ExecutiveIntelligencePayload,
  key: string,
): PersonaConversationResolvedAsset | null {
  const assets = buildDiscussionDeploymentAssets(payload.analysis ?? null, {
    personaMode: true,
  });
  const normalized = key.trim().toLowerCase();
  const match = assets.find((asset) => matchesAssetKey(asset, normalized));
  if (!match?.content.trim()) {
    return null;
  }
  return {
    kind: "deployment",
    key: match.assetKey ?? match.title.toLowerCase().replace(/\s+/g, "_"),
    title: match.title,
    content: match.content.trim(),
    group: "deployment",
  };
}

function resolveBlueprintAsset(
  payload: ExecutiveIntelligencePayload,
  key: string,
  brandDirection?: BlueprintBrandDirectionInput | null,
): PersonaConversationResolvedAsset | null {
  const blueprint = payload.blueprint;
  if (!blueprint) {
    return null;
  }
  const field = BLUEPRINT_KEY_TO_FIELD[key.trim().toLowerCase()];
  if (!field) {
    return null;
  }
  const raw = String(blueprint[field] ?? "").trim();
  if (!raw) {
    return null;
  }
  const content =
    field === "image_prompt" || field === "pdf_prompt"
      ? String(
          composeBlueprintPromptWithBrandDirection(raw, brandDirection) ?? raw,
        ).trim()
      : raw;
  return {
    kind: "blueprint",
    key:
      Object.values(BLUEPRINT_ASSET_TYPES).find(
        (value) => BLUEPRINT_KEY_TO_FIELD[value] === field,
      ) ?? field,
    title: `${blueprint.asset_title || "Strategic Blueprint"} — ${BLUEPRINT_FIELD_TITLES[field]}`,
    content,
    group: "blueprint",
  };
}

export function resolvePersonaReferencedAsset(input: {
  payload: ExecutiveIntelligencePayload | null;
  assetReference: PersonaConversationAssetReference;
  brandDirection?: BlueprintBrandDirectionInput | null;
}): PersonaConversationResolvedAsset {
  if (!input.payload) {
    throw new PersonaConversationError(
      "ASSET_NOT_FOUND",
      "Referenced asset requires an Executive Version with intelligence.",
      404,
    );
  }

  const kind = input.assetReference.kind;
  const key = input.assetReference.key.trim();
  if (!key) {
    throw new PersonaConversationError(
      "VALIDATION_ERROR",
      "Asset reference key is required.",
      400,
    );
  }

  if (kind === "deployment") {
    // Analysis assets also arrive as kind "deployment" from DeploymentAssets.
    // Resolve by catalog membership — never treat Analysis keys as publishable Deployment.
    if (isPersonaAnalysisAssetReferenceKey(key)) {
      const analysis = resolveAnalysisAsset(input.payload, key);
      if (!analysis) {
        throw new PersonaConversationError(
          "ASSET_NOT_FOUND",
          "Analysis asset not found for the selected Executive Version.",
          404,
        );
      }
      return analysis;
    }

    const deployment = resolveDeploymentAsset(input.payload, key);
    if (!deployment) {
      throw new PersonaConversationError(
        "ASSET_NOT_FOUND",
        "Deployment asset not found for the selected Executive Version.",
        404,
      );
    }
    return deployment;
  }

  if (kind === "blueprint") {
    const resolved = resolveBlueprintAsset(
      input.payload,
      key,
      input.brandDirection,
    );
    if (!resolved) {
      throw new PersonaConversationError(
        "ASSET_NOT_FOUND",
        "Blueprint asset not found for the selected Executive Version.",
        404,
      );
    }
    return resolved;
  }

  throw new PersonaConversationError(
    "VALIDATION_ERROR",
    "Unknown asset kind.",
    400,
  );
}

