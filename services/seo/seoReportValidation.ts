/**
 * Strict validation for SeoIntelligencePackage before persistence.
 * Incomplete packages must never be marked Ready.
 */

import {
  SEO_REPORT_DISCLAIMER,
  SEO_WEBSITE_PAGES_ANALYZED_MAX,
  type SeoCommercialOpportunity,
  type SeoCommercialOpportunityAnalysis,
  type SeoContentCoverageAnalysis,
  type SeoCustomerIntentAnalysis,
  type SeoCustomerIntentGap,
  type SeoExecutiveAssessment,
  type SeoIntelligencePackage,
  type SeoNinetyDayRoadmap,
  type SeoRoadmapEffort,
  type SeoRoadmapItem,
  type SeoRoadmapPriority,
  type SeoTrustAuthorityAnalysis,
  type SeoWebsitePageAnalyzed,
  type SeoWebsitePagesAnalyzed,
} from "@/services/seo/seoReportTypes";
import { emptySeoWebsitePagesAnalyzed } from "@/services/seo/seoWebsitePagesSnapshot";

export class SeoReportPackageValidationError extends Error {
  readonly code = "INVALID_PACKAGE";
  readonly details: string[];

  constructor(details: string[]) {
    super(details[0] ?? "SEO report package validation failed.");
    this.name = "SeoReportPackageValidationError";
    this.details = details;
  }
}

const FORBIDDEN_TECHNICAL_PATTERNS: RegExp[] = [
  /\bcanonical\b/i,
  /\brobots\.txt\b/i,
  /\bschema\.org\b/i,
  /\bstructured data\b/i,
  /\bhreflang\b/i,
  /\bindexability\b/i,
  /\bcrawl budget\b/i,
  /\bduplicate meta description/i,
  /\bbroken links?\b/i,
  /\bcore web vitals\b/i,
  /\bpagespeed\b/i,
];

const FORBIDDEN_METRIC_PATTERNS: RegExp[] = [
  /\btrending\b/i,
  /\bhigh[- ]volume\b/i,
  /\blive search\b/i,
  /\bsearch console\b/i,
  /\bgoogle analytics\b/i,
  /\bsemrush\b/i,
  /\bahrefs\b/i,
  /\bsearch volume\b/i,
  /\bavg\.?\s*cpc\b/i,
  /\bcpc\s*[:=]\s*\$?\d/i,
  /\bvolume\s*[:=]\s*\d/i,
  /\branking position\b/i,
  /\bkeyword database\b/i,
];

function requireNonEmptyString(
  value: unknown,
  path: string,
  errors: string[],
): string | null {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${path} must be a non-empty string.`);
    return null;
  }
  return value.trim();
}

function requireStringArray(
  value: unknown,
  path: string,
  errors: string[],
  minLength = 1,
): string[] | null {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array of strings.`);
    return null;
  }
  const items = value
    .map((item, index) => {
      if (typeof item !== "string" || !item.trim()) {
        errors.push(`${path}[${index}] must be a non-empty string.`);
        return null;
      }
      return item.trim();
    })
    .filter((item): item is string => item != null);

  if (items.length < minLength) {
    errors.push(`${path} must contain at least ${minLength} item(s).`);
    return null;
  }
  return items;
}

function collectForbiddenClaims(text: string, path: string, errors: string[]) {
  for (const pattern of FORBIDDEN_TECHNICAL_PATTERNS) {
    if (pattern.test(text)) {
      errors.push(
        `${path} contains Phase-1-forbidden technical SEO topic matching ${pattern}.`,
      );
      break;
    }
  }
  for (const pattern of FORBIDDEN_METRIC_PATTERNS) {
    if (pattern.test(text)) {
      errors.push(
        `${path} contains unsupported external SEO/metric claim matching ${pattern}.`,
      );
      break;
    }
  }
}

function scanObjectText(value: unknown, path: string, errors: string[]) {
  if (typeof value === "string") {
    collectForbiddenClaims(value, path, errors);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanObjectText(item, `${path}[${index}]`, errors));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      scanObjectText(nested, `${path}.${key}`, errors);
    }
  }
}

function validateExecutiveAssessment(
  value: unknown,
  errors: string[],
): SeoExecutiveAssessment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("executiveAssessment must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  const overallAssessment = requireNonEmptyString(
    raw.overallAssessment,
    "executiveAssessment.overallAssessment",
    errors,
  );
  const seoReadiness = requireNonEmptyString(
    raw.seoReadiness,
    "executiveAssessment.seoReadiness",
    errors,
  );
  const businessVisibilityAssessment = requireNonEmptyString(
    raw.businessVisibilityAssessment,
    "executiveAssessment.businessVisibilityAssessment",
    errors,
  );
  const summary = requireNonEmptyString(
    raw.summary,
    "executiveAssessment.summary",
    errors,
  );
  const strengths = requireStringArray(
    raw.strengths,
    "executiveAssessment.strengths",
    errors,
    2,
  );
  const weaknesses = requireStringArray(
    raw.weaknesses,
    "executiveAssessment.weaknesses",
    errors,
    2,
  );

  if (
    !overallAssessment ||
    !seoReadiness ||
    !businessVisibilityAssessment ||
    !summary ||
    !strengths ||
    !weaknesses
  ) {
    return null;
  }

  return {
    overallAssessment,
    strengths,
    weaknesses,
    seoReadiness,
    businessVisibilityAssessment,
    summary,
  };
}

function validateContentCoverage(
  value: unknown,
  errors: string[],
): SeoContentCoverageAnalysis | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("contentCoverage must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  const analysis = requireNonEmptyString(
    raw.analysis,
    "contentCoverage.analysis",
    errors,
  );
  const wellCoveredServices = requireStringArray(
    raw.wellCoveredServices,
    "contentCoverage.wellCoveredServices",
    errors,
    1,
  );
  const weaklyCoveredServices = requireStringArray(
    raw.weaklyCoveredServices,
    "contentCoverage.weaklyCoveredServices",
    errors,
    1,
  );
  const missingServices = requireStringArray(
    raw.missingServices,
    "contentCoverage.missingServices",
    errors,
    1,
  );
  const missingCustomerQuestions = requireStringArray(
    raw.missingCustomerQuestions,
    "contentCoverage.missingCustomerQuestions",
    errors,
    1,
  );
  const missingTrustContent = requireStringArray(
    raw.missingTrustContent,
    "contentCoverage.missingTrustContent",
    errors,
    1,
  );
  const missingEducationalContent = requireStringArray(
    raw.missingEducationalContent,
    "contentCoverage.missingEducationalContent",
    errors,
    1,
  );
  const missingConversionContent = requireStringArray(
    raw.missingConversionContent,
    "contentCoverage.missingConversionContent",
    errors,
    1,
  );
  const athenaEvidence = requireStringArray(
    raw.athenaEvidence,
    "contentCoverage.athenaEvidence",
    errors,
    1,
  );

  if (
    !analysis ||
    !wellCoveredServices ||
    !weaklyCoveredServices ||
    !missingServices ||
    !missingCustomerQuestions ||
    !missingTrustContent ||
    !missingEducationalContent ||
    !missingConversionContent ||
    !athenaEvidence
  ) {
    return null;
  }

  return {
    wellCoveredServices,
    weaklyCoveredServices,
    missingServices,
    missingCustomerQuestions,
    missingTrustContent,
    missingEducationalContent,
    missingConversionContent,
    analysis,
    athenaEvidence,
  };
}

function validateCustomerIntent(
  value: unknown,
  errors: string[],
): SeoCustomerIntentAnalysis | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("customerIntent must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  const buyerIntentSummary = requireNonEmptyString(
    raw.buyerIntentSummary,
    "customerIntent.buyerIntentSummary",
    errors,
  );
  const representedIntents = requireStringArray(
    raw.representedIntents,
    "customerIntent.representedIntents",
    errors,
    1,
  );
  const painPointGaps = requireStringArray(
    raw.painPointGaps,
    "customerIntent.painPointGaps",
    errors,
    1,
  );
  const athenaEvidence = requireStringArray(
    raw.athenaEvidence,
    "customerIntent.athenaEvidence",
    errors,
    1,
  );

  if (!Array.isArray(raw.missingIntents) || raw.missingIntents.length < 2) {
    errors.push("customerIntent.missingIntents must contain at least 2 items.");
    return null;
  }

  const missingIntents: SeoCustomerIntentGap[] = [];
  for (let i = 0; i < raw.missingIntents.length; i += 1) {
    const gapRaw = raw.missingIntents[i];
    if (!gapRaw || typeof gapRaw !== "object" || Array.isArray(gapRaw)) {
      errors.push(`customerIntent.missingIntents[${i}] must be an object.`);
      continue;
    }
    const g = gapRaw as Record<string, unknown>;
    const intent = requireNonEmptyString(
      g.intent,
      `customerIntent.missingIntents[${i}].intent`,
      errors,
    );
    const source = requireNonEmptyString(
      g.source,
      `customerIntent.missingIntents[${i}].source`,
      errors,
    );
    const websiteGap = requireNonEmptyString(
      g.websiteGap,
      `customerIntent.missingIntents[${i}].websiteGap`,
      errors,
    );
    const recommendation = requireNonEmptyString(
      g.recommendation,
      `customerIntent.missingIntents[${i}].recommendation`,
      errors,
    );
    if (intent && source && websiteGap && recommendation) {
      missingIntents.push({ intent, source, websiteGap, recommendation });
    }
  }

  if (
    !buyerIntentSummary ||
    !representedIntents ||
    !painPointGaps ||
    !athenaEvidence ||
    missingIntents.length < 2
  ) {
    return null;
  }

  return {
    representedIntents,
    missingIntents,
    painPointGaps,
    buyerIntentSummary,
    athenaEvidence,
  };
}

function validateCommercialOpportunities(
  value: unknown,
  errors: string[],
): SeoCommercialOpportunityAnalysis | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("commercialOpportunities must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  const summary = requireNonEmptyString(
    raw.summary,
    "commercialOpportunities.summary",
    errors,
  );

  if (!Array.isArray(raw.opportunities) || raw.opportunities.length < 3) {
    errors.push(
      "commercialOpportunities.opportunities must contain at least 3 items.",
    );
    return null;
  }

  const opportunities: SeoCommercialOpportunity[] = [];
  for (let i = 0; i < raw.opportunities.length; i += 1) {
    const oppRaw = raw.opportunities[i];
    if (!oppRaw || typeof oppRaw !== "object" || Array.isArray(oppRaw)) {
      errors.push(`commercialOpportunities.opportunities[${i}] must be an object.`);
      continue;
    }
    const o = oppRaw as Record<string, unknown>;
    const contentType = requireNonEmptyString(
      o.contentType,
      `commercialOpportunities.opportunities[${i}].contentType`,
      errors,
    );
    const title = requireNonEmptyString(
      o.title,
      `commercialOpportunities.opportunities[${i}].title`,
      errors,
    );
    const rationale = requireNonEmptyString(
      o.rationale,
      `commercialOpportunities.opportunities[${i}].rationale`,
      errors,
    );
    const expectedImpact = requireNonEmptyString(
      o.expectedImpact,
      `commercialOpportunities.opportunities[${i}].expectedImpact`,
      errors,
    );
    const athenaEvidence = requireStringArray(
      o.athenaEvidence,
      `commercialOpportunities.opportunities[${i}].athenaEvidence`,
      errors,
      1,
    );
    if (contentType && title && rationale && expectedImpact && athenaEvidence) {
      opportunities.push({
        contentType,
        title,
        rationale,
        expectedImpact,
        athenaEvidence,
      });
    }
  }

  if (!summary || opportunities.length < 3) {
    return null;
  }

  return { opportunities, summary };
}

function validateTrustAndAuthority(
  value: unknown,
  errors: string[],
): SeoTrustAuthorityAnalysis | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("trustAndAuthority must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  const fields = [
    "trustSignals",
    "testimonials",
    "caseStudies",
    "expertPositioning",
    "authorityMessaging",
    "differentiation",
    "callsToAction",
    "consistency",
  ] as const;
  const out: Partial<SeoTrustAuthorityAnalysis> = {};
  for (const field of fields) {
    const v = requireNonEmptyString(raw[field], `trustAndAuthority.${field}`, errors);
    if (v) out[field] = v;
  }
  const recommendations = requireStringArray(
    raw.recommendations,
    "trustAndAuthority.recommendations",
    errors,
    2,
  );
  const athenaEvidence = requireStringArray(
    raw.athenaEvidence,
    "trustAndAuthority.athenaEvidence",
    errors,
    1,
  );

  if (fields.some((f) => !out[f]) || !recommendations || !athenaEvidence) {
    return null;
  }

  return {
    ...(out as Omit<SeoTrustAuthorityAnalysis, "recommendations" | "athenaEvidence">),
    recommendations,
    athenaEvidence,
  };
}

function validateRoadmap(
  value: unknown,
  errors: string[],
): SeoNinetyDayRoadmap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("ninetyDayRoadmap must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  const overview = requireNonEmptyString(
    raw.overview,
    "ninetyDayRoadmap.overview",
    errors,
  );

  if (!Array.isArray(raw.items) || raw.items.length < 4) {
    errors.push("ninetyDayRoadmap.items must contain at least 4 items.");
    return null;
  }

  const priorities = new Set(["P0", "P1", "P2", "P3"]);
  const efforts = new Set(["low", "medium", "high"]);
  const items: SeoRoadmapItem[] = [];

  for (let i = 0; i < raw.items.length; i += 1) {
    const itemRaw = raw.items[i];
    if (!itemRaw || typeof itemRaw !== "object" || Array.isArray(itemRaw)) {
      errors.push(`ninetyDayRoadmap.items[${i}] must be an object.`);
      continue;
    }
    const item = itemRaw as Record<string, unknown>;
    const priority = requireNonEmptyString(
      item.priority,
      `ninetyDayRoadmap.items[${i}].priority`,
      errors,
    );
    if (priority && !priorities.has(priority)) {
      errors.push(
        `ninetyDayRoadmap.items[${i}].priority must be one of P0|P1|P2|P3.`,
      );
    }
    const estimatedEffort = requireNonEmptyString(
      item.estimatedEffort,
      `ninetyDayRoadmap.items[${i}].estimatedEffort`,
      errors,
    );
    if (estimatedEffort && !efforts.has(estimatedEffort)) {
      errors.push(
        `ninetyDayRoadmap.items[${i}].estimatedEffort must be low|medium|high.`,
      );
    }
    const recommendation = requireNonEmptyString(
      item.recommendation,
      `ninetyDayRoadmap.items[${i}].recommendation`,
      errors,
    );
    const reason = requireNonEmptyString(
      item.reason,
      `ninetyDayRoadmap.items[${i}].reason`,
      errors,
    );
    const expectedBusinessImpact = requireNonEmptyString(
      item.expectedBusinessImpact,
      `ninetyDayRoadmap.items[${i}].expectedBusinessImpact`,
      errors,
    );
    const athenaEvidence = requireStringArray(
      item.athenaEvidence,
      `ninetyDayRoadmap.items[${i}].athenaEvidence`,
      errors,
      1,
    );

    if (
      priority &&
      priorities.has(priority) &&
      estimatedEffort &&
      efforts.has(estimatedEffort) &&
      recommendation &&
      reason &&
      expectedBusinessImpact &&
      athenaEvidence
    ) {
      items.push({
        priority: priority as SeoRoadmapPriority,
        recommendation,
        reason,
        expectedBusinessImpact,
        estimatedEffort: estimatedEffort as SeoRoadmapEffort,
        athenaEvidence,
      });
    }
  }

  if (!overview || items.length < 4) {
    return null;
  }

  return { overview, items };
}

function validateWebsitePagesAnalyzed(
  value: unknown,
  errors: string[],
): SeoWebsitePagesAnalyzed | null {
  // Absent on legacy packages being re-normalized: treat as empty snapshot.
  if (value == null) {
    return emptySeoWebsitePagesAnalyzed();
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    errors.push("websitePagesAnalyzed must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  const pagesRaw = raw.pages;
  if (!Array.isArray(pagesRaw)) {
    errors.push("websitePagesAnalyzed.pages must be an array.");
    return null;
  }
  if (pagesRaw.length > SEO_WEBSITE_PAGES_ANALYZED_MAX) {
    errors.push(
      `websitePagesAnalyzed.pages must contain at most ${SEO_WEBSITE_PAGES_ANALYZED_MAX} pages.`,
    );
    return null;
  }

  const pages: SeoWebsitePageAnalyzed[] = [];
  for (let i = 0; i < pagesRaw.length; i += 1) {
    const item = pagesRaw[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`websitePagesAnalyzed.pages[${i}] must be an object.`);
      continue;
    }
    const page = item as Record<string, unknown>;
    const url =
      typeof page.url === "string" && page.url.trim() ? page.url.trim() : null;
    if (!url) {
      errors.push(`websitePagesAnalyzed.pages[${i}].url must be a non-empty string.`);
      continue;
    }
    const title =
      page.title == null
        ? null
        : typeof page.title === "string"
          ? page.title.trim() || null
          : null;
    if (page.title != null && typeof page.title !== "string") {
      errors.push(`websitePagesAnalyzed.pages[${i}].title must be a string or null.`);
      continue;
    }
    const pageType =
      page.pageType == null
        ? null
        : typeof page.pageType === "string"
          ? page.pageType.trim() || null
          : null;
    if (page.pageType != null && typeof page.pageType !== "string") {
      errors.push(
        `websitePagesAnalyzed.pages[${i}].pageType must be a string or null.`,
      );
      continue;
    }
    pages.push({ title, url, pageType });
  }

  const pagesAnalyzedCount =
    typeof raw.pagesAnalyzedCount === "number" &&
    Number.isFinite(raw.pagesAnalyzedCount) &&
    raw.pagesAnalyzedCount >= 0
      ? Math.floor(raw.pagesAnalyzedCount)
      : pages.length;

  const sourceUrl =
    raw.sourceUrl == null
      ? null
      : typeof raw.sourceUrl === "string"
        ? raw.sourceUrl.trim() || null
        : null;
  if (raw.sourceUrl != null && typeof raw.sourceUrl !== "string") {
    errors.push("websitePagesAnalyzed.sourceUrl must be a string or null.");
    return null;
  }

  const scrapedAt =
    raw.scrapedAt == null
      ? null
      : typeof raw.scrapedAt === "string"
        ? raw.scrapedAt.trim() || null
        : null;
  if (raw.scrapedAt != null && typeof raw.scrapedAt !== "string") {
    errors.push("websitePagesAnalyzed.scrapedAt must be a string or null.");
    return null;
  }

  return {
    pagesAnalyzedCount,
    sourceUrl,
    scrapedAt,
    pages,
  };
}

/**
 * Validate and normalize a complete SeoIntelligencePackage.
 * Throws SeoReportPackageValidationError when incomplete or unsafe.
 */
export function validateSeoIntelligencePackage(
  input: unknown,
): SeoIntelligencePackage {
  const errors: string[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new SeoReportPackageValidationError([
      "package must be a non-null object.",
    ]);
  }
  const raw = input as Record<string, unknown>;

  const reportName = requireNonEmptyString(raw.reportName, "reportName", errors);
  const briefMode = raw.briefMode;
  if (briefMode !== "inferred" && briefMode !== "guided") {
    errors.push('briefMode must be "inferred" or "guided".');
  }

  const executiveAssessment = validateExecutiveAssessment(
    raw.executiveAssessment,
    errors,
  );
  const contentCoverage = validateContentCoverage(raw.contentCoverage, errors);
  const customerIntent = validateCustomerIntent(raw.customerIntent, errors);
  const commercialOpportunities = validateCommercialOpportunities(
    raw.commercialOpportunities,
    errors,
  );
  const trustAndAuthority = validateTrustAndAuthority(
    raw.trustAndAuthority,
    errors,
  );
  const ninetyDayRoadmap = validateRoadmap(raw.ninetyDayRoadmap, errors);
  const websitePagesAnalyzed = validateWebsitePagesAnalyzed(
    raw.websitePagesAnalyzed,
    errors,
  );

  let disclaimer = requireNonEmptyString(raw.disclaimer, "disclaimer", errors);
  if (disclaimer) {
    const lower = disclaimer.toLowerCase();
    if (
      !(
        lower.includes("inferred") &&
        (lower.includes("athena") || lower.includes("organization intelligence"))
      )
    ) {
      errors.push(
        "disclaimer must explain the report is inferred from Athena organization intelligence.",
      );
    }
  }

  if (
    !reportName ||
    (briefMode !== "inferred" && briefMode !== "guided") ||
    !executiveAssessment ||
    !contentCoverage ||
    !customerIntent ||
    !commercialOpportunities ||
    !trustAndAuthority ||
    !ninetyDayRoadmap ||
    !websitePagesAnalyzed ||
    !disclaimer
  ) {
    throw new SeoReportPackageValidationError(
      errors.length > 0 ? errors : ["Incomplete SEO intelligence package."],
    );
  }

  const pkg: SeoIntelligencePackage = {
    reportName,
    briefMode,
    executiveAssessment,
    contentCoverage,
    customerIntent,
    commercialOpportunities,
    trustAndAuthority,
    ninetyDayRoadmap,
    disclaimer: disclaimer.includes("not based on")
      ? disclaimer
      : SEO_REPORT_DISCLAIMER,
    websitePagesAnalyzed,
  };

  // Scan package text for Phase-1 forbidden topics / external metric claims.
  // Skip disclaimer and provenance page inventory (URLs/titles are evidence, not analysis claims).
  const {
    disclaimer: _disclaimer,
    websitePagesAnalyzed: _pages,
    ...scannable
  } = pkg;
  scanObjectText(scannable, "package", errors);

  if (errors.length > 0) {
    throw new SeoReportPackageValidationError(errors);
  }

  return pkg;
}

export function isCompleteSeoIntelligencePackage(
  input: unknown,
): input is SeoIntelligencePackage {
  try {
    validateSeoIntelligencePackage(input);
    return true;
  } catch {
    return false;
  }
}
