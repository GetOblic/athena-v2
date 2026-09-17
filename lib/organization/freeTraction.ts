/**
 * One-time Free Generate Traction advertising campaign product state.
 *
 * Organization-scoped. Not an entitlement engine, quota table, or
 * campaign-count heuristic. Consumption is historical and survives plan change.
 */

import { isFreeTrained } from "@/lib/organization/freeStarter";
import { isFreeUntrained } from "@/lib/organization/freeUntrained";
import type { DefineKind } from "@/lib/home/homeDomainState";
import type { AthenaPlan } from "@/services/athenaPlan";

export const FREE_TRACTION_STATUSES = ["available", "reserved", "consumed"] as const;

export type FreeTractionStatus = (typeof FREE_TRACTION_STATUSES)[number];

export const FREE_TRACTION_PERSISTED_STATUSES = ["reserved", "consumed"] as const;

export type FreeTractionPersistedStatus =
  (typeof FREE_TRACTION_PERSISTED_STATUSES)[number];

export const FREE_TRACTION_RESERVATION_STALE_MS = 120_000;

export type FreeTractionEligibilityInput = {
  athenaPlan?: AthenaPlan | null;
  defineKind?: DefineKind | null;
  tractionStatus?: FreeTractionStatus | null;
};

export function resolveFreeTractionStatus(value: unknown): FreeTractionStatus {
  if (value === "reserved" || value === "consumed") {
    return value;
  }
  return "available";
}

export function isFreeTractionAvailable(status: FreeTractionStatus): boolean {
  return status === "available";
}

export function isFreeTractionEligible(
  input: FreeTractionEligibilityInput,
): boolean {
  return (
    isFreeTrained(input) &&
    resolveFreeTractionStatus(input.tractionStatus) === "available"
  );
}

export function isFreeTractionMetered(
  athenaPlan?: AthenaPlan | null,
): boolean {
  return athenaPlan === "free";
}

export { isFreeTrained, isFreeUntrained };
