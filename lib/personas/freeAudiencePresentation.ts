/**
 * Free Audience presentation authority for /personas family.
 * Derives from plan + trained progression + persisted starter state +
 * existing persona evidence. Not a quota meter.
 */

import {
  isFreeTrained,
  resolveFreeAudienceStatus,
  type FreeAudienceStatus,
} from "@/lib/organization/freeAudience";
import type { DefineKind } from "@/lib/home/homeDomainState";
import type { AthenaPlan } from "@/services/athenaPlan";

export const FREE_AUDIENCE_PRESENTATIONS = [
  "full",
  "untrained",
  "available",
  "reserved",
  "consumed",
] as const;

export type FreeAudiencePresentation =
  (typeof FREE_AUDIENCE_PRESENTATIONS)[number];

export type FreeAudiencePresentationInput = {
  athenaPlan?: AthenaPlan | null;
  defineKind?: DefineKind | null;
  audienceStatus?: FreeAudienceStatus | null;
  boundPersonaId?: string | null;
  hasPersona?: boolean | null;
};

export function deriveFreeAudiencePresentation(
  input: FreeAudiencePresentationInput,
): FreeAudiencePresentation {
  if (input.athenaPlan !== "free") {
    return "full";
  }

  if (!isFreeTrained(input)) {
    return "untrained";
  }

  const status = resolveFreeAudienceStatus(input.audienceStatus);

  if (status === "consumed" || input.hasPersona) {
    return "consumed";
  }

  if (status === "reserved") {
    return "reserved";
  }

  if (input.boundPersonaId) {
    return "consumed";
  }

  return "available";
}

export function shouldShowPersonaCreate(
  presentation: FreeAudiencePresentation,
): boolean {
  return presentation === "full" || presentation === "available";
}

export function shouldShowPersonaSuggest(
  presentation: FreeAudiencePresentation,
): boolean {
  return presentation === "full" || presentation === "available";
}

export function shouldShowPersonaManual(
  presentation: FreeAudiencePresentation,
): boolean {
  return presentation === "full" || presentation === "available";
}

export function shouldShowPersonaCsvImport(
  presentation: FreeAudiencePresentation,
): boolean {
  return presentation === "full";
}

export function shouldShowPersonaCsvLocked(
  presentation: FreeAudiencePresentation,
): boolean {
  return presentation === "available";
}

export function shouldShowPersonaCreateWorkflows(
  presentation: FreeAudiencePresentation,
): boolean {
  return presentation === "full" || presentation === "available";
}

export function shouldShowProspectCreateAudience(
  presentation: FreeAudiencePresentation,
): boolean {
  return presentation === "full" || presentation === "available";
}

export function shouldShowPersonaGenerateAgain(
  presentation: FreeAudiencePresentation,
): boolean {
  return presentation === "full";
}

export function shouldShowPersonaRefreshIntelligence(
  presentation: FreeAudiencePresentation,
): boolean {
  return presentation === "full";
}

export function shouldShowPersonaThinkDifferently(
  presentation: FreeAudiencePresentation,
): boolean {
  return presentation === "full";
}

export function shouldShowPersonaDeepScrape(
  presentation: FreeAudiencePresentation,
): boolean {
  return presentation === "full";
}

export function shouldShowPersonaAddObservation(
  presentation: FreeAudiencePresentation,
): boolean {
  return presentation === "full";
}

export function shouldShowFreeAudienceContinuation(
  presentation: FreeAudiencePresentation,
): boolean {
  return presentation === "consumed";
}

export function freeAudienceBoundaryCopyKey(
  presentation: FreeAudiencePresentation,
): "availableContext" | "reservedNote" | "completedNote" | null {
  switch (presentation) {
    case "available":
      return "availableContext";
    case "reserved":
      return "reservedNote";
    case "consumed":
      return "completedNote";
    default:
      return null;
  }
}
