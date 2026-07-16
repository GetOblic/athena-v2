/**
 * Autonomous Phase A Deep Website Crawl engine.
 */

import {
  buildCrawlSummary,
  DEEP_SCRAPE_CRAWL_POLICY,
  selectMeaningfulUrls,
} from "@/services/websiteLearning/deepScrape/crawlPolicy";
import { extractPageContent } from "@/services/websiteLearning/deepScrape/extract";
import { logDeepScrapeEvent } from "@/services/websiteLearning/deepScrape/observability";
import {
  fetchRobotsRules,
  isPathAllowedByRobots,
} from "@/services/websiteLearning/deepScrape/robots";
import { safeFetchHtml } from "@/services/websiteLearning/deepScrape/safeFetch";
import { collectUrlsFromSitemaps } from "@/services/websiteLearning/deepScrape/sitemap";
import { synthesizeDeepWebsiteIntelligence } from "@/services/websiteLearning/deepScrape/synthesize";
import type { DeepWebsiteIntelligence } from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import {
  canonicalizePageUrl,
  isSameRegistrableDomain,
  normalizeRootWebsiteUrl,
} from "@/services/websiteLearning/deepScrape/urlSafety";

export type DeepCrawlProgress = {
  stage: "discovering" | "crawling" | "synthesizing";
  pagesDiscovered: number;
  pagesCrawled: number;
  pagesTarget: number;
};

export type DeepCrawlEngineResult = {
  intelligence: DeepWebsiteIntelligence;
  pagesDiscovered: number;
  pagesCrawled: number;
  pagesAnalyzed: number;
  crawlSummary: DeepWebsiteIntelligence["crawl_summary"];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => run(),
  );
  await Promise.all(runners);
  return results;
}

export async function runDeepWebsiteCrawl(input: {
  websiteUrl: string;
  organizationId: string;
  jobId: string;
  sourceType: "brain" | "prospect";
  onProgress?: (progress: DeepCrawlProgress) => void | Promise<void>;
}): Promise<DeepCrawlEngineResult> {
  const startedAt = Date.now();
  const root = normalizeRootWebsiteUrl(input.websiteUrl);
  if (!root) {
    throw new Error("INVALID_WEBSITE_URL");
  }

  logDeepScrapeEvent("deep_scrape_started", {
    organizationId: input.organizationId,
    jobId: input.jobId,
    sourceType: input.sourceType,
    domain: root.registrableDomain,
    stage: "discovering",
  });

  await input.onProgress?.({
    stage: "discovering",
    pagesDiscovered: 0,
    pagesCrawled: 0,
    pagesTarget: DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages,
  });

  const robots = await fetchRobotsRules({
    rootUrl: root.url,
    registrableDomain: root.registrableDomain,
  });

  const discovered = new Set<string>();
  const rootCanonical = canonicalizePageUrl(root.url) ?? root.url;
  discovered.add(rootCanonical);

  const sitemapResult = await collectUrlsFromSitemaps({
    rootUrl: root.url,
    registrableDomain: root.registrableDomain,
    onSitemapFound: (url) => {
      logDeepScrapeEvent("sitemap_found", {
        organizationId: input.organizationId,
        jobId: input.jobId,
        sourceType: input.sourceType,
        domain: root.registrableDomain,
        stage: "discovering",
      });
      void url;
    },
  });

  for (const url of sitemapResult.urls) {
    if (discovered.size >= DEEP_SCRAPE_CRAWL_POLICY.maxDiscoveredUrls) break;
    const canonical = canonicalizePageUrl(url);
    if (!canonical) continue;
    if (!isSameRegistrableDomain(canonical, root.registrableDomain)) continue;
    discovered.add(canonical);
  }

  // Homepage-link fallback when sitemap yields little.
  if (discovered.size < 5) {
    const homepageFetch = await safeFetchHtml({
      url: root.url,
      registrableDomain: root.registrableDomain,
    });
    if (homepageFetch.ok && homepageFetch.bodyText) {
      const extracted = extractPageContent(
        homepageFetch.bodyText,
        homepageFetch.finalUrl,
      );
      for (const link of extracted.discoveredLinks) {
        if (discovered.size >= DEEP_SCRAPE_CRAWL_POLICY.maxDiscoveredUrls) break;
        const canonical = canonicalizePageUrl(link);
        if (!canonical) continue;
        if (!isSameRegistrableDomain(canonical, root.registrableDomain)) {
          continue;
        }
        discovered.add(canonical);
      }
    }
  }

  const allowedDiscovered = [...discovered].filter((url) => {
    try {
      const path = new URL(url).pathname;
      return isPathAllowedByRobots(path, robots);
    } catch {
      return false;
    }
  });

  const meaningful = selectMeaningfulUrls(allowedDiscovered);
  if (meaningful.length === 0) {
    throw new Error("INSUFFICIENT_USEFUL_CONTENT");
  }

  await input.onProgress?.({
    stage: "crawling",
    pagesDiscovered: allowedDiscovered.length,
    pagesCrawled: 0,
    pagesTarget: meaningful.length,
  });

  let pagesCrawled = 0;
  const crawledPages: Array<{
    url: string;
    title: string | null;
    pageType: string;
    text: string;
  }> = [];

  const crawlResults = await mapPool(
    meaningful,
    DEEP_SCRAPE_CRAWL_POLICY.maxConcurrentRequests,
    async (candidate) => {
      if (Date.now() - startedAt > DEEP_SCRAPE_CRAWL_POLICY.phaseAWallClockMs) {
        return null;
      }

      await sleep(DEEP_SCRAPE_CRAWL_POLICY.interRequestDelayMs);

      let lastError: string | undefined;
      for (
        let attempt = 0;
        attempt <= DEEP_SCRAPE_CRAWL_POLICY.pageRetryCount;
        attempt += 1
      ) {
        const fetched = await safeFetchHtml({
          url: candidate.url,
          registrableDomain: root.registrableDomain,
        });
        if (!fetched.ok || !fetched.bodyText) {
          lastError = fetched.errorCode ?? "PAGE_FETCH_FAILED";
          continue;
        }

        const extracted = extractPageContent(
          fetched.bodyText,
          fetched.finalUrl,
        );
        if (extracted.text.trim().length < 80) {
          lastError = "PAGE_TOO_THIN";
          continue;
        }

        logDeepScrapeEvent("page_crawled", {
          organizationId: input.organizationId,
          jobId: input.jobId,
          sourceType: input.sourceType,
          domain: root.registrableDomain,
          pageType: candidate.pageType,
          pagesCrawled: pagesCrawled + 1,
          pagesDiscovered: allowedDiscovered.length,
        });

        return {
          url: extracted.url,
          title: extracted.title,
          pageType: candidate.pageType,
          text: extracted.text,
        };
      }

      logDeepScrapeEvent("page_failed", {
        organizationId: input.organizationId,
        jobId: input.jobId,
        sourceType: input.sourceType,
        domain: root.registrableDomain,
        pageType: candidate.pageType,
        failureCode: lastError ?? "PAGE_FETCH_FAILED",
      });
      return null;
    },
  );

  for (const page of crawlResults) {
    if (!page) continue;
    crawledPages.push(page);
    pagesCrawled += 1;
    await input.onProgress?.({
      stage: "crawling",
      pagesDiscovered: allowedDiscovered.length,
      pagesCrawled,
      pagesTarget: meaningful.length,
    });
  }

  if (crawledPages.length === 0) {
    throw new Error("INSUFFICIENT_USEFUL_CONTENT");
  }

  // Bound combined source characters for synthesis.
  let combined = 0;
  const boundedPages = [];
  for (const page of crawledPages) {
    if (combined >= DEEP_SCRAPE_CRAWL_POLICY.maxCombinedSourceChars) break;
    const remaining =
      DEEP_SCRAPE_CRAWL_POLICY.maxCombinedSourceChars - combined;
    const text = page.text.slice(0, remaining);
    combined += text.length;
    boundedPages.push({ ...page, text });
  }

  await input.onProgress?.({
    stage: "synthesizing",
    pagesDiscovered: allowedDiscovered.length,
    pagesCrawled,
    pagesTarget: meaningful.length,
  });

  const crawlSummary = buildCrawlSummary(
    boundedPages.map((page) => ({ pageType: page.pageType })),
  );

  const intelligence = await synthesizeDeepWebsiteIntelligence({
    rootUrl: root.url,
    pages: boundedPages,
    crawlSummary,
  });

  logDeepScrapeEvent("crawl_completed", {
    organizationId: input.organizationId,
    jobId: input.jobId,
    sourceType: input.sourceType,
    domain: root.registrableDomain,
    pagesDiscovered: allowedDiscovered.length,
    pagesCrawled,
    pagesAnalyzed: intelligence.pages_analyzed,
    elapsedMs: Date.now() - startedAt,
  });

  return {
    intelligence,
    pagesDiscovered: allowedDiscovered.length,
    pagesCrawled,
    pagesAnalyzed: intelligence.pages_analyzed,
    crawlSummary,
  };
}
