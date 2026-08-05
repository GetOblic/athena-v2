/**
 * Deterministic synthesis-corpus selection after page acceptance.
 * Protects primary-navigation pages from async fetch-order / char-budget starvation.
 */

import { DEEP_SCRAPE_CRAWL_POLICY } from "@/services/websiteLearning/deepScrape/crawlPolicy";
import type { NormalizedPageDocument } from "@/services/websiteLearning/deepScrape/crawler/crawlerTypes";
import type {
  DiscoveryProvenance,
  RankedUrlCandidate,
} from "@/services/websiteLearning/deepScrape/crawler/urlRelevance";
import { canonicalizePageUrl } from "@/services/websiteLearning/deepScrape/urlSafety";

/** Semantic page types treated as core company/product knowledge. */
const CORE_PAGE_TYPES = new Set([
  "services",
  "products",
  "solutions",
  "pricing",
  "training",
  "about",
  "team",
  "faq",
  "contact",
  "locations",
  "testimonials",
  "case_studies",
  "portfolio",
  "commercial",
]);

export type CorpusStopReason = "page_cap" | "char_cap" | "exhausted";

export type CorpusPageMeta = {
  provenance: DiscoveryProvenance | string;
  rankedPlanIndex: number | null;
  totalScore: number;
};

export type CorpusSelectionResult = {
  pages: NormalizedPageDocument[];
  combinedChars: number;
  stopReason: CorpusStopReason;
  pagesAcceptedBeforeCorpusBound: number;
  pagesIncludedInCorpus: number;
  primaryNavigationSelected: number;
  primaryNavigationAccepted: number;
  primaryNavigationIncluded: number;
  orderedUrls: string[];
  excludedByCharCap: string[];
};

function pageKey(page: NormalizedPageDocument): string {
  return (
    canonicalizePageUrl(page.finalUrl) ??
    canonicalizePageUrl(page.url) ??
    (page.finalUrl || page.url)
  );
}

function urlKey(url: string): string {
  return canonicalizePageUrl(url) ?? url;
}

function isHomepage(page: NormalizedPageDocument, homepageUrl: string): boolean {
  const home = urlKey(homepageUrl);
  if (pageKey(page) === home) return true;
  if (page.pageType === "homepage") return true;
  try {
    const path = new URL(page.finalUrl || page.url).pathname;
    return path === "/" || path === "";
  } catch {
    return false;
  }
}

function resolveMeta(
  page: NormalizedPageDocument,
  rankedByUrl: Map<string, { index: number; entry: RankedUrlCandidate }>,
): CorpusPageMeta {
  const key = pageKey(page);
  const ranked = rankedByUrl.get(key);
  const provenance =
    page.discoveryProvenance ??
    ranked?.entry.provenance ??
    "unknown";
  return {
    provenance,
    rankedPlanIndex: ranked?.index ?? page.rankedPlanIndex ?? null,
    totalScore: page.rankScore ?? ranked?.entry.totalScore ?? 0,
  };
}

function tierOf(meta: CorpusPageMeta, page: NormalizedPageDocument, homepageUrl: string): number {
  if (isHomepage(page, homepageUrl)) return 0;
  if (meta.provenance === "primary_navigation") return 1;
  if (CORE_PAGE_TYPES.has(page.pageType)) return 2;
  return 3;
}

/**
 * Order accepted pages for corpus binding:
 * 1) homepage
 * 2) primary_navigation (ranked-plan order)
 * 3) core semantic company/product pages (ranked-plan order)
 * 4) remaining accepted pages (ranked-plan order)
 *
 * Ranked-plan index beats async acceptance order.
 */
export function orderAcceptedPagesForCorpus(input: {
  pages: NormalizedPageDocument[];
  homepageUrl: string;
  rankedSelected: RankedUrlCandidate[];
}): NormalizedPageDocument[] {
  const rankedByUrl = new Map<string, { index: number; entry: RankedUrlCandidate }>();
  input.rankedSelected.forEach((entry, index) => {
    rankedByUrl.set(urlKey(entry.normalizedUrl), { index, entry });
  });

  return [...input.pages].sort((left, right) => {
    const leftMeta = resolveMeta(left, rankedByUrl);
    const rightMeta = resolveMeta(right, rankedByUrl);
    const leftTier = tierOf(leftMeta, left, input.homepageUrl);
    const rightTier = tierOf(rightMeta, right, input.homepageUrl);
    if (leftTier !== rightTier) return leftTier - rightTier;

    const leftRank = leftMeta.rankedPlanIndex ?? Number.MAX_SAFE_INTEGER;
    const rightRank = rightMeta.rankedPlanIndex ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;

    if (rightMeta.totalScore !== leftMeta.totalScore) {
      return rightMeta.totalScore - leftMeta.totalScore;
    }
    return pageKey(left).localeCompare(pageKey(right));
  });
}

/**
 * Bind accepted pages into the synthesis corpus with page + char caps.
 * Primary-navigation pages are ordered ahead of lower-priority pages so the
 * character budget cannot starve them due to async fetch completion order.
 */
export function selectBoundedCorpusPages(input: {
  pages: NormalizedPageDocument[];
  homepageUrl: string;
  rankedSelected: RankedUrlCandidate[];
  maxPages?: number;
  maxCombinedChars?: number;
  primaryNavigationSelectedCount?: number;
}): CorpusSelectionResult {
  const maxPages =
    input.maxPages ?? DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages;
  const maxCombinedChars =
    input.maxCombinedChars ?? DEEP_SCRAPE_CRAWL_POLICY.maxCombinedSourceChars;

  const rankedByUrl = new Map<string, { index: number; entry: RankedUrlCandidate }>();
  input.rankedSelected.forEach((entry, index) => {
    rankedByUrl.set(urlKey(entry.normalizedUrl), { index, entry });
  });

  const primaryNavigationSelected =
    input.primaryNavigationSelectedCount ??
    input.rankedSelected.filter(
      (entry) => entry.provenance === "primary_navigation",
    ).length;

  const primaryNavigationAccepted = input.pages.filter((page) => {
    const meta = resolveMeta(page, rankedByUrl);
    return meta.provenance === "primary_navigation";
  }).length;

  const ordered = orderAcceptedPagesForCorpus({
    pages: input.pages,
    homepageUrl: input.homepageUrl,
    rankedSelected: input.rankedSelected,
  });

  const boundedPages: NormalizedPageDocument[] = [];
  let combinedChars = 0;
  const excludedByCharCap: string[] = [];
  let hitPageCap = false;
  let hitCharCap = false;

  for (let index = 0; index < ordered.length; index += 1) {
    const page = ordered[index]!;
    if (boundedPages.length >= maxPages) {
      hitPageCap = true;
      break;
    }
    if (combinedChars >= maxCombinedChars) {
      hitCharCap = true;
      for (const rest of ordered.slice(index)) {
        excludedByCharCap.push(rest.finalUrl || rest.url);
      }
      break;
    }
    const remaining = maxCombinedChars - combinedChars;
    const source = page.meaningfulText || page.readableText;
    const text = source.slice(0, remaining);
    if (text.length === 0 && source.length > 0) {
      hitCharCap = true;
      for (const rest of ordered.slice(index)) {
        excludedByCharCap.push(rest.finalUrl || rest.url);
      }
      break;
    }
    combinedChars += text.length;
    boundedPages.push({
      ...page,
      readableText: text,
      meaningfulText: text,
    });
  }

  const stopReason: CorpusStopReason = hitPageCap
    ? "page_cap"
    : hitCharCap
      ? "char_cap"
      : "exhausted";

  const primaryNavigationIncluded = boundedPages.filter((page) => {
    const meta = resolveMeta(page, rankedByUrl);
    return meta.provenance === "primary_navigation";
  }).length;

  return {
    pages: boundedPages,
    combinedChars,
    stopReason,
    pagesAcceptedBeforeCorpusBound: input.pages.length,
    pagesIncludedInCorpus: boundedPages.length,
    primaryNavigationSelected,
    primaryNavigationAccepted,
    primaryNavigationIncluded,
    orderedUrls: ordered.map((page) => page.finalUrl || page.url),
    excludedByCharCap,
  };
}
