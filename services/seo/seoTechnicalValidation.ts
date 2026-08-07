/**
 * Validation for SeoTechnicalPackage.
 * Rejects unsupported external/metric claims Athena did not collect.
 * Does NOT apply strategic SEO technical-audit prohibitions.
 */

import type { SeoTechnicalDeterministicEvidence } from "@/services/seo/seoTechnicalAnalyzer";
import {
  SEO_TECHNICAL_REPORT_DISCLAIMER,
  SEO_WEBSITE_PAGES_ANALYZED_MAX,
  type SeoTechnicalActionItem,
  type SeoTechnicalActionPlan,
  type SeoTechnicalArchitectureFindings,
  type SeoTechnicalContentHtmlFindings,
  type SeoTechnicalCrawlFindings,
  type SeoTechnicalExecutiveEvaluation,
  type SeoTechnicalImageFindings,
  type SeoTechnicalImplementationAssets,
  type SeoTechnicalPackage,
  type SeoTechnicalPageMetadataRecommendation,
  type SeoTechnicalPriority,
  type SeoTechnicalSchemaFindings,
  type SeoWebsitePageAnalyzed,
  type SeoWebsitePagesAnalyzed,
} from "@/services/seo/seoReportTypes";
import { emptySeoWebsitePagesAnalyzed } from "@/services/seo/seoWebsitePagesSnapshot";
import { SeoReportPackageValidationError } from "@/services/seo/seoReportValidation";

const FORBIDDEN_UNSUPPORTED_METRIC_PATTERNS: RegExp[] = [
  /\bcore web vitals\b/i,
  /\bpagespeed\b/i,
  /\blcp\b/i,
  /\bcls\b/i,
  /\binp\b/i,
  /\bfirst contentful paint\b/i,
  /\bsearch console\b/i,
  /\bgoogle analytics\b/i,
  /\bsemrush\b/i,
  /\bahrefs\b/i,
  /\bsearch volume\b/i,
  /\branking position\b/i,
  /\bbacklinks?\b/i,
  /\bdomain authority\b/i,
  /\borganic traffic\b/i,
  /\bindexed pages?\b/i,
  /\bindex coverage\b/i,
  /\bavg\.?\s*cpc\b/i,
  /\btrending\b/i,
  /\bhigh[- ]volume\b/i,
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
  minLength = 0,
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
  for (const pattern of FORBIDDEN_UNSUPPORTED_METRIC_PATTERNS) {
    if (pattern.test(text)) {
      errors.push(
        `${path} contains unsupported external/technical metric claim matching ${pattern}.`,
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
    value.forEach((item, index) =>
      scanObjectText(item, `${path}[${index}]`, errors),
    );
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      // Deterministic evidence and page inventory are factual — skip claim scan.
      if (key === "technicalCoverage" || key === "websitePagesAnalyzed") {
        continue;
      }
      scanObjectText(child, `${path}.${key}`, errors);
    }
  }
}

function validateWebsitePagesAnalyzed(
  value: unknown,
  errors: string[],
): SeoWebsitePagesAnalyzed | null {
  if (value == null) {
    return emptySeoWebsitePagesAnalyzed();
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("websitePagesAnalyzed must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  const pagesAnalyzedCount =
    typeof raw.pagesAnalyzedCount === "number" &&
    Number.isFinite(raw.pagesAnalyzedCount)
      ? Math.max(0, Math.floor(raw.pagesAnalyzedCount))
      : 0;
  const sourceUrl =
    raw.sourceUrl == null
      ? null
      : typeof raw.sourceUrl === "string"
        ? raw.sourceUrl
        : null;
  const scrapedAt =
    raw.scrapedAt == null
      ? null
      : typeof raw.scrapedAt === "string"
        ? raw.scrapedAt
        : null;
  if (!Array.isArray(raw.pages)) {
    errors.push("websitePagesAnalyzed.pages must be an array.");
    return null;
  }
  const pages: SeoWebsitePageAnalyzed[] = raw.pages
    .slice(0, SEO_WEBSITE_PAGES_ANALYZED_MAX)
    .map((page, index) => {
      if (!page || typeof page !== "object" || Array.isArray(page)) {
        errors.push(`websitePagesAnalyzed.pages[${index}] must be an object.`);
        return null;
      }
      const row = page as Record<string, unknown>;
      if (typeof row.url !== "string" || !row.url.trim()) {
        errors.push(
          `websitePagesAnalyzed.pages[${index}].url must be a non-empty string.`,
        );
        return null;
      }
      return {
        url: row.url.trim(),
        title:
          row.title == null
            ? null
            : typeof row.title === "string"
              ? row.title
              : null,
        pageType:
          row.pageType == null
            ? null
            : typeof row.pageType === "string"
              ? row.pageType
              : null,
      };
    })
    .filter((page): page is SeoWebsitePageAnalyzed => page != null);

  return {
    pagesAnalyzedCount,
    sourceUrl,
    scrapedAt,
    pages,
  };
}

function validateExecutive(
  value: unknown,
  errors: string[],
): SeoTechnicalExecutiveEvaluation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("executiveEvaluation must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  const overallAssessment = requireNonEmptyString(
    raw.overallAssessment,
    "executiveEvaluation.overallAssessment",
    errors,
  );
  const strengths = requireStringArray(
    raw.strengths,
    "executiveEvaluation.strengths",
    errors,
    1,
  );
  const criticalIssues = requireStringArray(
    raw.criticalIssues,
    "executiveEvaluation.criticalIssues",
    errors,
    0,
  );
  const warnings = requireStringArray(
    raw.warnings,
    "executiveEvaluation.warnings",
    errors,
    0,
  );
  const remediationPriorities = requireStringArray(
    raw.remediationPriorities,
    "executiveEvaluation.remediationPriorities",
    errors,
    1,
  );
  const summary = requireNonEmptyString(
    raw.summary,
    "executiveEvaluation.summary",
    errors,
  );
  if (
    !overallAssessment ||
    !strengths ||
    !criticalIssues ||
    !warnings ||
    !remediationPriorities ||
    !summary
  ) {
    return null;
  }
  return {
    overallAssessment,
    strengths,
    criticalIssues,
    warnings,
    remediationPriorities,
    summary,
  };
}

function optionalString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function validatePageMetadata(
  value: unknown,
  errors: string[],
): SeoTechnicalPageMetadataRecommendation[] | null {
  if (!Array.isArray(value)) {
    errors.push("pageMetadata must be an array.");
    return null;
  }
  const pages: SeoTechnicalPageMetadataRecommendation[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push(`pageMetadata[${index}] must be an object.`);
      continue;
    }
    const raw = row as Record<string, unknown>;
    const url = requireNonEmptyString(raw.url, `pageMetadata[${index}].url`, errors);
    if (!url) continue;
    pages.push({
      url,
      currentTitle: optionalString(raw.currentTitle),
      recommendedTitle: optionalString(raw.recommendedTitle),
      currentDescription: optionalString(raw.currentDescription),
      recommendedDescription: optionalString(raw.recommendedDescription),
      h1Observation: optionalString(raw.h1Observation),
      recommendedH1: optionalString(raw.recommendedH1),
      canonicalObservation: optionalString(raw.canonicalObservation),
      robotsObservation: optionalString(raw.robotsObservation),
    });
  }
  return pages;
}

function validateArchitecture(
  value: unknown,
  errors: string[],
): SeoTechnicalArchitectureFindings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("siteArchitecture must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  const architectureFindings = requireStringArray(
    raw.architectureFindings,
    "siteArchitecture.architectureFindings",
    errors,
    1,
  );
  const linkingEvidence = requireStringArray(
    raw.linkingEvidence,
    "siteArchitecture.linkingEvidence",
    errors,
    0,
  );
  const weaklyLinkedCandidates = requireStringArray(
    raw.weaklyLinkedCandidates,
    "siteArchitecture.weaklyLinkedCandidates",
    errors,
    0,
  );
  const summary = requireNonEmptyString(
    raw.summary,
    "siteArchitecture.summary",
    errors,
  );
  const recommendedLinksRaw = Array.isArray(raw.recommendedLinks)
    ? raw.recommendedLinks
    : [];
  const recommendedLinks = recommendedLinksRaw
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push(
          `siteArchitecture.recommendedLinks[${index}] must be an object.`,
        );
        return null;
      }
      const row = item as Record<string, unknown>;
      const fromUrl = requireNonEmptyString(
        row.fromUrl,
        `siteArchitecture.recommendedLinks[${index}].fromUrl`,
        errors,
      );
      const toUrl = requireNonEmptyString(
        row.toUrl,
        `siteArchitecture.recommendedLinks[${index}].toUrl`,
        errors,
      );
      const recommendedAnchor = requireNonEmptyString(
        row.recommendedAnchor,
        `siteArchitecture.recommendedLinks[${index}].recommendedAnchor`,
        errors,
      );
      const rationale = requireNonEmptyString(
        row.rationale,
        `siteArchitecture.recommendedLinks[${index}].rationale`,
        errors,
      );
      if (!fromUrl || !toUrl || !recommendedAnchor || !rationale) return null;
      return { fromUrl, toUrl, recommendedAnchor, rationale };
    })
    .filter(
      (
        item,
      ): item is {
        fromUrl: string;
        toUrl: string;
        recommendedAnchor: string;
        rationale: string;
      } => item != null,
    );

  if (!architectureFindings || !linkingEvidence || !weaklyLinkedCandidates || !summary) {
    return null;
  }
  return {
    architectureFindings,
    linkingEvidence,
    weaklyLinkedCandidates,
    recommendedLinks,
    summary,
  };
}

function validateContentHtml(
  value: unknown,
  errors: string[],
): SeoTechnicalContentHtmlFindings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("contentHtmlFindings must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  const headingFindings = requireStringArray(
    raw.headingFindings,
    "contentHtmlFindings.headingFindings",
    errors,
    0,
  );
  const metadataFindings = requireStringArray(
    raw.metadataFindings,
    "contentHtmlFindings.metadataFindings",
    errors,
    0,
  );
  const contentSizeFindings = requireStringArray(
    raw.contentSizeFindings,
    "contentHtmlFindings.contentSizeFindings",
    errors,
    0,
  );
  const structuralRecommendations = requireStringArray(
    raw.structuralRecommendations,
    "contentHtmlFindings.structuralRecommendations",
    errors,
    1,
  );
  const summary = requireNonEmptyString(
    raw.summary,
    "contentHtmlFindings.summary",
    errors,
  );
  if (
    !headingFindings ||
    !metadataFindings ||
    !contentSizeFindings ||
    !structuralRecommendations ||
    !summary
  ) {
    return null;
  }
  return {
    headingFindings,
    metadataFindings,
    contentSizeFindings,
    structuralRecommendations,
    summary,
  };
}

function validateSchema(
  value: unknown,
  errors: string[],
): SeoTechnicalSchemaFindings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("structuredData must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  const detectedSchemaEvidence = requireStringArray(
    raw.detectedSchemaEvidence,
    "structuredData.detectedSchemaEvidence",
    errors,
    0,
  );
  const missingOpportunityAssessment = requireNonEmptyString(
    raw.missingOpportunityAssessment,
    "structuredData.missingOpportunityAssessment",
    errors,
  );
  const recommendedSchemaTypes = requireStringArray(
    raw.recommendedSchemaTypes,
    "structuredData.recommendedSchemaTypes",
    errors,
    0,
  );
  const implementationGuidance = requireStringArray(
    raw.implementationGuidance,
    "structuredData.implementationGuidance",
    errors,
    0,
  );
  const exampleSnippets = requireStringArray(
    raw.exampleSnippets,
    "structuredData.exampleSnippets",
    errors,
    0,
  );
  const summary = requireNonEmptyString(
    raw.summary,
    "structuredData.summary",
    errors,
  );
  if (
    !detectedSchemaEvidence ||
    !missingOpportunityAssessment ||
    !recommendedSchemaTypes ||
    !implementationGuidance ||
    !exampleSnippets ||
    !summary
  ) {
    return null;
  }
  return {
    detectedSchemaEvidence,
    missingOpportunityAssessment,
    recommendedSchemaTypes,
    implementationGuidance,
    exampleSnippets,
    summary,
  };
}

function validateImageSeo(
  value: unknown,
  errors: string[],
): SeoTechnicalImageFindings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("imageSeo must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  const altCoverageSummary = requireNonEmptyString(
    raw.altCoverageSummary,
    "imageSeo.altCoverageSummary",
    errors,
  );
  const missingAltFindings = requireStringArray(
    raw.missingAltFindings,
    "imageSeo.missingAltFindings",
    errors,
    0,
  );
  const remediationGuidance = requireStringArray(
    raw.remediationGuidance,
    "imageSeo.remediationGuidance",
    errors,
    0,
  );
  const summary = requireNonEmptyString(raw.summary, "imageSeo.summary", errors);
  if (
    !altCoverageSummary ||
    !missingAltFindings ||
    !remediationGuidance ||
    !summary
  ) {
    return null;
  }
  return {
    altCoverageSummary,
    missingAltFindings,
    remediationGuidance,
    summary,
  };
}

function validateCrawlFindings(
  value: unknown,
  errors: string[],
): SeoTechnicalCrawlFindings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("crawlFindings must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  const statusFindings = requireStringArray(
    raw.statusFindings,
    "crawlFindings.statusFindings",
    errors,
    0,
  );
  const redirectFindings = requireStringArray(
    raw.redirectFindings,
    "crawlFindings.redirectFindings",
    errors,
    0,
  );
  const canonicalFindings = requireStringArray(
    raw.canonicalFindings,
    "crawlFindings.canonicalFindings",
    errors,
    0,
  );
  const robotsFindings = requireStringArray(
    raw.robotsFindings,
    "crawlFindings.robotsFindings",
    errors,
    0,
  );
  const summary = requireNonEmptyString(
    raw.summary,
    "crawlFindings.summary",
    errors,
  );
  if (
    !statusFindings ||
    !redirectFindings ||
    !canonicalFindings ||
    !robotsFindings ||
    !summary
  ) {
    return null;
  }
  return {
    statusFindings,
    redirectFindings,
    canonicalFindings,
    robotsFindings,
    summary,
  };
}

function validateActionPlan(
  value: unknown,
  errors: string[],
): SeoTechnicalActionPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("actionPlan must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  const overview = requireNonEmptyString(
    raw.overview,
    "actionPlan.overview",
    errors,
  );
  if (!Array.isArray(raw.items)) {
    errors.push("actionPlan.items must be an array.");
    return null;
  }
  const priorities: SeoTechnicalPriority[] = [
    "Critical",
    "High",
    "Improvement",
  ];
  const items: SeoTechnicalActionItem[] = [];
  for (let index = 0; index < raw.items.length; index += 1) {
    const row = raw.items[index];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push(`actionPlan.items[${index}] must be an object.`);
      continue;
    }
    const item = row as Record<string, unknown>;
    const priority = item.priority;
    if (
      typeof priority !== "string" ||
      !priorities.includes(priority as SeoTechnicalPriority)
    ) {
      errors.push(
        `actionPlan.items[${index}].priority must be Critical, High, or Improvement.`,
      );
      continue;
    }
    const title = requireNonEmptyString(
      item.title,
      `actionPlan.items[${index}].title`,
      errors,
    );
    const affectedPages = requireStringArray(
      item.affectedPages,
      `actionPlan.items[${index}].affectedPages`,
      errors,
      0,
    );
    const evidence = requireNonEmptyString(
      item.evidence,
      `actionPlan.items[${index}].evidence`,
      errors,
    );
    const reason = requireNonEmptyString(
      item.reason,
      `actionPlan.items[${index}].reason`,
      errors,
    );
    const recommendedAction = requireNonEmptyString(
      item.recommendedAction,
      `actionPlan.items[${index}].recommendedAction`,
      errors,
    );
    if (!title || !affectedPages || !evidence || !reason || !recommendedAction) {
      continue;
    }
    items.push({
      priority: priority as SeoTechnicalPriority,
      title,
      affectedPages,
      evidence,
      reason,
      recommendedAction,
    });
  }
  if (!overview || items.length < 3) {
    if (items.length < 3) {
      errors.push("actionPlan.items must contain at least 3 items.");
    }
    return null;
  }
  return { overview, items };
}

function validateImplementationAssets(
  value: unknown,
  errors: string[],
): SeoTechnicalImplementationAssets | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("implementationAssets must be an object.");
    return null;
  }
  const raw = value as Record<string, unknown>;
  const metadataTableNotes = requireNonEmptyString(
    raw.metadataTableNotes,
    "implementationAssets.metadataTableNotes",
    errors,
  );
  const headingRecommendations = requireStringArray(
    raw.headingRecommendations,
    "implementationAssets.headingRecommendations",
    errors,
    0,
  );
  const internalLinkPlan = requireStringArray(
    raw.internalLinkPlan,
    "implementationAssets.internalLinkPlan",
    errors,
    0,
  );
  const schemaRecommendations = requireStringArray(
    raw.schemaRecommendations,
    "implementationAssets.schemaRecommendations",
    errors,
    0,
  );
  const redirectRecommendations = requireStringArray(
    raw.redirectRecommendations,
    "implementationAssets.redirectRecommendations",
    errors,
    0,
  );
  const developerRemediationInstructions = requireStringArray(
    raw.developerRemediationInstructions,
    "implementationAssets.developerRemediationInstructions",
    errors,
    1,
  );
  if (
    !metadataTableNotes ||
    !headingRecommendations ||
    !internalLinkPlan ||
    !schemaRecommendations ||
    !redirectRecommendations ||
    !developerRemediationInstructions
  ) {
    return null;
  }
  return {
    metadataTableNotes,
    headingRecommendations,
    internalLinkPlan,
    schemaRecommendations,
    redirectRecommendations,
    developerRemediationInstructions,
  };
}

function isDeterministicEvidence(
  value: unknown,
): value is SeoTechnicalDeterministicEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  return (
    typeof raw.analyzedPageCount === "number" &&
    raw.metadata != null &&
    typeof raw.metadata === "object" &&
    raw.coverage != null &&
    typeof raw.coverage === "object" &&
    Array.isArray(raw.pages)
  );
}

export function validateSeoTechnicalPackage(
  input: unknown,
): SeoTechnicalPackage {
  const errors: string[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new SeoReportPackageValidationError([
      "package must be a non-null object.",
    ]);
  }
  const raw = input as Record<string, unknown>;
  if (raw.generationType !== "technical") {
    errors.push('generationType must be "technical".');
  }

  const reportName = requireNonEmptyString(raw.reportName, "reportName", errors);
  const briefMode = raw.briefMode;
  if (briefMode !== "inferred" && briefMode !== "guided") {
    errors.push('briefMode must be "inferred" or "guided".');
  }

  const executiveEvaluation = validateExecutive(raw.executiveEvaluation, errors);
  if (!isDeterministicEvidence(raw.technicalCoverage)) {
    errors.push(
      "technicalCoverage must be deterministic evidence produced by Athena analysis.",
    );
  }
  const technicalCoverage = isDeterministicEvidence(raw.technicalCoverage)
    ? raw.technicalCoverage
    : null;
  const pageMetadata = validatePageMetadata(raw.pageMetadata, errors);
  const siteArchitecture = validateArchitecture(raw.siteArchitecture, errors);
  const contentHtmlFindings = validateContentHtml(
    raw.contentHtmlFindings,
    errors,
  );
  const structuredData = validateSchema(raw.structuredData, errors);
  const imageSeo = validateImageSeo(raw.imageSeo, errors);
  const crawlFindings = validateCrawlFindings(raw.crawlFindings, errors);
  const actionPlan = validateActionPlan(raw.actionPlan, errors);
  const implementationAssets = validateImplementationAssets(
    raw.implementationAssets,
    errors,
  );
  const websitePagesAnalyzed = validateWebsitePagesAnalyzed(
    raw.websitePagesAnalyzed,
    errors,
  );

  const disclaimer = requireNonEmptyString(raw.disclaimer, "disclaimer", errors);
  if (disclaimer) {
    const lower = disclaimer.toLowerCase();
    if (
      !(
        lower.includes("website intelligence") ||
        lower.includes("technical evidence") ||
        lower.includes("athena")
      )
    ) {
      errors.push(
        "disclaimer must explain the report is based on Athena Website Intelligence technical evidence.",
      );
    }
  }

  if (
    raw.generationType !== "technical" ||
    !reportName ||
    (briefMode !== "inferred" && briefMode !== "guided") ||
    !executiveEvaluation ||
    !technicalCoverage ||
    !pageMetadata ||
    !siteArchitecture ||
    !contentHtmlFindings ||
    !structuredData ||
    !imageSeo ||
    !crawlFindings ||
    !actionPlan ||
    !implementationAssets ||
    !websitePagesAnalyzed ||
    !disclaimer
  ) {
    throw new SeoReportPackageValidationError(
      errors.length > 0 ? errors : ["Incomplete Technical SEO package."],
    );
  }

  const pkg: SeoTechnicalPackage = {
    generationType: "technical",
    reportName,
    briefMode,
    executiveEvaluation,
    technicalCoverage,
    pageMetadata,
    siteArchitecture,
    contentHtmlFindings,
    structuredData,
    imageSeo,
    crawlFindings,
    actionPlan,
    implementationAssets,
    disclaimer: disclaimer.includes("not based on")
      ? disclaimer
      : SEO_TECHNICAL_REPORT_DISCLAIMER,
    websitePagesAnalyzed,
  };

  const {
    disclaimer: _disclaimer,
    websitePagesAnalyzed: _pages,
    technicalCoverage: _coverage,
    ...scannable
  } = pkg;
  scanObjectText(scannable, "package", errors);

  if (errors.length > 0) {
    throw new SeoReportPackageValidationError(errors);
  }

  return pkg;
}

export function isCompleteSeoTechnicalPackage(
  input: unknown,
): input is SeoTechnicalPackage {
  try {
    validateSeoTechnicalPackage(input);
    return true;
  } catch {
    return false;
  }
}
