/**
 * Deterministic organization-jurisdiction resolver for Social Planner L2.
 *
 * Server-only. No LLM. No network. No US fallback.
 * Does not treat target-market (Prospect/Persona) or operator Ads/SEO
 * geography as organization jurisdiction.
 */

import type { IdentityExecutiveIntelligence } from "@/services/identity/identityExecutiveIntelligence";
import type { DeepWebsiteIntelligence } from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import {
  SOCIAL_PLANNER_COUNTRY_CATALOG,
  findSocialPlannerCountryByCode,
  findSocialPlannerCountryByLabel,
  type SocialPlannerCountryEntry,
} from "@/services/socialPlanner/geography/socialPlannerCountryCatalog";
import {
  SOCIAL_PLANNER_GEOGRAPHY_SOURCE_KEYS,
  SOCIAL_PLANNER_UNKNOWN_GEOGRAPHY,
  type SocialPlannerGeography,
  type SocialPlannerGeographyConfidence,
  type SocialPlannerGeographyEvidence,
  type SocialPlannerGeographySourceKey,
  type SocialPlannerGeographyStatus,
} from "@/services/socialPlanner/geography/socialPlannerGeographyTypes";

const AMBIGUOUS_GEO_PATTERNS: readonly RegExp[] = [
  /\bworldwide\b/i,
  /\bglobal\b/i,
  /\binternational\b/i,
  /\bremote[- ]first\b/i,
  /\bonline[- ]only\b/i,
  /\beverywhere\b/i,
  /\bmulti[- ]country\b/i,
  /\bmultiple countries\b/i,
  /\bserving customers worldwide\b/i,
  /\bacross the (world|globe)\b/i,
];

function normalizeEvidenceText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function isAmbiguousSocialPlannerGeographyText(value: string): boolean {
  const text = normalizeEvidenceText(value);
  if (!text) return true;
  return AMBIGUOUS_GEO_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Domain / TLD alone must never establish geography.
 * Exported for tests — always returns null by design.
 */
export function geographyFromDomainOrTld(urlOrHost: string): null {
  void urlOrHost;
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchAliasesInText(text: string): SocialPlannerCountryEntry[] {
  const hits: SocialPlannerCountryEntry[] = [];

  for (const entry of SOCIAL_PLANNER_COUNTRY_CATALOG) {
    const matched = entry.aliases.some((alias) => {
      const re = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i");
      return re.test(text);
    });
    if (matched) {
      hits.push(entry);
    }
  }

  return Array.from(new Map(hits.map((hit) => [hit.countryCode, hit])).values());
}

/**
 * Match trusted evidence to at most one catalog country.
 * Ambiguous multi-geo language or multiple distinct countries → null.
 */
export function matchCountryFromTrustedText(
  value: string,
): SocialPlannerCountryEntry | null {
  const text = normalizeEvidenceText(value);
  if (!text || isAmbiguousSocialPlannerGeographyText(text)) {
    return null;
  }

  const exactCode = findSocialPlannerCountryByCode(text);
  if (exactCode && text.length <= 3) {
    return exactCode;
  }

  const exactLabel = findSocialPlannerCountryByLabel(text);
  if (exactLabel) {
    return exactLabel;
  }

  const unique = matchAliasesInText(text);
  if (unique.length !== 1) {
    return null;
  }
  return unique[0] ?? null;
}

type SourceCandidate = {
  source: SocialPlannerGeographySourceKey;
  text: string;
};

function collectSourceCandidates(
  evidence: SocialPlannerGeographyEvidence,
): SourceCandidate[] {
  const candidates: SourceCandidate[] = [];

  if (evidence.structuredCountry?.trim()) {
    candidates.push({
      source: "structured_country",
      text: evidence.structuredCountry.trim(),
    });
  }
  if (evidence.structuredAddressCountry?.trim()) {
    candidates.push({
      source: "structured_address_country",
      text: evidence.structuredAddressCountry.trim(),
    });
  }
  if (evidence.executiveGeographicReach?.trim()) {
    candidates.push({
      source: "identity_executive_intelligence.geographic_reach",
      text: evidence.executiveGeographicReach.trim(),
    });
  }
  if (evidence.deepWebsiteContactInformation?.trim()) {
    candidates.push({
      source: "deep_website.contact_information",
      text: evidence.deepWebsiteContactInformation.trim(),
    });
  }

  return candidates;
}

function confidenceForSource(
  source: SocialPlannerGeographySourceKey,
): SocialPlannerGeographyConfidence {
  if (
    source === "structured_country" ||
    source === "structured_address_country"
  ) {
    return "high";
  }
  if (source === "identity_executive_intelligence.geographic_reach") {
    return "medium";
  }
  return "low";
}

function statusForResolution(input: {
  source: SocialPlannerGeographySourceKey;
  hasConflict: boolean;
}): SocialPlannerGeographyStatus {
  if (input.hasConflict) {
    return "partially_resolved";
  }
  if (input.source === "deep_website.contact_information") {
    return "partially_resolved";
  }
  return "resolved";
}

export function resolveSocialPlannerGeography(
  evidence: SocialPlannerGeographyEvidence = {},
): SocialPlannerGeography {
  const candidates = collectSourceCandidates(evidence);
  let winner: {
    source: SocialPlannerGeographySourceKey;
    entry: SocialPlannerCountryEntry;
  } | null = null;

  for (const candidate of candidates) {
    const match = matchCountryFromTrustedText(candidate.text);
    if (match) {
      winner = { source: candidate.source, entry: match };
      break;
    }
  }

  if (!winner) {
    return { ...SOCIAL_PLANNER_UNKNOWN_GEOGRAPHY };
  }

  let conflict: SocialPlannerGeography["conflict"] = null;
  const winnerIndex = SOCIAL_PLANNER_GEOGRAPHY_SOURCE_KEYS.indexOf(winner.source);

  for (const candidate of candidates) {
    const candidateIndex = SOCIAL_PLANNER_GEOGRAPHY_SOURCE_KEYS.indexOf(
      candidate.source,
    );
    if (candidateIndex <= winnerIndex) {
      continue;
    }
    const match = matchCountryFromTrustedText(candidate.text);
    if (match && match.countryCode !== winner.entry.countryCode) {
      conflict = {
        ignoredSource: candidate.source,
        ignoredCountry: match.country,
        ignoredCountryCode: match.countryCode,
      };
      break;
    }
  }

  return {
    status: statusForResolution({
      source: winner.source,
      hasConflict: conflict != null,
    }),
    country: winner.entry.country,
    countryCode: winner.entry.countryCode,
    region: null,
    regionCode: null,
    city: null,
    timezone: null,
    locale: null,
    hemisphere: winner.entry.hemisphere,
    source: winner.source,
    confidence: confidenceForSource(winner.source),
    conflict,
  };
}

export function extractSocialPlannerGeographicReach(
  executive: IdentityExecutiveIntelligence | null | undefined,
): string | null {
  const reach = executive?.business_model?.geographic_reach;
  if (typeof reach !== "string" || !reach.trim()) return null;
  return reach.trim();
}

export function extractSocialPlannerWebsiteContact(
  intelligence: DeepWebsiteIntelligence | null | undefined,
): string | null {
  if (!intelligence) return null;
  const contact =
    intelligence.business_knowledge?.contact_information ||
    intelligence.contact_information ||
    "";
  if (typeof contact === "string" && contact.trim()) {
    return contact.trim();
  }
  return null;
}
