/**
 * Free Convert Opportunities presentation authority for /prospects family.
 * Derives from plan + trained progression + persisted starter state +
 * existing prospect evidence. Not a quota meter.
 */

import {
  isFreeTrained,
  resolveFreeConvertStatus,
  type FreeConvertStatus,
} from "@/lib/organization/freeConvert";
import type { DefineKind } from "@/lib/home/homeDomainState";
import type { AthenaPlan } from "@/services/athenaPlan";

export const FREE_CONVERT_PRESENTATIONS = [
  "full",
  "untrained",
  "available",
  "bound",
  "processing",
  "failed",
  "consumed",
] as const;

export type FreeConvertPresentation =
  (typeof FREE_CONVERT_PRESENTATIONS)[number];

export type FreeConvertBoundProspectStatus =
  | "Saved"
  | "Queued"
  | "Processing"
  | "Learning from Website"
  | "Generating Executive Intelligence"
  | "Ready"
  | "Processing Failed"
  | string
  | null;

export type FreeConvertPresentationInput = {
  athenaPlan?: AthenaPlan | null;
  defineKind?: DefineKind | null;
  convertStatus?: FreeConvertStatus | null;
  boundProspectId?: string | null;
  boundProspectStatus?: FreeConvertBoundProspectStatus;
  hasReadyProspect?: boolean | null;
  hasInFlightProspect?: boolean | null;
};

export function deriveFreeConvertPresentation(
  input: FreeConvertPresentationInput,
): FreeConvertPresentation {
  if (input.athenaPlan !== "free") {
    return "full";
  }

  if (!isFreeTrained(input)) {
    return "untrained";
  }

  const status = resolveFreeConvertStatus(input.convertStatus);
  const boundStatus = input.boundProspectStatus ?? null;

  if (status === "consumed" || input.hasReadyProspect) {
    return "consumed";
  }

  if (status === "reserved") {
    if (boundStatus === "Ready") return "consumed";
    if (boundStatus === "Processing Failed") return "failed";
    if (
      boundStatus === "Queued" ||
      boundStatus === "Processing" ||
      boundStatus === "Learning from Website" ||
      boundStatus === "Generating Executive Intelligence"
    ) {
      return "processing";
    }
    return "bound";
  }

  if (boundStatus === "Processing Failed") {
    return "failed";
  }

  if (input.hasInFlightProspect) {
    return "processing";
  }

  if (input.boundProspectId) {
    return "failed";
  }

  return "available";
}

export function shouldShowProspectCreate(
  presentation: FreeConvertPresentation,
): boolean {
  return presentation === "full" || presentation === "available";
}

export function shouldShowProspectCsvImport(
  presentation: FreeConvertPresentation,
): boolean {
  return presentation === "full";
}

export function shouldShowProspectCsvLocked(
  presentation: FreeConvertPresentation,
): boolean {
  return presentation === "available";
}

export function shouldShowProspectFindAdd(
  presentation: FreeConvertPresentation,
): boolean {
  return presentation === "full" || presentation === "available";
}

export function shouldOfferGetOblicDiscovery(
  presentation: FreeConvertPresentation,
): boolean {
  return presentation === "full";
}

export function shouldOfferGoogleDiscovery(
  presentation: FreeConvertPresentation,
): boolean {
  return presentation === "full" || presentation === "available";
}

export function shouldRequireGoogleAuthorMapping(
  presentation: FreeConvertPresentation,
): boolean {
  return presentation === "full";
}

export function shouldShowGetOblicListingCapacityCard(
  presentation: FreeConvertPresentation,
): boolean {
  return presentation === "full";
}

export function defaultOpportunityDiscoveryMethod(
  directoryAvailable: boolean,
): "directory" | "google" {
  return directoryAvailable ? "directory" : "google";
}

export function shouldShowProspectGenerate(input: {
  presentation: FreeConvertPresentation;
  currentProspectId?: string | null;
  boundProspectId?: string | null;
}): boolean {
  if (input.presentation === "full") return true;
  if (input.presentation !== "bound" && input.presentation !== "failed") {
    return false;
  }
  const current = input.currentProspectId?.trim() || null;
  const bound = input.boundProspectId?.trim() || null;
  return Boolean(current && bound && current === bound);
}

export function shouldShowProspectRetrySame(input: {
  presentation: FreeConvertPresentation;
  currentProspectId?: string | null;
  boundProspectId?: string | null;
}): boolean {
  if (input.presentation !== "failed") return false;
  const current = input.currentProspectId?.trim() || null;
  const bound = input.boundProspectId?.trim() || null;
  return Boolean(current && bound && current === bound);
}

export function shouldShowProspectRegenerate(
  presentation: FreeConvertPresentation,
): boolean {
  return presentation === "full";
}

export function shouldShowProspectSyncAi(
  presentation: FreeConvertPresentation,
): boolean {
  return presentation === "full";
}

export function shouldShowProspectDeepScrape(
  presentation: FreeConvertPresentation,
): boolean {
  return presentation === "full";
}

export function shouldShowProspectConvertToClient(
  presentation: FreeConvertPresentation,
): boolean {
  return presentation === "full";
}

export function shouldShowProspectMeaningfulEdit(
  presentation: FreeConvertPresentation,
): boolean {
  return presentation === "full" || presentation === "bound";
}

export function shouldShowFreeConvertContinuation(
  presentation: FreeConvertPresentation,
): boolean {
  return presentation === "consumed";
}

export function freeConvertBoundaryCopyKey(
  presentation: FreeConvertPresentation,
):
  | "availableContext"
  | "boundNote"
  | "processingNote"
  | "completedNote"
  | "failedNote"
  | "historicalNote"
  | null {
  switch (presentation) {
    case "available":
      return "availableContext";
    case "bound":
      return "boundNote";
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
