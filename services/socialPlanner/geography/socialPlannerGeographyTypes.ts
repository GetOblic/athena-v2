/**
 * Social Planner L2 geography / jurisdiction contracts.
 *
 * Resolves the organization's primary calendar jurisdiction — not target markets.
 * Unknown geography is a valid result. Invented geography is not.
 */

export const SOCIAL_PLANNER_GEOGRAPHY_STATUSES = [
  "resolved",
  "partially_resolved",
  "unknown",
] as const;

export type SocialPlannerGeographyStatus =
  (typeof SOCIAL_PLANNER_GEOGRAPHY_STATUSES)[number];

export const SOCIAL_PLANNER_HEMISPHERES = [
  "northern",
  "southern",
  "unknown",
] as const;

export type SocialPlannerHemisphere =
  (typeof SOCIAL_PLANNER_HEMISPHERES)[number];

export const SOCIAL_PLANNER_GEOGRAPHY_CONFIDENCE = [
  "high",
  "medium",
  "low",
  "none",
] as const;

export type SocialPlannerGeographyConfidence =
  (typeof SOCIAL_PLANNER_GEOGRAPHY_CONFIDENCE)[number];

/**
 * Deterministic source keys, highest authority first.
 *
 * 1. structured_country — reserved future org field (not on organizations today)
 * 2. structured_address_country — reserved future address country
 * 3. identity_executive_intelligence.geographic_reach — persisted EI free text
 * 4. deep_website.contact_information — scraped/synthesized contact text
 *
 * Not used: domain/TLD, Ads/SEO operator geography, Prospect/Persona target geo,
 * website html_language/hreflang, organization locale/timezone (absent).
 */
export const SOCIAL_PLANNER_GEOGRAPHY_SOURCE_KEYS = [
  "structured_country",
  "structured_address_country",
  "identity_executive_intelligence.geographic_reach",
  "deep_website.contact_information",
] as const;

export type SocialPlannerGeographySourceKey =
  (typeof SOCIAL_PLANNER_GEOGRAPHY_SOURCE_KEYS)[number];

export type SocialPlannerGeographyEvidence = {
  structuredCountry?: string | null;
  structuredAddressCountry?: string | null;
  executiveGeographicReach?: string | null;
  deepWebsiteContactInformation?: string | null;
};

export type SocialPlannerGeographyConflict = {
  ignoredSource: SocialPlannerGeographySourceKey;
  ignoredCountry: string;
  ignoredCountryCode: string;
};

/**
 * Compact frozen geography. Free-text evidence is never persisted here.
 */
export type SocialPlannerGeography = {
  status: SocialPlannerGeographyStatus;
  country: string | null;
  countryCode: string | null;
  region: string | null;
  regionCode: string | null;
  city: string | null;
  timezone: string | null;
  locale: string | null;
  hemisphere: SocialPlannerHemisphere;
  source: SocialPlannerGeographySourceKey | null;
  confidence: SocialPlannerGeographyConfidence;
  conflict: SocialPlannerGeographyConflict | null;
};

export const SOCIAL_PLANNER_UNKNOWN_GEOGRAPHY: SocialPlannerGeography = {
  status: "unknown",
  country: null,
  countryCode: null,
  region: null,
  regionCode: null,
  city: null,
  timezone: null,
  locale: null,
  hemisphere: "unknown",
  source: null,
  confidence: "none",
  conflict: null,
};
