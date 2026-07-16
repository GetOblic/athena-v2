/**
 * Narrow per-candidate fetch lifecycle ledger for Deep Scrape Phase A.
 * Shared by Prospect and Brain — no source-type branches.
 *
 * Hard invariants (after Playwright finalization, before synthesis):
 *   1) playwrightPending === 0
 *   2) terminalHandlerCandidates === requestHandlersEntered
 *
 * Ranked-plan accounting is separate (redirects/dedupe may add non-ranked URLs):
 *   rankedCandidatesSelected
 *     === rankedHandlersEntered + rankedSkippedBeforeFetch
 *
 * fetchesAttempted (compat) === requestHandlersEntered
 *   = unique URLs that entered Cheerio and/or Playwright requestHandler
 *     (or failedRequestHandler). Not a raw Crawlee invocation counter.
 */

import { logDeepScrapeEvent } from "@/services/websiteLearning/deepScrape/observability";

export type DeepScrapeCandidateState =
  | "ranked"
  | "queued"
  | "fetch_started"
  | "response_received"
  | "redirected"
  | "cheerio_extracted"
  | "playwright_pending"
  | "playwright_started"
  | "accepted"
  | "rejected"
  | "request_failed"
  | "skipped_before_fetch";

export type DeepScrapeTerminalOutcome =
  | "accepted"
  | "rejected"
  | "request_failed"
  | "redirected"
  | "skipped_before_fetch";

const TERMINAL_STATES = new Set<DeepScrapeCandidateState>([
  "accepted",
  "rejected",
  "request_failed",
  "redirected",
  "skipped_before_fetch",
]);

export type FetchLifecycleEntry = {
  url: string;
  path: string;
  rank: number | null;
  score: number | null;
  provenance: string | null;
  statusCode: number | null;
  lastState: DeepScrapeCandidateState;
  terminalOutcome: DeepScrapeTerminalOutcome | null;
  reasonCode: string | null;
  browserFallbackUsed: boolean;
  inRankedPlan: boolean;
  handlerEntered: boolean;
  playwrightStarted: boolean;
  networkStarted: boolean;
  responseReceived: boolean;
  cheerioExtracted: boolean;
};

export type FetchLifecycleSummary = {
  rankedCandidatesSelected: number;
  rankedHandlersEntered: number;
  rankedSkippedBeforeFetch: number;
  requestHandlersEntered: number;
  terminalHandlerCandidates: number;
  networkRequestsStarted: number;
  responsesReceived: number;
  redirectsReceived: number;
  cheerioExtractedCompleted: number;
  playwrightPending: number;
  playwrightProcessed: number;
  pagesAccepted: number;
  pagesRejected: number;
  requestFailures: number;
  skippedBeforeFetch: number;
  terminalCandidates: number;
  nonTerminalCandidates: number;
  terminalReasons: Record<string, number>;
  /** Compat: unique URLs with handlerEntered. */
  fetchesAttempted: number;
};

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "/";
  }
}

function normalizeKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}`;
  } catch {
    return url;
  }
}

export class DeepScrapeFetchLifecycle {
  private readonly entries = new Map<string, FetchLifecycleEntry>();
  private rankedCandidatesSelected = 0;
  private playwrightProcessed = 0;
  private readonly meta: {
    organizationId: string;
    jobId: string;
    sourceType: "brain" | "prospect";
    domain: string;
  };

  constructor(meta: {
    organizationId: string;
    jobId: string;
    sourceType: "brain" | "prospect";
    domain: string;
  }) {
    this.meta = meta;
  }

  setRankedSelected(count: number): void {
    this.rankedCandidatesSelected = count;
  }

  getEntry(url: string): FetchLifecycleEntry | null {
    return this.entries.get(normalizeKey(url)) ?? null;
  }

  private ensure(
    url: string,
    patch?: Partial<
      Pick<FetchLifecycleEntry, "rank" | "score" | "provenance" | "inRankedPlan">
    >,
  ): FetchLifecycleEntry {
    const key = normalizeKey(url);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        url: key,
        path: pathOf(key),
        rank: patch?.rank ?? null,
        score: patch?.score ?? null,
        provenance: patch?.provenance ?? null,
        statusCode: null,
        lastState: "ranked",
        terminalOutcome: null,
        reasonCode: null,
        browserFallbackUsed: false,
        inRankedPlan: Boolean(patch?.inRankedPlan),
        handlerEntered: false,
        playwrightStarted: false,
        networkStarted: false,
        responseReceived: false,
        cheerioExtracted: false,
      };
      this.entries.set(key, entry);
    } else {
      if (patch?.rank != null) entry.rank = patch.rank;
      if (patch?.score != null) entry.score = patch.score;
      if (patch?.provenance) entry.provenance = patch.provenance;
      if (patch?.inRankedPlan) entry.inRankedPlan = true;
    }
    return entry;
  }

  markRanked(
    url: string,
    meta: { rank: number; score: number; provenance: string },
  ): void {
    const entry = this.ensure(url, { ...meta, inRankedPlan: true });
    // Never clobber in-flight or terminal homepage/secondary fetch state.
    if (entry.terminalOutcome || entry.handlerEntered) return;
    entry.lastState = "ranked";
  }

  markQueued(
    url: string,
    meta?: { score?: number; provenance?: string },
  ): void {
    const entry = this.ensure(url, meta);
    if (!TERMINAL_STATES.has(entry.lastState)) {
      entry.lastState = "queued";
    }
  }

  markNetworkStarted(url: string): void {
    const entry = this.ensure(url);
    entry.networkStarted = true;
    if (!TERMINAL_STATES.has(entry.lastState)) {
      entry.lastState = "fetch_started";
    }
  }

  markHandlerEntered(
    url: string,
    meta?: { score?: number; provenance?: string },
  ): FetchLifecycleEntry {
    const entry = this.ensure(url, meta);
    entry.handlerEntered = true;
    if (!entry.networkStarted) entry.networkStarted = true;
    if (!TERMINAL_STATES.has(entry.lastState)) {
      entry.lastState = "fetch_started";
    }
    return entry;
  }

  markResponseReceived(url: string, statusCode: number): void {
    const entry = this.ensure(url);
    entry.responseReceived = true;
    entry.statusCode = statusCode;
    if (!TERMINAL_STATES.has(entry.lastState)) {
      entry.lastState = "response_received";
    }
  }

  markCheerioExtracted(url: string): void {
    const entry = this.ensure(url);
    entry.cheerioExtracted = true;
    if (!TERMINAL_STATES.has(entry.lastState)) {
      entry.lastState = "cheerio_extracted";
    }
  }

  private terminalize(
    url: string,
    outcome: DeepScrapeTerminalOutcome,
    reasonCode: string,
    options?: {
      statusCode?: number;
      browserFallbackUsed?: boolean;
      state?: DeepScrapeCandidateState;
    },
  ): void {
    const entry = this.ensure(url);
    if (entry.terminalOutcome) {
      // Idempotent — never double-terminalize.
      return;
    }
    entry.terminalOutcome = outcome;
    entry.reasonCode = reasonCode;
    entry.lastState = options?.state ?? outcome;
    if (options?.statusCode != null) entry.statusCode = options.statusCode;
    if (options?.browserFallbackUsed) entry.browserFallbackUsed = true;

    logDeepScrapeEvent("deep_scrape_candidate_terminalized", {
      organizationId: this.meta.organizationId,
      jobId: this.meta.jobId,
      sourceType: this.meta.sourceType,
      domain: this.meta.domain,
      failureCode: outcome === "accepted" ? null : reasonCode,
      diagnostic: {
        path: entry.path,
        rank: entry.rank,
        score: entry.score,
        provenance: entry.provenance,
        statusCode: entry.statusCode,
        lastState: entry.lastState,
        terminalOutcome: outcome,
        reasonCode,
        browserFallbackUsed: entry.browserFallbackUsed,
        inRankedPlan: entry.inRankedPlan,
        handlerEntered: entry.handlerEntered,
      },
    });
  }

  markAccepted(
    url: string,
    options?: { browserFallbackUsed?: boolean },
  ): void {
    this.terminalize(url, "accepted", "accepted", {
      browserFallbackUsed: options?.browserFallbackUsed,
      state: "accepted",
    });
  }

  markRejected(
    url: string,
    reasonCode: string,
    options?: { statusCode?: number; browserFallbackUsed?: boolean },
  ): void {
    this.terminalize(url, "rejected", reasonCode, {
      statusCode: options?.statusCode,
      browserFallbackUsed: options?.browserFallbackUsed,
      state: "rejected",
    });
  }

  markRequestFailed(url: string, reasonCode: string): void {
    this.terminalize(url, "request_failed", reasonCode, {
      state: "request_failed",
    });
  }

  markRedirected(url: string, reasonCode = "REDIRECT"): void {
    this.terminalize(url, "redirected", reasonCode, { state: "redirected" });
  }

  markSkippedBeforeFetch(url: string, reasonCode: string): void {
    this.terminalize(url, "skipped_before_fetch", reasonCode, {
      state: "skipped_before_fetch",
    });
  }

  markPlaywrightPending(url: string, reasonCode: string): void {
    const entry = this.ensure(url);
    if (entry.terminalOutcome) return;
    entry.lastState = "playwright_pending";
    entry.reasonCode = reasonCode;
    entry.browserFallbackUsed = true;
  }

  markPlaywrightStarted(url: string): void {
    const entry = this.ensure(url);
    entry.browserFallbackUsed = true;
    // Cheerio already counted this URL as handlerEntered; PW is a second
    // phase on the same candidate, not a second requestHandlersEntered.
    if (!entry.handlerEntered) {
      entry.handlerEntered = true;
      entry.networkStarted = true;
    }
    if (!entry.playwrightStarted) {
      entry.playwrightStarted = true;
      this.playwrightProcessed += 1;
    }
    if (!TERMINAL_STATES.has(entry.lastState)) {
      entry.lastState = "playwright_started";
    }
  }

  /**
   * Terminalize every still-pending Playwright candidate after the PW phase
   * (or when PW is skipped / unavailable / over budget).
   */
  finalizePlaywrightPending(reasonCode: string): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (entry.lastState !== "playwright_pending" || entry.terminalOutcome) {
        continue;
      }
      this.markRejected(entry.url, reasonCode, { browserFallbackUsed: true });
      count += 1;
    }
    return count;
  }

  listHandlerEnteredNonTerminal(): FetchLifecycleEntry[] {
    return [...this.entries.values()].filter(
      (entry) => entry.handlerEntered && !entry.terminalOutcome,
    );
  }

  summary(): FetchLifecycleSummary {
    const terminalReasons: Record<string, number> = {};
    let requestHandlersEntered = 0;
    let terminalHandlerCandidates = 0;
    let networkRequestsStarted = 0;
    let responsesReceived = 0;
    let redirectsReceived = 0;
    let cheerioExtractedCompleted = 0;
    let playwrightPending = 0;
    let pagesAccepted = 0;
    let pagesRejected = 0;
    let requestFailures = 0;
    let skippedBeforeFetch = 0;
    let terminalCandidates = 0;
    let nonTerminalCandidates = 0;
    let rankedHandlersEntered = 0;
    let rankedSkippedBeforeFetch = 0;

    for (const entry of this.entries.values()) {
      if (entry.handlerEntered) {
        requestHandlersEntered += 1;
        if (entry.inRankedPlan) rankedHandlersEntered += 1;
        if (entry.terminalOutcome) terminalHandlerCandidates += 1;
      }
      if (entry.networkStarted) networkRequestsStarted += 1;
      if (entry.responseReceived) responsesReceived += 1;
      if (entry.cheerioExtracted) cheerioExtractedCompleted += 1;
      if (entry.lastState === "playwright_pending" && !entry.terminalOutcome) {
        playwrightPending += 1;
      }
      if (entry.terminalOutcome) {
        terminalCandidates += 1;
        const reason = entry.reasonCode ?? entry.terminalOutcome;
        terminalReasons[reason] = (terminalReasons[reason] ?? 0) + 1;
        if (entry.terminalOutcome === "accepted") pagesAccepted += 1;
        else if (entry.terminalOutcome === "rejected") pagesRejected += 1;
        else if (entry.terminalOutcome === "request_failed") {
          requestFailures += 1;
        } else if (entry.terminalOutcome === "redirected") {
          redirectsReceived += 1;
        } else if (entry.terminalOutcome === "skipped_before_fetch") {
          skippedBeforeFetch += 1;
          if (entry.inRankedPlan) rankedSkippedBeforeFetch += 1;
        }
      } else {
        nonTerminalCandidates += 1;
      }
    }

    return {
      rankedCandidatesSelected: this.rankedCandidatesSelected,
      rankedHandlersEntered,
      rankedSkippedBeforeFetch,
      requestHandlersEntered,
      terminalHandlerCandidates,
      networkRequestsStarted,
      responsesReceived,
      redirectsReceived,
      cheerioExtractedCompleted,
      playwrightPending,
      playwrightProcessed: this.playwrightProcessed,
      pagesAccepted,
      pagesRejected,
      requestFailures,
      skippedBeforeFetch,
      terminalCandidates,
      nonTerminalCandidates,
      terminalReasons,
      fetchesAttempted: requestHandlersEntered,
    };
  }

  /**
   * Hard invariants before synthesis:
   *   playwrightPending === 0
   *   terminalHandlerCandidates === requestHandlersEntered
   *
   * Ranked-plan identity (separate; fails if ranked URLs are lost):
   *   rankedCandidatesSelected
   *     === rankedHandlersEntered + rankedSkippedBeforeFetch
   */
  assertCompleteOrThrow(): FetchLifecycleSummary {
    this.finalizePlaywrightPending("PLAYWRIGHT_FALLBACK_SKIPPED");

    // Ranked/queued candidates that never entered a handler are explicit skips.
    // These must NOT be mixed into the handler-terminal invariant.
    for (const entry of this.entries.values()) {
      if (entry.handlerEntered || entry.terminalOutcome) continue;
      this.markSkippedBeforeFetch(entry.url, "FETCH_NOT_STARTED");
    }

    const summary = this.summary();
    const open = this.listHandlerEnteredNonTerminal();

    logDeepScrapeEvent("deep_scrape_fetch_lifecycle_finalized", {
      organizationId: this.meta.organizationId,
      jobId: this.meta.jobId,
      sourceType: this.meta.sourceType,
      domain: this.meta.domain,
      diagnostic: {
        ...summary,
        hardInvariants: {
          playwrightPendingIsZero: summary.playwrightPending === 0,
          terminalHandlersMatchHandlersEntered:
            summary.terminalHandlerCandidates ===
            summary.requestHandlersEntered,
        },
        rankedPlanIdentity: {
          rankedCandidatesSelected: summary.rankedCandidatesSelected,
          rankedHandlersEntered: summary.rankedHandlersEntered,
          rankedSkippedBeforeFetch: summary.rankedSkippedBeforeFetch,
          holds:
            summary.rankedCandidatesSelected ===
            summary.rankedHandlersEntered + summary.rankedSkippedBeforeFetch,
        },
      },
    });

    if (summary.playwrightPending > 0 || open.length > 0) {
      logDeepScrapeEvent("deep_scrape_fetch_lifecycle_failed", {
        organizationId: this.meta.organizationId,
        jobId: this.meta.jobId,
        sourceType: this.meta.sourceType,
        domain: this.meta.domain,
        failureCode: "DEEP_SCRAPE_FETCH_LIFECYCLE_INCOMPLETE",
        diagnostic: {
          ...summary,
          missingPaths: open.slice(0, 40).map((entry) => ({
            path: entry.path,
            lastState: entry.lastState,
            reasonCode: entry.reasonCode,
            handlerEntered: entry.handlerEntered,
            inRankedPlan: entry.inRankedPlan,
          })),
        },
      });
      throw new Error("DEEP_SCRAPE_FETCH_LIFECYCLE_INCOMPLETE");
    }

    if (
      summary.terminalHandlerCandidates !== summary.requestHandlersEntered
    ) {
      logDeepScrapeEvent("deep_scrape_fetch_lifecycle_failed", {
        organizationId: this.meta.organizationId,
        jobId: this.meta.jobId,
        sourceType: this.meta.sourceType,
        domain: this.meta.domain,
        failureCode: "DEEP_SCRAPE_FETCH_ACCOUNTING_MISMATCH",
        diagnostic: {
          ...summary,
          equation:
            "terminalHandlerCandidates === requestHandlersEntered",
        },
      });
      throw new Error("DEEP_SCRAPE_FETCH_ACCOUNTING_MISMATCH");
    }

    if (
      summary.rankedCandidatesSelected !==
      summary.rankedHandlersEntered + summary.rankedSkippedBeforeFetch
    ) {
      logDeepScrapeEvent("deep_scrape_fetch_lifecycle_failed", {
        organizationId: this.meta.organizationId,
        jobId: this.meta.jobId,
        sourceType: this.meta.sourceType,
        domain: this.meta.domain,
        failureCode: "DEEP_SCRAPE_FETCH_ACCOUNTING_MISMATCH",
        diagnostic: {
          ...summary,
          equation:
            "rankedCandidatesSelected === rankedHandlersEntered + rankedSkippedBeforeFetch",
        },
      });
      throw new Error("DEEP_SCRAPE_FETCH_ACCOUNTING_MISMATCH");
    }

    return summary;
  }
}
