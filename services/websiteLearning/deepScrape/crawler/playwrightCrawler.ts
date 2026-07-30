/**
 * PlaywrightCrawler fallback — Chromium only, concurrency 1.
 */

import {
  PlaywrightCrawler,
  type Configuration,
  type RequestQueue,
} from "crawlee";
import { chromium } from "playwright";
import {
  isExcludedUrl,
  scoreUrl,
  DEEP_SCRAPE_CRAWL_POLICY,
} from "@/services/websiteLearning/deepScrape/crawlPolicy";
import {
  installPlaywrightSecurityRoutes,
  isNavigationTargetAllowed,
} from "@/services/websiteLearning/deepScrape/crawler/browserGuard";
import { assertChromiumAvailable } from "@/services/websiteLearning/deepScrape/crawler/chromiumCheck";
import type { DeepScrapeFetchLifecycle } from "@/services/websiteLearning/deepScrape/crawler/fetchLifecycle";
import { classifyNormalizedPage } from "@/services/websiteLearning/deepScrape/crawler/pageClassifier";
import { extractWithReadability } from "@/services/websiteLearning/deepScrape/crawler/readabilityExtractor";
import type { NormalizedPageDocument } from "@/services/websiteLearning/deepScrape/crawler/crawlerTypes";
import { logDeepScrapeEvent } from "@/services/websiteLearning/deepScrape/observability";
import { canonicalizePageUrl } from "@/services/websiteLearning/deepScrape/urlSafety";

export type PlaywrightPhaseContext = {
  organizationId: string;
  jobId: string;
  sourceType: "brain" | "prospect" | "persona";
  registrableDomain: string;
  config: Configuration;
  requestQueue: RequestQueue;
  acceptedPages: NormalizedPageDocument[];
  seenCanonicalUrls: Map<string, string>;
  seenFinalUrls: Map<string, string>;
  seenContentHashes: Map<string, string>;
  seenFingerprints: Set<string>;
  rejectedByReason: Record<string, number>;
  maxAccepted: number;
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

function recordRejection(ctx: PlaywrightPhaseContext, code: string): void {
  ctx.rejectedByReason[code] = (ctx.rejectedByReason[code] ?? 0) + 1;
}

export async function runPlaywrightCrawlPhase(
  ctx: PlaywrightPhaseContext,
): Promise<{ processed: number; browserClosed: boolean }> {
  const executablePath = await assertChromiumAvailable();
  let processed = 0;
  let browserClosed = false;

  const crawler = new PlaywrightCrawler(
    {
      requestQueue: ctx.requestQueue,
      maxConcurrency: 1,
      maxRequestRetries: DEEP_SCRAPE_CRAWL_POLICY.pageRetryCount,
      navigationTimeoutSecs: Math.ceil(
        DEEP_SCRAPE_CRAWL_POLICY.perPageTimeoutMs / 1000,
      ),
      requestHandlerTimeoutSecs:
        Math.ceil(DEEP_SCRAPE_CRAWL_POLICY.perPageTimeoutMs / 1000) + 20,
      maxRequestsPerCrawl: DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages,
      useSessionPool: false,
      launchContext: {
        launcher: chromium,
        launchOptions: {
          headless: true,
          executablePath,
          args: ["--disable-dev-shm-usage", "--no-sandbox"],
        },
      },
      browserPoolOptions: {
        closeInactiveBrowserAfterSecs: 5,
        maxOpenPagesPerBrowser: 1,
      },
      preNavigationHooks: [
        async ({ page, request }) => {
          const allowed = await isNavigationTargetAllowed(
            request.url,
            ctx.registrableDomain,
          );
          if (!allowed.allowed) {
            throw new Error(allowed.reason ?? "PRIVATE_IP_REJECTED");
          }
          await installPlaywrightSecurityRoutes(page, ctx.registrableDomain);
          page.setDefaultNavigationTimeout(
            DEEP_SCRAPE_CRAWL_POLICY.perPageTimeoutMs,
          );
          page.setDefaultTimeout(DEEP_SCRAPE_CRAWL_POLICY.perPageTimeoutMs);
        },
      ],
      async requestHandler({ page, request, response }) {
        processed += 1;
        ctx.fetchLifecycle?.markPlaywrightStarted(request.url);

        const pageType =
          typeof request.userData?.pageType === "string"
            ? request.userData.pageType
            : scoreUrl(request.url).pageType;
        const provenance =
          typeof request.userData?.provenance === "string"
            ? request.userData.provenance
            : "unknown";
        const totalScore =
          typeof request.userData?.totalScore === "number"
            ? request.userData.totalScore
            : scoreUrl(request.url).score;

        if (ctx.acceptedPages.length >= ctx.maxAccepted) {
          recordRejection(ctx, "PAGE_CAP_LOWER_PRIORITY");
          ctx.fetchLifecycle?.markRejected(
            request.url,
            "PAGE_CAP_LOWER_PRIORITY",
            { browserFallbackUsed: true },
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
              reason: "acceptance_cap_playwright",
              browserFallbackUsed: true,
            },
          });
          await ctx.onPageProcessed?.();
          return;
        }

        // Bounded wait for meaningful DOM text after DOMContentLoaded.
        try {
          await page.waitForLoadState("domcontentloaded", {
            timeout: DEEP_SCRAPE_CRAWL_POLICY.perPageTimeoutMs,
          });
          await page
            .waitForFunction(
              () => {
                const text = (document.body?.innerText ?? "").trim();
                return text.length >= 40;
              },
              { timeout: 2_500 },
            )
            .catch(() => undefined);
        } catch {
          // Continue with whatever DOM is available.
        }

        const finalUrl = page.url();
        const statusCode = response?.status() ?? 0;
        const contentType = response?.headers()["content-type"] ?? "text/html";
        const html = await page.content();
        const responseBytes = Buffer.byteLength(html, "utf8");

        ctx.fetchLifecycle?.markResponseReceived(
          request.url,
          statusCode,
        );

        if (responseBytes > DEEP_SCRAPE_CRAWL_POLICY.maxResponseBytes) {
          recordRejection(ctx, "RESPONSE_TOO_LARGE");
          ctx.fetchLifecycle?.markRejected(request.url, "RESPONSE_TOO_LARGE", {
            statusCode,
            browserFallbackUsed: true,
          });
          logDeepScrapeEvent("page_rejected", {
            organizationId: ctx.organizationId,
            jobId: ctx.jobId,
            sourceType: ctx.sourceType,
            domain: ctx.registrableDomain,
            failureCode: "RESPONSE_TOO_LARGE",
            diagnostic: {
              path: safePath(finalUrl),
              browserFallbackUsed: true,
              responseBytes,
            },
          });
          await ctx.onPageProcessed?.();
          return;
        }

        const extracted = extractWithReadability({
          html,
          url: finalUrl,
          registrableDomain: ctx.registrableDomain,
        });

        logDeepScrapeEvent("readability_extraction_completed", {
          organizationId: ctx.organizationId,
          jobId: ctx.jobId,
          sourceType: ctx.sourceType,
          domain: ctx.registrableDomain,
          diagnostic: {
            path: safePath(finalUrl),
            extractionMethod: "playwright_readability",
            browserFallbackUsed: true,
            extractedChars: extracted.meaningfulText.length,
            structuredDataTypes: extracted.structuredBusinessData.types,
          },
        });

        const canonicalUrl =
          extracted.canonicalUrl ??
          canonicalizePageUrl(finalUrl) ??
          finalUrl;

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
          contentType,
          extractionMethod: "playwright_readability",
          renderedWithBrowser: true,
          discoveredLinks: extracted.discoveredLinks.filter(
            (link) => !isExcludedUrl(link) || scoreUrl(link).pageType === "homepage",
          ),
          structuredBusinessData: extracted.structuredBusinessData,
          contentHash: extracted.contentHash,
          fetchedAt: new Date().toISOString(),
          responseBytes,
          redirectCount: 0,
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
          alreadyRenderedWithBrowser: true,
        });

        logDeepScrapeEvent("playwright_page_processed", {
          organizationId: ctx.organizationId,
          jobId: ctx.jobId,
          sourceType: ctx.sourceType,
          domain: ctx.registrableDomain,
          pageType,
          diagnostic: {
            path: safePath(finalUrl),
            extractionMethod: "playwright_readability",
            browserFallbackUsed: true,
            status: statusCode,
            contentType,
            responseBytes,
            extractedChars: classification.extractedCharacterCount,
            structuredDataTypes: classification.structuredDataTypes,
            rejectionCode: classification.rejectionCode,
            duplicateBasis: classification.duplicateBasis,
          },
        });

        if (!classification.accepted) {
          const rejectCode =
            classification.rejectionCode ?? "PAGE_NO_USABLE_TEXT";
          recordRejection(ctx, rejectCode);
          ctx.fetchLifecycle?.markRejected(request.url, rejectCode, {
            statusCode,
            browserFallbackUsed: true,
          });
          logDeepScrapeEvent("page_rejected", {
            organizationId: ctx.organizationId,
            jobId: ctx.jobId,
            sourceType: ctx.sourceType,
            domain: ctx.registrableDomain,
            failureCode: classification.rejectionCode,
            pageType,
            diagnostic: {
              path: safePath(finalUrl),
              extractionMethod: "playwright_readability",
              browserFallbackUsed: true,
              rejectionCode: classification.rejectionCode,
              duplicateBasis: classification.duplicateBasis,
              duplicateOfPath: classification.duplicateOfPath,
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
        ctx.fetchLifecycle?.markAccepted(request.url, {
          browserFallbackUsed: true,
        });

        logDeepScrapeEvent("playwright_extraction_recovered", {
          organizationId: ctx.organizationId,
          jobId: ctx.jobId,
          sourceType: ctx.sourceType,
          domain: ctx.registrableDomain,
          pageType,
          diagnostic: {
            path: safePath(finalUrl),
            extractionMethod: "playwright_readability",
            browserFallbackUsed: true,
            extractedChars: classification.extractedCharacterCount,
          },
        });

        logDeepScrapeEvent("page_accepted", {
          organizationId: ctx.organizationId,
          jobId: ctx.jobId,
          sourceType: ctx.sourceType,
          domain: ctx.registrableDomain,
          pageType,
          pagesCrawled: ctx.acceptedPages.length,
          diagnostic: {
            path: safePath(finalUrl),
            extractionMethod: "playwright_readability",
            browserFallbackUsed: true,
            extractedChars: classification.extractedCharacterCount,
            structuredDataTypes: classification.structuredDataTypes,
            provenance,
            totalScore,
          },
        });

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
                .toUpperCase() || "PLAYWRIGHT_FAILED"
            : "PLAYWRIGHT_FAILED";
        ctx.fetchLifecycle?.markPlaywrightStarted(request.url);
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
            extractionMethod: "playwright_readability",
            browserFallbackUsed: true,
          },
        });
        await ctx.onPageProcessed?.();
      },
    },
    ctx.config,
  );

  try {
    await crawler.run();
  } finally {
    try {
      await crawler.teardown();
      browserClosed = true;
    } catch {
      browserClosed = false;
    }
  }

  return { processed, browserClosed };
}
