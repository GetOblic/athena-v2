/**
 * Identity Executive Intelligence — structured Brain understanding contract.
 * Persisted under master_profile.executive_intelligence (jsonb, no migration).
 */

import {
  isDeepWebsiteIntelligence,
  type DeepCrawledPage,
  type DeepWebsiteIntelligence,
} from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";

export const IDENTITY_EXECUTIVE_INTELLIGENCE_KEY = "executive_intelligence";

export type IdentityConfidenceLevel = "strong" | "developing" | "limited";

export type IdentityUpdateLocation =
  | "Your Voice"
  | "Your Business Knowledge"
  | "Business Website"
  | "Website content";

export type IdentityBusinessModelMap = {
  business_overview?: string;
  primary_audience?: string;
  problems_solved?: string;
  products_and_services?: string;
  positioning?: string;
  value_proposition?: string;
  differentiators?: string;
  trust_signals?: string;
  business_model?: string;
  geographic_reach?: string;
  customer_journey?: string;
  calls_to_action?: string;
  communication_style?: string;
  strategic_priorities?: string;
};

export type IdentityHiddenSignal = {
  finding: string;
  why_it_matters: string;
};

export type IdentityCalibrationGap = {
  what_is_unclear: string;
  why_it_matters: string;
  update_location: IdentityUpdateLocation;
};

export type IdentityExecutiveIntelligence = {
  executive_summary: string;
  confidence_level: IdentityConfidenceLevel;
  confidence_reasons: string[];
  voice_alignment: IdentityConfidenceLevel;
  business_knowledge_coverage: IdentityConfidenceLevel;
  website_evidence_coverage: IdentityConfidenceLevel;
  business_model: IdentityBusinessModelMap;
  hidden_signals: IdentityHiddenSignal[];
  calibration_gaps: IdentityCalibrationGap[];
};

export type IdentityWebsiteSourcePage = {
  title: string | null;
  url: string;
  pageType: string;
  group: string;
};

export type IdentityWebsiteCoverageView = {
  learningMode: "homepage" | "deep";
  websiteDomain: string | null;
  homepageUrl: string | null;
  pagesDiscovered: number | null;
  pagesSelected: number | null;
  pagesAnalyzed: number;
  lastHomepageLearningAt: string | null;
  lastDeepScrapeAt: string | null;
  lastRetrainedAt: string | null;
  sourcePages: IdentityWebsiteSourcePage[];
};

const BUSINESS_MODEL_KEYS: Array<keyof IdentityBusinessModelMap> = [
  "business_overview",
  "primary_audience",
  "problems_solved",
  "products_and_services",
  "positioning",
  "value_proposition",
  "differentiators",
  "trust_signals",
  "business_model",
  "geographic_reach",
  "customer_journey",
  "calls_to_action",
  "communication_style",
  "strategic_priorities",
];

export const BUSINESS_MODEL_FIELD_LABELS: Record<
  keyof IdentityBusinessModelMap,
  string
> = {
  business_overview: "Business Overview",
  primary_audience: "Primary Audience",
  problems_solved: "Problems Solved",
  products_and_services: "Products and Services",
  positioning: "Positioning",
  value_proposition: "Value Proposition",
  differentiators: "Differentiators",
  trust_signals: "Trust Signals",
  business_model: "Business Model",
  geographic_reach: "Geographic Reach",
  customer_journey: "Customer Journey",
  calls_to_action: "Calls to Action",
  communication_style: "Communication Style",
  strategic_priorities: "Strategic Priorities",
};

const UPDATE_LOCATIONS = new Set<IdentityUpdateLocation>([
  "Your Voice",
  "Your Business Knowledge",
  "Business Website",
  "Website content",
]);

const PAGE_TYPE_GROUPS: Array<{ group: string; match: RegExp }> = [
  { group: "Homepage", match: /^homepage$|^home$|^root$/i },
  { group: "About", match: /about|team|story|founder/i },
  { group: "Services", match: /service|treatment|offer/i },
  { group: "Products", match: /product|shop|store/i },
  { group: "Pricing", match: /pric|package|membership/i },
  { group: "Training / Education", match: /train|course|educat|academy|class/i },
  { group: "Case Studies", match: /case|result|portfolio|before/i },
  { group: "FAQ", match: /faq|question/i },
  { group: "Blog / Resources", match: /blog|resource|article|news/i },
  { group: "Contact", match: /contact|book|appoint|location/i },
  { group: "Policies", match: /policy|privacy|terms|legal/i },
];

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asStringArray(value: unknown, max = 12): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    const text = asTrimmedString(entry);
    if (!text) continue;
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeConfidenceLevel(value: unknown): IdentityConfidenceLevel | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "strong" || normalized === "high") return "strong";
  if (normalized === "developing" || normalized === "medium") return "developing";
  if (normalized === "limited" || normalized === "low" || normalized === "weak") {
    return "limited";
  }
  return null;
}

function normalizeUpdateLocation(value: unknown): IdentityUpdateLocation | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (UPDATE_LOCATIONS.has(trimmed as IdentityUpdateLocation)) {
    return trimmed as IdentityUpdateLocation;
  }
  const lower = trimmed.toLowerCase();
  if (lower.includes("voice")) return "Your Voice";
  if (lower.includes("business knowledge") || lower.includes("expertise")) {
    return "Your Business Knowledge";
  }
  if (lower.includes("website content") || lower.includes("page content")) {
    return "Website content";
  }
  if (lower.includes("website") || lower.includes("url")) {
    return "Business Website";
  }
  return null;
}

function normalizeBusinessModel(value: unknown): IdentityBusinessModelMap {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const out: IdentityBusinessModelMap = {};
  for (const key of BUSINESS_MODEL_KEYS) {
    const text = asTrimmedString(record[key]);
    if (text) out[key] = text;
  }
  return out;
}

function normalizeHiddenSignals(value: unknown): IdentityHiddenSignal[] {
  if (!Array.isArray(value)) return [];
  const out: IdentityHiddenSignal[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const finding =
      asTrimmedString(record.finding) ??
      asTrimmedString(record.Finding);
    const why =
      asTrimmedString(record.why_it_matters) ??
      asTrimmedString(record.whyItMatters) ??
      asTrimmedString(record["Why it matters"]);
    if (!finding || !why) continue;
    out.push({ finding, why_it_matters: why });
    if (out.length >= 8) break;
  }
  return out;
}

function normalizeCalibrationGaps(value: unknown): IdentityCalibrationGap[] {
  if (!Array.isArray(value)) return [];
  const out: IdentityCalibrationGap[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const what =
      asTrimmedString(record.what_is_unclear) ??
      asTrimmedString(record.whatIsUnclear);
    const why =
      asTrimmedString(record.why_it_matters) ??
      asTrimmedString(record.whyItMatters);
    const location = normalizeUpdateLocation(
      record.update_location ?? record.updateLocation ?? record.Update,
    );
    if (!what || !why || !location) continue;
    out.push({
      what_is_unclear: what,
      why_it_matters: why,
      update_location: location,
    });
    if (out.length >= 10) break;
  }
  return out;
}

/**
 * Normalize model output into a durable EI contract.
 * Returns null when the summary is missing (incomplete / unusable).
 */
export function normalizeIdentityExecutiveIntelligence(
  value: unknown,
): IdentityExecutiveIntelligence | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const executiveSummary = asTrimmedString(record.executive_summary);
  if (!executiveSummary) return null;

  const confidenceLevel =
    normalizeConfidenceLevel(record.confidence_level) ?? "developing";
  const voiceAlignment =
    normalizeConfidenceLevel(record.voice_alignment) ?? confidenceLevel;
  const businessKnowledgeCoverage =
    normalizeConfidenceLevel(record.business_knowledge_coverage) ??
    confidenceLevel;
  const websiteEvidenceCoverage =
    normalizeConfidenceLevel(record.website_evidence_coverage) ??
    confidenceLevel;

  return {
    executive_summary: executiveSummary,
    confidence_level: confidenceLevel,
    confidence_reasons: asStringArray(record.confidence_reasons, 8),
    voice_alignment: voiceAlignment,
    business_knowledge_coverage: businessKnowledgeCoverage,
    website_evidence_coverage: websiteEvidenceCoverage,
    business_model: normalizeBusinessModel(record.business_model),
    hidden_signals: normalizeHiddenSignals(record.hidden_signals),
    calibration_gaps: normalizeCalibrationGaps(record.calibration_gaps),
  };
}

export function readIdentityExecutiveIntelligence(
  masterProfile: Record<string, unknown> | null | undefined,
): IdentityExecutiveIntelligence | null {
  if (!masterProfile) return null;
  return normalizeIdentityExecutiveIntelligence(
    masterProfile[IDENTITY_EXECUTIVE_INTELLIGENCE_KEY],
  );
}

/**
 * Attach normalized EI to a freshly compiled master profile.
 * Preserves the previous successful EI when the new payload is incomplete.
 */
export function attachIdentityExecutiveIntelligence(input: {
  masterProfile: Record<string, unknown>;
  previousMasterProfile?: Record<string, unknown> | null;
}): {
  masterProfile: Record<string, unknown>;
  executiveIntelligence: IdentityExecutiveIntelligence | null;
  preservedPrevious: boolean;
} {
  const next = normalizeIdentityExecutiveIntelligence(
    input.masterProfile[IDENTITY_EXECUTIVE_INTELLIGENCE_KEY],
  );
  if (next) {
    return {
      masterProfile: {
        ...input.masterProfile,
        [IDENTITY_EXECUTIVE_INTELLIGENCE_KEY]: next,
      },
      executiveIntelligence: next,
      preservedPrevious: false,
    };
  }

  const previous = readIdentityExecutiveIntelligence(
    input.previousMasterProfile,
  );
  if (previous) {
    return {
      masterProfile: {
        ...input.masterProfile,
        [IDENTITY_EXECUTIVE_INTELLIGENCE_KEY]: previous,
      },
      executiveIntelligence: previous,
      preservedPrevious: true,
    };
  }

  const withoutBroken = { ...input.masterProfile };
  delete withoutBroken[IDENTITY_EXECUTIVE_INTELLIGENCE_KEY];
  return {
    masterProfile: withoutBroken,
    executiveIntelligence: null,
    preservedPrevious: false,
  };
}

export function formatIdentityConfidenceLabel(
  level: IdentityConfidenceLevel,
): string {
  if (level === "strong") return "Strong";
  if (level === "developing") return "Developing";
  return "Limited";
}

function canonicalSourceKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.origin.toLowerCase()}${path.toLowerCase()}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

export function groupIdentityPageType(pageType: string | null | undefined): string {
  const value = (pageType ?? "").trim();
  if (!value) return "Other";
  for (const entry of PAGE_TYPE_GROUPS) {
    if (entry.match.test(value)) return entry.group;
  }
  return "Other";
}

export function buildIdentityWebsiteSourcePages(
  websiteIntelligence: unknown,
): IdentityWebsiteSourcePage[] {
  if (!isDeepWebsiteIntelligence(websiteIntelligence)) return [];
  const seen = new Set<string>();
  const pages: IdentityWebsiteSourcePage[] = [];

  for (const page of websiteIntelligence.pages ?? []) {
    const url = asTrimmedString(page?.url);
    if (!url) continue;
    const key = canonicalSourceKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    const title = asTrimmedString(page.title);
    const pageType = asTrimmedString(page.page_type) ?? "other";
    pages.push({
      title,
      url,
      pageType,
      group: groupIdentityPageType(pageType),
    });
  }

  const groupOrder = PAGE_TYPE_GROUPS.map((entry) => entry.group).concat([
    "Other",
  ]);
  pages.sort((left, right) => {
    const leftRank = groupOrder.indexOf(left.group);
    const rightRank = groupOrder.indexOf(right.group);
    if (leftRank !== rightRank) return leftRank - rightRank;
    return (left.title ?? left.url).localeCompare(right.title ?? right.url);
  });

  return pages;
}

function websiteDomainFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(
      url.startsWith("http") ? url : `https://${url}`,
    ).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

export function buildIdentityWebsiteCoverageView(input: {
  website: string | null | undefined;
  websiteIntelligence: unknown;
  masterProfileGeneratedAt: string | null | undefined;
  lastDeepScrapeAt: string | null | undefined;
  lastDeepScrapePages: number | null | undefined;
}): IdentityWebsiteCoverageView {
  const deep = isDeepWebsiteIntelligence(input.websiteIntelligence)
    ? (input.websiteIntelligence as DeepWebsiteIntelligence)
    : null;
  const homepageUrl =
    deep?.url ??
    (input.website?.trim()
      ? input.website.startsWith("http")
        ? input.website.trim()
        : `https://${input.website.trim()}`
      : null);
  const sourcePages = buildIdentityWebsiteSourcePages(input.websiteIntelligence);
  const rawPageCount = deep && Array.isArray(deep.pages) ? deep.pages.length : 0;

  return {
    learningMode: deep ? "deep" : "homepage",
    websiteDomain: websiteDomainFromUrl(homepageUrl),
    homepageUrl,
    // Persisted deep-scrape records do not store a separate discovery inventory
    // on Identity; show persisted page counts only.
    pagesDiscovered: deep ? rawPageCount : input.website?.trim() ? 1 : 0,
    pagesSelected: deep ? sourcePages.length : input.website?.trim() ? 1 : 0,
    pagesAnalyzed: deep
      ? deep.pages_analyzed
      : input.website?.trim()
        ? 1
        : 0,
    lastHomepageLearningAt: deep ? null : input.masterProfileGeneratedAt ?? null,
    lastDeepScrapeAt: input.lastDeepScrapeAt ?? deep?.scraped_at ?? null,
    lastRetrainedAt: input.masterProfileGeneratedAt ?? null,
    sourcePages,
  };
}

/** Expose DeepCrawledPage typing for tests without leaking crawler internals. */
export type { DeepCrawledPage };
