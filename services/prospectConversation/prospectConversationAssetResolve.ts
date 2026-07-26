/**
 * Pure server-side asset resolution from an Executive Version payload.
 * No I/O — content is never taken from the client.
 */

import { buildDiscussionDeploymentAssets } from "@/lib/deploymentAssets";
import { BLUEPRINT_ASSET_TYPES } from "@/services/assetInteractions/assetInteractionKeys";
import type { ExecutiveIntelligencePayload } from "@/services/executiveVersions/executiveVersionTypes";
import {
  ProspectConversationError,
  type ProspectConversationAssetKind,
  type ProspectConversationAssetReference,
  type ProspectConversationResolvedAsset,
} from "@/services/prospectConversation/prospectConversationTypes";

const BLUEPRINT_KEY_TO_FIELD: Record<
  string,
  "image_prompt" | "pdf_prompt" | "social_prompt" | "notes"
> = {
  [BLUEPRINT_ASSET_TYPES.image_prompt]: "image_prompt",
  [BLUEPRINT_ASSET_TYPES.pdf_prompt]: "pdf_prompt",
  [BLUEPRINT_ASSET_TYPES.social_prompt]: "social_prompt",
  [BLUEPRINT_ASSET_TYPES.notes]: "notes",
  image_prompt: "image_prompt",
  pdf_prompt: "pdf_prompt",
  social_prompt: "social_prompt",
  notes: "notes",
};

const BLUEPRINT_FIELD_TITLES: Record<string, string> = {
  image_prompt: "Image Prompt",
  pdf_prompt: "PDF Prompt",
  social_prompt: "Social Prompt",
  notes: "Notes",
};

function resolveDeploymentAsset(
  payload: ExecutiveIntelligencePayload,
  key: string,
): ProspectConversationResolvedAsset | null {
  const assets = buildDiscussionDeploymentAssets(payload.analysis ?? null, {
    prospectMode: true,
  });
  const normalized = key.trim().toLowerCase();
  const match = assets.find((asset) => {
    const assetKey = (asset.assetKey ?? "").trim().toLowerCase();
    const titleKey = asset.title.toLowerCase().replace(/\s+/g, "_");
    return assetKey === normalized || titleKey === normalized;
  });
  if (!match?.content.trim()) {
    return null;
  }
  return {
    kind: "deployment",
    key: match.assetKey ?? match.title.toLowerCase().replace(/\s+/g, "_"),
    title: match.title,
    content: match.content.trim(),
  };
}

function resolveBlueprintAsset(
  payload: ExecutiveIntelligencePayload,
  key: string,
): ProspectConversationResolvedAsset | null {
  const blueprint = payload.blueprint;
  if (!blueprint) {
    return null;
  }
  const field = BLUEPRINT_KEY_TO_FIELD[key.trim().toLowerCase()];
  if (!field) {
    return null;
  }
  const content = String(blueprint[field] ?? "").trim();
  if (!content) {
    return null;
  }
  return {
    kind: "blueprint",
    key:
      Object.values(BLUEPRINT_ASSET_TYPES).find(
        (value) => BLUEPRINT_KEY_TO_FIELD[value] === field,
      ) ?? field,
    title: `${blueprint.asset_title || "Strategic Blueprint"} — ${BLUEPRINT_FIELD_TITLES[field]}`,
    content,
  };
}

export function resolveReferencedAsset(input: {
  payload: ExecutiveIntelligencePayload | null;
  assetReference: ProspectConversationAssetReference;
}): ProspectConversationResolvedAsset {
  if (!input.payload) {
    throw new ProspectConversationError(
      "ASSET_NOT_FOUND",
      "Referenced asset requires an Executive Version with intelligence.",
      404,
    );
  }

  const kind = input.assetReference.kind;
  const key = input.assetReference.key.trim();
  if (!key) {
    throw new ProspectConversationError(
      "VALIDATION_ERROR",
      "Asset reference key is required.",
      400,
    );
  }

  if (kind === "deployment") {
    const resolved = resolveDeploymentAsset(input.payload, key);
    if (!resolved) {
      throw new ProspectConversationError(
        "ASSET_NOT_FOUND",
        "Deployment asset not found for the selected Executive Version.",
        404,
      );
    }
    return resolved;
  }

  if (kind === "blueprint") {
    const resolved = resolveBlueprintAsset(input.payload, key);
    if (!resolved) {
      throw new ProspectConversationError(
        "ASSET_NOT_FOUND",
        "Blueprint asset not found for the selected Executive Version.",
        404,
      );
    }
    return resolved;
  }

  throw new ProspectConversationError(
    "VALIDATION_ERROR",
    "Unknown asset kind.",
    400,
  );
}

export function describeAssetKind(kind: ProspectConversationAssetKind): string {
  return kind === "deployment" ? "Deployment Asset" : "Strategic Blueprint";
}
