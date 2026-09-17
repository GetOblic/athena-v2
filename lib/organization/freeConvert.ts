/**
 * One-time Free Convert Opportunities researched prospect product state.
 *
 * Organization-scoped. Not an entitlement engine, quota table, or
 * prospect-count heuristic. Consumption is historical and survives plan change.
 */

import { isFreeTrained } from "@/lib/organization/freeStarter";
import { isFreeUntrained } from "@/lib/organization/freeUntrained";
import type { DefineKind } from "@/lib/home/homeDomainState";
import type { AthenaPlan } from "@/services/athenaPlan";

export const FREE_CONVERT_STATUSES = ["available", "reserved", "consumed"] as const;

export type FreeConvertStatus = (typeof FREE_CONVERT_STATUSES)[number];

export const FREE_CONVERT_PERSISTED_STATUSES = ["reserved", "consumed"] as const;

export type FreeConvertPersistedStatus =
  (typeof FREE_CONVERT_PERSISTED_STATUSES)[number];

export const FREE_CONVERT_RESERVATION_STALE_MS = 120_000;

export type FreeConvertEligibilityInput = {
  athenaPlan?: AthenaPlan | null;
  defineKind?: DefineKind | null;
  convertStatus?: FreeConvertStatus | null;
};

export function resolveFreeConvertStatus(value: unknown): FreeConvertStatus {
  if (value === "reserved" || value === "consumed") {
    return value;
  }
  return "available";
}

export function isFreeConvertAvailable(status: FreeConvertStatus): boolean {
  return status === "available";
}

export function isFreeConvertEligible(
  input: FreeConvertEligibilityInput,
): boolean {
  return (
    isFreeTrained(input) &&
    resolveFreeConvertStatus(input.convertStatus) === "available"
  );
}

export function isFreeConvertMetered(
  athenaPlan?: AthenaPlan | null,
): boolean {
  return athenaPlan === "free";
}

export { isFreeTrained, isFreeUntrained };
