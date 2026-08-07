/**
 * Deterministic Technical SEO evidence analyzer.
 * Facts and measurements are calculated in code — never invented by the LLM.
 */

import type {
  DeepCrawledInternalLinkSample,
  DeepCrawledPage,
  DeepWebsiteIntelligence,
} from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import { deepCrawledPageHasTechnicalEvidence } from "@/services/seo/seoTechnicalEvidence";
import type { SeoTechnicalLinkEdgeSample } from "@/services/seo/seoTechnicalInternalLinks";

const TITLE_SHORT = 30;
const TITLE_LONG = 60;
const DESC_SHORT = 70;
const DESC_LONG = 160;
const THIN_CONTENT_CHARS = 300;
const WEAK_INTERNAL_LINKS = 2;
const MAX_LINK_SAMPLES_PER_PAGE = 15;
const MAX_LINK_EDGE_SAMPLES = 80;

export type SeoTechnicalLengthBand = "missing" | "short" | "ok" | "long";

/**
 * Technical SEO redirect interpretation (does not change Deep Scrape crawl).
 * - none: redirectCount === 0
 * - single_hop_final_200: one hop ending in HTTP 200 (informational; not remediation debt)
 * - redirect_chain_candidate: redirectCount >= 2
 * - single_hop_other: one hop with non-200 / unknown final status (evidence only)
 */
export type SeoTechnicalRedirectInterpretation =
  | "none"
  | "single_hop_final_200"
  | "redirect_chain_candidate"
  | "single_hop_other";

export function classifyRedirectInterpretation(
  redirectCount: number | null,
  httpStatus: number | null,
): SeoTechnicalRedirectInterpretation {
  const count = redirectCount ?? 0;
  if (count <= 0) return "none";
  if (count >= 2) return "redirect_chain_candidate";
  if (count === 1 && httpStatus === 200) return "single_hop_final_200";
  return "single_hop_other";
}

export type SeoTechnicalPageFact = {
  url: string;
  pageType: string | null;
  title: string | null;
  titleLength: number | null;
  titleBand: SeoTechnicalLengthBand;
  metaDescription: string | null;
  descriptionLength: number | null;
  descriptionBand: SeoTechnicalLengthBand;
  h1Count: number;
  h1Texts: string[];
  headingCount: number;
  canonicalUrl: string | null;
  selfCanonical: boolean | null;
  httpStatus: number | null;
  redirectCount: number | null;
  redirectInterpretation: SeoTechnicalRedirectInterpretation;
  htmlLanguage: string | null;
  contentChars: number | null;
  thinContent: boolean | null;
  schemaTypes: string[];
  hasSchema: boolean | null;
  internalLinkCount: number | null;
  weakInternalLinks: boolean | null;
  internalLinksSample: DeepCrawledInternalLinkSample[];
  robotsMeta: string | null;
  imageAltTotal: number | null;
  imageAltWithAlt: number | null;
  imageAltMissing: number | null;
  hreflangCount: number | null;
};

export type SeoTechnicalDeterministicEvidence = {
  analyzedPageCount: number;
  technicalEvidencePageCount: number;
  metadata: {
    missingTitles: number;
    duplicateTitles: Array<{ title: string; urls: string[]; count: number }>;
    titleLengthBands: Record<SeoTechnicalLengthBand, number>;
    missingMetaDescriptions: number;
    duplicateMetaDescriptions: Array<{
      description: string;
      urls: string[];
      count: number;
    }>;
    descriptionLengthBands: Record<SeoTechnicalLengthBand, number>;
  };
  headings: {
    missingH1: number;
    multipleH1: number;
    pagesWithHeadings: number;
    headingCoveragePercent: number;
  };
  canonicals: {
    withCanonical: number;
    selfCanonical: number;
    nonSelfCanonical: number;
    missingCanonical: number;
    inconsistentCandidates: Array<{ url: string; canonicalUrl: string }>;
  };
  crawl: {
    httpStatusDistribution: Record<string, number>;
    /** Pages with any persisted redirect_count > 0 (raw evidence preserved). */
    redirectPages: number;
    totalRedirectHops: number;
    /** Single-hop final-200 — informational normalization evidence, not remediation debt. */
    singleHopFinal200Pages: number;
    /** redirectCount >= 2 — eligible for redirect-chain remediation. */
    redirectChainCandidatePages: number;
    singleHopFinal200Evidence: Array<{
      url: string;
      redirectCount: number;
      httpStatus: number | null;
    }>;
    redirectChainCandidates: Array<{
      url: string;
      redirectCount: number;
      httpStatus: number | null;
    }>;
    pageTypeDistribution: Record<string, number>;
  };
  content: {
    contentSizeBands: {
      thin: number;
      medium: number;
      substantial: number;
      unknown: number;
    };
    thinContentCandidates: Array<{ url: string; contentChars: number }>;
  };
  schema: {
    pagesWithSchema: number;
    pagesWithoutSchema: number;
    schemaCoveragePercent: number;
    typeDistribution: Record<string, number>;
  };
  internalLinks: {
    pagesWithCounts: number;
    averageInternalLinks: number | null;
    weakLinkingCandidates: Array<{ url: string; internalLinkCount: number }>;
    /** Bounded source→destination samples from persisted internal_links_sample. */
    linkEdgeSamples: SeoTechnicalLinkEdgeSample[];
  };
  images: {
    pagesWithImageData: number;
    totalImages: number;
    imagesWithAlt: number;
    imagesMissingAlt: number;
    altCoveragePercent: number | null;
  };
  robots: {
    pagesWithRobotsMeta: number;
    noindexCandidates: Array<{ url: string; robotsMeta: string }>;
  };
  coverage: {
    titleCoveragePercent: number;
    descriptionCoveragePercent: number;
    h1CoveragePercent: number;
    canonicalCoveragePercent: number;
    schemaCoveragePercent: number;
    imageAltCoveragePercent: number | null;
  };
  pages: SeoTechnicalPageFact[];
};

function bandForLength(
  value: string | null | undefined,
  shortLimit: number,
  longLimit: number,
): SeoTechnicalLengthBand {
  if (value == null || !String(value).trim()) return "missing";
  const length = String(value).trim().length;
  if (length < shortLimit) return "short";
  if (length > longLimit) return "long";
  return "ok";
}

function emptyBands(): Record<SeoTechnicalLengthBand, number> {
  return { missing: 0, short: 0, ok: 0, long: 0 };
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function collectDuplicates(
  entries: Array<{ key: string; display: string; url: string }>,
): Array<{ title?: string; description?: string; urls: string[]; count: number } & Record<string, unknown>> {
  const map = new Map<string, { display: string; urls: string[] }>();
  for (const entry of entries) {
    if (!entry.key) continue;
    const existing = map.get(entry.key);
    if (existing) {
      existing.urls.push(entry.url);
    } else {
      map.set(entry.key, { display: entry.display, urls: [entry.url] });
    }
  }
  return [...map.values()]
    .filter((item) => item.urls.length > 1)
    .map((item) => ({
      display: item.display,
      urls: item.urls,
      count: item.urls.length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);
}

function pageFacts(page: DeepCrawledPage): SeoTechnicalPageFact {
  const title = page.title?.trim() || null;
  const metaDescription =
    page.meta_description === undefined
      ? null
      : page.meta_description?.trim() || null;
  const headingEntries = Array.isArray(page.headings)
    ? page.headings.filter(
        (entry): entry is { level: number; text: string } =>
          Boolean(entry) &&
          typeof entry === "object" &&
          typeof (entry as { level?: unknown }).level === "number" &&
          typeof (entry as { text?: unknown }).text === "string",
      )
    : [];
  const h1Texts = headingEntries
    .filter((entry) => entry.level === 1)
    .map((entry) => entry.text);
  const contentChars =
    typeof page.content_chars === "number" ? page.content_chars : null;
  const schemaTypes = page.schema_summary?.types ?? [];
  const internalLinkCount =
    typeof page.internal_link_count === "number"
      ? page.internal_link_count
      : null;
  const httpStatus =
    typeof page.http_status === "number" ? page.http_status : null;
  const redirectCount =
    typeof page.redirect_count === "number" ? page.redirect_count : null;
  const internalLinksSample = Array.isArray(page.internal_links_sample)
    ? page.internal_links_sample
        .filter(
          (link): link is DeepCrawledInternalLinkSample =>
            Boolean(link) &&
            typeof link === "object" &&
            typeof (link as { url?: unknown }).url === "string" &&
            Boolean(String((link as { url: string }).url).trim()),
        )
        .slice(0, MAX_LINK_SAMPLES_PER_PAGE)
        .map((link) => ({
          url: link.url.trim(),
          anchor:
            link.anchor == null
              ? null
              : typeof link.anchor === "string"
                ? link.anchor
                : null,
          provenance:
            link.provenance == null
              ? null
              : typeof link.provenance === "string"
                ? link.provenance
                : null,
        }))
    : [];

  return {
    url: page.url,
    pageType: page.page_type || null,
    title,
    titleLength: title ? title.length : null,
    titleBand: bandForLength(title, TITLE_SHORT, TITLE_LONG),
    metaDescription,
    descriptionLength: metaDescription ? metaDescription.length : null,
    descriptionBand: bandForLength(metaDescription, DESC_SHORT, DESC_LONG),
    h1Count: h1Texts.length,
    h1Texts,
    headingCount: headingEntries.length,
    canonicalUrl:
      page.canonical_url === undefined ? null : page.canonical_url,
    selfCanonical:
      typeof page.self_canonical === "boolean" ? page.self_canonical : null,
    httpStatus,
    redirectCount,
    redirectInterpretation: classifyRedirectInterpretation(
      redirectCount,
      httpStatus,
    ),
    htmlLanguage:
      page.html_language === undefined ? null : page.html_language,
    contentChars,
    thinContent:
      contentChars == null ? null : contentChars < THIN_CONTENT_CHARS,
    schemaTypes,
    hasSchema:
      page.schema_summary == null
        ? null
        : schemaTypes.length > 0 ||
          (page.schema_summary.raw_json_ld_count ?? 0) > 0,
    internalLinkCount,
    weakInternalLinks:
      internalLinkCount == null
        ? null
        : internalLinkCount <= WEAK_INTERNAL_LINKS,
    internalLinksSample,
    robotsMeta: page.robots_meta === undefined ? null : page.robots_meta,
    imageAltTotal: page.image_alt?.total ?? null,
    imageAltWithAlt: page.image_alt?.with_alt ?? null,
    imageAltMissing: page.image_alt?.missing_alt ?? null,
    hreflangCount: Array.isArray(page.hreflang) ? page.hreflang.length : null,
  };
}

/**
 * Analyze persisted Deep Website Intelligence pages deterministically.
 * Only pages with technical evidence contribute measured findings.
 */
export function analyzeTechnicalSeoEvidence(
  intelligence: DeepWebsiteIntelligence,
): SeoTechnicalDeterministicEvidence {
  const allPages = Array.isArray(intelligence.pages) ? intelligence.pages : [];
  const technicalPages = allPages.filter(deepCrawledPageHasTechnicalEvidence);
  const pages = technicalPages.map(pageFacts);
  const n = pages.length;

  const titleBands = emptyBands();
  const descriptionBands = emptyBands();
  const titleEntries: Array<{ key: string; display: string; url: string }> = [];
  const descriptionEntries: Array<{
    key: string;
    display: string;
    url: string;
  }> = [];

  let missingTitles = 0;
  let missingMetaDescriptions = 0;
  let missingH1 = 0;
  let multipleH1 = 0;
  let pagesWithHeadings = 0;
  let withCanonical = 0;
  let selfCanonical = 0;
  let nonSelfCanonical = 0;
  let missingCanonical = 0;
  const inconsistentCandidates: Array<{ url: string; canonicalUrl: string }> =
    [];
  const httpStatusDistribution: Record<string, number> = {};
  const pageTypeDistribution: Record<string, number> = {};
  let redirectPages = 0;
  let totalRedirectHops = 0;
  let singleHopFinal200Pages = 0;
  let redirectChainCandidatePages = 0;
  const singleHopFinal200Evidence: Array<{
    url: string;
    redirectCount: number;
    httpStatus: number | null;
  }> = [];
  const redirectChainCandidates: Array<{
    url: string;
    redirectCount: number;
    httpStatus: number | null;
  }> = [];
  const contentSizeBands = {
    thin: 0,
    medium: 0,
    substantial: 0,
    unknown: 0,
  };
  const thinContentCandidates: Array<{ url: string; contentChars: number }> =
    [];
  let pagesWithSchema = 0;
  let pagesWithoutSchema = 0;
  const typeDistribution: Record<string, number> = {};
  let internalLinkSum = 0;
  let pagesWithLinkCounts = 0;
  const weakLinkingCandidates: Array<{
    url: string;
    internalLinkCount: number;
  }> = [];
  const linkEdgeSamples: SeoTechnicalLinkEdgeSample[] = [];
  const corpusUrlKeys = new Set(
    pages.map((page) => page.url.trim().replace(/\/+$/, "").toLowerCase()),
  );
  let pagesWithImageData = 0;
  let totalImages = 0;
  let imagesWithAlt = 0;
  let imagesMissingAlt = 0;
  let pagesWithRobotsMeta = 0;
  const noindexCandidates: Array<{ url: string; robotsMeta: string }> = [];

  for (const page of pages) {
    titleBands[page.titleBand] += 1;
    descriptionBands[page.descriptionBand] += 1;
    if (page.titleBand === "missing") missingTitles += 1;
    if (page.descriptionBand === "missing") missingMetaDescriptions += 1;
    if (page.title) {
      titleEntries.push({
        key: normalizeKey(page.title),
        display: page.title,
        url: page.url,
      });
    }
    if (page.metaDescription) {
      descriptionEntries.push({
        key: normalizeKey(page.metaDescription),
        display: page.metaDescription,
        url: page.url,
      });
    }

    if (page.h1Count === 0) missingH1 += 1;
    if (page.h1Count > 1) multipleH1 += 1;
    if (page.headingCount > 0) pagesWithHeadings += 1;

    if (page.canonicalUrl) {
      withCanonical += 1;
      if (page.selfCanonical === true) selfCanonical += 1;
      if (page.selfCanonical === false) {
        nonSelfCanonical += 1;
        inconsistentCandidates.push({
          url: page.url,
          canonicalUrl: page.canonicalUrl,
        });
      }
    } else {
      missingCanonical += 1;
    }

    const statusKey =
      page.httpStatus == null ? "unknown" : String(page.httpStatus);
    httpStatusDistribution[statusKey] =
      (httpStatusDistribution[statusKey] ?? 0) + 1;

    const typeKey = page.pageType?.trim() || "unknown";
    pageTypeDistribution[typeKey] = (pageTypeDistribution[typeKey] ?? 0) + 1;

    if ((page.redirectCount ?? 0) > 0) {
      redirectPages += 1;
      totalRedirectHops += page.redirectCount ?? 0;
    }
    if (page.redirectInterpretation === "single_hop_final_200") {
      singleHopFinal200Pages += 1;
      singleHopFinal200Evidence.push({
        url: page.url,
        redirectCount: page.redirectCount ?? 1,
        httpStatus: page.httpStatus,
      });
    } else if (page.redirectInterpretation === "redirect_chain_candidate") {
      redirectChainCandidatePages += 1;
      redirectChainCandidates.push({
        url: page.url,
        redirectCount: page.redirectCount ?? 2,
        httpStatus: page.httpStatus,
      });
    }

    if (page.contentChars == null) {
      contentSizeBands.unknown += 1;
    } else if (page.contentChars < THIN_CONTENT_CHARS) {
      contentSizeBands.thin += 1;
      thinContentCandidates.push({
        url: page.url,
        contentChars: page.contentChars,
      });
    } else if (page.contentChars < 1_200) {
      contentSizeBands.medium += 1;
    } else {
      contentSizeBands.substantial += 1;
    }

    if (page.hasSchema === true) {
      pagesWithSchema += 1;
      for (const schemaType of page.schemaTypes) {
        typeDistribution[schemaType] = (typeDistribution[schemaType] ?? 0) + 1;
      }
    } else if (page.hasSchema === false) {
      pagesWithoutSchema += 1;
    }

    if (page.internalLinkCount != null) {
      pagesWithLinkCounts += 1;
      internalLinkSum += page.internalLinkCount;
      if (page.weakInternalLinks) {
        weakLinkingCandidates.push({
          url: page.url,
          internalLinkCount: page.internalLinkCount,
        });
      }
    }
    for (const sample of page.internalLinksSample) {
      if (linkEdgeSamples.length >= MAX_LINK_EDGE_SAMPLES) break;
      const destKey = sample.url.trim().replace(/\/+$/, "").toLowerCase();
      // Prefer corpus destinations for implementation recommendations.
      if (!corpusUrlKeys.has(destKey)) continue;
      linkEdgeSamples.push({
        sourceUrl: page.url,
        destinationUrl: sample.url,
        anchor: sample.anchor,
        provenance: sample.provenance,
      });
    }

    if (page.imageAltTotal != null) {
      pagesWithImageData += 1;
      totalImages += page.imageAltTotal;
      imagesWithAlt += page.imageAltWithAlt ?? 0;
      imagesMissingAlt += page.imageAltMissing ?? 0;
    }

    if (page.robotsMeta) {
      pagesWithRobotsMeta += 1;
      if (/\bnoindex\b/i.test(page.robotsMeta)) {
        noindexCandidates.push({
          url: page.url,
          robotsMeta: page.robotsMeta,
        });
      }
    }
  }

  const pct = (count: number) =>
    n === 0 ? 0 : Math.round((count / n) * 1000) / 10;

  const duplicateTitles = collectDuplicates(titleEntries).map((item) => ({
    title: String(item.display),
    urls: item.urls,
    count: item.count,
  }));
  const duplicateMetaDescriptions = collectDuplicates(descriptionEntries).map(
    (item) => ({
      description: String(item.display),
      urls: item.urls,
      count: item.count,
    }),
  );

  const altCoveragePercent =
    totalImages === 0
      ? null
      : Math.round((imagesWithAlt / totalImages) * 1000) / 10;

  return {
    analyzedPageCount: n,
    technicalEvidencePageCount: technicalPages.length,
    metadata: {
      missingTitles,
      duplicateTitles,
      titleLengthBands: titleBands,
      missingMetaDescriptions,
      duplicateMetaDescriptions,
      descriptionLengthBands: descriptionBands,
    },
    headings: {
      missingH1,
      multipleH1,
      pagesWithHeadings,
      headingCoveragePercent: pct(pagesWithHeadings),
    },
    canonicals: {
      withCanonical,
      selfCanonical,
      nonSelfCanonical,
      missingCanonical,
      inconsistentCandidates: inconsistentCandidates.slice(0, 25),
    },
    crawl: {
      httpStatusDistribution,
      redirectPages,
      totalRedirectHops,
      singleHopFinal200Pages,
      redirectChainCandidatePages,
      singleHopFinal200Evidence: singleHopFinal200Evidence.slice(0, 25),
      redirectChainCandidates: redirectChainCandidates.slice(0, 25),
      pageTypeDistribution,
    },
    content: {
      contentSizeBands,
      thinContentCandidates: thinContentCandidates
        .sort((a, b) => a.contentChars - b.contentChars)
        .slice(0, 25),
    },
    schema: {
      pagesWithSchema,
      pagesWithoutSchema,
      schemaCoveragePercent: pct(pagesWithSchema),
      typeDistribution,
    },
    internalLinks: {
      pagesWithCounts: pagesWithLinkCounts,
      averageInternalLinks:
        pagesWithLinkCounts === 0
          ? null
          : Math.round((internalLinkSum / pagesWithLinkCounts) * 10) / 10,
      weakLinkingCandidates: weakLinkingCandidates
        .sort((a, b) => a.internalLinkCount - b.internalLinkCount)
        .slice(0, 25),
      linkEdgeSamples,
    },
    images: {
      pagesWithImageData,
      totalImages,
      imagesWithAlt,
      imagesMissingAlt,
      altCoveragePercent,
    },
    robots: {
      pagesWithRobotsMeta,
      noindexCandidates: noindexCandidates.slice(0, 25),
    },
    coverage: {
      titleCoveragePercent: pct(n - missingTitles),
      descriptionCoveragePercent: pct(n - missingMetaDescriptions),
      h1CoveragePercent: pct(n - missingH1),
      canonicalCoveragePercent: pct(withCanonical),
      schemaCoveragePercent: pct(pagesWithSchema),
      imageAltCoveragePercent: altCoveragePercent,
    },
    pages,
  };
}

export function formatTechnicalEvidenceForPrompt(
  evidence: SeoTechnicalDeterministicEvidence,
): string {
  const summary = {
    analyzedPageCount: evidence.analyzedPageCount,
    coverage: evidence.coverage,
    metadata: {
      missingTitles: evidence.metadata.missingTitles,
      duplicateTitleGroups: evidence.metadata.duplicateTitles.length,
      missingMetaDescriptions: evidence.metadata.missingMetaDescriptions,
      duplicateDescriptionGroups:
        evidence.metadata.duplicateMetaDescriptions.length,
      titleLengthBands: evidence.metadata.titleLengthBands,
      descriptionLengthBands: evidence.metadata.descriptionLengthBands,
    },
    headings: evidence.headings,
    canonicals: {
      withCanonical: evidence.canonicals.withCanonical,
      selfCanonical: evidence.canonicals.selfCanonical,
      nonSelfCanonical: evidence.canonicals.nonSelfCanonical,
      missingCanonical: evidence.canonicals.missingCanonical,
      inconsistentCount: evidence.canonicals.inconsistentCandidates.length,
    },
    crawl: {
      httpStatusDistribution: evidence.crawl.httpStatusDistribution,
      redirectPages: evidence.crawl.redirectPages,
      totalRedirectHops: evidence.crawl.totalRedirectHops,
      singleHopFinal200Pages: evidence.crawl.singleHopFinal200Pages,
      redirectChainCandidatePages: evidence.crawl.redirectChainCandidatePages,
      singleHopFinal200Evidence: evidence.crawl.singleHopFinal200Evidence,
      redirectChainCandidates: evidence.crawl.redirectChainCandidates,
      pageTypeDistribution: evidence.crawl.pageTypeDistribution,
      redirectInterpretationRules: {
        none: "redirectCount === 0 → no redirect issue",
        single_hop_final_200:
          "redirectCount === 1 AND final HTTP 200 → informational normalization only; MUST NOT by itself generate redirect-chain remediation",
        redirect_chain_candidate:
          "redirectCount >= 2 → redirect-chain remediation candidate",
      },
    },
    content: {
      contentSizeBands: evidence.content.contentSizeBands,
      thinContentCandidateCount: evidence.content.thinContentCandidates.length,
    },
    schema: {
      pagesWithSchema: evidence.schema.pagesWithSchema,
      pagesWithoutSchema: evidence.schema.pagesWithoutSchema,
      schemaCoveragePercent: evidence.schema.schemaCoveragePercent,
      typeDistribution: evidence.schema.typeDistribution,
    },
    internalLinks: {
      averageInternalLinks: evidence.internalLinks.averageInternalLinks,
      weakLinkingCandidates: evidence.internalLinks.weakLinkingCandidates,
      linkEdgeSamples: evidence.internalLinks.linkEdgeSamples.slice(0, 40),
    },
    images: evidence.images,
    robots: {
      pagesWithRobotsMeta: evidence.robots.pagesWithRobotsMeta,
      noindexCandidateCount: evidence.robots.noindexCandidates.length,
    },
  };

  const pageRows = evidence.pages.slice(0, 50).map((page) => ({
    url: page.url,
    pageType: page.pageType,
    title: page.title,
    metaDescription: page.metaDescription,
    h1Count: page.h1Count,
    h1Texts: page.h1Texts.slice(0, 3),
    canonicalUrl: page.canonicalUrl,
    selfCanonical: page.selfCanonical,
    httpStatus: page.httpStatus,
    redirectCount: page.redirectCount,
    redirectInterpretation: page.redirectInterpretation,
    contentChars: page.contentChars,
    schemaTypes: page.schemaTypes,
    internalLinkCount: page.internalLinkCount,
    internalLinksSample: page.internalLinksSample.slice(0, 8),
    robotsMeta: page.robotsMeta,
    imageAltMissing: page.imageAltMissing,
  }));

  return [
    "DETERMINISTIC TECHNICAL SEO EVIDENCE (authoritative; do not invent metrics):",
    JSON.stringify(summary, null, 2),
    "",
    "PAGE-LEVEL FACTS (authoritative inventory for the page metadata matrix):",
    JSON.stringify(pageRows, null, 2),
    "",
    "INTERNAL LINK EDGE SAMPLES (only these edges are evidenced; do not invent source→destination pairs):",
    JSON.stringify(evidence.internalLinks.linkEdgeSamples.slice(0, 40), null, 2),
  ].join("\n");
}
