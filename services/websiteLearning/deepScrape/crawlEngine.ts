/**
 * Phase A Deep Website Crawl entrypoint.
 *
 * Authoritative engine: Crawlee (Cheerio-first + Playwright fallback) + Readability.
 * Durable job orchestration and Gemini synthesis remain unchanged.
 */

import {
  buildSummaryFromNormalizedPages,
  runCrawleeWebsiteCrawl,
  toSynthesisPages,
} from "@/services/websiteLearning/deepScrape/crawler/crawleeAdapter";
import type { CrawlerProgress } from "@/services/websiteLearning/deepScrape/crawler/crawlerTypes";
import { synthesizeDeepWebsiteIntelligence } from "@/services/websiteLearning/deepScrape/synthesize";
import type { DeepWebsiteIntelligence } from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import { logDeepScrapeEvent } from "@/services/websiteLearning/deepScrape/observability";
import { canonicalizePageUrl, normalizeRootWebsiteUrl } from "@/services/websiteLearning/deepScrape/urlSafety";

export type DeepCrawlProgress = {
  stage: "discovering" | "crawling" | "rendering" | "synthesizing";
  pagesDiscovered: number;
  pagesCrawled: number;
  pagesTarget: number;
  pagesAttempted?: number;
  pagesAccepted?: number;
  pagesRendered?: number;
  pagesRejected?: number;
};

export type DeepCrawlEngineResult = {
  intelligence: DeepWebsiteIntelligence;
  pagesDiscovered: number;
  pagesCrawled: number;
  pagesAnalyzed: number;
  crawlSummary: DeepWebsiteIntelligence["crawl_summary"];
};

function mapProgress(progress: CrawlerProgress): DeepCrawlProgress {
  return {
    stage: progress.stage,
    pagesDiscovered: progress.pagesDiscovered,
    pagesCrawled: progress.pagesAccepted,
    pagesTarget: progress.pagesTarget,
    pagesAttempted: progress.pagesAttempted,
    pagesAccepted: progress.pagesAccepted,
    pagesRendered: progress.pagesRendered,
    pagesRejected: progress.pagesRejected,
  };
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
  const rootCanonical = canonicalizePageUrl(root.url) ?? root.url;

  logDeepScrapeEvent("deep_scrape_started", {
    organizationId: input.organizationId,
    jobId: input.jobId,
    sourceType: input.sourceType,
    domain: root.registrableDomain,
    rootUrl: rootCanonical,
    stage: "discovering",
  });

  const crawl = await runCrawleeWebsiteCrawl({
    websiteUrl: input.websiteUrl,
    organizationId: input.organizationId,
    jobId: input.jobId,
    sourceType: input.sourceType,
    onProgress: async (progress) => {
      await input.onProgress?.(mapProgress(progress));
    },
  });

  await input.onProgress?.({
    stage: "synthesizing",
    pagesDiscovered: crawl.stats.candidatesDiscovered,
    pagesCrawled: crawl.stats.pagesAccepted,
    pagesTarget: Math.max(1, crawl.stats.pagesAccepted),
    pagesAttempted: crawl.stats.fetchesAttempted,
    pagesAccepted: crawl.stats.pagesAccepted,
    pagesRendered: crawl.stats.pagesRendered,
    pagesRejected: crawl.stats.pagesRejected,
  });

  logDeepScrapeEvent("deep_scrape_synthesis_started", {
    organizationId: input.organizationId,
    jobId: input.jobId,
    sourceType: input.sourceType,
    domain: root.registrableDomain,
    pagesDiscovered: crawl.stats.candidatesDiscovered,
    pagesCrawled: crawl.stats.pagesAccepted,
    stage: "synthesizing",
  });

  const crawlSummary = buildSummaryFromNormalizedPages(crawl.pages);
  const intelligence = await synthesizeDeepWebsiteIntelligence({
    rootUrl: root.url,
    pages: toSynthesisPages(crawl.pages),
    crawlSummary,
  });

  logDeepScrapeEvent("deep_scrape_synthesis_completed", {
    organizationId: input.organizationId,
    jobId: input.jobId,
    sourceType: input.sourceType,
    domain: root.registrableDomain,
    pagesAnalyzed: intelligence.pages_analyzed,
    stage: "synthesizing",
  });

  logDeepScrapeEvent("crawl_completed", {
    organizationId: input.organizationId,
    jobId: input.jobId,
    sourceType: input.sourceType,
    domain: root.registrableDomain,
    pagesDiscovered: crawl.stats.candidatesDiscovered,
    pagesCrawled: crawl.stats.pagesAccepted,
    pagesAnalyzed: intelligence.pages_analyzed,
    elapsedMs: Date.now() - startedAt,
    diagnostic: {
      candidatesDiscovered: crawl.stats.candidatesDiscovered,
      fetchesAttempted: crawl.stats.fetchesAttempted,
      pagesAccepted: crawl.stats.pagesAccepted,
      pagesRejectedByReason: crawl.stats.rejectedByReason,
      pagesRendered: crawl.stats.pagesRendered,
      combinedExtractedChars: crawl.stats.combinedExtractedChars,
      combinedExtractedWords: crawl.stats.combinedExtractedWords,
      synthesisInvoked: true,
      browserFallbackUsed: crawl.stats.browserFallbackUsed,
      extractionEngine: "crawlee_cheerio_playwright_readability",
      terminalReason: null,
    },
  });

  return {
    intelligence,
    pagesDiscovered: crawl.stats.candidatesDiscovered,
    pagesCrawled: crawl.stats.pagesAccepted,
    pagesAnalyzed: intelligence.pages_analyzed,
    crawlSummary,
  };
}
