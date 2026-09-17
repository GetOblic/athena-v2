/**
 * Global Full Athena invitation visibility for tenant chrome.
 *
 * Presentation only. Authority is the existing shell plan plus Define
 * readiness kind already used by navigation. This module does not read
 * the database or payment state.
 */

import {
  isFreeUntrained,
  type FreeUntrainedInput,
} from "@/lib/organization/freeUntrained";
import {
  upgradeSidebarContent,
  type UpgradeSharedCopy,
  type UpgradeSidebarContent,
} from "@/lib/upgrade/upgradePresentation";

export function shouldShowGlobalFullAthenaInvite(
  input: FreeUntrainedInput,
): boolean {
  return (
    input.athenaPlan === "free" &&
    input.defineKind != null &&
    !isFreeUntrained(input)
  );
}

export function resolveGlobalFullAthenaInvite(
  input: FreeUntrainedInput,
  copy: UpgradeSharedCopy,
): UpgradeSidebarContent | null {
  if (!shouldShowGlobalFullAthenaInvite(input)) {
    return null;
  }

  return upgradeSidebarContent(copy);
}
