/**
 * Compact Full Athena presentation for secondary locked methods.
 *
 * Presentation only. Callers decide visibility from existing page
 * presentation / plan state. This module does not read plan,
 * entitlements, reservations, or payment state.
 *
 * Secondary locked methods use UpgradeHint and omit a continuation
 * CTA label so they stay compact beside available Free actions.
 */

import {
  createUpgradeCapabilities,
  type UpgradeContextualContent,
  type UpgradeSharedCopy,
} from "@/lib/upgrade/upgradePresentation";

export type FreeSecondaryLockedCopy = {
  headline: string;
  capability1: string;
  capability2: string;
  supportingText?: string;
};

function secondaryLockedContent(input: {
  feature: UpgradeContextualContent["feature"];
  accent: UpgradeContextualContent["accent"];
  locked: FreeSecondaryLockedCopy;
  upgrade: UpgradeSharedCopy;
  availabilityLabel?: string;
}): UpgradeContextualContent {
  return {
    feature: input.feature,
    accent: input.accent,
    eyebrow: input.availabilityLabel ?? input.upgrade.availableWithFullAthena,
    headline: input.locked.headline,
    supportingText: input.locked.supportingText,
    capabilities: createUpgradeCapabilities([
      input.locked.capability1,
      input.locked.capability2,
    ]),
  };
}

export function technicalSeoUpgradeContent(input: {
  locked: FreeSecondaryLockedCopy;
  upgrade: UpgradeSharedCopy;
  availabilityLabel?: string;
}): UpgradeContextualContent {
  return secondaryLockedContent({
    feature: "technicalSeo",
    accent: "visibility",
    locked: input.locked,
    upgrade: input.upgrade,
    availabilityLabel: input.availabilityLabel,
  });
}

export function personaCsvUpgradeContent(input: {
  locked: FreeSecondaryLockedCopy;
  upgrade: UpgradeSharedCopy;
  availabilityLabel?: string;
}): UpgradeContextualContent {
  return secondaryLockedContent({
    feature: "personaCsv",
    accent: "audience",
    locked: input.locked,
    upgrade: input.upgrade,
    availabilityLabel: input.availabilityLabel,
  });
}

export function prospectCsvUpgradeContent(input: {
  locked: FreeSecondaryLockedCopy;
  upgrade: UpgradeSharedCopy;
  availabilityLabel?: string;
}): UpgradeContextualContent {
  return secondaryLockedContent({
    feature: "prospectCsv",
    accent: "convert",
    locked: input.locked,
    upgrade: input.upgrade,
    availabilityLabel: input.availabilityLabel,
  });
}
