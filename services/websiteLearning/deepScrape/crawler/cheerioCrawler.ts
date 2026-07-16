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
import { classifyNormalizedPage } from "@/services/websiteLearning/deepScrape/crawler/pageClassifier";
import { extractWithReadability } from "@/services/websiteLearning/deepScrape/crawler/readabilityExtractor";
import type { NormalizedPageDocument } from "@/services/websiteLearning/deepScrape/crawler/crawlerTypes";
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
  maxAccepted: number;
  maxQueueSize: number;
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

async function maybeEnqueue(
  ctx: CheerioPhaseContext,
  url: string,
  label?: string,
): Promise<void> {
  const canonical = canonicalizePageUrl(url);
  if (!canonical) return;
  if (ctx.enqueuedUrls.size >= ctx.maxQueueSize) return;
  if (ctx.enqueuedUrls.has(canonical)) return;
  if (!isSameRegistrableDomain(canonical, ctx.registrableDomain)) return;
  if (isExcludedUrl(canonical) && scoreUrl(canonical).pageType !== "homepage") {
    return;
  }
  try {
    const path = new URL(canonical).pathname || "/";
    if (!isPathAllowedByRobots(path, ctx.robots)) return;
  } catch {
    return;
  }

  ctx.enqueuedUrls.add(canonical);
  await ctx.requestQueue.addRequest({
    url: canonical,
    uniqueKey: canonical,
    userData: {
      pageType: scoreUrl(canonical).pageType,
      label: label ?? "cheerio",
    },
  });
  logDeepScrapeEvent("crawlee_request_enqueued", {
    organizationId: ctx.organizationId,
    jobId: ctx.jobId,
    sourceType: ctx.sourceType,
    domain: ctx.registrableDomain,
    diagnostic: {
      path: safePath(canonical),
      extractionMethod: "cheerio_readability",
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
      maxRequestsPerCrawl: ctx.maxQueueSize,
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
      async requestHandler({ request, body, contentType, response }) {
        processed += 1;
        const pageType =
          typeof request.userData?.pageType === "string"
            ? request.userData.pageType
            : scoreUrl(request.url).pageType;
        const statusCode = response?.statusCode ?? 0;
        const ctype =
          typeof contentType === "string"
            ? contentType
            : contentType?.type
              ? `${contentType.type}${contentType.encoding ? `; charset=${contentType.encoding}` : ""}`
              : response?.headers["content-type"] ?? "";

        // Manual redirect handling with SSRF re-check via enqueue.
        if ([301, 302, 303, 307, 308].includes(statusCode)) {
          const location = response?.headers?.location;
          if (typeof location === "string" && location) {
            const nextUrl = new URL(location, request.url).toString();
            await maybeEnqueue(ctx, nextUrl, "redirect");
          } else {
            recordRejection(ctx, "REDIRECT_MISSING_LOCATION");
          }
          await ctx.onPageProcessed?.();
          return;
        }

        if (statusCode < 200 || statusCode >= 400) {
          recordRejection(ctx, `HTTP_${statusCode || "0"}`);
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
          await ctx.onPageProcessed?.();
          return;
        }

        const htmlBuffer = Buffer.isBuffer(body)
          ? body
          : Buffer.from(String(body ?? ""), "utf8");
        if (htmlBuffer.byteLength > DEEP_SCRAPE_CRAWL_POLICY.maxResponseBytes) {
          recordRejection(ctx, "RESPONSE_TOO_LARGE");
          await ctx.onPageProcessed?.();
          return;
        }

        const html = htmlBuffer.toString("utf8");
        const finalUrl = request.loadedUrl ?? request.url;
        const extracted = extractWithReadability({
          html,
          url: finalUrl,
          registrableDomain: ctx.registrableDomain,
        });

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

        if (
          classification.needsPlaywrightFallback &&
          ctx.acceptedPages.length < ctx.maxAccepted
        ) {
          const fallbackUrl = finalUrl;
          if (!ctx.playwrightFallbackUrls.includes(fallbackUrl)) {
            ctx.playwrightFallbackUrls.push(fallbackUrl);
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
              },
            });
          }
          await ctx.onPageProcessed?.();
          return;
        }

        if (!classification.accepted) {
          recordRejection(
            ctx,
            classification.rejectionCode ?? "PAGE_NO_USABLE_TEXT",
          );
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
          },
        });

        // Discover same-domain links while under caps.
        if (ctx.acceptedPages.length < ctx.maxAccepted) {
          for (const link of extracted.discoveredLinks) {
            await maybeEnqueue(ctx, link, "link");
          }
        }

        await ctx.onPageProcessed?.();
      },
      async failedRequestHandler({ request }, error) {
        const code =
          error instanceof Error
            ? error.message
                .replace(/\s+/g, "_")
                .replace(/[^A-Z0-9_]/gi, "")
                .slice(0, 80)
                .toUpperCase() || "FETCH_FAILED"
            : "FETCH_FAILED";
        recordRejection(ctx, code);
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
