/**
 * Immutable Deep Website Intelligence page snapshot for SEO reports.
 * Captured at generation time from shared website_intelligence (deep_v1).
 * Does not enqueue scrapes or mutate Identity / Brain.
 */

import {
  isDeepWebsiteIntelligence,
  type DeepWebsiteIntelligence,
} from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import {
  SEO_WEBSITE_PAGES_ANALYZED_MAX,
  type SeoWebsitePageAnalyzed,
  type SeoWebsitePagesAnalyzed,
} from "@/services/seo/seoReportTypes";

export function emptySeoWebsitePagesAnalyzed(): SeoWebsitePagesAnalyzed {
  return {
    pagesAnalyzedCount: 0,
    sourceUrl: null,
    scrapedAt: null,
    pages: [],
  };
}

/**
 * Snapshot up to 50 pages in persisted Deep Scrape order (no regroup/sort).
 */
export function snapshotSeoWebsitePagesAnalyzed(
  intelligence: DeepWebsiteIntelligence | null | undefined,
  maxPages: number = SEO_WEBSITE_PAGES_ANALYZED_MAX,
): SeoWebsitePagesAnalyzed {
  if (!intelligence || !isDeepWebsiteIntelligence(intelligence)) {
    return emptySeoWebsitePagesAnalyzed();
  }

  const pages: SeoWebsitePageAnalyzed[] = [];
  for (const page of intelligence.pages ?? []) {
    if (pages.length >= maxPages) break;
    const url = typeof page?.url === "string" ? page.url.trim() : "";
    if (!url) continue;
    const title =
      typeof page.title === "string" && page.title.trim()
        ? page.title.trim()
        : null;
    const pageType =
      typeof page.page_type === "string" && page.page_type.trim()
        ? page.page_type.trim()
        : null;
    pages.push({ title, url, pageType });
  }

  return {
    pagesAnalyzedCount:
      typeof intelligence.pages_analyzed === "number" &&
      Number.isFinite(intelligence.pages_analyzed)
        ? intelligence.pages_analyzed
        : pages.length,
    sourceUrl:
      typeof intelligence.url === "string" && intelligence.url.trim()
        ? intelligence.url.trim()
        : null,
    scrapedAt:
      typeof intelligence.scraped_at === "string" && intelligence.scraped_at.trim()
        ? intelligence.scraped_at.trim()
        : null,
    pages,
  };
}
