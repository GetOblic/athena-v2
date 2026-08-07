/**
 * Technical SEO evidence sufficiency against Website Intelligence pages.
 * Historical WI ({ url, title, page_type, excerpt }) is insufficient.
 */

import {
  isDeepWebsiteIntelligence,
  type DeepCrawledPage,
  type DeepWebsiteIntelligence,
} from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";

export const TECHNICAL_SEO_EVIDENCE_INSUFFICIENT_CODE =
  "TECHNICAL_SEO_EVIDENCE_INSUFFICIENT" as const;

export const TECHNICAL_SEO_EVIDENCE_INSUFFICIENT_MESSAGE =
  "Technical SEO requires refreshed Website Intelligence with V23 technical evidence. Re-run Deep Scrape / Website Intelligence refresh first, then generate Technical SEO. Generate SEO Intelligence remains available with existing data." as const;

/**
 * A page carries V23 technical evidence when crawl/status and at least one
 * metadata/structure signal from the additive persistence pass is present.
 */
export function deepCrawledPageHasTechnicalEvidence(
  page: DeepCrawledPage,
): boolean {
  if (typeof page.http_status !== "number") {
    return false;
  }
  if (typeof page.self_canonical !== "boolean") {
    return false;
  }
  const hasMetaOrContent =
    page.meta_description !== undefined ||
    typeof page.content_chars === "number" ||
    (Array.isArray(page.headings) &&
      page.headings.some(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          typeof (entry as { level?: unknown }).level === "number",
      ));
  return hasMetaOrContent;
}

export function countTechnicalEvidencePages(
  pages: DeepCrawledPage[] | null | undefined,
): number {
  if (!Array.isArray(pages) || pages.length === 0) return 0;
  return pages.filter(deepCrawledPageHasTechnicalEvidence).length;
}

/**
 * Website Intelligence is sufficient for Technical SEO when enough pages
 * carry V23 technical fields. Legacy thin pages fail this check.
 */
export function websiteIntelligenceHasTechnicalSeoEvidence(
  intelligence: DeepWebsiteIntelligence | null | undefined,
): boolean {
  if (!intelligence || !isDeepWebsiteIntelligence(intelligence)) {
    return false;
  }
  const pages = intelligence.pages;
  if (!Array.isArray(pages) || pages.length === 0) {
    return false;
  }
  const technicalCount = countTechnicalEvidencePages(pages);
  const minimumRequired = Math.min(3, pages.length);
  return technicalCount >= minimumRequired;
}

export type TechnicalSeoEvidenceSufficiency = {
  sufficient: boolean;
  pagesAnalyzed: number;
  technicalEvidencePages: number;
  minimumRequired: number;
  code: typeof TECHNICAL_SEO_EVIDENCE_INSUFFICIENT_CODE | null;
  message: string | null;
};

export function assessTechnicalSeoEvidenceSufficiency(
  intelligence: DeepWebsiteIntelligence | null | undefined,
): TechnicalSeoEvidenceSufficiency {
  const pages = intelligence?.pages ?? [];
  const pagesAnalyzed = Array.isArray(pages) ? pages.length : 0;
  const technicalEvidencePages = countTechnicalEvidencePages(pages);
  const minimumRequired = Math.min(3, Math.max(pagesAnalyzed, 1));
  const sufficient = websiteIntelligenceHasTechnicalSeoEvidence(intelligence);

  if (sufficient) {
    return {
      sufficient: true,
      pagesAnalyzed,
      technicalEvidencePages,
      minimumRequired,
      code: null,
      message: null,
    };
  }

  return {
    sufficient: false,
    pagesAnalyzed,
    technicalEvidencePages,
    minimumRequired,
    code: TECHNICAL_SEO_EVIDENCE_INSUFFICIENT_CODE,
    message: TECHNICAL_SEO_EVIDENCE_INSUFFICIENT_MESSAGE,
  };
}
