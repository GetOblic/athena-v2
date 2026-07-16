/**
 * Shared deep-v1 page serialization and promotion parity helpers.
 * Used by Brain and Prospect paths — no source-specific corpus forks.
 */

import {
  type DeepCrawledPage,
  type DeepWebsiteIntelligence,
  DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
  isDeepWebsiteIntelligence,
} from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import { canonicalizePageUrl } from "@/services/websiteLearning/deepScrape/urlSafety";

export const BRAIN_DEEP_SCRAPE_PAGE_PARITY_FAILED =
  "BRAIN_DEEP_SCRAPE_PAGE_PARITY_FAILED";

export class DeepScrapePageParityError extends Error {
  readonly code = BRAIN_DEEP_SCRAPE_PAGE_PARITY_FAILED;
  readonly retryable = false;
  readonly diagnostic: Record<string, unknown>;

  constructor(message: string, diagnostic: Record<string, unknown> = {}) {
    super(message);
    this.name = "DeepScrapePageParityError";
    this.diagnostic = diagnostic;
  }
}

export type CompactSynthesisPage = {
  url: string;
  title: string | null;
  pageType: string;
  text: string;
};

/** Compact persisted page records (no raw HTML / full bodies). */
export function toCompactDeepCrawledPages(
  pages: CompactSynthesisPage[],
): DeepCrawledPage[] {
  return pages.map((page) => ({
    url: page.url,
    title: page.title,
    page_type: page.pageType,
    excerpt: page.text.slice(0, 400),
  }));
}

export function normalizeDeepPageUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
  } catch {
    return null;
  }
  return canonicalizePageUrl(trimmed) ?? trimmed;
}

export function listValidDeepPages(
  pages: unknown,
): DeepCrawledPage[] {
  if (!Array.isArray(pages)) return [];
  const out: DeepCrawledPage[] = [];
  const seen = new Set<string>();
  for (const entry of pages) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url : "";
    const normalized = normalizeDeepPageUrl(url);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push({
      url: typeof record.url === "string" ? record.url : normalized,
      title: typeof record.title === "string" ? record.title : null,
      page_type:
        typeof record.page_type === "string" ? record.page_type : "other",
      excerpt: typeof record.excerpt === "string" ? record.excerpt : "",
    });
  }
  return out;
}

export function countDeepPages(pages: unknown): number {
  return listValidDeepPages(pages).length;
}

/**
 * Rebuild a promotable deep-v1 payload with an explicit pages array copy.
 * Prevents accidental overwrite via object spread / stale references.
 */
export function buildPromotableDeepWebsiteIntelligence(
  intelligence: DeepWebsiteIntelligence,
): DeepWebsiteIntelligence {
  const pages = listValidDeepPages(intelligence.pages);
  if (pages.length === 0) {
    throw new DeepScrapePageParityError(
      "Deep website intelligence has no valid pages to promote",
      { pagesAnalyzed: intelligence.pages_analyzed },
    );
  }

  return {
    ...intelligence,
    provider: DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
    pages,
    pages_analyzed: pages.length,
    crawl_summary: {
      ...intelligence.crawl_summary,
      pages_analyzed: pages.length,
    },
  };
}

export type DeepScrapePageParityInput = {
  acceptedPageCount: number;
  synthesisInputPageCount: number;
  crawlResultPageCount: number;
  promotedPageCount: number;
  lastDeepScrapePages?: number | null;
  /** Explicit documented filter delta (duplicates / quality rejects after accept). */
  documentedFilteredCount?: number;
  promotedPages?: unknown;
};

/**
 * Fail-closed publication contract for deep-v1 Brain promotion.
 * Prospect may call the same helper for shared invariants.
 */
export function assertDeepScrapePageParity(
  input: DeepScrapePageParityInput,
): void {
  const documentedFiltered = Math.max(0, input.documentedFilteredCount ?? 0);
  const expectedFloor = Math.max(
    1,
    input.acceptedPageCount - documentedFiltered,
  );

  if (
    input.synthesisInputPageCount !== input.acceptedPageCount ||
    input.crawlResultPageCount !== input.synthesisInputPageCount ||
    input.promotedPageCount !== input.crawlResultPageCount
  ) {
    throw new DeepScrapePageParityError(
      "Deep scrape page counts diverged across crawl → synthesis → persistence → promotion",
      {
        acceptedPageCount: input.acceptedPageCount,
        synthesisInputPageCount: input.synthesisInputPageCount,
        crawlResultPageCount: input.crawlResultPageCount,
        promotedPageCount: input.promotedPageCount,
        documentedFilteredCount: documentedFiltered,
      },
    );
  }

  if (input.promotedPageCount < expectedFloor) {
    throw new DeepScrapePageParityError(
      "Promoted deep scrape page count fell below the accepted corpus floor",
      {
        acceptedPageCount: input.acceptedPageCount,
        promotedPageCount: input.promotedPageCount,
        expectedFloor,
        documentedFilteredCount: documentedFiltered,
      },
    );
  }

  if (
    input.acceptedPageCount > 1 &&
    input.promotedPageCount <= 1 &&
    documentedFiltered < input.acceptedPageCount - 1
  ) {
    throw new DeepScrapePageParityError(
      "Multi-page accepted corpus collapsed to a single promoted page without documented filtering",
      {
        acceptedPageCount: input.acceptedPageCount,
        promotedPageCount: input.promotedPageCount,
        documentedFilteredCount: documentedFiltered,
      },
    );
  }

  if (
    typeof input.lastDeepScrapePages === "number" &&
    input.lastDeepScrapePages !== input.promotedPageCount
  ) {
    throw new DeepScrapePageParityError(
      "last_deep_scrape_pages does not match promoted page count",
      {
        lastDeepScrapePages: input.lastDeepScrapePages,
        promotedPageCount: input.promotedPageCount,
      },
    );
  }

  const valid = listValidDeepPages(input.promotedPages ?? []);
  if (valid.length !== input.promotedPageCount) {
    throw new DeepScrapePageParityError(
      "Promoted pages failed URL/dedupe validation",
      {
        promotedPageCount: input.promotedPageCount,
        validPromotedPageCount: valid.length,
      },
    );
  }
}

export function readDeepIntelligencePageCount(
  value: unknown,
): number {
  if (!isDeepWebsiteIntelligence(value)) return 0;
  const fromPages = countDeepPages(value.pages);
  if (fromPages > 0) return fromPages;
  return typeof value.pages_analyzed === "number" ? value.pages_analyzed : 0;
}
