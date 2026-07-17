import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { ATHENA_GENERATION_TRIGGER_TYPES } from "../../services/generationJobs/generationJobTypes";
import { resolveProspectWebsiteLearningDecision } from "../../services/prospects/prospectWebsiteLearningPolicy";
import {
  DEEP_SCRAPE_CRAWL_POLICY,
  isExcludedUrl,
  scoreUrl,
  selectMeaningfulUrls,
} from "../../services/websiteLearning/deepScrape/crawlPolicy";
import {
  deepIntelligenceHasUsableContent,
  isDeepWebsiteIntelligence,
} from "../../services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import { formatDeepScrapeStatusLabel } from "../../services/websiteLearning/deepScrape/deepScrapeJobTypes";
import {
  isPathAllowedByRobots,
  parseRobotsTxt,
} from "../../services/websiteLearning/deepScrape/robots";
import {
  canonicalizePageUrl,
  extractRegistrableDomain,
  isPrivateOrLocalIp,
  isSameRegistrableDomain,
  normalizeRootWebsiteUrl,
} from "../../services/websiteLearning/deepScrape/urlSafety";

const root = process.cwd();

describe("Deep scrape URL safety", () => {
  it("normalizes root website URLs and rejects IP literals", () => {
    const ok = normalizeRootWebsiteUrl("example.com/path");
    assert.equal(ok?.registrableDomain, "example.com");
    assert.equal(normalizeRootWebsiteUrl("http://127.0.0.1"), null);
    assert.equal(normalizeRootWebsiteUrl("https://192.168.1.10"), null);
  });

  it("extracts registrable domains including multi-part TLDs", () => {
    assert.equal(extractRegistrableDomain("www.shop.example.co.uk"), "example.co.uk");
    assert.equal(extractRegistrableDomain("docs.example.com"), "example.com");
  });

  it("enforces same registrable domain", () => {
    assert.equal(
      isSameRegistrableDomain("https://docs.example.com/a", "example.com"),
      true,
    );
    assert.equal(
      isSameRegistrableDomain("https://evil.com", "example.com"),
      false,
    );
  });

  it("detects private IPs", () => {
    assert.equal(isPrivateOrLocalIp("10.0.0.1"), true);
    assert.equal(isPrivateOrLocalIp("192.168.0.1"), true);
    assert.equal(isPrivateOrLocalIp("127.0.0.1"), true);
    assert.equal(isPrivateOrLocalIp("8.8.8.8"), false);
  });

  it("canonicalizes tracking query duplicates", () => {
    const canonical = canonicalizePageUrl(
      "https://example.com/about?utm_source=x&id=1",
    );
    assert.ok(canonical?.includes("id=1"));
    assert.ok(!canonical?.includes("utm_source"));
  });
});

describe("Deep scrape crawl policy", () => {
  it("caps meaningful pages at 25", () => {
    assert.equal(DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages, 25);
  });

  it("excludes legal/login/cart paths", () => {
    assert.equal(isExcludedUrl("https://example.com/privacy"), true);
    assert.equal(isExcludedUrl("https://example.com/login"), true);
    assert.equal(isExcludedUrl("https://example.com/cart"), true);
    assert.equal(isExcludedUrl("mailto:hi@example.com"), true);
    assert.equal(isExcludedUrl("https://example.com/services"), false);
  });

  it("prioritizes commercial page types and stops at meaningful limit", () => {
    const urls = [
      "https://example.com/",
      "https://example.com/about",
      "https://example.com/services",
      "https://example.com/privacy",
      "https://example.com/random-blog-post-12345",
      ...Array.from({ length: 40 }, (_, i) => `https://example.com/page-${i}`),
    ];
    const selected = selectMeaningfulUrls(urls, 25);
    assert.ok(selected.length <= 25);
    assert.ok(selected.some((entry) => entry.pageType === "about"));
    assert.ok(selected.every((entry) => entry.pageType !== "invalid"));
    assert.equal(scoreUrl("https://example.com/services").pageType, "services");
  });
});

describe("Deep scrape robots", () => {
  it("parses disallow rules for Athena UA", () => {
    const rules = parseRobotsTxt(
      ["User-agent: *", "Disallow: /private", "Allow: /private/open"].join("\n"),
      "AthenaDeepScrape/1.0",
    );
    assert.equal(isPathAllowedByRobots("/private", rules), false);
    assert.equal(isPathAllowedByRobots("/private/open", rules), true);
    assert.equal(isPathAllowedByRobots("/about", rules), true);
  });
});

describe("Deep website intelligence shape", () => {
  it("validates deep_v1 provider payloads", () => {
    const intel = {
      provider: "deep_v1",
      url: "https://example.com",
      scraped_at: new Date().toISOString(),
      pages_analyzed: 3,
      pages: [],
      business_knowledge: {
        about: "We teach PMU",
        services: "Training",
        positioning: "",
        products: "",
        solutions: "",
        pricing: "",
        training: "",
        faq: "",
        team: "",
        testimonials: "",
        case_studies: "",
        target_audience: "",
        messaging: "",
        value_proposition: "",
        differentiators: "",
        trust_signals: "",
        contact_information: "",
        brand_tone: "",
        cta: "",
      },
      crawl_summary: {
        pages_analyzed: 3,
        services_discovered: 1,
        faqs_discovered: 0,
        testimonials_discovered: 0,
        team_pages_discovered: 0,
        commercial_pages_discovered: 0,
      },
      positioning: "",
      products: "",
      services: "Training",
      about: "We teach PMU",
      target_audience: "",
      messaging: "",
      value_proposition: "",
      cta: "",
      differentiators: "",
      trust_signals: "",
      contact_information: "",
      brand_tone: "",
      headings: "",
      paragraphs: "",
    };
    assert.equal(isDeepWebsiteIntelligence(intel), true);
    assert.equal(deepIntelligenceHasUsableContent(intel), true);
  });
});

describe("Prospect deep scrape trigger policy", () => {
  it("includes prospect_deep_scrape trigger type", () => {
    assert.ok(ATHENA_GENERATION_TRIGGER_TYPES.includes("prospect_deep_scrape"));
  });

  it("never homepage-crawls on prospect_deep_scrape follow-on", () => {
    const decision = resolveProspectWebsiteLearningDecision({
      triggerType: "prospect_deep_scrape",
      hasWebsite: true,
      websiteIntelligence: null,
    });
    assert.equal(decision.shouldCrawl, false);
    assert.equal(decision.reason, "intelligence_refresh");
  });
});

describe("Deep scrape status labels", () => {
  it("formats brain and prospect phase labels", () => {
    assert.equal(
      formatDeepScrapeStatusLabel({
        status: "processing",
        current_stage: "retraining",
        source_type: "brain",
      }),
      "Retraining Athena Brain",
    );
    assert.equal(
      formatDeepScrapeStatusLabel({
        status: "awaiting_follow_on",
        current_stage: "regenerating",
        source_type: "prospect",
      }),
      "Generating Executive Intelligence",
    );
    assert.match(
      formatDeepScrapeStatusLabel({
        status: "processing",
        current_stage: "crawling",
        pages_crawled: 3,
        progress: { pagesCrawled: 3, pagesTarget: 10 },
        source_type: "brain",
      }),
      /Crawling 3 of 10/i,
    );
  });
});

describe("Deep scrape wiring contracts", () => {
  it("keeps deep scrape independent from Train Athena / import / refresh", () => {
    const identityService = readFileSync(
      path.join(root, "services/identity/identityService.ts"),
      "utf8",
    );
    const importer = readFileSync(
      path.join(root, "services/prospects/prospectImporter.ts"),
      "utf8",
    );
    const refreshRoute = readFileSync(
      path.join(root, "app/api/prospects/[id]/refresh/route.ts"),
      "utf8",
    );
    const worker = readFileSync(path.join(root, "workers/athenaWorker.ts"), "utf8");
    const executor = readFileSync(
      path.join(root, "services/generationJobs/generationJobExecutor.ts"),
      "utf8",
    );

    assert.doesNotMatch(identityService, /enqueueBrainDeepScrapeJob|runDeepWebsiteCrawl/);
    assert.doesNotMatch(importer, /runDeepWebsiteCrawl|enqueueProspectDeepScrapeJob/);
    assert.doesNotMatch(refreshRoute, /deep-scrape|prospect_deep_scrape/);
    assert.match(worker, /claimAndExecuteNextDeepScrapeJob/);
    assert.match(worker, /reconcileAwaitingFollowOnJobs/);
    assert.match(executor, /prospect_deep_scrape/);
    assert.match(identityService, /stored_deep_website_intelligence_present|formatDeepIntelligenceForBrainPrompt/);
  });

  it("adds dedicated deep scrape APIs and UI entry points", () => {
    const identityPage = readFileSync(
      path.join(root, "app/identity/page.tsx"),
      "utf8",
    );
    const prospectPage = readFileSync(
      path.join(root, "app/prospects/[id]/page.tsx"),
      "utf8",
    );
    const migration = readFileSync(
      path.join(
        root,
        "supabase/migrations/20260723000001_create_website_deep_scrape_jobs.sql",
      ),
      "utf8",
    );

    assert.match(identityPage, /DeepScrapeWebsiteButton/);
    assert.match(prospectPage, /ProspectDeepScrapeWebsiteButton/);
    assert.match(migration, /athena_website_deep_scrape_jobs/);
    assert.match(migration, /prospect_deep_scrape/);
    assert.match(migration, /deployment_assets_refresh/);
    assert.match(migration, /strategic_assets_refresh/);
    assert.match(migration, /website_intelligence/);
    assert.match(migration, /awaiting_follow_on/);
    assert.doesNotMatch(
      migration,
      /20260722000001_add_partial_refresh_trigger_types/,
    );
  });
});
