/**
 * One-time Free Visibility Strategy product state.
 *
 * Organization-scoped. Not an entitlement engine, quota table, or
 * report-count heuristic. Consumption is historical and survives plan change.
 */

import { isFreeTrained } from "@/lib/organization/freeStarter";
import { isFreeUntrained } from "@/lib/organization/freeUntrained";
import type { DefineKind } from "@/lib/home/homeDomainState";
import type { AthenaPlan } from "@/services/athenaPlan";

export const FREE_VISIBILITY_STATUSES = ["available", "reserved", "consumed"] as const;

export type FreeVisibilityStatus = (typeof FREE_VISIBILITY_STATUSES)[number];

export const FREE_VISIBILITY_PERSISTED_STATUSES = ["reserved", "consumed"] as const;

export type FreeVisibilityPersistedStatus =
  (typeof FREE_VISIBILITY_PERSISTED_STATUSES)[number];

export const FREE_VISIBILITY_RESERVATION_STALE_MS = 120_000;

export type FreeVisibilityEligibilityInput = {
  athenaPlan?: AthenaPlan | null;
  defineKind?: DefineKind | null;
  visibilityStatus?: FreeVisibilityStatus | null;
};

export function resolveFreeVisibilityStatus(value: unknown): FreeVisibilityStatus {
  if (value === "reserved" || value === "consumed") {
    return value;
  }
  return "available";
}

export function isFreeVisibilityAvailable(status: FreeVisibilityStatus): boolean {
  return status === "available";
}

export function isFreeVisibilityEligible(
  input: FreeVisibilityEligibilityInput,
): boolean {
  return (
    isFreeTrained(input) &&
    resolveFreeVisibilityStatus(input.visibilityStatus) === "available"
  );
}

export function isFreeVisibilityMetered(
  athenaPlan?: AthenaPlan | null,
): boolean {
  return athenaPlan === "free";
}

export { isFreeTrained, isFreeUntrained };
