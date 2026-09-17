/**
 * Feature-owned Full Athena continuation content for exhausted Free Ask surfaces.
 *
 * Presentation only. Callers decide visibility from existing Ask presentation.
 * This module does not read plan, entitlements, reservations, or payment state.
 */

import {
  createUpgradeCapabilities,
  type UpgradeContextualContent,
  type UpgradeSharedCopy,
} from "@/lib/upgrade/upgradePresentation";

export type FreeAskContinuationCopy = {
  headline: string;
  supportingText?: string;
  capability1: string;
  capability2: string;
  capability3: string;
};

export function identityAskUpgradeContent(input: {
  continuation: FreeAskContinuationCopy;
  upgrade: UpgradeSharedCopy;
}): UpgradeContextualContent {
  return {
    feature: "identityAsk",
    accent: "identity",
    eyebrow: input.upgrade.fullAthena,
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

export function helpAskUpgradeContent(input: {
  continuation: FreeAskContinuationCopy;
  upgrade: UpgradeSharedCopy;
}): UpgradeContextualContent {
  return {
    feature: "helpAsk",
    accent: "help",
    eyebrow: input.upgrade.fullAthena,
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

export function personaAskUpgradeContent(input: {
  continuation: FreeAskContinuationCopy;
  upgrade: UpgradeSharedCopy;
}): UpgradeContextualContent {
  return {
    feature: "personaAsk",
    accent: "audience",
    eyebrow: input.upgrade.fullAthena,
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
