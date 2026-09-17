/**
 * Free Traction presentation authority for /ads family.
 * Derives from plan + trained progression + persisted starter state +
 * existing campaign evidence. Not a quota meter.
 */

import {
  isFreeTrained,
  resolveFreeTractionStatus,
  type FreeTractionStatus,
} from "@/lib/organization/freeTraction";
import type { DefineKind } from "@/lib/home/homeDomainState";
import type { AthenaPlan } from "@/services/athenaPlan";
import type { AdCampaignStatus } from "@/services/ads/adCampaignTypes";

export const FREE_TRACTION_PRESENTATIONS = [
  "full",
  "untrained",
  "available",
  "processing",
  "failed",
  "consumed",
] as const;

export type FreeTractionPresentation =
  (typeof FREE_TRACTION_PRESENTATIONS)[number];

export type FreeTractionPresentationInput = {
  athenaPlan?: AthenaPlan | null;
  defineKind?: DefineKind | null;
  tractionStatus?: FreeTractionStatus | null;
  boundCampaignId?: string | null;
  boundCampaignStatus?: AdCampaignStatus | null;
  hasReadyCampaign?: boolean | null;
  hasInFlightCampaign?: boolean | null;
};

export function deriveFreeTractionPresentation(
  input: FreeTractionPresentationInput,
): FreeTractionPresentation {
  if (input.athenaPlan !== "free") {
    return "full";
  }

  if (!isFreeTrained(input)) {
    return "untrained";
  }

  const status = resolveFreeTractionStatus(input.tractionStatus);
  const boundStatus = input.boundCampaignStatus ?? null;

  if (status === "consumed" || input.hasReadyCampaign) {
    return "consumed";
  }

  if (status === "reserved") {
    if (boundStatus === "Ready") return "consumed";
    if (boundStatus === "Processing Failed") return "failed";
    return "processing";
  }

  if (boundStatus === "Processing Failed") {
    return "failed";
  }

  if (input.hasInFlightCampaign) {
    return "processing";
  }

  return "available";
}

export function shouldShowAdsCreate(
  presentation: FreeTractionPresentation,
): boolean {
  return presentation === "full" || presentation === "available";
}

export function shouldShowAdsRegenerate(
  presentation: FreeTractionPresentation,
): boolean {
  return presentation === "full";
}

export function shouldShowAdsRetrySameCampaign(
  presentation: FreeTractionPresentation,
  input: {
    currentCampaignId?: string | null;
    boundCampaignId?: string | null;
  },
): boolean {
  if (presentation !== "failed") return false;
  const current = input.currentCampaignId?.trim() || null;
  const bound = input.boundCampaignId?.trim() || null;
  return Boolean(current && bound && current === bound);
}

export function shouldShowFreeTractionContinuation(
  presentation: FreeTractionPresentation,
): boolean {
  return presentation === "consumed";
}

export function freeTractionBoundaryCopyKey(
  presentation: FreeTractionPresentation,
):
  | "availableContext"
  | "processingNote"
  | "completedNote"
  | "failedNote"
  | "historicalNote"
  | null {
  switch (presentation) {
    case "available":
      return "availableContext";
    case "processing":
      return "processingNote";
    case "failed":
      return "failedNote";
    case "consumed":
      return "completedNote";
    default:
      return null;
  }
}
