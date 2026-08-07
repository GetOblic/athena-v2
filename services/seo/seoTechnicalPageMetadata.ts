/**
 * Build the complete page-level metadata implementation matrix.
 * technicalCoverage.pages is the authoritative inventory; AI overlays recommendations.
 */

import type { SeoTechnicalDeterministicEvidence } from "@/services/seo/seoTechnicalAnalyzer";
import type { SeoTechnicalPageMetadataRecommendation } from "@/services/seo/seoReportTypes";

function normalizeUrlKey(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

function h1ObservationFromFact(page: {
  h1Count: number;
  h1Texts: string[];
}): string {
  if (page.h1Count === 0) return "Missing H1";
  if (page.h1Count > 1) {
    return `Multiple H1 (${page.h1Count}): ${page.h1Texts.slice(0, 3).join(" | ")}`;
  }
  return page.h1Texts[0] ? `H1: ${page.h1Texts[0]}` : "One H1 present";
}

function canonicalObservationFromFact(page: {
  canonicalUrl: string | null;
  selfCanonical: boolean | null;
}): string {
  if (!page.canonicalUrl) return "Missing canonical";
  if (page.selfCanonical === true) return "Self-canonical";
  if (page.selfCanonical === false) {
    return `Non-self canonical → ${page.canonicalUrl}`;
  }
  return `Canonical: ${page.canonicalUrl}`;
}

function robotsObservationFromFact(page: {
  robotsMeta: string | null;
}): string | null {
  return page.robotsMeta ? `robots: ${page.robotsMeta}` : null;
}

function issueFlagsFromFact(page: {
  titleBand: string;
  descriptionBand: string;
  h1Count: number;
  canonicalUrl: string | null;
  selfCanonical: boolean | null;
  httpStatus: number | null;
  redirectInterpretation: string;
  thinContent: boolean | null;
  weakInternalLinks: boolean | null;
  robotsMeta: string | null;
  imageAltMissing: number | null;
}): string[] {
  const flags: string[] = [];
  if (page.titleBand === "missing") flags.push("missing_title");
  else if (page.titleBand === "short") flags.push("title_short");
  else if (page.titleBand === "long") flags.push("title_long");
  if (page.descriptionBand === "missing") flags.push("missing_meta_description");
  else if (page.descriptionBand === "short") flags.push("meta_description_short");
  else if (page.descriptionBand === "long") flags.push("meta_description_long");
  if (page.h1Count === 0) flags.push("missing_h1");
  if (page.h1Count > 1) flags.push("multiple_h1");
  if (!page.canonicalUrl) flags.push("missing_canonical");
  if (page.selfCanonical === false) flags.push("non_self_canonical");
  if (page.httpStatus != null && page.httpStatus >= 400) {
    flags.push(`http_${page.httpStatus}`);
  }
  if (page.redirectInterpretation === "redirect_chain_candidate") {
    flags.push("redirect_chain_candidate");
  } else if (page.redirectInterpretation === "single_hop_final_200") {
    flags.push("single_hop_redirect_informational");
  }
  if (page.thinContent === true) flags.push("thin_content");
  if (page.weakInternalLinks === true) flags.push("weak_internal_links");
  if (page.robotsMeta && /\bnoindex\b/i.test(page.robotsMeta)) {
    flags.push("noindex");
  }
  if ((page.imageAltMissing ?? 0) > 0) flags.push("images_missing_alt");
  return flags;
}

export type AiPageMetadataOverlay = {
  url: string;
  recommendedTitle?: string | null;
  recommendedDescription?: string | null;
  recommendedH1?: string | null;
  h1Observation?: string | null;
  canonicalObservation?: string | null;
  robotsObservation?: string | null;
  currentTitle?: string | null;
  currentDescription?: string | null;
};

/**
 * Merge deterministic page inventory with optional AI recommendation overlays.
 * Every analyzed page appears — healthy pages remain with null recommendations.
 */
export function buildCompletePageMetadataMatrix(
  evidence: SeoTechnicalDeterministicEvidence,
  aiOverlays: AiPageMetadataOverlay[] = [],
): SeoTechnicalPageMetadataRecommendation[] {
  const overlayByUrl = new Map<string, AiPageMetadataOverlay>();
  for (const row of aiOverlays) {
    if (!row?.url || typeof row.url !== "string") continue;
    overlayByUrl.set(normalizeUrlKey(row.url), row);
  }

  return evidence.pages.map((page) => {
    const overlay = overlayByUrl.get(normalizeUrlKey(page.url));
    return {
      url: page.url,
      currentTitle: page.title,
      recommendedTitle: overlay?.recommendedTitle?.trim() || null,
      currentDescription: page.metaDescription,
      recommendedDescription: overlay?.recommendedDescription?.trim() || null,
      h1Observation:
        overlay?.h1Observation?.trim() || h1ObservationFromFact(page),
      recommendedH1: overlay?.recommendedH1?.trim() || null,
      canonicalObservation:
        overlay?.canonicalObservation?.trim() ||
        canonicalObservationFromFact(page),
      robotsObservation:
        overlay?.robotsObservation?.trim() ||
        robotsObservationFromFact(page),
      httpStatus: page.httpStatus,
      issueFlags: issueFlagsFromFact(page),
    };
  });
}
