/**
 * Free Visibility presentation authority for /seo family.
 * Derives from plan + trained progression + persisted starter state +
 * existing report evidence. Not a quota meter.
 */

import {
  isFreeTrained,
  resolveFreeVisibilityStatus,
  type FreeVisibilityStatus,
} from "@/lib/organization/freeVisibility";
import type { DefineKind } from "@/lib/home/homeDomainState";
import type { AthenaPlan } from "@/services/athenaPlan";
import type { SeoReportStatus } from "@/services/seo/seoReportTypes";

export const FREE_VISIBILITY_PRESENTATIONS = [
  "full",
  "untrained",
  "available",
  "processing",
  "failed",
  "consumed",
] as const;

export type FreeVisibilityPresentation =
  (typeof FREE_VISIBILITY_PRESENTATIONS)[number];

export type FreeVisibilityPresentationInput = {
  athenaPlan?: AthenaPlan | null;
  defineKind?: DefineKind | null;
  visibilityStatus?: FreeVisibilityStatus | null;
  boundReportId?: string | null;
  boundReportStatus?: SeoReportStatus | null;
  hasReadyReport?: boolean | null;
  hasInFlightReport?: boolean | null;
};

export function deriveFreeVisibilityPresentation(
  input: FreeVisibilityPresentationInput,
): FreeVisibilityPresentation {
  if (input.athenaPlan !== "free") {
    return "full";
  }

  if (!isFreeTrained(input)) {
    return "untrained";
  }

  const status = resolveFreeVisibilityStatus(input.visibilityStatus);
  const boundStatus = input.boundReportStatus ?? null;

  if (status === "consumed" || input.hasReadyReport) {
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

  if (input.hasInFlightReport) {
    return "processing";
  }

  return "available";
}

export function shouldShowSeoNewAnalysis(
  presentation: FreeVisibilityPresentation,
): boolean {
  return presentation === "full" || presentation === "available";
}

export function shouldShowSeoRegenerate(
  presentation: FreeVisibilityPresentation,
): boolean {
  return presentation === "full";
}

export function shouldShowSeoTechnicalOption(
  presentation: FreeVisibilityPresentation,
): boolean {
  return presentation === "full";
}

export function shouldShowSeoTechnicalLocked(
  presentation: FreeVisibilityPresentation,
): boolean {
  return presentation === "available";
}

export function shouldShowSeoRetrySameReport(
  presentation: FreeVisibilityPresentation,
  input: {
    currentReportId?: string | null;
    boundReportId?: string | null;
  },
): boolean {
  if (presentation !== "failed") return false;
  const current = input.currentReportId?.trim() || null;
  const bound = input.boundReportId?.trim() || null;
  return Boolean(current && bound && current === bound);
}

export function shouldShowFreeVisibilityContinuation(
  presentation: FreeVisibilityPresentation,
): boolean {
  return presentation === "consumed";
}

export function freeVisibilityBoundaryCopyKey(
  presentation: FreeVisibilityPresentation,
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
