/**
 * Crawlee adapter — authoritative Phase A crawl/extraction engine.
 * Returns normalized page documents; never leaks Crawlee types upward.
 */

import { RequestQueue } from "crawlee";
import {
  buildCrawlSummary,
  countWords,
  DEEP_SCRAPE_CRAWL_POLICY,
  evaluateCorpusUsefulness,
} from "@/services/websiteLearning/deepScrape/crawlPolicy";
import {
  buildBoilerplateFingerprintSet,
  hashMeaningfulContent,
  stripBoilerplateBlocks,
} from "@/services/websiteLearning/deepScrape/crawler/boilerplate";
import { DeepScrapeCandidateRegistry } from "@/services/websiteLearning/deepScrape/crawler/candidateRegistry";
import {
  enqueueCheerioUrl,
  runCheerioCrawlPhase,
  type CheerioPhaseContext,
} from "@/services/websiteLearning/deepScrape/crawler/cheerioCrawler";
import { DeepScrapeFetchLifecycle } from "@/services/websiteLearning/deepScrape/crawler/fetchLifecycle";
import type { ExtractedDiscoveryLink } from "@/services/websiteLearning/deepScrape/crawler/navigationExtraction";
import { buildRankedCrawlPlan } from "@/services/websiteLearning/deepScrape/crawler/rankedCrawlPlan";
import type { DiscoveryProvenance } from "@/services/websiteLearning/deepScrape/crawler/urlRelevance";
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
    text: page.meaningfulText || page.readableText,
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
  const seenCanonicalUrls = new Map<string, string>();
  const seenFinalUrls = new Map<string, string>();
  const seenContentHashes = new Map<string, string>();
  const seenFingerprints = new Set<string>();
  const enqueuedUrls = new Set<string>();
  const rejectedByReason: Record<string, number> = {};
  const candidateRegistry = new DeepScrapeCandidateRegistry();
  const acceptedByProvenance: Record<string, number> = {};
  const discoveredInventoryLinks: ExtractedDiscoveryLink[] = [];
  const fetchLifecycle = new DeepScrapeFetchLifecycle({
    organizationId: input.organizationId,
    jobId: input.jobId,
    sourceType: input.sourceType,
    domain: root.registrableDomain,
  });
  let cheerioProcessed = 0;
  let playwrightProcessed = 0;
  let browserClosed = true;
  let queueSizeBounded = false;
  let rankedPlanSelectedCount = 0;
  let lifecycleSummary: ReturnType<
    DeepScrapeFetchLifecycle["summary"]
  > | null = null;

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
      pagesDiscovered: Math.max(
        rankedPlanSelectedCount,
        candidateRegistry.size,
        enqueuedUrls.size,
      ),
      pagesAttempted,
      pagesAccepted: acceptedPages.length,
      pagesRendered: playwrightProcessed,
      pagesRejected,
      // pagesCrawled remains accepted-page count for UI/DB compatibility.
      pagesCrawled: acceptedPages.length,
      pagesTarget: Math.max(
        1,
        Math.min(
          rankedPlanSelectedCount || enqueuedUrls.size || 1,
          DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages,
        ),
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

    const cheerioQueue = await RequestQueue.open(
      `cheerio-${input.jobId}`,
      { config: storage.config },
    );

    const cheerioCtx: CheerioPhaseContext = {
      organizationId: input.organizationId,
      jobId: input.jobId,
      sourceType: input.sourceType,
      registrableDomain: root.registrableDomain,
      rootUrl: rootCanonical,
      robots,
      config: storage.config,
      requestQueue: cheerioQueue,
      acceptedPages,
      playwrightFallbackUrls,
      seenCanonicalUrls,
      seenFinalUrls,
      seenContentHashes,
      seenFingerprints,
      enqueuedUrls,
      rejectedByReason,
      candidateRegistry,
      acceptedByProvenance,
      maxAccepted: DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages,
      maxQueueSize: DEEP_SCRAPE_CRAWL_POLICY.maxRankedCandidates,
      allowLiveLinkEnqueue: false,
      forefrontOnEnqueue: false,
      discoveredInventoryLinks,
      fetchLifecycle,
      onPageProcessed: async () => emitProgress("crawling"),
    };

    // ── Stage 1: homepage-only discovery ──────────────────────────────
    logDeepScrapeEvent("deep_scrape_homepage_discovery_started", {
      organizationId: input.organizationId,
      jobId: input.jobId,
      sourceType: input.sourceType,
      domain: root.registrableDomain,
      rootUrl: rootCanonical,
      stage: "discovering",
    });

    await enqueueCheerioUrl(cheerioCtx, rootCanonical, {
      label: "homepage",
      provenance: "unknown",
      forefront: false,
    });
    cheerioCtx.maxRequestsPerCrawlOverride = 1;
    const homepageResult = await runCheerioCrawlPhase(cheerioCtx);
    cheerioProcessed += homepageResult.processed;

    logDeepScrapeEvent("deep_scrape_homepage_discovery_completed", {
      organizationId: input.organizationId,
      jobId: input.jobId,
      sourceType: input.sourceType,
      domain: root.registrableDomain,
      pagesCrawled: acceptedPages.length,
      diagnostic: {
        homepageProcessed: homepageResult.processed,
        navigationLinkCount: discoveredInventoryLinks.length,
        primaryNavigationCount: discoveredInventoryLinks.filter(
          (link) => link.provenance === "primary_navigation",
        ).length,
        acceptedHomepage: acceptedPages.some(
          (page) =>
            (canonicalizePageUrl(page.finalUrl) ?? page.finalUrl) ===
            rootCanonical,
        ),
      },
    });

    logDeepScrapeEvent("deep_scrape_navigation_inventory_collected", {
      organizationId: input.organizationId,
      jobId: input.jobId,
      sourceType: input.sourceType,
      domain: root.registrableDomain,
      diagnostic: {
        linkCount: discoveredInventoryLinks.length,
        primaryNavigationCount: discoveredInventoryLinks.filter(
          (link) => link.provenance === "primary_navigation",
        ).length,
        secondaryNavigationCount: discoveredInventoryLinks.filter(
          (link) => link.provenance === "secondary_navigation",
        ).length,
        footerNavigationCount: discoveredInventoryLinks.filter(
          (link) => link.provenance === "footer_navigation",
        ).length,
        contentLinkCount: discoveredInventoryLinks.filter(
          (link) => link.provenance === "content_link",
        ).length,
      },
    });

    // Sitemap after homepage so navigation already occupies inventory slots.
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

    if (sitemap.urls.length > DEEP_SCRAPE_CRAWL_POLICY.maxDiscoveryInventory) {
      queueSizeBounded = true;
    }

    const planCandidates: Array<{
      url: string;
      provenance: DiscoveryProvenance;
      anchorText?: string | null;
    }> = [
      { url: rootCanonical, provenance: "unknown" },
      ...discoveredInventoryLinks.map((link) => ({
        url: link.url,
        provenance: link.provenance as DiscoveryProvenance,
        anchorText: link.anchorText,
      })),
      ...sitemap.urls
        .filter((url) => pathAllowed(url, robots))
        .map((url) => ({
          url,
          provenance: "sitemap" as const,
        })),
    ];

    const rankedPlan = buildRankedCrawlPlan({
      rootUrl: rootCanonical,
      homepageUrl: rootCanonical,
      candidates: planCandidates,
      maxDiscoveryInventory: DEEP_SCRAPE_CRAWL_POLICY.maxDiscoveryInventory,
      maxRankedCandidates: DEEP_SCRAPE_CRAWL_POLICY.maxRankedCandidates,
    });
    rankedPlanSelectedCount = rankedPlan.selected.length;
    fetchLifecycle.setRankedSelected(rankedPlan.selected.length);
    rankedPlan.selected.forEach((entry, index) => {
      fetchLifecycle.markRanked(entry.normalizedUrl, {
        rank: index,
        score: entry.totalScore,
        provenance: entry.provenance,
      });
    });

    logDeepScrapeEvent("deep_scrape_candidate_inventory_finalized", {
      organizationId: input.organizationId,
      jobId: input.jobId,
      sourceType: input.sourceType,
      domain: root.registrableDomain,
      pagesDiscovered: rankedPlan.stats.totalCandidatesAfterDeduplication,
      diagnostic: {
        ...rankedPlan.stats,
        sitemapUrlCount: sitemap.urls.length,
        navigationLinkCount: discoveredInventoryLinks.length,
      },
    });

    logDeepScrapeEvent("deep_scrape_ranked_plan_finalized", {
      organizationId: input.organizationId,
      jobId: input.jobId,
      sourceType: input.sourceType,
      domain: root.registrableDomain,
      pagesDiscovered: rankedPlan.stats.selectedCandidateCount,
      diagnostic: {
        ...rankedPlan.stats,
        jobId: input.jobId,
        sourceType: input.sourceType,
        domain: root.registrableDomain,
      },
    });

    for (const excluded of rankedPlan.excluded.slice(0, 40)) {
      logDeepScrapeEvent("deep_scrape_ranked_candidate_excluded", {
        organizationId: input.organizationId,
        jobId: input.jobId,
        sourceType: input.sourceType,
        domain: root.registrableDomain,
        failureCode: "RANKED_PLAN_LOWER_PRIORITY",
        diagnostic: {
          candidateUrl: excluded.normalizedUrl,
          candidateScore: excluded.totalScore,
          candidateProvenance: excluded.provenance,
          discoveredCandidateCount:
            rankedPlan.stats.totalCandidatesAfterDeduplication,
          rankedCandidateCount: rankedPlan.selected.length,
          maxRankedCandidates: DEEP_SCRAPE_CRAWL_POLICY.maxRankedCandidates,
          lowestSelectedScore: rankedPlan.stats.lowestSelectedScore,
        },
      });
    }

    // Compat event name used by existing dashboards/tests.
    logDeepScrapeEvent("deep_scrape_priority_queue_finalized", {
      organizationId: input.organizationId,
      jobId: input.jobId,
      sourceType: input.sourceType,
      domain: root.registrableDomain,
      pagesDiscovered: rankedPlan.stats.selectedCandidateCount,
      diagnostic: {
        ...candidateRegistry.summary(acceptedByProvenance),
        ...rankedPlan.stats,
        pageCap: DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages,
        fetchBudget: DEEP_SCRAPE_CRAWL_POLICY.maxFetchAttempts,
        rankedPlan: true,
      },
    });

    if (rankedPlan.secondarySelected.length === 0 && sitemap.urls.length === 0) {
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

    // ── Stage 2: ranked secondary fetch (homepage already processed) ──
    const remainingFetchBudget = Math.max(
      0,
      DEEP_SCRAPE_CRAWL_POLICY.maxFetchAttempts - cheerioProcessed,
    );

    logDeepScrapeEvent("deep_scrape_ranked_fetch_started", {
      organizationId: input.organizationId,
      jobId: input.jobId,
      sourceType: input.sourceType,
      domain: root.registrableDomain,
      diagnostic: {
        secondaryCandidateCount: rankedPlan.secondarySelected.length,
        remainingFetchBudget,
        maxFetchAttempts: DEEP_SCRAPE_CRAWL_POLICY.maxFetchAttempts,
        homepageAlreadyFetched: cheerioProcessed > 0,
      },
    });

    cheerioCtx.maxQueueSize = DEEP_SCRAPE_CRAWL_POLICY.maxRankedCandidates;
    cheerioCtx.allowLiveLinkEnqueue = false;
    cheerioCtx.forefrontOnEnqueue = false;
    cheerioCtx.maxRequestsPerCrawlOverride = remainingFetchBudget;

    for (const entry of rankedPlan.secondarySelected) {
      if (enqueuedUrls.size >= DEEP_SCRAPE_CRAWL_POLICY.maxRankedCandidates) {
        break;
      }
      await enqueueCheerioUrl(cheerioCtx, entry.normalizedUrl, {
        label: "ranked",
        provenance: entry.provenance,
        anchorText: entry.anchorText,
        forefront: false,
      });
    }

    if (
      remainingFetchBudget > 0 &&
      rankedPlan.secondarySelected.length > 0
    ) {
      const rankedResult = await runCheerioCrawlPhase(cheerioCtx);
      cheerioProcessed += rankedResult.processed;
    }

    logDeepScrapeEvent("deep_scrape_ranked_fetch_completed", {
      organizationId: input.organizationId,
      jobId: input.jobId,
      sourceType: input.sourceType,
      domain: root.registrableDomain,
      pagesCrawled: acceptedPages.length,
      diagnostic: {
        cheerioProcessed,
        rankedPlanSelected: rankedPlan.selected.length,
        maxFetchAttempts: DEEP_SCRAPE_CRAWL_POLICY.maxFetchAttempts,
        maxMeaningfulPages: DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages,
      },
    });

    const shouldRunPlaywright =
      Date.now() < deadline &&
      playwrightFallbackUrls.length > 0 &&
      acceptedPages.length < DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages;

    if (shouldRunPlaywright) {
      await emitProgress("rendering");
      const playwrightQueue = await RequestQueue.open(
        `playwright-${input.jobId}`,
        { config: storage.config },
      );

      // Playwright only re-renders URLs already selected/fetched in the ranked plan.
      const uniqueFallbackAll = [...new Set(playwrightFallbackUrls)]
        .map((url) => {
          const meta = candidateRegistry.getEntry(url);
          return {
            url,
            pageType: meta?.pageType ?? "other",
            provenance: meta?.provenance ?? "unknown",
            totalScore: meta?.totalScore ?? 0,
          };
        })
        .sort(
          (left, right) =>
            right.totalScore - left.totalScore ||
            left.url.localeCompare(right.url),
        );
      const uniqueFallback = uniqueFallbackAll.slice(
        0,
        DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages,
      );
      const overflowFallback = uniqueFallbackAll.slice(
        DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages,
      );
      for (const entry of overflowFallback) {
        rejectedByReason.PLAYWRIGHT_BUDGET_EXCEEDED =
          (rejectedByReason.PLAYWRIGHT_BUDGET_EXCEEDED ?? 0) + 1;
        fetchLifecycle.markRejected(entry.url, "PLAYWRIGHT_BUDGET_EXCEEDED", {
          browserFallbackUsed: true,
        });
        logDeepScrapeEvent("page_rejected", {
          organizationId: input.organizationId,
          jobId: input.jobId,
          sourceType: input.sourceType,
          domain: root.registrableDomain,
          failureCode: "PLAYWRIGHT_BUDGET_EXCEEDED",
          diagnostic: {
            path: (() => {
              try {
                return new URL(entry.url).pathname;
              } catch {
                return "/";
              }
            })(),
            browserFallbackUsed: true,
            totalScore: entry.totalScore,
            provenance: entry.provenance,
          },
        });
      }

      for (const entry of uniqueFallback) {
        await playwrightQueue.addRequest(
          {
            url: entry.url,
            uniqueKey: `pw:${entry.url}`,
            userData: {
              pageType: entry.pageType,
              provenance: entry.provenance,
              totalScore: entry.totalScore,
            },
          },
          // Deterministic score-desc enqueue order; no forefront reordering.
          { forefront: false },
        );
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
          seenFinalUrls,
          seenContentHashes,
          seenFingerprints,
          rejectedByReason,
          maxAccepted: DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages,
          fetchLifecycle,
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
          const skipped = fetchLifecycle.finalizePlaywrightPending(
            "PLAYWRIGHT_CHROMIUM_UNAVAILABLE",
          );
          if (skipped > 0) {
            rejectedByReason.PLAYWRIGHT_CHROMIUM_UNAVAILABLE =
              (rejectedByReason.PLAYWRIGHT_CHROMIUM_UNAVAILABLE ?? 0) + skipped;
          }
          logDeepScrapeEvent("page_rejected", {
            organizationId: input.organizationId,
            jobId: input.jobId,
            sourceType: input.sourceType,
            domain: root.registrableDomain,
            failureCode: "PLAYWRIGHT_CHROMIUM_UNAVAILABLE",
            diagnostic: {
              browserFallbackUsed: true,
              pagesAcceptedWithoutBrowser: acceptedPages.length,
              pendingTerminalized: skipped,
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
    } else if (playwrightFallbackUrls.length > 0) {
      const skipReason =
        acceptedPages.length >= DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages
          ? "PAGE_CAP_LOWER_PRIORITY"
          : "PLAYWRIGHT_FALLBACK_SKIPPED";
      const skipped = fetchLifecycle.finalizePlaywrightPending(skipReason);
      if (skipped > 0) {
        rejectedByReason[skipReason] =
          (rejectedByReason[skipReason] ?? 0) + skipped;
      }
    }

    try {
      await cheerioQueue.drop();
    } catch {
      // ignore
    }

    // Pre-synthesis: terminalize any leftover PW-pending, then enforce
    // terminalHandlerCandidates === requestHandlersEntered and
    // playwrightPending === 0. Ranked never-started → skipped_before_fetch
    // (separate from the handler invariant).
    {
      const leftover = fetchLifecycle.finalizePlaywrightPending(
        "PLAYWRIGHT_FALLBACK_SKIPPED",
      );
      if (leftover > 0) {
        rejectedByReason.PLAYWRIGHT_FALLBACK_SKIPPED =
          (rejectedByReason.PLAYWRIGHT_FALLBACK_SKIPPED ?? 0) + leftover;
      }
    }
    lifecycleSummary = fetchLifecycle.assertCompleteOrThrow();

    // Cross-page boilerplate removal before hashing/corpus assembly.
    const boilerplateSet = buildBoilerplateFingerprintSet(
      acceptedPages.map(
        (page) => page.meaningfulText || page.readableText,
      ),
    );
    if (boilerplateSet.size > 0) {
      logDeepScrapeEvent("shared_template_detected", {
        organizationId: input.organizationId,
        jobId: input.jobId,
        sourceType: input.sourceType,
        domain: root.registrableDomain,
        diagnostic: {
          sharedBlockCount: boilerplateSet.size,
          pagesSampled: acceptedPages.length,
        },
      });
    }

    const dedupedByHash = new Map<string, NormalizedPageDocument>();
    for (const page of acceptedPages) {
      const source = page.meaningfulText || page.readableText;
      const stripped = stripBoilerplateBlocks(source, boilerplateSet);
      if (stripped.removedBlocks > 0) {
        logDeepScrapeEvent("boilerplate_removed", {
          organizationId: input.organizationId,
          jobId: input.jobId,
          sourceType: input.sourceType,
          domain: root.registrableDomain,
          diagnostic: {
            path: (() => {
              try {
                return new URL(page.finalUrl).pathname;
              } catch {
                return "/";
              }
            })(),
            preBoilerplateChars: stripped.preChars,
            postBoilerplateChars: stripped.postChars,
            removedBlocks: stripped.removedBlocks,
          },
        });
      }
      const meaningfulText = stripped.text;
      const contentHash = hashMeaningfulContent(meaningfulText);
      const next: NormalizedPageDocument = {
        ...page,
        meaningfulText,
        readableText: meaningfulText || page.readableText,
        contentHash,
        preBoilerplateChars: stripped.preChars,
        postBoilerplateChars: stripped.postChars,
      };
      // Prefer longer unique content when hashes collide after stripping.
      const prior = dedupedByHash.get(contentHash);
      if (
        !prior ||
        (next.meaningfulText?.length ?? 0) > (prior.meaningfulText?.length ?? 0)
      ) {
        dedupedByHash.set(contentHash, next);
      }
    }

    const uniquePages = [...dedupedByHash.values()];
    const boundedPages: NormalizedPageDocument[] = [];
    let combinedChars = 0;
    for (const page of uniquePages) {
      if (boundedPages.length >= DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages) {
        break;
      }
      if (combinedChars >= DEEP_SCRAPE_CRAWL_POLICY.maxCombinedSourceChars) {
        break;
      }
      const remaining =
        DEEP_SCRAPE_CRAWL_POLICY.maxCombinedSourceChars - combinedChars;
      const text = (page.meaningfulText || page.readableText).slice(
        0,
        remaining,
      );
      combinedChars += text.length;
      boundedPages.push({
        ...page,
        readableText: text,
        meaningfulText: text,
      });
    }

    const uniqueChars = boundedPages.reduce(
      (sum, page) => sum + (page.meaningfulText || page.readableText).length,
      0,
    );
    const uniqueWords = countWords(
      boundedPages
        .map((page) => page.meaningfulText || page.readableText)
        .join(" "),
    );
    const duplicateRejects =
      (rejectedByReason.PAGE_DUPLICATE ?? 0) +
      (rejectedByReason.CHEERIO_SUSPECTED_TEMPLATE_EXTRACTION ?? 0);
    const attempted = cheerioProcessed + playwrightProcessed;
    const collapsedToTemplate =
      attempted >= 5 &&
      boundedPages.length <= 1 &&
      uniqueChars < 800 &&
      duplicateRejects >= Math.max(3, Math.floor(attempted * 0.5)) &&
      playwrightProcessed === 0;

    if (collapsedToTemplate) {
      logDeepScrapeEvent("corpus_quality_failed", {
        organizationId: input.organizationId,
        jobId: input.jobId,
        sourceType: input.sourceType,
        domain: root.registrableDomain,
        failureCode: "EXTRACTION_COLLAPSED_TO_SHARED_TEMPLATE",
        diagnostic: {
          fetchesAttempted: attempted,
          pagesAccepted: boundedPages.length,
          uniqueChars,
          uniqueWords,
          duplicateRejects,
          browserFallbackUsed: false,
        },
      });
      throw new Error("EXTRACTION_COLLAPSED_TO_SHARED_TEMPLATE");
    }

    // If many pages collapsed but Playwright already ran and corpus is still tiny.
    if (
      attempted >= 5 &&
      boundedPages.length <= 1 &&
      uniqueChars < 500 &&
      duplicateRejects >= Math.max(3, Math.floor(attempted * 0.5))
    ) {
      logDeepScrapeEvent("corpus_quality_failed", {
        organizationId: input.organizationId,
        jobId: input.jobId,
        sourceType: input.sourceType,
        domain: root.registrableDomain,
        failureCode: "EXTRACTION_COLLAPSED_TO_SHARED_TEMPLATE",
        diagnostic: {
          fetchesAttempted: attempted,
          pagesAccepted: boundedPages.length,
          uniqueChars,
          uniqueWords,
          duplicateRejects,
          browserFallbackUsed: playwrightProcessed > 0,
        },
      });
      throw new Error("EXTRACTION_COLLAPSED_TO_SHARED_TEMPLATE");
    }

    const corpus = evaluateCorpusUsefulness(
      boundedPages.map((page) => ({
        text: page.meaningfulText || page.readableText,
        title: page.title,
        pageType: page.pageType,
      })),
    );

    const prioritySummary = candidateRegistry.summary(acceptedByProvenance);
    logDeepScrapeEvent("deep_scrape_priority_queue_finalized", {
      organizationId: input.organizationId,
      jobId: input.jobId,
      sourceType: input.sourceType,
      domain: root.registrableDomain,
      pagesDiscovered: prioritySummary.candidatesDiscovered,
      pagesCrawled: boundedPages.length,
      diagnostic: {
        phase: "crawl_completed",
        ...prioritySummary,
        pageCapSkips:
          prioritySummary.pageCapSkips +
          (rejectedByReason.PAGE_CAP_LOWER_PRIORITY ?? 0),
        rejectedByReason,
      },
    });

    const stats = {
      // Discovered = inventory size; pagesCrawled in job progress = accepted.
      candidatesDiscovered: Math.max(
        rankedPlanSelectedCount,
        candidateRegistry.size,
      ),
      // Compat: unique URLs with requestHandler/failedRequestHandler entry.
      fetchesAttempted:
        lifecycleSummary?.fetchesAttempted ??
        cheerioProcessed + playwrightProcessed,
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
        // fetchesAttempted = requestHandlersEntered (unique handler URLs).
        fetchLifecycle: lifecycleSummary,
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
