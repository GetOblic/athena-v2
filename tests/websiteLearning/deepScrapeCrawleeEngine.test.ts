import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  DEEP_SCRAPE_CRAWL_POLICY,
  selectMeaningfulUrls,
} from "../../services/websiteLearning/deepScrape/crawlPolicy";
import {
  isNavigationTargetAllowed,
} from "../../services/websiteLearning/deepScrape/crawler/browserGuard";
import {
  checkChromiumAvailable,
  resetChromiumAvailabilityCache,
} from "../../services/websiteLearning/deepScrape/crawler/chromiumCheck";
import { classifyNormalizedPage } from "../../services/websiteLearning/deepScrape/crawler/pageClassifier";
import {
  extractWithReadability,
  looksLikeJsShell,
} from "../../services/websiteLearning/deepScrape/crawler/readabilityExtractor";
import { toSynthesisPages } from "../../services/websiteLearning/deepScrape/crawler/crawleeAdapter";
import type { NormalizedPageDocument } from "../../services/websiteLearning/deepScrape/crawler/crawlerTypes";
import { isPrivateOrLocalIp } from "../../services/websiteLearning/deepScrape/urlSafety";

const ROOT = process.cwd();

function fixtureDoc(
  overrides: Partial<NormalizedPageDocument> = {},
): NormalizedPageDocument {
  return {
    url: "https://example.com/",
    canonicalUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    title: "Example Clinic",
    description: "Hair restoration clinic",
    headings: ["Services"],
    readableText:
      "We offer scalp micropigmentation and hairline design consultations in London.",
    meaningfulText:
      "We offer scalp micropigmentation and hairline design consultations in London.",
    htmlLanguage: "en",
    pageType: "homepage",
    statusCode: 200,
    contentType: "text/html",
    extractionMethod: "cheerio_readability",
    renderedWithBrowser: false,
    discoveredLinks: ["https://example.com/about"],
    structuredBusinessData: {
      types: [],
      organizationName: null,
      businessName: null,
      description: null,
      telephone: null,
      email: null,
      address: null,
      openingHours: [],
      socialLinks: [],
      services: [],
      products: [],
      people: [],
      faqs: [],
      reviews: [],
      rawJsonLdCount: 0,
    },
    contentHash: "hash1",
    fetchedAt: new Date().toISOString(),
    responseBytes: 1200,
    redirectCount: 0,
    selfCanonical: true,
    ...overrides,
  };
}

describe("Deep scrape Crawlee engine — extraction and acceptance", () => {
  it("1/4/5. static HTML extracts via Readability without JS-shell fallback", () => {
    const html = `<!doctype html><html lang="en"><head>
      <title>About Apex</title>
      <meta name="description" content="Clinic about page"/>
      <link rel="canonical" href="https://example.com/about"/>
    </head><body>
      <h1>About our clinic</h1>
      <p>Apex Scalp Clinic provides scalp micropigmentation treatments for lasting density.</p>
      <p>Book a consultation with our specialist team in London.</p>
      <a href="/services">Services</a>
      <a href="https://evil.com">External</a>
    </body></html>`;

    const extracted = extractWithReadability({
      html,
      url: "https://example.com/about",
      registrableDomain: "example.com",
    });

    assert.ok(extracted.readableText.length > 40);
    assert.match(extracted.readableText, /scalp micropigmentation/i);
    assert.equal(extracted.htmlLanguage, "en");
    assert.ok(extracted.discoveredLinks.some((link) => link.includes("/services")));
    assert.equal(
      extracted.discoveredLinks.some((link) => link.includes("evil.com")),
      false,
    );
    assert.equal(looksLikeJsShell(html, extracted.readableText), false);

    const classification = classifyNormalizedPage({
      document: fixtureDoc({
        readableText: extracted.readableText,
        title: extracted.title,
        headings: extracted.headings,
        description: extracted.description,
        pageType: "about",
        contentHash: extracted.contentHash,
        canonicalUrl: extracted.canonicalUrl ?? "https://example.com/about",
        finalUrl: "https://example.com/about",
      }),
      htmlForShellCheck: html,
    });
    assert.equal(classification.accepted, true);
    assert.equal(classification.needsPlaywrightFallback, false);
  });

  it("2/3. JS-shell indicators request Playwright fallback", () => {
    const html = `<!doctype html><html><body>
      <div id="root"></div>
      <script>window.__NEXT_DATA__={}</script>
      <noscript>Please enable JavaScript to continue using this application.</noscript>
    </body></html>`;
    const extracted = extractWithReadability({
      html,
      url: "https://example.com/",
      registrableDomain: "example.com",
    });
    assert.equal(looksLikeJsShell(html, extracted.readableText), true);
    const classification = classifyNormalizedPage({
      document: fixtureDoc({
        readableText: extracted.readableText || "Home",
        meaningfulText: extracted.meaningfulText || "",
        title: "App",
        headings: [],
        description: null,
        pageType: "homepage",
        contentHash: extracted.contentHash,
      }),
      htmlForShellCheck: html,
    });
    assert.equal(classification.accepted, false);
    assert.equal(classification.needsPlaywrightFallback, true);
  });

  it("6/7. structured LocalBusiness / contact data is retained and accepted", () => {
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">
      {
        "@context":"https://schema.org",
        "@type":"LocalBusiness",
        "name":"Apex Scalp Clinic",
        "telephone":"+44 20 1234 5678",
        "email":"hello@apexscalpclinic.com",
        "address":{"@type":"PostalAddress","streetAddress":"12 Harley Street","addressLocality":"London"}
      }
      </script>
    </head><body><h1>Contact</h1><p>Visit us</p></body></html>`;
    const extracted = extractWithReadability({
      html,
      url: "https://example.com/contact",
      registrableDomain: "example.com",
    });
    assert.ok(extracted.structuredBusinessData.types.includes("LocalBusiness"));
    assert.equal(extracted.structuredBusinessData.telephone, "+44 20 1234 5678");
    assert.equal(
      extracted.structuredBusinessData.email,
      "hello@apexscalpclinic.com",
    );
    const classification = classifyNormalizedPage({
      document: fixtureDoc({
        title: extracted.title,
        readableText: extracted.readableText,
        headings: extracted.headings,
        pageType: "contact",
        structuredBusinessData: extracted.structuredBusinessData,
        contentHash: extracted.contentHash,
        canonicalUrl: "https://example.com/contact",
        finalUrl: "https://example.com/contact",
      }),
    });
    assert.equal(classification.accepted, true);
  });

  it("8/9. concise service page and brochure homepage accepted", () => {
    const service = classifyNormalizedPage({
      document: fixtureDoc({
        pageType: "services",
        title: "Services",
        readableText: "We offer density treatments and hairline design.",
        contentHash: "svc",
      }),
    });
    assert.equal(service.accepted, true);

    const brochure = classifyNormalizedPage({
      document: fixtureDoc({
        pageType: "homepage",
        title: "Apex Scalp Clinic",
        readableText: "Natural looking hair restoration. Book a consultation today.",
        contentHash: "home",
      }),
    });
    assert.equal(brochure.accepted, true);
  });

  it("10/11/12. sitemap/link selection keeps business pages; externals rejected by safety", () => {
    const selected = selectMeaningfulUrls([
      "https://example.com/",
      "https://example.com/about",
      "https://example.com/services",
      "https://example.com/privacy",
    ]);
    assert.ok(selected.some((entry) => entry.pageType === "homepage"));
    assert.ok(selected.some((entry) => entry.url.includes("/services")));
    assert.equal(
      selected.some((entry) => entry.url.includes("/privacy")),
      false,
    );
    const cheerio = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/cheerioCrawler.ts",
      ),
      "utf8",
    );
    assert.match(cheerio, /isSameRegistrableDomain/);
  });

  it("13-15. private/external navigation targets are rejected", async () => {
    assert.equal(isPrivateOrLocalIp("127.0.0.1"), true);
    assert.equal(isPrivateOrLocalIp("169.254.169.254"), true);
    const external = await isNavigationTargetAllowed(
      "https://evil.com/page",
      "example.com",
    );
    assert.equal(external.allowed, false);
    assert.equal(external.reason, "CROSS_DOMAIN_REJECTED");

    const privateLiteral = await isNavigationTargetAllowed(
      "http://127.0.0.1/",
      "example.com",
    );
    assert.equal(privateLiteral.allowed, false);

    const guard = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/browserGuard.ts",
      ),
      "utf8",
    );
    assert.match(guard, /assertPublicHostname/);
    assert.match(guard, /route\.abort/);
    assert.match(guard, /websocket/);
  });

  it("16. robots policy helper remains wired through adapter", () => {
    const adapter = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/crawleeAdapter.ts",
      ),
      "utf8",
    );
    assert.match(adapter, /fetchRobotsRules/);
    assert.match(adapter, /ROBOTS_DENIED/);
  });

  it("17/18. duplicate canonical URL and content hash are rejected", () => {
    const seenFinalUrls = new Map([
      ["https://example.com/about", "https://example.com/about"],
    ]);
    const seenContentHashes = new Map([
      ["samehash", "https://example.com/services"],
    ]);
    const dupUrl = classifyNormalizedPage({
      document: fixtureDoc({
        canonicalUrl: "https://example.com/about",
        finalUrl: "https://example.com/about",
        contentHash: "other",
        selfCanonical: true,
      }),
      seenFinalUrls,
    });
    assert.equal(dupUrl.rejectionCode, "PAGE_DUPLICATE");
    assert.equal(dupUrl.duplicateBasis, "final_url");

    const dupHash = classifyNormalizedPage({
      document: fixtureDoc({
        canonicalUrl: "https://example.com/services-b",
        finalUrl: "https://example.com/services-b",
        contentHash: "samehash",
        selfCanonical: true,
      }),
      seenFinalUrls: new Map(),
      seenContentHashes,
      alreadyRenderedWithBrowser: true,
    });
    assert.equal(dupHash.rejectionCode, "PAGE_DUPLICATE");
    assert.equal(dupHash.duplicateBasis, "meaningful_content_hash");
  });

  it("19-21. caps and Playwright concurrency remain conservative", () => {
    assert.equal(DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages, 25);
    assert.equal(DEEP_SCRAPE_CRAWL_POLICY.maxDiscoveredUrls, 200);
    assert.equal(DEEP_SCRAPE_CRAWL_POLICY.maxConcurrentRequests, 2);
    const playwright = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/playwrightCrawler.ts",
      ),
      "utf8",
    );
    assert.match(playwright, /maxConcurrency:\s*1/);
    const cheerio = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/cheerioCrawler.ts",
      ),
      "utf8",
    );
    assert.match(cheerio, /maxConcurrency:\s*DEEP_SCRAPE_CRAWL_POLICY\.maxConcurrentRequests/);
  });

  it("22-25. browser teardown, no raw HTML persistence/logging contracts", () => {
    const playwright = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/playwrightCrawler.ts",
      ),
      "utf8",
    );
    const storage = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/crawlStorage.ts",
      ),
      "utf8",
    );
    const observability = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/observability.ts"),
      "utf8",
    );
    assert.match(playwright, /crawler\.teardown/);
    assert.match(playwright, /headless:\s*true/);
    assert.doesNotMatch(playwright, /screenshot|trace:|recordVideo/i);
    assert.match(storage, /persistStorage:\s*false/);
    assert.match(storage, /cleanupJobCrawleeStorage/);
    assert.match(observability, /crawlee_job_started/);
    assert.match(observability, /page_accepted/);
    assert.match(observability, /never logs page bodies/i);
  });

  it("26. synthesis receives normalized page documents", () => {
    const pages = toSynthesisPages([
      fixtureDoc({
        finalUrl: "https://example.com/services",
        title: "Services",
        pageType: "services",
        readableText: "Density treatments",
        meaningfulText: "Density treatments",
      }),
    ]);
    assert.deepEqual(pages, [
      {
        url: "https://example.com/services",
        title: "Services",
        pageType: "services",
        text: "Density treatments",
      },
    ]);
  });

  it("27-36. Phase B, APIs, UI, and unchanged flows remain wired", () => {
    const engine = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/crawlEngine.ts"),
      "utf8",
    );
    const executor = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/deepScrapeExecutor.ts",
      ),
      "utf8",
    );
    const identity = readFileSync(
      path.join(ROOT, "services/identity/identityService.ts"),
      "utf8",
    );
    const refresh = readFileSync(
      path.join(ROOT, "app/api/prospects/[id]/refresh/route.ts"),
      "utf8",
    );
    const brainApi = readFileSync(
      path.join(ROOT, "app/api/identity/deep-scrape/route.ts"),
      "utf8",
    );
    const prospectApi = readFileSync(
      path.join(ROOT, "app/api/prospects/[id]/deep-scrape/route.ts"),
      "utf8",
    );

    assert.match(engine, /runCrawleeWebsiteCrawl/);
    assert.match(engine, /synthesizeDeepWebsiteIntelligence/);
    assert.match(engine, /toSynthesisPages/);
    assert.doesNotMatch(engine, /extractPageContent|safeFetchHtml/);
    assert.match(executor, /compileMasterIdentityProfile/);
    assert.match(executor, /prospect_deep_scrape/);
    assert.match(executor, /pagesRendered/);
    assert.doesNotMatch(identity, /runDeepWebsiteCrawl/);
    assert.doesNotMatch(refresh, /runDeepWebsiteCrawl/);
    assert.match(brainApi, /enqueueBrainDeepScrapeJob/);
    assert.match(prospectApi, /enqueueProspectDeepScrapeJob/);
  });
});

describe("Deep scrape Crawlee engine — Chromium availability", () => {
  it("reports Chromium availability without downloading", async () => {
    resetChromiumAvailabilityCache();
    const result = await checkChromiumAvailable();
    assert.equal(typeof result.available, "boolean");
    if (result.available) {
      assert.ok(result.executablePath);
    } else {
      assert.match(String(result.error), /PLAYWRIGHT_CHROMIUM_UNAVAILABLE/);
    }
  });
});
