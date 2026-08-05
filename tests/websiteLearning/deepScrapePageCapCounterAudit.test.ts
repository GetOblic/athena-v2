import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { DeepScrapeCandidateRegistry } from "../../services/websiteLearning/deepScrape/crawler/candidateRegistry";
import { enqueueCheerioUrl } from "../../services/websiteLearning/deepScrape/crawler/cheerioCrawler";
import { DEEP_SCRAPE_CRAWL_POLICY } from "../../services/websiteLearning/deepScrape/crawlPolicy";

const ROOT = path.join(__dirname, "../..");

describe("Deep scrape page-cap counter forensic audit", () => {
  it("proves acceptance-cap vs ranked-plan exclusion use distinct events", () => {
    const cheerio = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/cheerioCrawler.ts",
      ),
      "utf8",
    );
    const adapter = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/crawleeAdapter.ts",
      ),
      "utf8",
    );

    assert.match(
      cheerio,
      /if \(ctx\.acceptedPages\.length >= ctx\.maxAccepted\) \{\s*recordRejection\(ctx, "PAGE_CAP_LOWER_PRIORITY"\)/,
    );
    assert.match(cheerio, /reason: "acceptance_cap"/);
    assert.match(cheerio, /reason: "acceptance_cap_after_extract"/);
    assert.match(cheerio, /RANKED_PLAN_LOWER_PRIORITY/);
    assert.match(cheerio, /deep_scrape_ranked_candidate_excluded/);
    assert.doesNotMatch(cheerio, /reason: "queue_capacity"/);

    assert.match(
      adapter,
      /maxAccepted: DEEP_SCRAPE_CRAWL_POLICY\.maxMeaningfulPages/,
    );
    assert.match(
      adapter,
      /maxQueueSize: DEEP_SCRAPE_CRAWL_POLICY\.maxRankedCandidates/,
    );
    assert.equal(DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages, 50);
    assert.equal(DEEP_SCRAPE_CRAWL_POLICY.maxRankedCandidates, 100);
  });

  it("ranked-plan capacity emits ranked exclusion, not page-cap, at 1 accepted", async () => {
    const events: Array<{ event: string; diagnostic: Record<string, unknown> }> =
      [];
    const originalLog = console.log;
    console.log = ((...args: unknown[]) => {
      const payload = args[1];
      if (
        payload &&
        typeof payload === "object" &&
        "event" in payload
      ) {
        const event = (payload as { event: string }).event;
        if (
          event === "deep_scrape_page_cap_candidate_skipped" ||
          event === "deep_scrape_ranked_candidate_excluded"
        ) {
          events.push({
            event,
            diagnostic:
              ((payload as { diagnostic?: Record<string, unknown> }).diagnostic ??
                {}) as Record<string, unknown>,
          });
        }
      }
    }) as typeof console.log;

    try {
      const enqueuedUrls = new Set<string>();
      for (let i = 0; i < DEEP_SCRAPE_CRAWL_POLICY.maxRankedCandidates; i += 1) {
        enqueuedUrls.add(`https://getoblic.com/seed-${i}`);
      }

      const acceptedPages: unknown[] = [
        {
          url: "https://getoblic.com/",
          finalUrl: "https://getoblic.com/",
        },
      ];

      const ctx = {
        organizationId: "org-audit",
        jobId: "job-ranked",
        sourceType: "brain" as const,
        registrableDomain: "getoblic.com",
        rootUrl: "https://getoblic.com/",
        robots: { rules: [], sitemaps: [], crawlDelay: null },
        config: {} as never,
        requestQueue: {
          addRequest: async () => ({ requestId: "x", wasAlreadyPresent: false }),
        } as never,
        acceptedPages: acceptedPages as never,
        playwrightFallbackUrls: [],
        seenCanonicalUrls: new Map(),
        seenFinalUrls: new Map(),
        seenContentHashes: new Map(),
        seenFingerprints: new Set<string>(),
        enqueuedUrls,
        rejectedByReason: {} as Record<string, number>,
        candidateRegistry: new DeepScrapeCandidateRegistry(),
        acceptedByProvenance: {},
        maxAccepted: DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages,
        maxQueueSize: DEEP_SCRAPE_CRAWL_POLICY.maxRankedCandidates,
        allowLiveLinkEnqueue: false,
        forefrontOnEnqueue: false,
      };

      assert.equal(acceptedPages.length, 1);
      assert.ok(acceptedPages.length < ctx.maxAccepted);

      await enqueueCheerioUrl(ctx as never, "https://getoblic.com/pricing", {
        label: "link",
        provenance: "primary_navigation",
        anchorText: "Pricing",
      });

      assert.equal(events.length, 1);
      assert.equal(events[0].event, "deep_scrape_ranked_candidate_excluded");
      assert.equal(events[0].diagnostic.reason, "ranked_plan_capacity");
      assert.ok(
        !events.some((e) => e.event === "deep_scrape_page_cap_candidate_skipped"),
      );
      assert.equal(acceptedPages.length, 1);
    } finally {
      console.log = originalLog;
    }
  });

  it("acceptance-cap emitters require acceptedPages.length >= maxAccepted", () => {
    const cheerio = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/cheerioCrawler.ts",
      ),
      "utf8",
    );
    assert.doesNotMatch(
      cheerio,
      /candidateRegistry\.size\s*>=\s*ctx\.maxAccepted/,
    );
    assert.match(cheerio, /acceptedPages\.length >= ctx\.maxAccepted/);
  });

  it("Prospect and Brain share the same cheerio enqueue/cap path", () => {
    const adapter = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/crawleeAdapter.ts",
      ),
      "utf8",
    );
    const cheerio = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/cheerioCrawler.ts",
      ),
      "utf8",
    );
    assert.doesNotMatch(cheerio, /sourceType\s*===\s*["']brain["']/);
    assert.doesNotMatch(cheerio, /sourceType\s*===\s*["']prospect["']/);
    assert.match(adapter, /sourceType: input\.sourceType/);
    assert.match(adapter, /enqueueCheerioUrl/);
  });
});
