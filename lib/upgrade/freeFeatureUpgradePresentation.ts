/**
 * Feature-owned Full Athena continuation content for completed Free
 * core-feature surfaces.
 *
 * Presentation only. Callers decide visibility from existing page
 * presentation / plan state. This module does not read plan,
 * entitlements, reservations, or payment state.
 */

import {
  createUpgradeCapabilities,
  type UpgradeContextualContent,
  type UpgradeSharedCopy,
} from "@/lib/upgrade/upgradePresentation";

export type FreeFeatureContinuationCopy = {
  headline: string;
  supportingText?: string;
  capability1: string;
  capability2: string;
  capability3: string;
};

function featureUpgradeContent(input: {
  feature: UpgradeContextualContent["feature"];
  accent: UpgradeContextualContent["accent"];
  continuation: FreeFeatureContinuationCopy;
  upgrade: UpgradeSharedCopy;
  eyebrow?: string;
}): UpgradeContextualContent {
  return {
    feature: input.feature,
    accent: input.accent,
    eyebrow: input.eyebrow ?? input.upgrade.fullAthena,
    headline: input.continuation.headline,
    supportingText: input.continuation.supportingText,
    capabilities: createUpgradeCapabilities([
      input.continuation.capability1,
      input.continuation.capability2,
      input.continuation.capability3,
    ]),
    ctaLabel: input.upgrade.continueWithFullAthena,
  };
}

export function audienceUpgradeContent(input: {
  continuation: FreeFeatureContinuationCopy;
  upgrade: UpgradeSharedCopy;
}): UpgradeContextualContent {
  return featureUpgradeContent({
    feature: "audience",
    accent: "audience",
    continuation: input.continuation,
    upgrade: input.upgrade,
  });
}

export function visibilityUpgradeContent(input: {
  continuation: FreeFeatureContinuationCopy;
  upgrade: UpgradeSharedCopy;
}): UpgradeContextualContent {
  return featureUpgradeContent({
    feature: "visibility",
    accent: "visibility",
    continuation: input.continuation,
    upgrade: input.upgrade,
  });
}

export function advertisingUpgradeContent(input: {
  continuation: FreeFeatureContinuationCopy;
  upgrade: UpgradeSharedCopy;
}): UpgradeContextualContent {
  return featureUpgradeContent({
    feature: "advertising",
    accent: "advertising",
    continuation: input.continuation,
    upgrade: input.upgrade,
  });
}

export function socialUpgradeContent(input: {
  continuation: FreeFeatureContinuationCopy;
  upgrade: UpgradeSharedCopy;
}): UpgradeContextualContent {
  return featureUpgradeContent({
    feature: "social",
    accent: "social",
    continuation: input.continuation,
    upgrade: input.upgrade,
  });
}

export function convertUpgradeContent(input: {
  continuation: FreeFeatureContinuationCopy;
  upgrade: UpgradeSharedCopy;
}): UpgradeContextualContent {
  return featureUpgradeContent({
    feature: "convert",
    accent: "convert",
    continuation: input.continuation,
    upgrade: input.upgrade,
  });
}

export function getoblicDirectoryUpgradeContent(input: {
  continuation: FreeFeatureContinuationCopy;
  upgrade: UpgradeSharedCopy;
  availabilityLabel?: string;
}): UpgradeContextualContent {
  return featureUpgradeContent({
    feature: "getoblicDirectory",
    accent: "convert",
    continuation: input.continuation,
    upgrade: input.upgrade,
    eyebrow: input.availabilityLabel ?? input.upgrade.availableWithFullAthena,
  });
}
