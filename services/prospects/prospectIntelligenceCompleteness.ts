/**
 * Deterministic Prospect Completeness score.
 * Coverage of existing evidence only — never opportunity ranking,
 * LLM confidence, lifecycle, or generated outreach quality.
 */

import { isActiveGetOblicRelationshipStatus } from "@/services/getoblicDirectory/getoblicDirectoryTypes";
import { websiteIntelligenceHasUsableContent } from "@/services/prospects/prospectWebsiteLearningPolicy";
import { normalizeWebsiteUrl } from "@/services/prospects/prospectUtils";

export const PROSPECT_COMPLETENESS_WEIGHTS = {
  identityCore: 25,
  contact: 20,
  website: 15,
  websiteIntelligence: 20,
  generatedIntelligence: 15,
  enrichment: 5,
} as const;

const TRIVIAL_PLACEHOLDERS = new Set([
  "na",
  "n/a",
  "tbd",
  "todo",
  "none",
  "null",
  "undefined",
  "xxx",
  "placeholder",
]);

export type ProspectCompletenessBand = "Low" | "Medium" | "Strong" | "Excellent";

export type ProspectCompletenessBreakdown = {
  identityCore: number;
  contact: number;
  website: number;
  websiteIntelligence: number;
  generatedIntelligence: number;
  enrichment: number;
};

export type ProspectCompletenessResult = {
  score: number;
  band: ProspectCompletenessBand;
  breakdown: ProspectCompletenessBreakdown;
};

export type ProspectCompletenessSource = {
  business_name?: string | null;
  category?: string | null;
  industry?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp_number?: string | null;
  website?: string | null;
  website_intelligence?: Record<string, unknown> | null;
  linkedin?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  google_business_url?: string | null;
  ads_content?: string | null;
  notes?: string | null;
  additional_context?: string | null;
  raw_json?: Record<string, unknown> | null;
  opportunity_score?: number | null;
  lifecycle_status?: string | null;
};

export type ProspectCompletenessLinkInput = {
  relationship_status?: string | null;
} | null;

export function isMeaningfullyPopulated(
  value: string | null | undefined,
): boolean {
  const text = value?.trim() ?? "";
  if (text.length < 2) return false;
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!normalized) return false;
  if (TRIVIAL_PLACEHOLDERS.has(text.toLowerCase().trim())) return false;
  return !TRIVIAL_PLACEHOLDERS.has(normalized);
}

export function prospectCompletenessBand(
  score: number,
): ProspectCompletenessBand {
  if (score <= 39) return "Low";
  if (score <= 69) return "Medium";
  if (score <= 89) return "Strong";
  return "Excellent";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function readImportedSourceDescription(
  rawJson?: Record<string, unknown> | null,
): string | null {
  const root = asRecord(rawJson);
  if (!root) return null;

  const candidates: unknown[] = [
    root.description,
    asRecord(root.listing)?.description,
    asRecord(root.getoblic)?.description,
    asRecord(asRecord(root.listing)?.observed)?.description,
    asRecord(root.observed)?.description,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && isMeaningfullyPopulated(candidate)) {
      return candidate.trim();
    }
  }
  return null;
}

export function hasActiveGetOblicListingLink(
  link?: ProspectCompletenessLinkInput,
): boolean {
  const status = link?.relationship_status?.trim() ?? "";
  return Boolean(status) && isActiveGetOblicRelationshipStatus(status);
}

function identityCorePoints(prospect: ProspectCompletenessSource): number {
  const checks = [
    isMeaningfullyPopulated(prospect.business_name),
    isMeaningfullyPopulated(prospect.category) ||
      isMeaningfullyPopulated(prospect.industry),
    isMeaningfullyPopulated(prospect.city) ||
      isMeaningfullyPopulated(prospect.state) ||
      isMeaningfullyPopulated(prospect.country) ||
      isMeaningfullyPopulated(prospect.address),
  ];
  const filled = checks.filter(Boolean).length;
  return (filled / checks.length) * PROSPECT_COMPLETENESS_WEIGHTS.identityCore;
}

export function computeProspectIntelligenceCompleteness(input: {
  prospect: ProspectCompletenessSource | null | undefined;
  hasCurrentExecutiveVersion?: boolean;
  hasActiveGetOblicListingLink?: boolean;
  analysisConfidence?: number | null;
}): ProspectCompletenessResult {
  const prospect = input.prospect ?? {};
  const identityCore = identityCorePoints(prospect);

  const contact =
    isMeaningfullyPopulated(prospect.email) ||
    isMeaningfullyPopulated(prospect.phone) ||
    isMeaningfullyPopulated(prospect.whatsapp_number)
      ? PROSPECT_COMPLETENESS_WEIGHTS.contact
      : 0;

  const website = normalizeWebsiteUrl(prospect.website)
    ? PROSPECT_COMPLETENESS_WEIGHTS.website
    : 0;

  const websiteIntelligence = websiteIntelligenceHasUsableContent(
    prospect.website_intelligence,
  )
    ? PROSPECT_COMPLETENESS_WEIGHTS.websiteIntelligence
    : 0;

  const generatedIntelligence = input.hasCurrentExecutiveVersion
    ? PROSPECT_COMPLETENESS_WEIGHTS.generatedIntelligence
    : 0;

  const enrichment =
    isMeaningfullyPopulated(prospect.linkedin) ||
    isMeaningfullyPopulated(prospect.facebook) ||
    isMeaningfullyPopulated(prospect.instagram) ||
    isMeaningfullyPopulated(prospect.google_business_url) ||
    Boolean(input.hasActiveGetOblicListingLink) ||
    isMeaningfullyPopulated(prospect.ads_content) ||
    isMeaningfullyPopulated(prospect.notes) ||
    isMeaningfullyPopulated(prospect.additional_context) ||
    Boolean(readImportedSourceDescription(prospect.raw_json))
      ? PROSPECT_COMPLETENESS_WEIGHTS.enrichment
      : 0;

  void prospect.opportunity_score;
  void prospect.lifecycle_status;
  void input.analysisConfidence;

  const breakdown: ProspectCompletenessBreakdown = {
    identityCore,
    contact,
    website,
    websiteIntelligence,
    generatedIntelligence,
    enrichment,
  };

  const weighted =
    breakdown.identityCore +
    breakdown.contact +
    breakdown.website +
    breakdown.websiteIntelligence +
    breakdown.generatedIntelligence +
    breakdown.enrichment;

  const score = Math.min(100, Math.max(0, Math.round(weighted)));

  return {
    score,
    band: prospectCompletenessBand(score),
    breakdown,
  };
}
