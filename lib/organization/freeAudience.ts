/**
 * One-time Free Audience / Persona product state.
 *
 * Organization-scoped. Not an entitlement engine, quota table, or
 * persona-count heuristic. Consumption is historical and survives plan
 * change and audience delete.
 */

import { isFreeTrained } from "@/lib/organization/freeStarter";
import { isFreeUntrained } from "@/lib/organization/freeUntrained";
import type { DefineKind } from "@/lib/home/homeDomainState";
import type { AthenaPlan } from "@/services/athenaPlan";

export const FREE_AUDIENCE_STATUSES = ["available", "reserved", "consumed"] as const;

export type FreeAudienceStatus = (typeof FREE_AUDIENCE_STATUSES)[number];

export const FREE_AUDIENCE_PERSISTED_STATUSES = ["reserved", "consumed"] as const;

export type FreeAudiencePersistedStatus =
  (typeof FREE_AUDIENCE_PERSISTED_STATUSES)[number];

export const FREE_AUDIENCE_RESERVATION_STALE_MS = 120_000;

export type FreeAudienceEligibilityInput = {
  athenaPlan?: AthenaPlan | null;
  defineKind?: DefineKind | null;
  audienceStatus?: FreeAudienceStatus | null;
};

export function resolveFreeAudienceStatus(value: unknown): FreeAudienceStatus {
  if (value === "reserved" || value === "consumed") {
    return value;
  }
  return "available";
}

export function isFreeAudienceAvailable(status: FreeAudienceStatus): boolean {
  return status === "available";
}

export function isFreeAudienceEligible(
  input: FreeAudienceEligibilityInput,
): boolean {
  return (
    isFreeTrained(input) &&
    resolveFreeAudienceStatus(input.audienceStatus) === "available"
  );
}

export function isFreeAudienceMetered(
  athenaPlan?: AthenaPlan | null,
): boolean {
  return athenaPlan === "free";
}

export { isFreeTrained, isFreeUntrained };
