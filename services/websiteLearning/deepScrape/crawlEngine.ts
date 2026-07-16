/**
 * Autonomous Phase A Deep Website Crawl engine.
 *
 * Discovery degrades gracefully to homepage-only intelligence when sitemaps
 * and internal links are unavailable, as long as the homepage itself is useful.
 */

import {
  buildCrawlSummary,
  DEEP_SCRAPE_CRAWL_POLICY,
  ensureHomepageCandidate,
  evaluatePageUsefulness,
  selectMeaningfulUrls,
  type ScoredUrl,
} from "@/services/websiteLearning/deepScrape/crawlPolicy";
import { extractPageContent } from "@/services/websiteLearning/deepScrape/extract";
import { logDeepScrapeEvent } from "@/services/websiteLearning/deepScrape/observability";
import {
  fetchRobotsRules,
  isPathAllowedByRobots,
  type RobotsRules,
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

type DiscoveryDiagnostic = {
  robotsFetched: boolean;
  robotsDisallowCount: number;
  homepageRobotsAllowed: boolean;
  sitemapLocationsAttempted: string[];
  sitemapResponseStatuses: Array<{ url: string; status: number; ok: boolean }>;
  sitemapCandidateCount: number;
  homepageFetchStatus: number | null;
  homepageFetchOk: boolean | null;
  homepageFinalUrl: string | null;
  homepageContentType: string | null;
  homepageResponseBytes: number | null;
  homepageExtractedCharCount: number | null;
  homepageExtractedWordCount: number | null;
  homepageDiscoveredLinkCount: number | null;
  meaningfulCandidateCount: number;
  rejectedExcludedCount: number;
  rejectedRobotsCount: number;
  rejectedExternalCount: number;
  terminalReason: string | null;
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

function pathAllowed(url: string, robots: RobotsRules): boolean {
  try {
    return isPathAllowedByRobots(new URL(url).pathname || "/", robots);
  } catch {
    return false;
  }
}

function emitDiscoveryDiagnostic(input: {
  organizationId: string;
  jobId: string;
  sourceType: "brain" | "prospect";
  domain: string;
  rootUrl: string;
  diagnostic: DiscoveryDiagnostic;
}): void {
  logDeepScrapeEvent("deep_scrape_discovery_diagnostic", {
    organizationId: input.organizationId,
    jobId: input.jobId,
    sourceType: input.sourceType,
    domain: input.domain,
    rootUrl: input.rootUrl,
    stage: "discovering",
    failureCode: input.diagnostic.terminalReason,
    diagnostic: {
      robotsResult: {
        fetched: input.diagnostic.robotsFetched,
        disallowCount: input.diagnostic.robotsDisallowCount,
        homepageAllowed: input.diagnostic.homepageRobotsAllowed,
      },
      sitemapLocationsAttempted: input.diagnostic.sitemapLocationsAttempted,
      sitemapResponseStatuses: input.diagnostic.sitemapResponseStatuses,
      sitemapCandidateCount: input.diagnostic.sitemapCandidateCount,
      homepageFetchStatus: input.diagnostic.homepageFetchStatus,
      homepageFinalUrl: input.diagnostic.homepageFinalUrl,
      homepageContentType: input.diagnostic.homepageContentType,
      homepageResponseBytes: input.diagnostic.homepageResponseBytes,
      homepageExtractedCharCount: input.diagnostic.homepageExtractedCharCount,
      homepageExtractedWordCount: input.diagnostic.homepageExtractedWordCount,
      homepageDiscoveredLinkCount: input.diagnostic.homepageDiscoveredLinkCount,
      meaningfulCandidateCount: input.diagnostic.meaningfulCandidateCount,
      rejectedCandidateCounts: {
        excluded: input.diagnostic.rejectedExcludedCount,
        robots: input.diagnostic.rejectedRobotsCount,
        external: input.diagnostic.rejectedExternalCount,
      },
      terminalReason: input.diagnostic.terminalReason,
    },
  });
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

  const homepageRobotsAllowed = pathAllowed(rootCanonical, robots);
  const diagnostic: DiscoveryDiagnostic = {
    robotsFetched: robots.fetched,
    robotsDisallowCount: robots.disallow.length,
    homepageRobotsAllowed,
    sitemapLocationsAttempted: [],
    sitemapResponseStatuses: [],
    sitemapCandidateCount: 0,
    homepageFetchStatus: null,
    homepageFetchOk: null,
    homepageFinalUrl: null,
    homepageContentType: null,
    homepageResponseBytes: null,
    homepageExtractedCharCount: null,
    homepageExtractedWordCount: null,
    homepageDiscoveredLinkCount: null,
    meaningfulCandidateCount: 0,
    rejectedExcludedCount: 0,
    rejectedRobotsCount: 0,
    rejectedExternalCount: 0,
    terminalReason: null,
  };

  if (!homepageRobotsAllowed) {
    diagnostic.terminalReason = "ROBOTS_DENIED";
    emitDiscoveryDiagnostic({
      organizationId: input.organizationId,
      jobId: input.jobId,
      sourceType: input.sourceType,
      domain: root.registrableDomain,
      rootUrl: rootCanonical,
      diagnostic,
    });
    throw new Error("ROBOTS_DENIED");
  }

  const discovered = new Set<string>([rootCanonical]);
  let rejectedExternalCount = 0;
  let rejectedExcludedCount = 0;
  let rejectedRobotsCount = 0;

  const sitemapResult = await collectUrlsFromSitemaps({
    rootUrl: root.url,
    registrableDomain: root.registrableDomain,
    onSitemapFound: () => {
      logDeepScrapeEvent("sitemap_found", {
        organizationId: input.organizationId,
        jobId: input.jobId,
        sourceType: input.sourceType,
        domain: root.registrableDomain,
        stage: "discovering",
      });
    },
  });

  diagnostic.sitemapLocationsAttempted = sitemapResult.locationsAttempted;
  diagnostic.sitemapResponseStatuses = sitemapResult.attempts.map((attempt) => ({
    url: attempt.url,
    status: attempt.status,
    ok: attempt.ok,
  }));
  diagnostic.sitemapCandidateCount = sitemapResult.urls.length;

  for (const url of sitemapResult.urls) {
    if (discovered.size >= DEEP_SCRAPE_CRAWL_POLICY.maxDiscoveredUrls) break;
    const canonical = canonicalizePageUrl(url);
    if (!canonical) continue;
    if (!isSameRegistrableDomain(canonical, root.registrableDomain)) {
      rejectedExternalCount += 1;
      continue;
    }
    discovered.add(canonical);
  }

  const sitemapMeaningful = selectMeaningfulUrls([...discovered]).filter(
    (entry) => entry.pageType !== "homepage",
  );

  // Fallback: homepage link discovery when sitemap yields no meaningful pages.
  if (sitemapMeaningful.length === 0) {
    logDeepScrapeEvent("sitemap_fallback_to_homepage", {
      organizationId: input.organizationId,
      jobId: input.jobId,
      sourceType: input.sourceType,
      domain: root.registrableDomain,
      rootUrl: rootCanonical,
      stage: "discovering",
      diagnostic: {
        sitemapCandidateCount: sitemapResult.urls.length,
        sitemapParsed: sitemapResult.sitemapsParsed,
      },
    });

    const homepageFetch = await safeFetchHtml({
      url: rootCanonical,
      registrableDomain: root.registrableDomain,
    });

    diagnostic.homepageFetchOk = homepageFetch.ok;
    diagnostic.homepageFetchStatus = homepageFetch.status;
    diagnostic.homepageFinalUrl = homepageFetch.finalUrl;
    diagnostic.homepageContentType = homepageFetch.contentType || null;

    if (!homepageFetch.ok || !homepageFetch.bodyText) {
      const code = homepageFetch.errorCode ?? "ROOT_FETCH_FAILED";
      if (code === "UNSUPPORTED_CONTENT_TYPE") {
        diagnostic.terminalReason = "UNSUPPORTED_CONTENT_TYPE";
        emitDiscoveryDiagnostic({
          organizationId: input.organizationId,
          jobId: input.jobId,
          sourceType: input.sourceType,
          domain: root.registrableDomain,
          rootUrl: rootCanonical,
          diagnostic,
        });
        throw new Error("UNSUPPORTED_CONTENT_TYPE");
      }
      // Keep going with homepage URL as crawl target; crawl phase will classify fetch errors.
    } else {
      diagnostic.homepageResponseBytes = Buffer.byteLength(
        homepageFetch.bodyText,
        "utf8",
      );
      const extracted = extractPageContent(
        homepageFetch.bodyText,
        homepageFetch.finalUrl,
      );
      const usefulness = evaluatePageUsefulness({
        title: extracted.title,
        headings: extracted.headings,
        text: extracted.text,
      });
      diagnostic.homepageExtractedCharCount = usefulness.charCount;
      diagnostic.homepageExtractedWordCount = usefulness.wordCount;
      diagnostic.homepageDiscoveredLinkCount = extracted.discoveredLinks.length;

      for (const link of extracted.discoveredLinks) {
        if (discovered.size >= DEEP_SCRAPE_CRAWL_POLICY.maxDiscoveredUrls) break;
        const canonical = canonicalizePageUrl(link);
        if (!canonical) continue;
        if (!isSameRegistrableDomain(canonical, root.registrableDomain)) {
          rejectedExternalCount += 1;
          continue;
        }
        discovered.add(canonical);
      }
    }
  }

  // Homepage is always a first-class candidate when robots allows it.
  const withHomepage = ensureHomepageCandidate(discovered, rootCanonical);

  for (const url of withHomepage) {
    if (!isSameRegistrableDomain(url, root.registrableDomain)) {
      rejectedExternalCount += 1;
    } else if (!pathAllowed(url, robots)) {
      rejectedRobotsCount += 1;
    } else if (
      url !== rootCanonical &&
      selectMeaningfulUrls([url]).length === 0
    ) {
      rejectedExcludedCount += 1;
    }
  }

  const allowedDiscovered = withHomepage.filter((url) => {
    if (!isSameRegistrableDomain(url, root.registrableDomain)) return false;
    return pathAllowed(url, robots);
  });

  let meaningful: ScoredUrl[] = selectMeaningfulUrls(allowedDiscovered);

  // Absolute guarantee: homepage remains selectable after scoring/dedupe.
  if (!meaningful.some((entry) => entry.url === rootCanonical)) {
    meaningful = [
      { url: rootCanonical, score: 110, pageType: "homepage" },
      ...meaningful,
    ].slice(0, DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages);
  }

  if (meaningful.length === 1 && meaningful[0]?.pageType === "homepage") {
    logDeepScrapeEvent("homepage_only_crawl_selected", {
      organizationId: input.organizationId,
      jobId: input.jobId,
      sourceType: input.sourceType,
      domain: root.registrableDomain,
      rootUrl: rootCanonical,
      stage: "discovering",
      pagesDiscovered: allowedDiscovered.length,
    });
  }

  diagnostic.rejectedExcludedCount = rejectedExcludedCount;
  diagnostic.rejectedRobotsCount = rejectedRobotsCount;
  diagnostic.rejectedExternalCount = rejectedExternalCount;
  diagnostic.meaningfulCandidateCount = meaningful.length;

  if (meaningful.length === 0) {
    diagnostic.terminalReason = "NO_PERMISSIBLE_CRAWL_TARGETS";
    emitDiscoveryDiagnostic({
      organizationId: input.organizationId,
      jobId: input.jobId,
      sourceType: input.sourceType,
      domain: root.registrableDomain,
      rootUrl: rootCanonical,
      diagnostic,
    });
    throw new Error("NO_PERMISSIBLE_CRAWL_TARGETS");
  }

  await input.onProgress?.({
    stage: "crawling",
    pagesDiscovered: Math.max(allowedDiscovered.length, 1),
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
  let rootFetchError: string | null = null;
  let sawUnsupportedContentType = false;
  let lastUsefulnessFailure: string | null = null;

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

        if (candidate.pageType === "homepage") {
          diagnostic.homepageFetchOk = fetched.ok;
          diagnostic.homepageFetchStatus = fetched.status;
          diagnostic.homepageFinalUrl = fetched.finalUrl;
          diagnostic.homepageContentType = fetched.contentType || null;
        }

        if (!fetched.ok || !fetched.bodyText) {
          lastError = fetched.errorCode ?? "PAGE_FETCH_FAILED";
          if (candidate.pageType === "homepage") {
            rootFetchError = lastError;
          }
          if (lastError === "UNSUPPORTED_CONTENT_TYPE") {
            sawUnsupportedContentType = true;
          }
          continue;
        }

        if (candidate.pageType === "homepage") {
          diagnostic.homepageResponseBytes = Buffer.byteLength(
            fetched.bodyText,
            "utf8",
          );
        }

        const extracted = extractPageContent(
          fetched.bodyText,
          fetched.finalUrl,
        );
        const usefulness = evaluatePageUsefulness({
          title: extracted.title,
          headings: extracted.headings,
          text: extracted.text,
        });

        if (candidate.pageType === "homepage") {
          diagnostic.homepageExtractedCharCount = usefulness.charCount;
          diagnostic.homepageExtractedWordCount = usefulness.wordCount;
          diagnostic.homepageDiscoveredLinkCount =
            extracted.discoveredLinks.length;
        }

        if (!usefulness.useful) {
          lastError =
            usefulness.reason === "denied_or_shell"
              ? "EMPTY_OR_THIN_HOMEPAGE"
              : usefulness.reason === "empty_text" ||
                  usefulness.reason === "too_thin" ||
                  usefulness.reason === "low_word_count"
                ? "EMPTY_OR_THIN_HOMEPAGE"
                : "INSUFFICIENT_USEFUL_CONTENT";
          lastUsefulnessFailure = lastError;
          continue;
        }

        logDeepScrapeEvent("page_crawled", {
          organizationId: input.organizationId,
          jobId: input.jobId,
          sourceType: input.sourceType,
          domain: root.registrableDomain,
          pageType: candidate.pageType,
          pagesCrawled: pagesCrawled + 1,
          pagesDiscovered: Math.max(allowedDiscovered.length, 1),
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
      pagesDiscovered: Math.max(allowedDiscovered.length, 1),
      pagesCrawled,
      pagesTarget: meaningful.length,
    });
  }

    if (crawledPages.length === 0) {
    let terminal = "INSUFFICIENT_USEFUL_CONTENT";
    if (sawUnsupportedContentType && meaningful.length === 1) {
      terminal = "UNSUPPORTED_CONTENT_TYPE";
    } else if (
      rootFetchError &&
      (meaningful.length === 1 ||
        meaningful.every((entry) => entry.pageType === "homepage"))
    ) {
      // Preserve precise transport/security codes for retry classification.
      if (
        rootFetchError === "UNSUPPORTED_CONTENT_TYPE" ||
        rootFetchError === "PAGE_TIMEOUT" ||
        rootFetchError === "FETCH_FAILED" ||
        rootFetchError === "DNS_LOOKUP_FAILED" ||
        rootFetchError === "PRIVATE_IP_REJECTED" ||
        rootFetchError === "IP_LITERAL_REJECTED" ||
        rootFetchError === "CROSS_DOMAIN_REJECTED" ||
        /^HTTP_\d+/.test(rootFetchError)
      ) {
        terminal = rootFetchError;
      } else {
        terminal = "ROOT_FETCH_FAILED";
      }
    } else if (lastUsefulnessFailure) {
      terminal = lastUsefulnessFailure;
    } else if (!homepageRobotsAllowed) {
      terminal = "ROBOTS_DENIED";
    } else {
      terminal = "NO_PERMISSIBLE_CRAWL_TARGETS";
    }

    diagnostic.terminalReason = terminal;
    diagnostic.meaningfulCandidateCount = meaningful.length;
    emitDiscoveryDiagnostic({
      organizationId: input.organizationId,
      jobId: input.jobId,
      sourceType: input.sourceType,
      domain: root.registrableDomain,
      rootUrl: rootCanonical,
      diagnostic,
    });
    throw new Error(terminal);
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
    pagesDiscovered: Math.max(allowedDiscovered.length, 1),
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
    pagesDiscovered: Math.max(allowedDiscovered.length, 1),
    pagesCrawled,
    pagesAnalyzed: intelligence.pages_analyzed,
    elapsedMs: Date.now() - startedAt,
  });

  return {
    intelligence,
    pagesDiscovered: Math.max(allowedDiscovered.length, 1),
    pagesCrawled,
    pagesAnalyzed: intelligence.pages_analyzed,
    crawlSummary,
  };
}
