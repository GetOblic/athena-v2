/**
 * Same-origin redirect continuation for the shared Cheerio deep-scrape path.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEEP_SCRAPE_CRAWL_POLICY } from "../../services/websiteLearning/deepScrape/crawlPolicy";
import { DeepScrapeFetchLifecycle } from "../../services/websiteLearning/deepScrape/crawler/fetchLifecycle";
import { classifyNormalizedPage } from "../../services/websiteLearning/deepScrape/crawler/pageClassifier";
import { extractWithReadability } from "../../services/websiteLearning/deepScrape/crawler/readabilityExtractor";
import {
  continueSameOriginRedirectChain,
  redirectHopKey,
} from "../../services/websiteLearning/deepScrape/crawler/redirectContinuation";
import { canonicalizePageUrl } from "../../services/websiteLearning/deepScrape/urlSafety";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "../..");

const ALLOW_ALL_ROBOTS = {
  fetched: true,
  disallow: [] as string[],
  allow: [] as string[],
};

const SERVICE_HTML = `<!doctype html><html><head><title>Products</title>
<meta name="description" content="Medical spa products and skincare."/>
</head><body><main><h1>Products</h1>
<p>Browse our professional skincare and laser treatment products for clients seeking long-term skin health.</p>
<p>We offer consultations, aftercare guidance, and clinician-selected product lines with transparent pricing.</p>
</main></body></html>`;

function htmlResponse(status: number, body: string, headers?: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...headers,
    },
  });
}

function redirectResponse(location: string, status = 301): Response {
  return new Response(null, {
    status,
    headers: { location },
  });
}

describe("Deep scrape same-origin redirect continuation", () => {
  it("hop limit remains maxRedirectDepth=3", () => {
    assert.equal(DEEP_SCRAPE_CRAWL_POLICY.maxRedirectDepth, 3);
  });

  it("Cheerio path continues same-origin redirects instead of markRedirected+enqueue", () => {
    const cheerio = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/cheerioCrawler.ts",
      ),
      "utf8",
    );
    assert.match(cheerio, /gotOptions\.followRedirect\s*=\s*false/);
    assert.match(cheerio, /continueSameOriginRedirectChain/);
    assert.match(cheerio, /deep_scrape_redirect_continuation_started/);
    assert.doesNotMatch(
      cheerio,
      /markRedirected\(request\.url,\s*"REDIRECT"\)/,
    );
    assert.doesNotMatch(
      cheerio,
      /provenance:\s*"redirect_target"/,
    );
  });

  it("1) /products → 301 → /products/ → 200 extracted and eligible for acceptance", async () => {
    const startUrl = "https://example.test/products";
    const slashUrl = "https://example.test/products/";
    assert.equal(canonicalizePageUrl(startUrl), canonicalizePageUrl(slashUrl));

    const fetches: string[] = [];
    const result = await continueSameOriginRedirectChain({
      startUrl,
      firstLocation: "/products/",
      registrableDomain: "example.test",
      safetyContext: { fetchPurpose: "page" },
      robotsRules: ALLOW_ALL_ROBOTS,
      deps: {
        assertHostname: async () => [],
        fetchImpl: async (input) => {
          const url = String(input);
          fetches.push(url);
          assert.equal(url, slashUrl);
          return htmlResponse(200, SERVICE_HTML);
        },
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.statusCode, 200);
    assert.equal(result.finalUrl, slashUrl);
    assert.equal(result.redirectCount, 1);
    assert.deepEqual(fetches, [slashUrl]);
    assert.notEqual(redirectHopKey(startUrl), redirectHopKey(slashUrl));

    const extracted = extractWithReadability({
      html: result.bodyText,
      url: result.finalUrl,
      registrableDomain: "example.test",
    });
    assert.ok(extracted.meaningfulText.length > 80);

    const classification = classifyNormalizedPage({
      document: {
        url: startUrl,
        canonicalUrl: canonicalizePageUrl(result.finalUrl) ?? result.finalUrl,
        finalUrl: result.finalUrl,
        title: extracted.title,
        description: extracted.description,
        headings: extracted.headings,
        readableText: extracted.readableText,
        meaningfulText: extracted.meaningfulText,
        htmlLanguage: extracted.htmlLanguage,
        pageType: "services",
        statusCode: 200,
        contentType: "text/html",
        extractionMethod: "cheerio_readability",
        renderedWithBrowser: false,
        discoveredLinks: extracted.discoveredLinks,
        structuredBusinessData: extracted.structuredBusinessData,
        contentHash: extracted.contentHash,
        fetchedAt: new Date().toISOString(),
        responseBytes: result.responseBytes,
        redirectCount: result.redirectCount,
        selfCanonical: extracted.selfCanonical,
        extractionMethodSelected: extracted.extractionMethodSelected,
        preBoilerplateChars: extracted.preBoilerplateChars,
        postBoilerplateChars: extracted.preBoilerplateChars,
      },
      alreadyRenderedWithBrowser: false,
    });
    assert.equal(classification.accepted, true);
    assert.equal(classification.needsPlaywrightFallback, false);
  });

  it("2) multi-hop same-origin redirect within the hop limit", async () => {
    const startUrl = "https://example.test/a";
    const fetches: string[] = [];
    const result = await continueSameOriginRedirectChain({
      startUrl,
      firstLocation: "/b",
      registrableDomain: "example.test",
      safetyContext: { fetchPurpose: "page" },
      robotsRules: ALLOW_ALL_ROBOTS,
      maxRedirects: 3,
      deps: {
        assertHostname: async () => [],
        fetchImpl: async (input) => {
          const url = String(input);
          fetches.push(new URL(url).pathname);
          if (url.endsWith("/b")) return redirectResponse("/c");
          if (url.endsWith("/c")) return redirectResponse("/d/");
          if (url.endsWith("/d/") || url.endsWith("/d")) {
            return htmlResponse(200, SERVICE_HTML);
          }
          throw new Error(`unexpected fetch ${url}`);
        },
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.statusCode, 200);
    assert.equal(result.redirectCount, 3);
    assert.deepEqual(fetches, ["/b", "/c", "/d/"]);
  });

  it("3) redirect loop is rejected", async () => {
    const startUrl = "https://example.test/loop-a";
    const result = await continueSameOriginRedirectChain({
      startUrl,
      firstLocation: "/loop-b",
      registrableDomain: "example.test",
      safetyContext: { fetchPurpose: "page" },
      robotsRules: ALLOW_ALL_ROBOTS,
      deps: {
        assertHostname: async () => [],
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.endsWith("/loop-b")) return redirectResponse("/loop-a");
          if (url.endsWith("/loop-a")) return redirectResponse("/loop-b");
          throw new Error(`unexpected fetch ${url}`);
        },
      },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.errorCode, "REDIRECT_LOOP");
  });

  it("4) cross-origin / unsafe redirect is rejected without fetching", async () => {
    let fetchCount = 0;
    const result = await continueSameOriginRedirectChain({
      startUrl: "https://example.test/products",
      firstLocation: "https://evil.example/phish",
      registrableDomain: "example.test",
      safetyContext: { fetchPurpose: "page" },
      robotsRules: ALLOW_ALL_ROBOTS,
      deps: {
        assertHostname: async () => [],
        fetchImpl: async () => {
          fetchCount += 1;
          return htmlResponse(200, SERVICE_HTML);
        },
      },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.errorCode, "CROSS_DOMAIN_REJECTED");
    assert.equal(fetchCount, 0);
  });

  it("4b) SSRF/hostname safety rejection maps to CROSS_DOMAIN_REJECTED", async () => {
    const result = await continueSameOriginRedirectChain({
      startUrl: "https://example.test/products",
      firstLocation: "/products/",
      registrableDomain: "example.test",
      safetyContext: { fetchPurpose: "page" },
      robotsRules: ALLOW_ALL_ROBOTS,
      deps: {
        assertHostname: async () => {
          throw new Error("PRIVATE_IP_REJECTED");
        },
        fetchImpl: async () => htmlResponse(200, SERVICE_HTML),
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.errorCode, "CROSS_DOMAIN_REJECTED");
  });

  it("5) lifecycle invariants stay balanced after successful continuation", () => {
    const lifecycle = new DeepScrapeFetchLifecycle({
      organizationId: "org",
      jobId: "job",
      sourceType: "prospect",
      domain: "example.test",
    });
    const url = "https://example.test/products";
    lifecycle.setRankedSelected(1);
    lifecycle.markRanked(url, { rank: 0, score: 180, provenance: "sitemap" });
    lifecycle.markQueued(url, { score: 180, provenance: "sitemap" });
    lifecycle.markHandlerEntered(url, { score: 180, provenance: "sitemap" });
    // Initial 301, then continued final 200 — still one handler candidate.
    lifecycle.markResponseReceived(url, 301);
    lifecycle.markResponseReceived(url, 200);
    lifecycle.markCheerioExtracted(url);
    lifecycle.markAccepted(url);

    const summary = lifecycle.summary();
    assert.equal(summary.requestHandlersEntered, 1);
    assert.equal(summary.terminalHandlerCandidates, 1);
    assert.equal(summary.responsesReceived, 1);
    assert.equal(summary.redirectsReceived, 0);
    assert.equal(summary.cheerioExtractedCompleted, 1);
    assert.equal(summary.pagesAccepted, 1);
    assert.equal(summary.fetchesAttempted, 1);
    assert.equal(summary.rankedCandidatesSelected, 1);
    assert.equal(summary.rankedHandlersEntered, 1);
    assert.equal(summary.rankedSkippedBeforeFetch, 0);
    const complete = lifecycle.assertCompleteOrThrow();
    assert.equal(complete.terminalHandlerCandidates, complete.requestHandlersEntered);
    assert.equal(complete.playwrightPending, 0);
  });

  it("failed continuation terminalizes as rejected (not REDIRECT)", () => {
    const lifecycle = new DeepScrapeFetchLifecycle({
      organizationId: "org",
      jobId: "job",
      sourceType: "brain",
      domain: "example.test",
    });
    const url = "https://example.test/products";
    lifecycle.setRankedSelected(1);
    lifecycle.markRanked(url, { rank: 0, score: 100, provenance: "nav" });
    lifecycle.markHandlerEntered(url);
    lifecycle.markResponseReceived(url, 301);
    lifecycle.markRejected(url, "REDIRECT_LOOP", { statusCode: 301 });

    const summary = lifecycle.summary();
    assert.equal(summary.redirectsReceived, 0);
    assert.equal(summary.pagesRejected, 1);
    assert.equal(summary.terminalReasons.REDIRECT_LOOP, 1);
    assert.equal(summary.terminalHandlerCandidates, summary.requestHandlersEntered);
  });

  it("hop-limit breach rejects REDIRECT_DEPTH_EXCEEDED", async () => {
    const result = await continueSameOriginRedirectChain({
      startUrl: "https://example.test/a",
      firstLocation: "/b",
      registrableDomain: "example.test",
      safetyContext: { fetchPurpose: "page" },
      robotsRules: ALLOW_ALL_ROBOTS,
      maxRedirects: 3,
      deps: {
        assertHostname: async () => [],
        fetchImpl: async (input) => {
          const pathName = new URL(String(input)).pathname;
          if (pathName === "/b") return redirectResponse("/c");
          if (pathName === "/c") return redirectResponse("/d");
          if (pathName === "/d") return redirectResponse("/e");
          if (pathName === "/e") return htmlResponse(200, SERVICE_HTML);
          throw new Error(`unexpected ${pathName}`);
        },
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.errorCode, "REDIRECT_DEPTH_EXCEEDED");
  });

  it("canonical trailing-slash /faq → /faq/ is accepted (not a loop)", async () => {
    const startUrl = "https://example.test/faq";
    const slashUrl = "https://example.test/faq/";
    assert.equal(canonicalizePageUrl(startUrl), canonicalizePageUrl(slashUrl));
    assert.notEqual(redirectHopKey(startUrl), redirectHopKey(slashUrl));

    const result = await continueSameOriginRedirectChain({
      startUrl,
      firstLocation: "/faq/",
      registrableDomain: "example.test",
      safetyContext: { fetchPurpose: "page" },
      robotsRules: ALLOW_ALL_ROBOTS,
      deps: {
        assertHostname: async () => [],
        fetchImpl: async (input) => {
          assert.equal(String(input), slashUrl);
          return htmlResponse(200, SERVICE_HTML);
        },
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.finalUrl, slashUrl);
  });

  it("GetOblic-shaped https /faq → http /faq/ → https /faq/ is accepted", async () => {
    const startUrl = "https://example.test/faq";
    const fetches: string[] = [];
    const result = await continueSameOriginRedirectChain({
      startUrl,
      firstLocation: "http://example.test/faq/",
      registrableDomain: "example.test",
      safetyContext: { fetchPurpose: "page" },
      robotsRules: ALLOW_ALL_ROBOTS,
      deps: {
        assertHostname: async () => [],
        fetchImpl: async (input) => {
          const url = String(input);
          fetches.push(url);
          if (url === "http://example.test/faq/") {
            return redirectResponse("https://example.test/faq/");
          }
          if (url === "https://example.test/faq/") {
            return htmlResponse(200, SERVICE_HTML);
          }
          throw new Error(`unexpected ${url}`);
        },
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.statusCode, 200);
    assert.equal(result.redirectCount, 2);
    assert.deepEqual(fetches, [
      "http://example.test/faq/",
      "https://example.test/faq/",
    ]);
  });

  it("/faq/ → /faq repeated 301 loop is rejected", async () => {
    const result = await continueSameOriginRedirectChain({
      startUrl: "https://example.test/faq/",
      firstLocation: "/faq",
      registrableDomain: "example.test",
      safetyContext: { fetchPurpose: "page" },
      robotsRules: ALLOW_ALL_ROBOTS,
      deps: {
        assertHostname: async () => [],
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.endsWith("/faq") && !url.endsWith("/faq/")) {
            return redirectResponse("/faq/");
          }
          if (url.endsWith("/faq/")) {
            return redirectResponse("/faq");
          }
          throw new Error(`unexpected ${url}`);
        },
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.errorCode, "REDIRECT_LOOP");
  });

  it("self-redirect to the same hop is rejected", async () => {
    const result = await continueSameOriginRedirectChain({
      startUrl: "https://example.test/faq",
      firstLocation: "/faq/",
      registrableDomain: "example.test",
      safetyContext: { fetchPurpose: "page" },
      robotsRules: ALLOW_ALL_ROBOTS,
      deps: {
        assertHostname: async () => [],
        fetchImpl: async () => redirectResponse("/faq/"),
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.errorCode, "REDIRECT_LOOP");
  });

  it("HTTP → HTTPS same-site redirect is accepted", async () => {
    const result = await continueSameOriginRedirectChain({
      startUrl: "http://example.test/about",
      firstLocation: "https://example.test/about",
      registrableDomain: "example.test",
      safetyContext: { fetchPurpose: "page" },
      robotsRules: ALLOW_ALL_ROBOTS,
      deps: {
        assertHostname: async () => [],
        fetchImpl: async (input) => {
          assert.equal(String(input), "https://example.test/about");
          return htmlResponse(200, SERVICE_HTML);
        },
      },
    });
    assert.equal(result.ok, true);
  });

  it("redirect depth maximum remains enforced", async () => {
    assert.equal(DEEP_SCRAPE_CRAWL_POLICY.maxRedirectDepth, 3);
  });
});
