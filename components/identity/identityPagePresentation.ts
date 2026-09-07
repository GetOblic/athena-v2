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
  voice: "identity-voice",
  knowledge: "identity-knowledge",
  website: "identity-website",
  websiteKnowledge: "identity-website-knowledge",
} as const;

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
