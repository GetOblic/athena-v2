import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  CandidateAccountingError,
  CandidateAccountingLedger,
  DEEP_SCRAPE_CANDIDATE_ACCOUNTING_MISMATCH,
  DEEP_SCRAPE_REJECTION_REASONS,
  mapClassifierRejectionToReason,
  mapDuplicateBasisToReason,
} from "../../services/websiteLearning/deepScrape/crawler/candidateAccounting";
import { formatDeepScrapeErrorMessage } from "../../services/websiteLearning/deepScrape/deepScrapeJobTypes";

const ROOT = path.join(__dirname, "../..");

describe("Deep scrape candidate accounting", () => {
  it("1. seven candidates: four accepted, one duplicate, one retry exhausted, one non-HTML", () => {
    const ledger = new CandidateAccountingLedger();
    const urls = [
      "https://example.com/",
      "https://example.com/services",
      "https://example.com/training",
      "https://example.com/about",
      "https://example.com/services-copy",
      "https://example.com/broken",
      "https://example.com/file.pdf",
    ];
    for (const url of urls) {
      ledger.markQueued(url);
      ledger.markRequestStarted(url);
    }

    ledger.markAccepted({
      url: urls[0],
      finalUrl: urls[0],
      contentChars: 400,
      extractionMethod: "cheerio_readability",
    });
    ledger.markAccepted({
      url: urls[1],
      finalUrl: urls[1],
      contentChars: 300,
      extractionMethod: "cheerio_readability",
    });
    ledger.markAccepted({
      url: urls[2],
      finalUrl: urls[2],
      contentChars: 350,
      extractionMethod: "playwright_readability",
    });
    ledger.markAccepted({
      url: urls[3],
      finalUrl: urls[3],
      contentChars: 280,
      extractionMethod: "cheerio_readability",
    });
    ledger.markRejected({
      url: urls[4],
      reason: "DUPLICATE_CONTENT",
    });
    ledger.markRejected({
      url: urls[5],
      reason: "REQUEST_RETRY_EXHAUSTED",
      isRequestFailure: true,
    });
    ledger.markRejected({
      url: urls[6],
      reason: "NON_HTML_CONTENT",
    });

    const snap = ledger.verifyOrThrow();
    assert.equal(snap.networkRequestsAttempted, 7);
    assert.equal(snap.pagesAccepted, 4);
    assert.equal(snap.pagesRejected, 3);
    assert.equal(snap.pagesAccepted + snap.pagesRejected, snap.networkRequestsAttempted);
    assert.equal(snap.pagesRejectedByReason.DUPLICATE_CONTENT, 1);
    assert.equal(snap.pagesRejectedByReason.REQUEST_RETRY_EXHAUSTED, 1);
    assert.equal(snap.pagesRejectedByReason.NON_HTML_CONTENT, 1);
    assert.ok(DEEP_SCRAPE_REJECTION_REASONS.includes("REQUEST_RETRY_EXHAUSTED"));
  });

  it("2. pending Playwright without resolution fails accounting", () => {
    const ledger = new CandidateAccountingLedger();
    ledger.markRequestStarted("https://example.com/a");
    ledger.markPendingPlaywright({
      url: "https://example.com/a",
      finalUrl: "https://example.com/a",
      cheerioRejectionCode: "PAGE_NO_USABLE_TEXT",
    });
    assert.throws(
      () => ledger.verifyOrThrow(),
      (error: unknown) =>
        error instanceof CandidateAccountingError &&
        error.code === DEEP_SCRAPE_CANDIDATE_ACCOUNTING_MISMATCH,
    );
  });

  it("3. rejectAllPendingPlaywright restores balance and blocks silent gaps", () => {
    const ledger = new CandidateAccountingLedger();
    for (const pathName of ["/", "/services", "/training", "/faq", "/contact", "/pricing", "/blog"]) {
      const url = `https://tattoomdcoaching.com${pathName}`;
      ledger.markQueued(url);
      ledger.markRequestStarted(url);
    }
    ledger.markAccepted({
      url: "https://tattoomdcoaching.com/",
      finalUrl: "https://tattoomdcoaching.com/",
      contentChars: 500,
    });
    for (const pathName of ["/services", "/training", "/faq", "/contact", "/pricing", "/blog"]) {
      ledger.markPendingPlaywright({
        url: `https://tattoomdcoaching.com${pathName}`,
        finalUrl: `https://tattoomdcoaching.com${pathName}`,
      });
    }
    assert.throws(() => ledger.verifyOrThrow(), CandidateAccountingError);
    const skipped = ledger.rejectAllPendingPlaywright("PLAYWRIGHT_FALLBACK_SKIPPED");
    assert.equal(skipped, 6);
    const snap = ledger.verifyOrThrow();
    assert.equal(snap.pagesAccepted, 1);
    assert.equal(snap.pagesRejected, 6);
    assert.equal(snap.pagesRejectedByReason.PLAYWRIGHT_FALLBACK_SKIPPED, 6);
  });

  it("4. queue dedupe does not increment networkRequestsAttempted", () => {
    const ledger = new CandidateAccountingLedger();
    const first = ledger.markQueued("https://example.com/services");
    const second = ledger.markQueued("https://example.com/services/");
    assert.equal(first?.deduplicated, false);
    assert.equal(second?.deduplicated, true);
    const snap = ledger.snapshot();
    assert.equal(snap.candidatesQueued, 1);
    assert.equal(snap.candidatesDeduplicatedBeforeFetch, 1);
    assert.equal(snap.networkRequestsAttempted, 0);
  });

  it("5. shared incorrect canonical mapping stays content-hash based", () => {
    assert.equal(mapDuplicateBasisToReason("canonical_url"), "DUPLICATE_CANONICAL");
    assert.equal(mapDuplicateBasisToReason("final_url"), "DUPLICATE_FINAL_URL");
    assert.equal(mapDuplicateBasisToReason("meaningful_content_hash"), "DUPLICATE_CONTENT");
    const classifier = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/crawler/pageClassifier.ts"),
      "utf8",
    );
    assert.match(classifier, /selfCanonical/);
    assert.match(classifier, /doc\.canonicalUrl === doc\.finalUrl/);
  });

  it("6. redirects and request-handler exits are terminal in Cheerio source", () => {
    const cheerio = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/crawler/cheerioCrawler.ts"),
      "utf8",
    );
    assert.match(cheerio, /REDIRECTED_SAME_ORIGIN/);
    assert.match(cheerio, /markPendingPlaywright/);
    assert.match(cheerio, /ACCEPTANCE_CAP_REACHED/);
    assert.match(cheerio, /REQUEST_RETRY_EXHAUSTED/);
    assert.match(cheerio, /EMPTY_RESPONSE/);
    assert.match(cheerio, /NON_HTML_CONTENT/);
    // Playwright pending must record a ledger outcome before returning.
    assert.match(cheerio, /markPendingPlaywright/);
    assert.match(cheerio, /deep_scrape_candidate_playwright_fallback_started/);
  });

  it("7. adapter resolves skipped Playwright and verifies accounting before synthesis", () => {
    const adapter = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/crawler/crawleeAdapter.ts"),
      "utf8",
    );
    assert.match(adapter, /rejectAllPendingPlaywright/);
    assert.match(adapter, /PLAYWRIGHT_FALLBACK_SKIPPED/);
    assert.match(adapter, /PLAYWRIGHT_CHROMIUM_UNAVAILABLE/);
    assert.match(adapter, /verifyOrThrow/);
    assert.match(adapter, /deep_scrape_candidate_accounting_verified/);
    assert.match(adapter, /CandidateAccountingError/);
    // Brain and Prospect share the same adapter path.
    assert.match(adapter, /sourceType: input\.sourceType/);
  });

  it("8. Playwright failure and cap paths record terminal outcomes", () => {
    const pw = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/crawler/playwrightCrawler.ts"),
      "utf8",
    );
    assert.match(pw, /PLAYWRIGHT_FALLBACK_FAILED/);
    assert.match(pw, /ACCEPTANCE_CAP_REACHED/);
    assert.match(pw, /ledger\.markAccepted/);
    assert.match(pw, /ledger\.markRejected/);
  });

  it("9. classifier rejection mapping covers weak/empty extraction", () => {
    assert.equal(mapClassifierRejectionToReason("PAGE_NO_USABLE_TEXT"), "EXTRACTION_EMPTY");
    assert.equal(mapClassifierRejectionToReason("PAGE_NAVIGATION_ONLY"), "LOW_INFORMATION_PAGE");
    assert.equal(
      mapClassifierRejectionToReason("CHEERIO_SUSPECTED_TEMPLATE_EXTRACTION"),
      "SUSPECTED_TEMPLATE_EXTRACTION",
    );
  });

  it("10. accounting mismatch is terminal and user-readable", () => {
    const executor = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/deepScrapeExecutor.ts"),
      "utf8",
    );
    assert.match(executor, /DEEP_SCRAPE_CANDIDATE_ACCOUNTING_MISMATCH/);
    assert.match(
      formatDeepScrapeErrorMessage("DEEP_SCRAPE_CANDIDATE_ACCOUNTING_MISMATCH"),
      /without a clear accept or reject result/i,
    );
  });

  it("11. observability registers candidate lifecycle events", () => {
    const observability = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/observability.ts"),
      "utf8",
    );
    for (const event of [
      "deep_scrape_candidate_discovered",
      "deep_scrape_candidate_queued",
      "deep_scrape_candidate_queue_deduplicated",
      "deep_scrape_candidate_request_started",
      "deep_scrape_candidate_redirected",
      "deep_scrape_candidate_extraction_completed",
      "deep_scrape_candidate_playwright_fallback_started",
      "deep_scrape_candidate_accepted",
      "deep_scrape_candidate_rejected",
      "deep_scrape_candidate_request_failed",
      "deep_scrape_candidate_accounting_verified",
      "deep_scrape_candidate_accounting_failed",
    ]) {
      assert.match(observability, new RegExp(`"${event}"`));
    }
  });

  it("12. stats expose distinct counter semantics", () => {
    const types = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/crawler/crawlerTypes.ts"),
      "utf8",
    );
    assert.match(types, /networkRequestsAttempted/);
    assert.match(types, /candidatesQueued/);
    assert.match(types, /candidatesDeduplicatedBeforeFetch/);
    assert.match(types, /pagesExtracted/);
    assert.match(types, /requestFailures/);
  });
});
