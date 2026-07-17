/**
 * CheerioCrawler phase — default path for server-rendered HTML.
 * All requests are validated through Athena's SSRF boundary before fetch.
 */

import {
  CheerioCrawler,
  type Configuration,
  type RequestQueue,
} from "crawlee";
import {
  DEEP_SCRAPE_CRAWL_POLICY,
  isExcludedUrl,
  scoreUrl,
} from "@/services/websiteLearning/deepScrape/crawlPolicy";
import { DeepScrapeCandidateRegistry } from "@/services/websiteLearning/deepScrape/crawler/candidateRegistry";
import type { DeepScrapeFetchLifecycle } from "@/services/websiteLearning/deepScrape/crawler/fetchLifecycle";
import type { ExtractedDiscoveryLink } from "@/services/websiteLearning/deepScrape/crawler/navigationExtraction";
import { classifyNormalizedPage } from "@/services/websiteLearning/deepScrape/crawler/pageClassifier";
import { extractWithReadability } from "@/services/websiteLearning/deepScrape/crawler/readabilityExtractor";
import { continueSameOriginRedirectChain } from "@/services/websiteLearning/deepScrape/crawler/redirectContinuation";
import type { NormalizedPageDocument } from "@/services/websiteLearning/deepScrape/crawler/crawlerTypes";
import {
  scoreDeepScrapeCandidate,
  type DiscoveryProvenance,
} from "@/services/websiteLearning/deepScrape/crawler/urlRelevance";
import { logDeepScrapeEvent } from "@/services/websiteLearning/deepScrape/observability";
import {
  assertPublicHostname,
  canonicalizePageUrl,
  isSameRegistrableDomain,
} from "@/services/websiteLearning/deepScrape/urlSafety";
import { isPathAllowedByRobots, type RobotsRules } from "@/services/websiteLearning/deepScrape/robots";

export type CheerioPhaseContext = {
  organizationId: string;
  jobId: string;
  sourceType: "brain" | "prospect";
  registrableDomain: string;
  rootUrl: string;
  robots: RobotsRules;
  config: Configuration;
  requestQueue: RequestQueue;
  acceptedPages: NormalizedPageDocument[];
  playwrightFallbackUrls: string[];
  /** map: identity url/hash -> first seen page path */
  seenCanonicalUrls: Map<string, string>;
  seenFinalUrls: Map<string, string>;
  seenContentHashes: Map<string, string>;
  seenFingerprints: Set<string>;
  enqueuedUrls: Set<string>;
  rejectedByReason: Record<string, number>;
  candidateRegistry: DeepScrapeCandidateRegistry;
  acceptedByProvenance: Record<string, number>;
  maxAccepted: number;
  /** Max URLs allowed in the active fetch queue (ranked plan size). */
  maxQueueSize: number;
  /**
   * When false (default for ranked-plan crawl), extracted links are inventoried
   * into the registry only — they are not enqueued mid-crawl.
   */
  allowLiveLinkEnqueue?: boolean;
  /** When true, addRequest uses Crawlee forefront. Default false (FIFO plan order). */
  forefrontOnEnqueue?: boolean;
  /** Override Cheerio maxRequestsPerCrawl for staged runs. */
  maxRequestsPerCrawlOverride?: number;
  /** Optional sink for homepage/navigation inventory links. */
  discoveredInventoryLinks?: ExtractedDiscoveryLink[];
  /** Shared Prospect/Brain fetch lifecycle ledger. */
  fetchLifecycle?: DeepScrapeFetchLifecycle;
  onPageProcessed?: () => void | Promise<void>;
};

function safePath(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "/";
  }
}

function recordRejection(
  ctx: CheerioPhaseContext,
  code: string,
): void {
  ctx.rejectedByReason[code] = (ctx.rejectedByReason[code] ?? 0) + 1;
}

function inventoryDiscoveries(
  ctx: CheerioPhaseContext,
  links: ExtractedDiscoveryLink[],
  sourcePath: string,
): void {
  if (links.length === 0) return;
  logDeepScrapeEvent("deep_scrape_navigation_extracted", {
    organizationId: ctx.organizationId,
    jobId: ctx.jobId,
    sourceType: ctx.sourceType,
    domain: ctx.registrableDomain,
    diagnostic: {
      path: sourcePath,
      linkCount: links.length,
      primaryNavigationCount: links.filter(
        (link) => link.provenance === "primary_navigation",
      ).length,
      secondaryNavigationCount: links.filter(
        (link) => link.provenance === "secondary_navigation",
      ).length,
      footerNavigationCount: links.filter(
        (link) => link.provenance === "footer_navigation",
      ).length,
      contentLinkCount: links.filter(
        (link) => link.provenance === "content_link",
      ).length,
    },
  });

  for (const link of links) {
    const canonical = canonicalizePageUrl(link.url);
    if (!canonical) continue;
    if (!isSameRegistrableDomain(canonical, ctx.registrableDomain)) continue;

    if (
      ctx.candidateRegistry.size >= DEEP_SCRAPE_CRAWL_POLICY.maxDiscoveryInventory &&
      !ctx.candidateRegistry.getEntry(canonical)
    ) {
      recordRejection(ctx, "DISCOVERY_INVENTORY_CAPACITY");
      logDeepScrapeEvent("deep_scrape_discovery_inventory_candidate_skipped", {
        organizationId: ctx.organizationId,
        jobId: ctx.jobId,
        sourceType: ctx.sourceType,
        domain: ctx.registrableDomain,
        failureCode: "DISCOVERY_INVENTORY_CAPACITY",
        diagnostic: {
          candidateUrl: canonical,
          candidateScore: null,
          candidateProvenance: link.provenance,
          discoveredCandidateCount: ctx.candidateRegistry.size,
          maxDiscoveryInventory: DEEP_SCRAPE_CRAWL_POLICY.maxDiscoveryInventory,
          reason: "discovery_inventory_capacity",
        },
      });
      continue;
    }

    const observed = ctx.candidateRegistry.observe({
      url: canonical,
      rootUrl: ctx.rootUrl,
      provenance: link.provenance,
      anchorText: link.anchorText,
    });
    ctx.discoveredInventoryLinks?.push({
      url: observed.ranked.normalizedUrl,
      provenance: observed.ranked.provenance,
      anchorText: observed.ranked.anchorText ?? link.anchorText,
    });
    logDeepScrapeEvent("deep_scrape_candidate_scored", {
      organizationId: ctx.organizationId,
      jobId: ctx.jobId,
      sourceType: ctx.sourceType,
      domain: ctx.registrableDomain,
      diagnostic: {
        path: safePath(canonical),
        provenance: observed.ranked.provenance,
        totalScore: observed.ranked.totalScore,
        factors: observed.ranked.factors.slice(0, 8),
        pageType: observed.ranked.pageType,
        upgraded: observed.upgraded,
      },
    });
    if (observed.upgraded) {
      logDeepScrapeEvent("deep_scrape_candidate_priority_upgraded", {
        organizationId: ctx.organizationId,
        jobId: ctx.jobId,
        sourceType: ctx.sourceType,
        domain: ctx.registrableDomain,
        diagnostic: {
          path: safePath(canonical),
          provenance: observed.ranked.provenance,
          totalScore: observed.ranked.totalScore,
        },
      });
    }
  }
}

async function maybeEnqueue(
  ctx: CheerioPhaseContext,
  url: string,
  options?: {
    label?: string;
    provenance?: DiscoveryProvenance;
    anchorText?: string | null;
    /** Force forefront; default respects ctx.forefrontOnEnqueue (false). */
    forefront?: boolean;
  },
): Promise<void> {
  const canonical = canonicalizePageUrl(url);
  if (!canonical) return;
  if (!isSameRegistrableDomain(canonical, ctx.registrableDomain)) return;

  const provenance = options?.provenance ?? "unknown";
  const observed = ctx.candidateRegistry.observe({
    url: canonical,
    rootUrl: ctx.rootUrl,
    provenance,
    anchorText: options?.anchorText ?? null,
  });

  logDeepScrapeEvent("deep_scrape_candidate_scored", {
    organizationId: ctx.organizationId,
    jobId: ctx.jobId,
    sourceType: ctx.sourceType,
    domain: ctx.registrableDomain,
    diagnostic: {
      path: safePath(canonical),
      provenance: observed.ranked.provenance,
      totalScore: observed.ranked.totalScore,
      factors: observed.ranked.factors.slice(0, 8),
      pageType: observed.ranked.pageType,
      upgraded: observed.upgraded,
    },
  });

  if (observed.upgraded) {
    logDeepScrapeEvent("deep_scrape_candidate_priority_upgraded", {
      organizationId: ctx.organizationId,
      jobId: ctx.jobId,
      sourceType: ctx.sourceType,
      domain: ctx.registrableDomain,
      diagnostic: {
        path: safePath(canonical),
        provenance: observed.ranked.provenance,
        totalScore: observed.ranked.totalScore,
      },
    });
  }

  if (observed.ranked.rejectedBeforeFetch) {
    recordRejection(ctx, observed.ranked.rejectionReason ?? "URL_POLICY_REJECTED");
    return;
  }
  if (isExcludedUrl(canonical) && observed.ranked.pageType !== "homepage") {
    recordRejection(ctx, "URL_POLICY_REJECTED");
    return;
  }
  try {
    const path = new URL(canonical).pathname || "/";
    if (!isPathAllowedByRobots(path, ctx.robots)) {
      recordRejection(ctx, "ROBOTS_OR_ACCESS_BLOCKED");
      return;
    }
  } catch {
    return;
  }

  // Already queued: metadata may upgrade, but do not create a second fetch.
  if (ctx.enqueuedUrls.has(canonical)) {
    return;
  }
  if (ctx.enqueuedUrls.size >= ctx.maxQueueSize) {
    recordRejection(ctx, "RANKED_PLAN_LOWER_PRIORITY");
    logDeepScrapeEvent("deep_scrape_ranked_candidate_excluded", {
      organizationId: ctx.organizationId,
      jobId: ctx.jobId,
      sourceType: ctx.sourceType,
      domain: ctx.registrableDomain,
      failureCode: "RANKED_PLAN_LOWER_PRIORITY",
      diagnostic: {
        candidateUrl: canonical,
        candidateScore: observed.ranked.totalScore,
        candidateProvenance: observed.ranked.provenance,
        rankedCandidateCount: ctx.enqueuedUrls.size,
        maxRankedCandidates: ctx.maxQueueSize,
        reason: "ranked_plan_capacity",
      },
    });
    return;
  }

  const forefront =
    options?.forefront ?? Boolean(ctx.forefrontOnEnqueue);
  ctx.enqueuedUrls.add(canonical);
  ctx.candidateRegistry.markEnqueued(canonical);
  ctx.fetchLifecycle?.markQueued(canonical, {
    score: observed.ranked.totalScore,
    provenance: observed.ranked.provenance,
  });
  await ctx.requestQueue.addRequest(
    {
      url: canonical,
      uniqueKey: canonical,
      userData: {
        pageType: observed.ranked.pageType,
        label: options?.label ?? "cheerio",
        provenance: observed.ranked.provenance,
        totalScore: observed.ranked.totalScore,
        scoreFactors: observed.ranked.factors.slice(0, 8),
        pathDepth: observed.ranked.arborescence.pathDepth,
      },
    },
    { forefront },
  );
  logDeepScrapeEvent("crawlee_request_enqueued", {
    organizationId: ctx.organizationId,
    jobId: ctx.jobId,
    sourceType: ctx.sourceType,
    domain: ctx.registrableDomain,
    diagnostic: {
      path: safePath(canonical),
      extractionMethod: "cheerio_readability",
      provenance: observed.ranked.provenance,
      totalScore: observed.ranked.totalScore,
      forefront,
    },
  });
}

export async function runCheerioCrawlPhase(
  ctx: CheerioPhaseContext,
): Promise<{ processed: number }> {
  let processed = 0;

  const crawler = new CheerioCrawler(
    {
      requestQueue: ctx.requestQueue,
      maxConcurrency: DEEP_SCRAPE_CRAWL_POLICY.maxConcurrentRequests,
      maxRequestRetries: DEEP_SCRAPE_CRAWL_POLICY.pageRetryCount,
      navigationTimeoutSecs: Math.ceil(
        DEEP_SCRAPE_CRAWL_POLICY.perPageTimeoutMs / 1000,
      ),
      requestHandlerTimeoutSecs: Math.ceil(
        DEEP_SCRAPE_CRAWL_POLICY.perPageTimeoutMs / 1000,
      ) + 10,
      maxRequestsPerCrawl:
        ctx.maxRequestsPerCrawlOverride ??
        DEEP_SCRAPE_CRAWL_POLICY.maxFetchAttempts,
      useSessionPool: false,
      additionalMimeTypes: ["application/xhtml+xml"],
      preNavigationHooks: [
        async ({ request }, gotOptions) => {
          const url = request.url;
          if (!isSameRegistrableDomain(url, ctx.registrableDomain)) {
            throw new Error("CROSS_DOMAIN_REJECTED");
          }
          const hostname = new URL(url).hostname;
          await assertPublicHostname(hostname, {
            jobId: ctx.jobId,
            organizationId: ctx.organizationId,
            sourceType: ctx.sourceType,
            fetchPurpose: "page",
          });
          ctx.fetchLifecycle?.markNetworkStarted(url);
          gotOptions.followRedirect = false;
          gotOptions.timeout = {
            request: DEEP_SCRAPE_CRAWL_POLICY.perPageTimeoutMs,
          };
          gotOptions.headers = {
            ...(gotOptions.headers ?? {}),
            "user-agent": DEEP_SCRAPE_CRAWL_POLICY.userAgent,
            accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          };
        },
      ],
      async requestHandler({ request, body, contentType, response, crawler }) {
        processed += 1;
        const registryEntry = ctx.candidateRegistry.getEntry(request.url);
        const pageType =
          typeof request.userData?.pageType === "string"
            ? request.userData.pageType
            : registryEntry?.pageType ?? scoreUrl(request.url).pageType;
        const provenance =
          typeof request.userData?.provenance === "string"
            ? request.userData.provenance
            : registryEntry?.provenance ?? "unknown";
        const totalScore =
          typeof request.userData?.totalScore === "number"
            ? request.userData.totalScore
            : registryEntry?.totalScore ?? scoreUrl(request.url).score;

        ctx.fetchLifecycle?.markHandlerEntered(request.url, {
          score: totalScore,
          provenance: String(provenance),
        });

        if (ctx.acceptedPages.length >= ctx.maxAccepted) {
          recordRejection(ctx, "PAGE_CAP_LOWER_PRIORITY");
          ctx.candidateRegistry.recordPageCapSkip();
          ctx.fetchLifecycle?.markRejected(
            request.url,
            "PAGE_CAP_LOWER_PRIORITY",
          );
          logDeepScrapeEvent("deep_scrape_page_cap_candidate_skipped", {
            organizationId: ctx.organizationId,
            jobId: ctx.jobId,
            sourceType: ctx.sourceType,
            domain: ctx.registrableDomain,
            failureCode: "PAGE_CAP_LOWER_PRIORITY",
            diagnostic: {
              path: safePath(request.url),
              candidateUrl: request.url,
              candidateScore: totalScore,
              candidateProvenance: provenance,
              acceptedPageCount: ctx.acceptedPages.length,
              maxMeaningfulPages: ctx.maxAccepted,
              reason: "acceptance_cap",
            },
          });
          try {
            await crawler.autoscaledPool?.abort();
          } catch {
            // ignore abort races
          }
          await ctx.onPageProcessed?.();
          return;
        }
        let statusCode = response?.statusCode ?? 0;
        let ctype =
          typeof contentType === "string"
            ? contentType
            : contentType?.type
              ? `${contentType.type}${contentType.encoding ? `; charset=${contentType.encoding}` : ""}`
              : response?.headers["content-type"] ?? "";
        let responseBody: Buffer | string | unknown = body;
        let finalUrl = request.loadedUrl ?? request.url;
        let redirectCount = 0;

        ctx.fetchLifecycle?.markResponseReceived(request.url, statusCode);

        // Manual redirect handling: follow safe same-origin Locations as the
        // same ranked candidate (do not enqueue a second plan slot / terminalize REDIRECT).
        if ([301, 302, 303, 307, 308].includes(statusCode)) {
          const location = response?.headers?.location;
          if (typeof location !== "string" || !location) {
            recordRejection(ctx, "REDIRECT_MISSING_LOCATION");
            ctx.fetchLifecycle?.markRejected(
              request.url,
              "REDIRECT_MISSING_LOCATION",
              { statusCode },
            );
            logDeepScrapeEvent("page_rejected", {
              organizationId: ctx.organizationId,
              jobId: ctx.jobId,
              sourceType: ctx.sourceType,
              domain: ctx.registrableDomain,
              failureCode: "REDIRECT_MISSING_LOCATION",
              diagnostic: {
                path: safePath(request.url),
                status: statusCode,
              },
            });
            await ctx.onPageProcessed?.();
            return;
          }

          logDeepScrapeEvent("deep_scrape_redirect_continuation_started", {
            organizationId: ctx.organizationId,
            jobId: ctx.jobId,
            sourceType: ctx.sourceType,
            domain: ctx.registrableDomain,
            diagnostic: {
              path: safePath(request.url),
              location,
              status: statusCode,
              maxRedirectDepth: DEEP_SCRAPE_CRAWL_POLICY.maxRedirectDepth,
            },
          });

          const continued = await continueSameOriginRedirectChain({
            startUrl: request.url,
            firstLocation: location,
            registrableDomain: ctx.registrableDomain,
            safetyContext: {
              jobId: ctx.jobId,
              organizationId: ctx.organizationId,
              sourceType: ctx.sourceType,
              fetchPurpose: "page",
              redirectDepth: 1,
            },
            robotsRules: ctx.robots,
            maxRedirects: DEEP_SCRAPE_CRAWL_POLICY.maxRedirectDepth,
            timeoutMs: DEEP_SCRAPE_CRAWL_POLICY.perPageTimeoutMs,
          });

          if (!continued.ok) {
            recordRejection(ctx, continued.errorCode);
            ctx.fetchLifecycle?.markRejected(request.url, continued.errorCode, {
              statusCode: continued.statusCode ?? statusCode,
            });
            logDeepScrapeEvent("page_rejected", {
              organizationId: ctx.organizationId,
              jobId: ctx.jobId,
              sourceType: ctx.sourceType,
              domain: ctx.registrableDomain,
              failureCode: continued.errorCode,
              diagnostic: {
                path: safePath(request.url),
                finalUrl: continued.finalUrl,
                status: continued.statusCode ?? statusCode,
                redirectCount: continued.redirectCount,
              },
            });
            await ctx.onPageProcessed?.();
            return;
          }

          statusCode = continued.statusCode;
          ctype = continued.contentType ?? "";
          responseBody = Buffer.from(continued.bodyText, "utf8");
          finalUrl = continued.finalUrl;
          redirectCount = continued.redirectCount;
          ctx.fetchLifecycle?.markResponseReceived(request.url, statusCode);

          logDeepScrapeEvent("deep_scrape_redirect_continuation_completed", {
            organizationId: ctx.organizationId,
            jobId: ctx.jobId,
            sourceType: ctx.sourceType,
            domain: ctx.registrableDomain,
            diagnostic: {
              path: safePath(request.url),
              finalUrl,
              status: statusCode,
              redirectCount,
            },
          });
        }

        if (statusCode < 200 || statusCode >= 400) {
          recordRejection(ctx, `HTTP_${statusCode || "0"}`);
          ctx.fetchLifecycle?.markRejected(
            request.url,
            `HTTP_${statusCode || "0"}`,
            { statusCode },
          );
          logDeepScrapeEvent("page_rejected", {
            organizationId: ctx.organizationId,
            jobId: ctx.jobId,
            sourceType: ctx.sourceType,
            domain: ctx.registrableDomain,
            failureCode: `HTTP_${statusCode || "0"}`,
            diagnostic: {
              path: safePath(request.url),
              extractionMethod: "cheerio_readability",
              browserFallbackUsed: false,
              status: statusCode,
              contentType: ctype,
            },
          });
          await ctx.onPageProcessed?.();
          return;
        }

        if (!/html/i.test(ctype)) {
          recordRejection(ctx, "UNSUPPORTED_CONTENT_TYPE");
          ctx.fetchLifecycle?.markRejected(
            request.url,
            "UNSUPPORTED_CONTENT_TYPE",
            { statusCode },
          );
          logDeepScrapeEvent("page_rejected", {
            organizationId: ctx.organizationId,
            jobId: ctx.jobId,
            sourceType: ctx.sourceType,
            domain: ctx.registrableDomain,
            failureCode: "UNSUPPORTED_CONTENT_TYPE",
            diagnostic: {
              path: safePath(request.url),
              status: statusCode,
              contentType: ctype,
            },
          });
          await ctx.onPageProcessed?.();
          return;
        }

        const htmlBuffer = Buffer.isBuffer(responseBody)
          ? responseBody
          : Buffer.from(String(responseBody ?? ""), "utf8");
        if (htmlBuffer.byteLength > DEEP_SCRAPE_CRAWL_POLICY.maxResponseBytes) {
          recordRejection(ctx, "RESPONSE_TOO_LARGE");
          ctx.fetchLifecycle?.markRejected(request.url, "RESPONSE_TOO_LARGE", {
            statusCode,
          });
          logDeepScrapeEvent("page_rejected", {
            organizationId: ctx.organizationId,
            jobId: ctx.jobId,
            sourceType: ctx.sourceType,
            domain: ctx.registrableDomain,
            failureCode: "RESPONSE_TOO_LARGE",
            diagnostic: {
              path: safePath(request.url),
              status: statusCode,
              responseBytes: htmlBuffer.byteLength,
            },
          });
          await ctx.onPageProcessed?.();
          return;
        }

        const html = htmlBuffer.toString("utf8");
        const extracted = extractWithReadability({
          html,
          url: finalUrl,
          registrableDomain: ctx.registrableDomain,
        });
        ctx.fetchLifecycle?.markCheerioExtracted(request.url);

        logDeepScrapeEvent("extraction_method_selected", {
          organizationId: ctx.organizationId,
          jobId: ctx.jobId,
          sourceType: ctx.sourceType,
          domain: ctx.registrableDomain,
          diagnostic: {
            path: safePath(request.url),
            extractionMethod: extracted.extractionMethodSelected,
            browserFallbackUsed: false,
            responseBytes: htmlBuffer.byteLength,
            preBoilerplateChars: extracted.preBoilerplateChars,
            titleLength: extracted.title?.length ?? 0,
          },
        });

        logDeepScrapeEvent("readability_extraction_completed", {
          organizationId: ctx.organizationId,
          jobId: ctx.jobId,
          sourceType: ctx.sourceType,
          domain: ctx.registrableDomain,
          diagnostic: {
            path: safePath(request.url),
            extractionMethod: "cheerio_readability",
            extractedChars: extracted.meaningfulText.length,
            structuredDataTypes: extracted.structuredBusinessData.types,
            selfCanonical: extracted.selfCanonical,
          },
        });

        const canonicalUrl =
          extracted.canonicalUrl ?? canonicalizePageUrl(finalUrl) ?? finalUrl;
        const pageDocument: NormalizedPageDocument = {
          url: request.url,
          canonicalUrl,
          finalUrl,
          title: extracted.title,
          description: extracted.description,
          headings: extracted.headings,
          readableText: extracted.readableText,
          meaningfulText: extracted.meaningfulText,
          htmlLanguage: extracted.htmlLanguage,
          pageType,
          statusCode,
          contentType: ctype,
          extractionMethod: "cheerio_readability",
          renderedWithBrowser: false,
          discoveredLinks: extracted.discoveredLinks,
          structuredBusinessData: extracted.structuredBusinessData,
          contentHash: extracted.contentHash,
          fetchedAt: new Date().toISOString(),
          responseBytes: htmlBuffer.byteLength,
          redirectCount,
          selfCanonical: extracted.selfCanonical,
          extractionMethodSelected: extracted.extractionMethodSelected,
          preBoilerplateChars: extracted.preBoilerplateChars,
          postBoilerplateChars: extracted.preBoilerplateChars,
        };

        const classification = classifyNormalizedPage({
          document: pageDocument,
          htmlForShellCheck: html,
          seenCanonicalUrls: ctx.seenCanonicalUrls,
          seenFinalUrls: ctx.seenFinalUrls,
          seenContentHashes: ctx.seenContentHashes,
          seenFingerprints: ctx.seenFingerprints,
        });

        logDeepScrapeEvent("cheerio_page_processed", {
          organizationId: ctx.organizationId,
          jobId: ctx.jobId,
          sourceType: ctx.sourceType,
          domain: ctx.registrableDomain,
          pageType,
          diagnostic: {
            path: safePath(request.url),
            extractionMethod: "cheerio_readability",
            browserFallbackUsed: false,
            status: statusCode,
            contentType: ctype,
            responseBytes: htmlBuffer.byteLength,
            extractedChars: classification.extractedCharacterCount,
            preBoilerplateChars: classification.preBoilerplateChars,
            postBoilerplateChars: classification.postBoilerplateChars,
            structuredDataTypes: classification.structuredDataTypes,
            rejectionCode: classification.rejectionCode,
            duplicateBasis: classification.duplicateBasis,
            duplicateOfPath: classification.duplicateOfPath,
          },
        });

        // Inventory navigation/content links even when the page is not accepted
        // (homepage structural discovery must not depend on acceptance).
        inventoryDiscoveries(
          ctx,
          extracted.discoveredLinkRecords ?? [],
          safePath(request.url),
        );

        if (
          classification.needsPlaywrightFallback &&
          ctx.acceptedPages.length < ctx.maxAccepted
        ) {
          // Keep lifecycle key aligned with the Cheerio request URL.
          const fallbackUrl =
            canonicalizePageUrl(request.url) ?? request.url;
          const pendingReason =
            classification.rejectionCode ?? "PAGE_NO_USABLE_TEXT";
          if (!ctx.playwrightFallbackUrls.includes(fallbackUrl)) {
            ctx.playwrightFallbackUrls.push(fallbackUrl);
            // Preserve priority metadata for Playwright fallback.
            ctx.candidateRegistry.observe({
              url: fallbackUrl,
              rootUrl: ctx.rootUrl,
              provenance: provenance as DiscoveryProvenance,
            });
            if (
              classification.rejectionCode ===
              "CHEERIO_SUSPECTED_TEMPLATE_EXTRACTION"
            ) {
              logDeepScrapeEvent("cheerio_extraction_suspect", {
                organizationId: ctx.organizationId,
                jobId: ctx.jobId,
                sourceType: ctx.sourceType,
                domain: ctx.registrableDomain,
                diagnostic: {
                  path: safePath(fallbackUrl),
                  duplicateBasis: classification.duplicateBasis,
                  duplicateOfPath: classification.duplicateOfPath,
                  extractedChars: classification.extractedCharacterCount,
                },
              });
            }
            logDeepScrapeEvent("playwright_fallback_started", {
              organizationId: ctx.organizationId,
              jobId: ctx.jobId,
              sourceType: ctx.sourceType,
              domain: ctx.registrableDomain,
              diagnostic: {
                path: safePath(fallbackUrl),
                extractionMethod: "cheerio_readability",
                browserFallbackUsed: true,
                rejectionCode: classification.rejectionCode,
                provenance,
                totalScore,
              },
            });
          }
          // Non-terminal until Playwright runs or is explicitly skipped.
          ctx.fetchLifecycle?.markPlaywrightPending(fallbackUrl, pendingReason);
          await ctx.onPageProcessed?.();
          return;
        }

        if (!classification.accepted) {
          const rejectCode =
            classification.rejectionCode ?? "PAGE_NO_USABLE_TEXT";
          recordRejection(ctx, rejectCode);
          ctx.fetchLifecycle?.markRejected(request.url, rejectCode, {
            statusCode,
          });
          logDeepScrapeEvent("page_rejected", {
            organizationId: ctx.organizationId,
            jobId: ctx.jobId,
            sourceType: ctx.sourceType,
            domain: ctx.registrableDomain,
            failureCode: classification.rejectionCode,
            pageType,
            diagnostic: {
              path: safePath(request.url),
              extractionMethod: "cheerio_readability",
              extractedChars: classification.extractedCharacterCount,
              structuredDataTypes: classification.structuredDataTypes,
              rejectionCode: classification.rejectionCode,
              duplicateBasis: classification.duplicateBasis,
              duplicateOfPath: classification.duplicateOfPath,
            },
          });
          if (classification.rejectionCode === "PAGE_DUPLICATE") {
            logDeepScrapeEvent("duplicate_detected", {
              organizationId: ctx.organizationId,
              jobId: ctx.jobId,
              sourceType: ctx.sourceType,
              domain: ctx.registrableDomain,
              diagnostic: {
                path: safePath(request.url),
                duplicateBasis: classification.duplicateBasis,
                duplicateOfPath: classification.duplicateOfPath,
                browserFallbackUsed: false,
              },
            });
          }
          await ctx.onPageProcessed?.();
          return;
        }

        if (ctx.acceptedPages.length >= ctx.maxAccepted) {
          recordRejection(ctx, "PAGE_CAP_LOWER_PRIORITY");
          ctx.candidateRegistry.recordPageCapSkip();
          ctx.fetchLifecycle?.markRejected(
            request.url,
            "PAGE_CAP_LOWER_PRIORITY",
            { statusCode },
          );
          logDeepScrapeEvent("deep_scrape_page_cap_candidate_skipped", {
            organizationId: ctx.organizationId,
            jobId: ctx.jobId,
            sourceType: ctx.sourceType,
            domain: ctx.registrableDomain,
            failureCode: "PAGE_CAP_LOWER_PRIORITY",
            diagnostic: {
              path: safePath(request.url),
              candidateUrl: request.url,
              candidateScore: totalScore,
              candidateProvenance: provenance,
              acceptedPageCount: ctx.acceptedPages.length,
              maxMeaningfulPages: ctx.maxAccepted,
              reason: "acceptance_cap_after_extract",
            },
          });
          await ctx.onPageProcessed?.();
          return;
        }

        ctx.seenFinalUrls.set(finalUrl, finalUrl);
        if (pageDocument.selfCanonical) {
          ctx.seenCanonicalUrls.set(canonicalUrl, finalUrl);
        }
        ctx.seenContentHashes.set(pageDocument.contentHash, finalUrl);
        if (classification.duplicateFingerprint) {
          ctx.seenFingerprints.add(classification.duplicateFingerprint);
        }
        ctx.acceptedPages.push(pageDocument);
        ctx.acceptedByProvenance[String(provenance)] =
          (ctx.acceptedByProvenance[String(provenance)] ?? 0) + 1;
        ctx.fetchLifecycle?.markAccepted(request.url);

        logDeepScrapeEvent("page_accepted", {
          organizationId: ctx.organizationId,
          jobId: ctx.jobId,
          sourceType: ctx.sourceType,
          domain: ctx.registrableDomain,
          pageType,
          pagesCrawled: ctx.acceptedPages.length,
          diagnostic: {
            path: safePath(request.url),
            extractionMethod: "cheerio_readability",
            browserFallbackUsed: false,
            extractedChars: classification.extractedCharacterCount,
            structuredDataTypes: classification.structuredDataTypes,
            provenance,
            totalScore,
          },
        });

        // Ranked-plan mode inventories links above; live enqueue is opt-in only.
        // Same-origin redirects continue in-handler (no second plan slot).
        if (
          ctx.allowLiveLinkEnqueue &&
          ctx.acceptedPages.length < ctx.maxAccepted
        ) {
          const navLinks = extracted.discoveredLinkRecords ?? [];
          const ordered = [...navLinks].sort((left, right) => {
            const leftScore = scoreDeepScrapeCandidate({
              url: left.url,
              rootUrl: ctx.rootUrl,
              provenance: left.provenance,
              anchorText: left.anchorText,
            }).totalScore;
            const rightScore = scoreDeepScrapeCandidate({
              url: right.url,
              rootUrl: ctx.rootUrl,
              provenance: right.provenance,
              anchorText: right.anchorText,
            }).totalScore;
            return rightScore - leftScore || left.url.localeCompare(right.url);
          });
          for (const link of ordered) {
            await maybeEnqueue(ctx, link.url, {
              label: "link",
              provenance: link.provenance,
              anchorText: link.anchorText,
            });
          }
        }

        await ctx.onPageProcessed?.();
      },
      async failedRequestHandler({ request }, error) {
        processed += 1;
        const code =
          error instanceof Error
            ? error.message
                .replace(/\s+/g, "_")
                .replace(/[^A-Z0-9_]/gi, "")
                .slice(0, 80)
                .toUpperCase() || "FETCH_FAILED"
            : "FETCH_FAILED";
        ctx.fetchLifecycle?.markHandlerEntered(request.url);
        recordRejection(ctx, code);
        ctx.fetchLifecycle?.markRequestFailed(request.url, code);
        logDeepScrapeEvent("page_rejected", {
          organizationId: ctx.organizationId,
          jobId: ctx.jobId,
          sourceType: ctx.sourceType,
          domain: ctx.registrableDomain,
          failureCode: code,
          diagnostic: {
            path: safePath(request.url),
            extractionMethod: "cheerio_readability",
            browserFallbackUsed: false,
          },
        });
        await ctx.onPageProcessed?.();
      },
    },
    ctx.config,
  );

  await crawler.run();
  return { processed };
}

export { maybeEnqueue as enqueueCheerioUrl };
