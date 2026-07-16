/**
 * Crawlee adapter — authoritative Phase A crawl/extraction engine.
 * Returns normalized page documents; never leaks Crawlee types upward.
 */

import { RequestQueue } from "crawlee";
import {
  buildCrawlSummary,
  DEEP_SCRAPE_CRAWL_POLICY,
  ensureHomepageCandidate,
  evaluateCorpusUsefulness,
  selectMeaningfulUrls,
} from "@/services/websiteLearning/deepScrape/crawlPolicy";
import {
  enqueueCheerioUrl,
  runCheerioCrawlPhase,
} from "@/services/websiteLearning/deepScrape/crawler/cheerioCrawler";
import {
  cleanupJobCrawleeStorage,
  createJobCrawleeStorage,
} from "@/services/websiteLearning/deepScrape/crawler/crawlStorage";
import type {
  CrawlerRunInput,
  CrawlerRunResult,
  NormalizedPageDocument,
} from "@/services/websiteLearning/deepScrape/crawler/crawlerTypes";
import { runPlaywrightCrawlPhase } from "@/services/websiteLearning/deepScrape/crawler/playwrightCrawler";
import { logDeepScrapeEvent } from "@/services/websiteLearning/deepScrape/observability";
import {
  fetchRobotsRules,
  isPathAllowedByRobots,
} from "@/services/websiteLearning/deepScrape/robots";
import { collectUrlsFromSitemaps } from "@/services/websiteLearning/deepScrape/sitemap";
import {
  canonicalizePageUrl,
  normalizeRootWebsiteUrl,
} from "@/services/websiteLearning/deepScrape/urlSafety";

export type {
  CrawlerProgress,
  CrawlerRunResult,
  NormalizedPageDocument,
} from "@/services/websiteLearning/deepScrape/crawler/crawlerTypes";

function pathAllowed(
  url: string,
  robots: Awaited<ReturnType<typeof fetchRobotsRules>>,
): boolean {
  try {
    return isPathAllowedByRobots(new URL(url).pathname || "/", robots);
  } catch {
    return false;
  }
}

export function toSynthesisPages(
  pages: NormalizedPageDocument[],
): Array<{ url: string; title: string | null; pageType: string; text: string }> {
  return pages.map((page) => ({
    url: page.finalUrl || page.url,
    title: page.title,
    pageType: page.pageType,
    text: page.readableText,
  }));
}

export function buildSummaryFromNormalizedPages(
  pages: NormalizedPageDocument[],
) {
  return buildCrawlSummary(
    pages.map((page) => ({ pageType: page.pageType })),
  );
}

/**
 * Run Cheerio-first crawl with Playwright fallback. Job-scoped Crawlee storage.
 */
export async function runCrawleeWebsiteCrawl(
  input: CrawlerRunInput,
): Promise<CrawlerRunResult> {
  const startedAt = Date.now();
  const root = normalizeRootWebsiteUrl(input.websiteUrl);
  if (!root) {
    throw new Error("INVALID_WEBSITE_URL");
  }

  const rootCanonical = canonicalizePageUrl(root.url) ?? root.url;
  const storage = await createJobCrawleeStorage(input.jobId);
  const acceptedPages: NormalizedPageDocument[] = [];
  const playwrightFallbackUrls: string[] = [];
  const seenCanonicalUrls = new Set<string>();
  const seenContentHashes = new Set<string>();
  const seenFingerprints = new Set<string>();
  const enqueuedUrls = new Set<string>();
  const rejectedByReason: Record<string, number> = {};
  let cheerioProcessed = 0;
  let playwrightProcessed = 0;
  let browserClosed = true;
  let queueSizeBounded = false;

  const emitProgress = async (
    stage: "discovering" | "crawling" | "rendering",
  ) => {
    const pagesAttempted = cheerioProcessed + playwrightProcessed;
    const pagesRejected = Object.values(rejectedByReason).reduce(
      (sum, value) => sum + value,
      0,
    );
    await input.onProgress?.({
      stage,
      pagesDiscovered: enqueuedUrls.size,
      pagesAttempted,
      pagesAccepted: acceptedPages.length,
      pagesRendered: playwrightProcessed,
      pagesRejected,
      pagesCrawled: acceptedPages.length,
      pagesTarget: Math.max(
        1,
        Math.min(enqueuedUrls.size || 1, DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages),
      ),
    });
  };

  try {
    logDeepScrapeEvent("crawlee_job_started", {
      organizationId: input.organizationId,
      jobId: input.jobId,
      sourceType: input.sourceType,
      domain: root.registrableDomain,
      rootUrl: rootCanonical,
      stage: "discovering",
    });

    await emitProgress("discovering");

    const robots = await fetchRobotsRules({
      rootUrl: root.url,
      registrableDomain: root.registrableDomain,
    });

    if (!pathAllowed(rootCanonical, robots)) {
      throw new Error("ROBOTS_DENIED");
    }

    const sitemap = await collectUrlsFromSitemaps({
      rootUrl: root.url,
      registrableDomain: root.registrableDomain,
    });

    if (sitemap.urls.length > 0) {
      logDeepScrapeEvent("sitemap_found", {
        organizationId: input.organizationId,
        jobId: input.jobId,
        sourceType: input.sourceType,
        domain: root.registrableDomain,
        pagesDiscovered: sitemap.urls.length,
      });
    } else {
      logDeepScrapeEvent("sitemap_fallback_to_homepage", {
        organizationId: input.organizationId,
        jobId: input.jobId,
        sourceType: input.sourceType,
        domain: root.registrableDomain,
      });
    }

    const candidatePool = ensureHomepageCandidate(
      sitemap.urls,
      rootCanonical,
    );
    const meaningful = selectMeaningfulUrls(
      candidatePool.filter((url) => pathAllowed(url, robots)),
      DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages,
    );

    if (meaningful.length === 0) {
      throw new Error("NO_PERMISSIBLE_CRAWL_TARGETS");
    }

    if (candidatePool.length > DEEP_SCRAPE_CRAWL_POLICY.maxDiscoveredUrls) {
      queueSizeBounded = true;
    }

    const cheerioQueue = await RequestQueue.open(
      `cheerio-${input.jobId}`,
      { config: storage.config },
    );

    const cheerioCtx = {
      organizationId: input.organizationId,
      jobId: input.jobId,
      sourceType: input.sourceType,
      registrableDomain: root.registrableDomain,
      robots,
      config: storage.config,
      requestQueue: cheerioQueue,
      acceptedPages,
      playwrightFallbackUrls,
      seenCanonicalUrls,
      seenContentHashes,
      seenFingerprints,
      enqueuedUrls,
      rejectedByReason,
      maxAccepted: DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages,
      maxQueueSize: DEEP_SCRAPE_CRAWL_POLICY.maxDiscoveredUrls,
      onPageProcessed: async () => emitProgress("crawling"),
    };

    for (const entry of meaningful) {
      await enqueueCheerioUrl(cheerioCtx, entry.url, "seed");
    }

    if (enqueuedUrls.size === 0) {
      await enqueueCheerioUrl(cheerioCtx, rootCanonical, "homepage");
    }

    if (enqueuedUrls.size === 1 && sitemap.urls.length === 0) {
      logDeepScrapeEvent("homepage_only_crawl_selected", {
        organizationId: input.organizationId,
        jobId: input.jobId,
        sourceType: input.sourceType,
        domain: root.registrableDomain,
      });
    }

    await emitProgress("crawling");

    const deadline =
      startedAt + DEEP_SCRAPE_CRAWL_POLICY.phaseAWallClockMs - 60_000;

    const cheerioResult = await runCheerioCrawlPhase(cheerioCtx);
    cheerioProcessed = cheerioResult.processed;

    if (
      Date.now() < deadline &&
      playwrightFallbackUrls.length > 0 &&
      acceptedPages.length < DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages
    ) {
      await emitProgress("rendering");
      const playwrightQueue = await RequestQueue.open(
        `playwright-${input.jobId}`,
        { config: storage.config },
      );

      const uniqueFallback = [...new Set(playwrightFallbackUrls)].slice(
        0,
        DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages,
      );
      for (const url of uniqueFallback) {
        await playwrightQueue.addRequest({
          url,
          uniqueKey: `pw:${url}`,
          userData: { pageType: selectMeaningfulUrls([url])[0]?.pageType ?? "other" },
        });
      }

      try {
        const pwResult = await runPlaywrightCrawlPhase({
          organizationId: input.organizationId,
          jobId: input.jobId,
          sourceType: input.sourceType,
          registrableDomain: root.registrableDomain,
          config: storage.config,
          requestQueue: playwrightQueue,
          acceptedPages,
          seenCanonicalUrls,
          seenContentHashes,
          seenFingerprints,
          rejectedByReason,
          maxAccepted: DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages,
          onPageProcessed: async () => emitProgress("rendering"),
        });
        playwrightProcessed = pwResult.processed;
        browserClosed = pwResult.browserClosed;
      } catch (error) {
        browserClosed = true;
        const message =
          error instanceof Error ? error.message : "PLAYWRIGHT_FAILED";
        // If Chromium is missing and we already have accepted Cheerio pages, continue.
        if (
          /PLAYWRIGHT_CHROMIUM_UNAVAILABLE/i.test(message) &&
          acceptedPages.length > 0
        ) {
          logDeepScrapeEvent("page_rejected", {
            organizationId: input.organizationId,
            jobId: input.jobId,
            sourceType: input.sourceType,
            domain: root.registrableDomain,
            failureCode: "PLAYWRIGHT_CHROMIUM_UNAVAILABLE",
            diagnostic: {
              browserFallbackUsed: true,
              pagesAcceptedWithoutBrowser: acceptedPages.length,
            },
          });
        } else if (/PLAYWRIGHT_CHROMIUM_UNAVAILABLE/i.test(message)) {
          throw error;
        } else {
          throw error;
        }
      } finally {
        try {
          await playwrightQueue.drop();
        } catch {
          // ignore
        }
      }
    }

    try {
      await cheerioQueue.drop();
    } catch {
      // ignore
    }

    const boundedPages: NormalizedPageDocument[] = [];
    let combinedChars = 0;
    for (const page of acceptedPages) {
      if (boundedPages.length >= DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages) {
        break;
      }
      if (combinedChars >= DEEP_SCRAPE_CRAWL_POLICY.maxCombinedSourceChars) {
        break;
      }
      const remaining =
        DEEP_SCRAPE_CRAWL_POLICY.maxCombinedSourceChars - combinedChars;
      const text = page.readableText.slice(0, remaining);
      combinedChars += text.length;
      boundedPages.push({ ...page, readableText: text });
    }

    const corpus = evaluateCorpusUsefulness(
      boundedPages.map((page) => ({
        text: page.readableText,
        title: page.title,
        pageType: page.pageType,
      })),
    );

    const stats = {
      candidatesDiscovered: enqueuedUrls.size,
      fetchesAttempted: cheerioProcessed + playwrightProcessed,
      pagesAccepted: boundedPages.length,
      pagesRejected: Object.values(rejectedByReason).reduce(
        (sum, value) => sum + value,
        0,
      ),
      pagesRendered: playwrightProcessed,
      rejectedByReason,
      cheerioProcessed,
      playwrightProcessed,
      combinedExtractedChars: corpus.combinedChars,
      combinedExtractedWords: corpus.combinedWords,
      browserFallbackUsed: playwrightProcessed > 0,
      queueSizeBounded,
      browserClosed,
    };

    if (!corpus.useful) {
      logDeepScrapeEvent("crawlee_job_failed", {
        organizationId: input.organizationId,
        jobId: input.jobId,
        sourceType: input.sourceType,
        domain: root.registrableDomain,
        failureCode: corpus.code,
        elapsedMs: Date.now() - startedAt,
        diagnostic: { ...stats, terminalReason: corpus.code },
      });
      throw new Error(corpus.code);
    }

    logDeepScrapeEvent("crawlee_job_completed", {
      organizationId: input.organizationId,
      jobId: input.jobId,
      sourceType: input.sourceType,
      domain: root.registrableDomain,
      pagesDiscovered: stats.candidatesDiscovered,
      pagesCrawled: stats.pagesAccepted,
      elapsedMs: Date.now() - startedAt,
      diagnostic: {
        ...stats,
        synthesisInvoked: false,
      },
    });

    return { pages: boundedPages, stats };
  } catch (error) {
    const code =
      error instanceof Error
        ? error.message
            .replace(/\s+/g, "_")
            .replace(/[^A-Z0-9_]/gi, "")
            .slice(0, 80)
            .toUpperCase() || "CRAWLEE_JOB_FAILED"
        : "CRAWLEE_JOB_FAILED";
    logDeepScrapeEvent("crawlee_job_failed", {
      organizationId: input.organizationId,
      jobId: input.jobId,
      sourceType: input.sourceType,
      domain: root.registrableDomain,
      failureCode: code,
      elapsedMs: Date.now() - startedAt,
    });
    throw error instanceof Error ? error : new Error(code);
  } finally {
    await cleanupJobCrawleeStorage(storage);
  }
}
