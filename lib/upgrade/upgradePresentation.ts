/**
 * Shared Upgrade UX presentation contracts.
 *
 * Presentation only. Callers supply feature-specific capability copy.
 * This module does not read Athena plan, entitlements, or payment state.
 */

export const UPGRADE_FEATURE_KEYS = [
  "identity",
  "identityAsk",
  "helpAsk",
  "visibility",
  "audience",
  "personaAsk",
  "advertising",
  "social",
  "convert",
  "getoblicDirectory",
  "personaCsv",
  "prospectCsv",
  "technicalSeo",
] as const;

export type UpgradeFeatureKey = (typeof UPGRADE_FEATURE_KEYS)[number];

export const UPGRADE_ACCENTS = [
  "identity",
  "visibility",
  "audience",
  "advertising",
  "social",
  "convert",
  "help",
  "chrome",
] as const;

export type UpgradeAccent = (typeof UPGRADE_ACCENTS)[number];

export const UPGRADE_CTA_TONES = ["quiet", "medium", "primary"] as const;

export type UpgradeCtaTone = (typeof UPGRADE_CTA_TONES)[number];

export const UPGRADE_CONTEXTUAL_VARIANTS = [
  "unavailable",
  "hint",
  "exhausted",
  "completion",
] as const;

export type UpgradeContextualVariant =
  (typeof UPGRADE_CONTEXTUAL_VARIANTS)[number];

export const UPGRADE_FEATURE_ACCENT = {
  identity: "identity",
  identityAsk: "identity",
  helpAsk: "help",
  visibility: "visibility",
  audience: "audience",
  personaAsk: "audience",
  advertising: "advertising",
  social: "social",
  convert: "convert",
  getoblicDirectory: "convert",
  personaCsv: "audience",
  prospectCsv: "convert",
  technicalSeo: "visibility",
} as const satisfies Record<UpgradeFeatureKey, UpgradeAccent>;

/**
 * Destination is intentionally undecided.
 * Callers may later supply a handler or href without redesigning the family.
 * FREE-15A does not invent a product destination.
 */
export type UpgradeCtaAction =
  | { kind: "none" }
  | { kind: "handler"; onContinue: () => void }
  | { kind: "href"; href: string };

export type UpgradeCapabilityStatement = {
  readonly id: string;
  readonly label: string;
};

export type UpgradeCapabilities =
  | readonly [UpgradeCapabilityStatement]
  | readonly [UpgradeCapabilityStatement, UpgradeCapabilityStatement]
  | readonly [UpgradeCapabilityStatement, UpgradeCapabilityStatement, UpgradeCapabilityStatement];

export type UpgradeCapabilityInput =
  | readonly [string]
  | readonly [string, string]
  | readonly [string, string, string];

/**
 * Contextual upgrade copy. Success / value copy stays with the caller.
 * Capabilities must name what Full Athena unlocks in this feature.
 */
export type UpgradeContextualContent = {
  feature: UpgradeFeatureKey;
  headline: string;
  capabilities: UpgradeCapabilities;
  eyebrow?: string;
  supportingText?: string;
  ctaLabel?: string;
  accent?: UpgradeAccent;
  ctaTone?: UpgradeCtaTone;
};

export type UpgradeSidebarContent = {
  eyebrow: string;
  headline: string;
  supportingText?: string;
  ctaLabel?: string;
  ctaTone?: Extract<UpgradeCtaTone, "quiet">;
};

export type UpgradeSharedCopy = {
  fullAthena: string;
  continueWithFullAthena: string;
  availableWithFullAthena: string;
  sidebarEyebrow: string;
  sidebarHeadline: string;
  sidebarSupportingText: string;
};

export function createUpgradeCapabilities(
  statements: UpgradeCapabilityInput,
): UpgradeCapabilities {
  return statements.map((label, index) => ({
    id: `upgrade-capability-${index + 1}`,
    label,
  })) as unknown as UpgradeCapabilities;
}

export function resolveUpgradeAccent(
  feature: UpgradeFeatureKey,
  accent?: UpgradeAccent,
): UpgradeAccent {
  return accent ?? UPGRADE_FEATURE_ACCENT[feature];
}

export function resolveUpgradeCtaAction(
  action?: UpgradeCtaAction | null,
): UpgradeCtaAction {
  return action ?? { kind: "none" };
}

export function isUpgradeCtaActionInteractive(
  action?: UpgradeCtaAction | null,
): boolean {
  const resolved = resolveUpgradeCtaAction(action);
  return resolved.kind === "handler" || resolved.kind === "href";
}

export function defaultUpgradeCtaTone(
  variant: UpgradeContextualVariant | "sidebar",
): UpgradeCtaTone {
  if (variant === "exhausted" || variant === "completion") {
    return "medium";
  }
  return "quiet";
}

export function upgradeSidebarContent(
  copy: UpgradeSharedCopy,
): UpgradeSidebarContent {
  return {
    eyebrow: copy.sidebarEyebrow,
    headline: copy.sidebarHeadline,
    supportingText: copy.sidebarSupportingText,
    ctaLabel: copy.continueWithFullAthena,
    ctaTone: "quiet",
  };
}
