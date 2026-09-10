import type { TenantMessages } from "@/lib/tenantI18n/types";
import {
  type IdentityBusinessModelMap,
  type IdentityCalibrationGap,
  type IdentityConfidenceLevel,
  type IdentityUpdateLocation,
  type IdentityWebsiteSourcePage,
} from "@/services/identity/identityExecutiveIntelligence";
import { hasUsableStoredHomepageLearning } from "@/services/identity/identityHomepageLearning";
import type { AthenaIdentity } from "@/services/identity/identityService";
import { isDeepWebsiteIntelligence } from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";

export const PRIMARY_BUSINESS_MODEL_KEYS = [
  "business_overview",
  "primary_audience",
  "products_and_services",
  "positioning",
  "value_proposition",
] as const satisfies ReadonlyArray<keyof IdentityBusinessModelMap>;

export const IDENTITY_FIELD_ANCHORS = {
  teach: "identity-teach",
  voice: "identity-voice",
  knowledge: "identity-knowledge",
  website: "identity-website",
  websiteKnowledge: "identity-website-knowledge",
} as const;

export type IdentityCardAccent =
  | "orange"
  | "blue"
  | "violet"
  | "green"
  | "warm"
  | "magenta";

const IDENTITY_CARD_SURFACE: Record<IdentityCardAccent, string> = {
  orange:
    "relative !border-[rgba(255,102,0,0.34)] hover:!border-[rgba(255,102,0,0.52)] bg-[linear-gradient(180deg,rgba(255,102,0,0.07),transparent_46%)] shadow-[0_0_28px_rgba(255,102,0,0.05)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(255,102,0,0.7)]",
  blue:
    "relative !border-[rgba(56,189,248,0.30)] hover:!border-[rgba(56,189,248,0.50)] bg-[linear-gradient(180deg,rgba(56,189,248,0.06),transparent_46%)] shadow-[0_0_24px_rgba(56,189,248,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(56,189,248,0.65)]",
  violet:
    "relative !border-[rgba(167,139,250,0.30)] hover:!border-[rgba(167,139,250,0.48)] bg-[linear-gradient(180deg,rgba(167,139,250,0.06),transparent_46%)] shadow-[0_0_24px_rgba(167,139,250,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.62)]",
  green:
    "relative border-[var(--athena-success)]/35 hover:border-[var(--athena-success)]/55 !border-[var(--athena-success)]/45 hover:!border-[var(--athena-success)]/70 bg-[linear-gradient(180deg,rgba(0,208,132,0.09),rgba(19,19,26,0.15)_52%)] shadow-[0_0_30px_rgba(0,208,132,0.08)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[var(--athena-success)]/80",
  warm:
    "relative !border-[rgba(255,160,80,0.28)] hover:!border-[rgba(255,160,80,0.46)] bg-[linear-gradient(180deg,rgba(255,160,80,0.05),transparent_46%)] shadow-[0_0_22px_rgba(255,160,80,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(255,160,80,0.58)]",
  magenta:
    "relative !border-[rgba(232,121,189,0.28)] hover:!border-[rgba(232,121,189,0.46)] bg-[linear-gradient(180deg,rgba(232,121,189,0.06),transparent_46%)] shadow-[0_0_24px_rgba(232,121,189,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(232,121,189,0.6)]",
};

export const IDENTITY_CARD_ICON_CLASS: Record<IdentityCardAccent, string> = {
  orange:
    "border border-[rgba(255,102,0,0.32)] bg-[rgba(255,102,0,0.14)] text-[var(--athena-orange)] shadow-[0_0_16px_rgba(255,102,0,0.22)]",
  blue:
    "border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.13)] text-sky-300 shadow-[0_0_16px_rgba(56,189,248,0.18)]",
  violet:
    "border border-[rgba(167,139,250,0.32)] bg-[rgba(167,139,250,0.13)] text-violet-300 shadow-[0_0_16px_rgba(167,139,250,0.16)]",
  green:
    "border border-[var(--athena-success)]/40 bg-[var(--athena-success)]/15 text-[var(--athena-success)] shadow-[0_0_18px_rgba(0,208,132,0.22)]",
  warm:
    "border border-[rgba(255,160,80,0.30)] bg-[rgba(255,160,80,0.12)] text-orange-200 shadow-[0_0_14px_rgba(255,160,80,0.16)]",
  magenta:
    "border border-[rgba(232,121,189,0.32)] bg-[rgba(232,121,189,0.12)] text-pink-300 shadow-[0_0_16px_rgba(232,121,189,0.16)]",
};

export const IDENTITY_CARD_SURFACE_CLASS = IDENTITY_CARD_SURFACE;

/** Stronger green contour for Teach Athena and Client Brand Identity cards. */
export const IDENTITY_SUCCESS_SECTION_CONTOUR_CLASS =
  IDENTITY_CARD_SURFACE.green;

export const IDENTITY_RETRAIN_ACTION_CLASS =
  "inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--athena-orange)] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90 sm:w-auto";

export const IDENTITY_HEADER_RETRAIN_ACTION_CLASS =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--athena-orange)] px-4 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90";

export const IDENTITY_UPDATE_LOCATION_HREFS = {
  "Your Voice": `#${IDENTITY_FIELD_ANCHORS.voice}`,
  "Your Business Knowledge": `#${IDENTITY_FIELD_ANCHORS.knowledge}`,
  "Business Website": `#${IDENTITY_FIELD_ANCHORS.website}`,
  "Website content": `#${IDENTITY_FIELD_ANCHORS.websiteKnowledge}`,
} as const satisfies Record<IdentityUpdateLocation, string>;

const PAGE_GROUP_KEYS = {
  Homepage: "pageGroupHomepage",
  About: "pageGroupAbout",
  Services: "pageGroupServices",
  Products: "pageGroupProducts",
  Pricing: "pageGroupPricing",
  "Training / Education": "pageGroupTraining",
  "Case Studies": "pageGroupCaseStudies",
  FAQ: "pageGroupFaq",
  "Blog / Resources": "pageGroupBlog",
  Contact: "pageGroupContact",
  Policies: "pageGroupPolicies",
  Other: "pageGroupOther",
} as const satisfies Record<string, keyof TenantMessages["identity"]["executive"]>;

export function hasSuccessfulAthenaTraining(
  identity: AthenaIdentity | null,
): boolean {
  if (!identity) return false;
  return (
    identity.brain_status === "ready" ||
    Boolean(identity.master_profile) ||
    Boolean(identity.brain_last_updated)
  );
}

export function isAthenaBrainTraining(identity: AthenaIdentity | null): boolean {
  return (
    identity?.brain_status === "pending" ||
    identity?.brain_status === "processing"
  );
}

export function shouldOpenTeachAthena(input: {
  trained: boolean;
  training: boolean;
  hasCalibrationGaps: boolean;
}): boolean {
  return !input.trained || input.training || input.hasCalibrationGaps;
}

export function listBusinessModelEntries(
  model: IdentityBusinessModelMap,
): Array<[keyof IdentityBusinessModelMap, string]> {
  return (
    Object.entries(model) as Array<[keyof IdentityBusinessModelMap, string]>
  ).filter(([, value]) => Boolean(value?.trim()));
}

export function splitBusinessModelEntries(model: IdentityBusinessModelMap): {
  primary: Array<[keyof IdentityBusinessModelMap, string]>;
  secondary: Array<[keyof IdentityBusinessModelMap, string]>;
} {
  const entries = listBusinessModelEntries(model);
  const primaryKeys = new Set<string>(PRIMARY_BUSINESS_MODEL_KEYS);
  return {
    primary: entries.filter(([key]) => primaryKeys.has(key)),
    secondary: entries.filter(([key]) => !primaryKeys.has(key)),
  };
}

export function localizeConfidence(
  level: IdentityConfidenceLevel,
  messages: TenantMessages["identity"]["executive"],
): string {
  if (level === "strong") return messages.confidenceStrong;
  if (level === "developing") return messages.confidenceDeveloping;
  return messages.confidenceLimited;
}

export function localizePageGroup(
  group: string,
  messages: TenantMessages["identity"]["executive"],
): string {
  const key = PAGE_GROUP_KEYS[group as keyof typeof PAGE_GROUP_KEYS];
  return key ? messages[key] : group;
}

export function localizeUpdateLocation(
  location: IdentityUpdateLocation,
  messages: TenantMessages["identity"]["page"],
): string {
  if (location === "Your Voice") return messages.updateLocationVoice;
  if (location === "Your Business Knowledge") {
    return messages.updateLocationKnowledge;
  }
  if (location === "Business Website") return messages.updateLocationWebsite;
  return messages.updateLocationWebsiteContent;
}

export function groupSourcePages(
  pages: IdentityWebsiteSourcePage[],
): Array<[string, IdentityWebsiteSourcePage[]]> {
  const map = new Map<string, IdentityWebsiteSourcePage[]>();
  for (const page of pages) {
    const list = map.get(page.group) ?? [];
    list.push(page);
    map.set(page.group, list);
  }
  return Array.from(map.entries());
}

export function readWebsiteKnowledgeFlags(identity: AthenaIdentity | null): {
  hasWebsiteUrl: boolean;
  hasHomepageLearning: boolean;
  hasDeepIntelligence: boolean;
} {
  const hasWebsiteUrl = Boolean(identity?.website?.trim());
  return {
    hasWebsiteUrl,
    hasHomepageLearning: hasUsableStoredHomepageLearning(
      identity?.master_profile,
    ),
    hasDeepIntelligence: isDeepWebsiteIntelligence(
      identity?.website_intelligence,
    ),
  };
}

export function hasMaterialCalibrationGaps(
  gaps: IdentityCalibrationGap[] | undefined,
): boolean {
  return Boolean(gaps?.some((gap) => gap.what_is_unclear.trim()));
}
