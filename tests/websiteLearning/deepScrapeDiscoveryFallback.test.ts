import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  DEEP_SCRAPE_CRAWL_POLICY,
  ensureHomepageCandidate,
  evaluatePageUsefulness,
  selectMeaningfulUrls,
  scoreUrl,
} from "../../services/websiteLearning/deepScrape/crawlPolicy";
import {
  deepIntelligenceHasUsableContent,
  isDeepWebsiteIntelligence,
  type DeepWebsiteIntelligence,
} from "../../services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import { isPathAllowedByRobots, parseRobotsTxt } from "../../services/websiteLearning/deepScrape/robots";
import {
  canonicalizePageUrl,
  isSameRegistrableDomain,
  normalizeRootWebsiteUrl,
} from "../../services/websiteLearning/deepScrape/urlSafety";

const ROOT = process.cwd();

function brochureHomepageText(): string {
  return [
    "Welcome to Acme Training",
    "We help beauty professionals launch their PMU businesses.",
    "Our services include consultation, training courses, and mentorship.",
    "Contact our team to book a discovery call and learn about pricing.",
    "Students praise our practical methodology and business coaching.",
  ].join(" ");
}

describe("Deep scrape discovery fallback and usefulness", () => {
  it("1/9. homepage remains a candidate after canonicalization and dedupe", () => {
    const root = normalizeRootWebsiteUrl("https://www.example.com");
    assert.ok(root);
    const canonical = canonicalizePageUrl(root.url) ?? root.url;
    const urls = ensureHomepageCandidate(
      ["https://example.com/about", canonical, canonical],
      canonical,
    );
    assert.ok(urls.includes(canonical));
    const meaningful = selectMeaningfulUrls(urls);
    assert.ok(meaningful.some((entry) => entry.pageType === "homepage"));
    assert.equal(scoreUrl(canonical).pageType, "homepage");
  });

  it("2-4. empty/missing sitemap still keeps homepage for fallback selection", () => {
    const homepage = "https://brochure.example.com";
    const onlyHomepage = ensureHomepageCandidate([], homepage);
    const meaningful = selectMeaningfulUrls(onlyHomepage);
    assert.equal(meaningful.length, 1);
    assert.equal(meaningful[0]?.pageType, "homepage");
    assert.equal(DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages, 50);
  });

  it("5. homepage internal links are scored as crawl candidates", () => {
    const urls = [
      "https://example.com/",
      "https://example.com/services",
      "https://example.com/about",
      "https://evil.com/services",
    ].filter((url) => isSameRegistrableDomain(url, "example.com"));
    const meaningful = selectMeaningfulUrls(urls);
    assert.ok(meaningful.some((entry) => entry.pageType === "services"));
    assert.ok(meaningful.some((entry) => entry.pageType === "about"));
    assert.ok(!meaningful.some((entry) => entry.url.includes("evil.com")));
  });

  it("6/10. brochure homepage content passes usefulness validation", () => {
    const result = evaluatePageUsefulness({
      title: "Acme Training",
      headings: ["Professional PMU Courses"],
      text: brochureHomepageText(),
    });
    assert.equal(result.useful, true);
    assert.equal(result.accepted, true);
    assert.ok(result.charCount >= DEEP_SCRAPE_CRAWL_POLICY.minPageReadableChars);
    assert.ok(result.wordCount >= DEEP_SCRAPE_CRAWL_POLICY.minPageWordCount);
  });

  it("7/8. homepage-only deep_v1 shape supports pages_analyzed = 1", () => {
    const intel = {
      provider: "deep_v1",
      url: "https://brochure.example.com",
      scraped_at: new Date().toISOString(),
      pages_analyzed: 1,
      pages: [
        {
          url: "https://brochure.example.com",
          title: "Acme",
          page_type: "homepage",
          excerpt: "Welcome",
        },
      ],
      business_knowledge: {
        positioning: "PMU training",
        about: "We train artists",
        products: "",
        services: "Courses",
        solutions: "",
        pricing: "",
        training: "Hands-on",
        faq: "",
        team: "",
        testimonials: "",
        case_studies: "",
        target_audience: "Beauty pros",
        messaging: "",
        value_proposition: "",
        differentiators: "",
        trust_signals: "",
        contact_information: "hello@acme.test",
        brand_tone: "Warm",
        cta: "Book a call",
      },
      crawl_summary: {
        pages_analyzed: 1,
        services_discovered: 0,
        faqs_discovered: 0,
        testimonials_discovered: 0,
        team_pages_discovered: 0,
        commercial_pages_discovered: 0,
      },
      positioning: "PMU training",
      products: "",
      services: "Courses",
      about: "We train artists",
      target_audience: "Beauty pros",
      messaging: "",
      value_proposition: "",
      cta: "Book a call",
      differentiators: "",
      trust_signals: "",
      contact_information: "hello@acme.test",
      brand_tone: "Warm",
      headings: "Acme",
      paragraphs: "We train artists",
    } satisfies DeepWebsiteIntelligence;

    assert.equal(isDeepWebsiteIntelligence(intel), true);
    assert.equal(deepIntelligenceHasUsableContent(intel), true);
    assert.equal(intel.pages_analyzed, 1);
  });

  it("11-14. thin / JS shell / cookie-wall / access-denied fail usefulness", () => {
    assert.equal(
      evaluatePageUsefulness({
        title: "Hi",
        headings: [],
        text: "Too short",
      }).useful,
      false,
    );
    assert.equal(
      evaluatePageUsefulness({
        title: "App",
        headings: [],
        text: "Please enable JavaScript to continue using this application shell.",
      }).rejectionCode,
      "PAGE_JS_SHELL",
    );
    assert.equal(
      evaluatePageUsefulness({
        title: "Cookies",
        headings: ["We use cookies"],
        text: "Accept all cookies to continue. Cookie consent settings are required.",
      }).useful,
      false,
    );
    assert.equal(
      evaluatePageUsefulness({
        title: "Forbidden",
        headings: ["Access Denied"],
        text: "403 Forbidden. Access denied by security policy for this resource path.",
      }).useful,
      false,
    );
  });

  it("15/16. robots-denied root does not bypass robots policy", () => {
    const rules = parseRobotsTxt(
      ["User-agent: *", "Disallow: /"].join("\n"),
      DEEP_SCRAPE_CRAWL_POLICY.userAgent,
    );
    assert.equal(isPathAllowedByRobots("/", rules), false);
    assert.equal(isPathAllowedByRobots("/about", rules), false);
  });

  it("17/18. same-domain and external rejection remain enforced", () => {
    assert.equal(
      isSameRegistrableDomain("https://docs.example.com/a", "example.com"),
      true,
    );
    assert.equal(
      isSameRegistrableDomain("https://other.test/a", "example.com"),
      false,
    );
  });

  it("19/20. discovery diagnostic event wiring has metadata-only contract", () => {
    const observability = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/observability.ts"),
      "utf8",
    );
    const adapter = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/crawleeAdapter.ts",
      ),
      "utf8",
    );
    assert.match(observability, /sitemap_fallback_to_homepage/);
    assert.match(observability, /homepage_only_crawl_selected/);
    assert.match(observability, /crawlee_job_started/);
    assert.match(adapter, /homepage_only_crawl_selected/);
    assert.match(adapter, /sitemap_fallback_to_homepage/);
    assert.match(adapter, /buildRankedCrawlPlan/);
    assert.match(adapter, /deep_scrape_homepage_discovery_started/);
    assert.doesNotMatch(adapter, /console\.log\([^\)]*readableText/);
  });

  it("21/22. shared crawl engine serves Brain and Prospect without forks", () => {
    const executor = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/deepScrapeExecutor.ts"),
      "utf8",
    );
    assert.match(executor, /runDeepWebsiteCrawl/);
    assert.match(executor, /source_type === "brain"/);
    assert.match(executor, /source_type === "prospect"/);
    assert.match(executor, /EMPTY_OR_THIN_HOMEPAGE/);
    assert.match(executor, /ROBOTS_DENIED/);
    assert.match(executor, /ROOT_FETCH_FAILED/);
    assert.match(executor, /NO_PERMISSIBLE_CRAWL_TARGETS/);
  });

  it("23-26. caps, synthesis model path, worker leases, and initial flows unchanged", () => {
    assert.equal(DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages, 50);
    const synthesize = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/synthesize.ts"),
      "utf8",
    );
    const identity = readFileSync(
      path.join(ROOT, "services/identity/identityService.ts"),
      "utf8",
    );
    const importer = readFileSync(
      path.join(ROOT, "services/prospects/prospectImporter.ts"),
      "utf8",
    );
    const refresh = readFileSync(
      path.join(ROOT, "app/api/prospects/[id]/refresh/route.ts"),
      "utf8",
    );
    const worker = readFileSync(path.join(ROOT, "workers/athenaWorker.ts"), "utf8");

    assert.match(synthesize, /generationKind:\s*"identity_profile"/);
    assert.match(synthesize, /athenaStage:\s*"identity_profile"/);
    assert.doesNotMatch(identity, /runDeepWebsiteCrawl/);
    assert.doesNotMatch(importer, /runDeepWebsiteCrawl/);
    assert.doesNotMatch(refresh, /deep-scrape|runDeepWebsiteCrawl/);
    assert.match(worker, /claimAndExecuteNextDeepScrapeJob/);
    assert.match(worker, /reconcileAwaitingFollowOnJobs/);
  });

  it("does not treat empty sitemap as terminal discovery failure", () => {
    const adapter = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/crawleeAdapter.ts",
      ),
      "utf8",
    );
    // Discovery must not throw INSUFFICIENT_USEFUL_CONTENT before crawl.
    // Empty sitemap still proceeds via homepage-first ranked plan.
    assert.match(adapter, /buildRankedCrawlPlan/);
    assert.match(adapter, /sitemap_fallback_to_homepage/);
    assert.match(adapter, /homepage_only_crawl_selected/);
    assert.match(adapter, /evaluateCorpusUsefulness/);
    assert.match(adapter, /throw new Error\(corpus\.code\)/);
    assert.doesNotMatch(
      adapter,
      /if \(meaningful\.length === 0\) \{\s*throw new Error\("INSUFFICIENT_USEFUL_CONTENT"\)/,
    );
  });
});
