/**
 * Explicit candidate lifecycle outcomes for Deep Scrape crawls.
 * Every network-attempted URL must terminate as accepted or rejected.
 */

import { canonicalizePageUrl } from "@/services/websiteLearning/deepScrape/urlSafety";

export const DEEP_SCRAPE_CANDIDATE_ACCOUNTING_MISMATCH =
  "DEEP_SCRAPE_CANDIDATE_ACCOUNTING_MISMATCH";

export const DEEP_SCRAPE_REJECTION_REASONS = [
  "REQUEST_FAILED",
  "REQUEST_RETRY_EXHAUSTED",
  "REQUEST_QUEUE_DEDUPLICATED",
  "REDIRECTED_SAME_ORIGIN",
  "REDIRECTED_OFF_ORIGIN",
  "REDIRECT_LOOP",
  "REDIRECT_MISSING_LOCATION",
  "HTTP_STATUS_REJECTED",
  "NON_HTML_CONTENT",
  "EMPTY_RESPONSE",
  "ROBOTS_OR_ACCESS_BLOCKED",
  "URL_POLICY_REJECTED",
  "EXTRACTION_EMPTY",
  "EXTRACTION_TOO_WEAK",
  "SUSPECTED_TEMPLATE_EXTRACTION",
  "DUPLICATE_FINAL_URL",
  "DUPLICATE_CANONICAL",
  "DUPLICATE_CONTENT",
  "LOW_INFORMATION_PAGE",
  "UNSUPPORTED_PAGE",
  "ACCEPTANCE_CAP_REACHED",
  "RESPONSE_TOO_LARGE",
  "PLAYWRIGHT_FALLBACK_FAILED",
  "PLAYWRIGHT_FALLBACK_SKIPPED",
  "PLAYWRIGHT_CHROMIUM_UNAVAILABLE",
  "CROSS_DOMAIN_REJECTED",
  "PRIVATE_IP_REJECTED",
  "UNKNOWN_TERMINAL_PATH",
] as const;

export type DeepScrapeRejectionReason =
  (typeof DEEP_SCRAPE_REJECTION_REASONS)[number];

export type DeepScrapeCandidateOutcome =
  | {
      status: "accepted";
      normalizedUrl: string;
      finalUrl: string;
      pageType?: string;
      extractionMethod?: string;
      contentChars: number;
    }
  | {
      status: "rejected";
      normalizedUrl: string;
      finalUrl?: string;
      reason: DeepScrapeRejectionReason;
      diagnostic?: Record<string, unknown>;
    }
  | {
      status: "pending_playwright";
      normalizedUrl: string;
      finalUrl: string;
      cheerioRejectionCode?: string | null;
      diagnostic?: Record<string, unknown>;
    };

export type CandidateAccountingSnapshot = {
  candidatesDiscovered: number;
  candidatesQueued: number;
  candidatesDeduplicatedBeforeFetch: number;
  networkRequestsAttempted: number;
  requestFailures: number;
  pagesExtracted: number;
  pagesAccepted: number;
  pagesRejected: number;
  pagesRejectedByReason: Record<string, number>;
  pendingPlaywrightCount: number;
};

export class CandidateAccountingError extends Error {
  readonly code = DEEP_SCRAPE_CANDIDATE_ACCOUNTING_MISMATCH;
  readonly retryable = false;
  readonly diagnostic: Record<string, unknown>;

  constructor(message: string, diagnostic: Record<string, unknown> = {}) {
    super(message);
    this.name = "CandidateAccountingError";
    this.diagnostic = diagnostic;
  }
}

export function normalizeCandidateUrl(url: string): string | null {
  return canonicalizePageUrl(url);
}

export function mapClassifierRejectionToReason(
  code: string | null | undefined,
): DeepScrapeRejectionReason {
  switch (String(code ?? "").toUpperCase()) {
    case "PAGE_DUPLICATE":
      return "DUPLICATE_CONTENT";
    case "CHEERIO_SUSPECTED_TEMPLATE_EXTRACTION":
      return "SUSPECTED_TEMPLATE_EXTRACTION";
    case "PAGE_NO_USABLE_TEXT":
    case "PAGE_EMPTY":
      return "EXTRACTION_EMPTY";
    case "PAGE_NAVIGATION_ONLY":
      return "LOW_INFORMATION_PAGE";
    case "PAGE_ACCESS_DENIED":
    case "ROBOTS_DENIED":
      return "ROBOTS_OR_ACCESS_BLOCKED";
    case "UNSUPPORTED_CONTENT_TYPE":
      return "NON_HTML_CONTENT";
    case "RESPONSE_TOO_LARGE":
      return "RESPONSE_TOO_LARGE";
    default:
      if (!code) return "UNKNOWN_TERMINAL_PATH";
      if (/^HTTP_/.test(code)) return "HTTP_STATUS_REJECTED";
      return "UNSUPPORTED_PAGE";
  }
}

export function mapDuplicateBasisToReason(
  basis: string | null | undefined,
): DeepScrapeRejectionReason {
  switch (basis) {
    case "final_url":
      return "DUPLICATE_FINAL_URL";
    case "canonical_url":
      return "DUPLICATE_CANONICAL";
    case "meaningful_content_hash":
    case "near_duplicate":
      return "DUPLICATE_CONTENT";
    default:
      return "DUPLICATE_CONTENT";
  }
}

export class CandidateAccountingLedger {
  private readonly discovered = new Set<string>();
  private readonly queued = new Set<string>();
  private readonly networkAttempted = new Set<string>();
  private readonly outcomes = new Map<string, DeepScrapeCandidateOutcome>();
  private deduplicatedBeforeFetch = 0;
  private requestFailures = 0;
  private pagesExtracted = 0;

  markDiscovered(url: string): string | null {
    const normalized = normalizeCandidateUrl(url);
    if (!normalized) return null;
    this.discovered.add(normalized);
    return normalized;
  }

  markQueued(url: string): { normalized: string; deduplicated: boolean } | null {
    const normalized = normalizeCandidateUrl(url);
    if (!normalized) return null;
    this.discovered.add(normalized);
    if (this.queued.has(normalized)) {
      this.deduplicatedBeforeFetch += 1;
      return { normalized, deduplicated: true };
    }
    this.queued.add(normalized);
    return { normalized, deduplicated: false };
  }

  markRequestStarted(url: string): string | null {
    const normalized = normalizeCandidateUrl(url);
    if (!normalized) return null;
    this.discovered.add(normalized);
    this.queued.add(normalized);
    this.networkAttempted.add(normalized);
    return normalized;
  }

  markExtracted(url: string): void {
    const normalized = normalizeCandidateUrl(url);
    if (!normalized) return;
    this.pagesExtracted += 1;
  }

  markAccepted(input: {
    url: string;
    finalUrl: string;
    pageType?: string;
    extractionMethod?: string;
    contentChars: number;
  }): void {
    const normalized = normalizeCandidateUrl(input.url);
    if (!normalized) return;
    this.networkAttempted.add(normalized);
    this.outcomes.set(normalized, {
      status: "accepted",
      normalizedUrl: normalized,
      finalUrl: input.finalUrl,
      pageType: input.pageType,
      extractionMethod: input.extractionMethod,
      contentChars: input.contentChars,
    });
  }

  markRejected(input: {
    url: string;
    finalUrl?: string;
    reason: DeepScrapeRejectionReason;
    diagnostic?: Record<string, unknown>;
    isRequestFailure?: boolean;
  }): void {
    const normalized = normalizeCandidateUrl(input.url);
    if (!normalized) return;
    if (this.networkAttempted.has(normalized) || input.isRequestFailure) {
      this.networkAttempted.add(normalized);
    }
    if (input.isRequestFailure) {
      this.requestFailures += 1;
    }
    // Do not overwrite an accepted outcome.
    const prior = this.outcomes.get(normalized);
    if (prior?.status === "accepted") return;
    this.outcomes.set(normalized, {
      status: "rejected",
      normalizedUrl: normalized,
      finalUrl: input.finalUrl,
      reason: input.reason,
      diagnostic: input.diagnostic,
    });
  }

  markPendingPlaywright(input: {
    url: string;
    finalUrl: string;
    cheerioRejectionCode?: string | null;
    diagnostic?: Record<string, unknown>;
  }): void {
    const normalized = normalizeCandidateUrl(input.url);
    if (!normalized) return;
    this.networkAttempted.add(normalized);
    const prior = this.outcomes.get(normalized);
    if (prior?.status === "accepted" || prior?.status === "rejected") return;
    this.outcomes.set(normalized, {
      status: "pending_playwright",
      normalizedUrl: normalized,
      finalUrl: input.finalUrl,
      cheerioRejectionCode: input.cheerioRejectionCode,
      diagnostic: input.diagnostic,
    });
  }

  /** Resolve every still-pending Playwright candidate as rejected. */
  rejectAllPendingPlaywright(
    reason: DeepScrapeRejectionReason,
    diagnostic?: Record<string, unknown>,
  ): number {
    let count = 0;
    for (const [url, outcome] of this.outcomes) {
      if (outcome.status !== "pending_playwright") continue;
      this.outcomes.set(url, {
        status: "rejected",
        normalizedUrl: url,
        finalUrl: outcome.finalUrl,
        reason,
        diagnostic: {
          ...(outcome.diagnostic ?? {}),
          ...(diagnostic ?? {}),
          cheerioRejectionCode: outcome.cheerioRejectionCode ?? null,
        },
      });
      count += 1;
    }
    return count;
  }

  listPendingPlaywrightUrls(): string[] {
    return [...this.outcomes.values()]
      .filter((outcome) => outcome.status === "pending_playwright")
      .map((outcome) =>
        outcome.status === "pending_playwright" ? outcome.finalUrl : "",
      )
      .filter(Boolean);
  }

  snapshot(): CandidateAccountingSnapshot {
    const pagesRejectedByReason: Record<string, number> = {};
    let pagesAccepted = 0;
    let pagesRejected = 0;
    let pendingPlaywrightCount = 0;
    for (const outcome of this.outcomes.values()) {
      if (outcome.status === "accepted") {
        pagesAccepted += 1;
      } else if (outcome.status === "rejected") {
        pagesRejected += 1;
        pagesRejectedByReason[outcome.reason] =
          (pagesRejectedByReason[outcome.reason] ?? 0) + 1;
      } else if (outcome.status === "pending_playwright") {
        pendingPlaywrightCount += 1;
      }
    }
    return {
      candidatesDiscovered: this.discovered.size,
      candidatesQueued: this.queued.size,
      candidatesDeduplicatedBeforeFetch: this.deduplicatedBeforeFetch,
      networkRequestsAttempted: this.networkAttempted.size,
      requestFailures: this.requestFailures,
      pagesExtracted: this.pagesExtracted,
      pagesAccepted,
      pagesRejected,
      pagesRejectedByReason,
      pendingPlaywrightCount,
    };
  }

  /**
   * Fail-closed: every network-attempted URL must be accepted or rejected.
   * Pending Playwright is not a terminal outcome.
   */
  verifyOrThrow(): CandidateAccountingSnapshot {
    const unresolved: string[] = [];
    for (const url of this.networkAttempted) {
      const outcome = this.outcomes.get(url);
      if (!outcome) {
        unresolved.push(url);
        continue;
      }
      if (outcome.status === "pending_playwright") {
        unresolved.push(url);
      }
    }

    const snapshot = this.snapshot();
    const terminal =
      snapshot.pagesAccepted + snapshot.pagesRejected;
    if (
      unresolved.length > 0 ||
      terminal !== snapshot.networkRequestsAttempted
    ) {
      throw new CandidateAccountingError(
        "Deep scrape candidate accounting did not balance",
        {
          ...snapshot,
          unresolvedCount: unresolved.length,
          unresolvedSample: unresolved.slice(0, 12).map((url) => {
            try {
              return new URL(url).pathname;
            } catch {
              return url;
            }
          }),
          terminalAcceptedPlusRejected: terminal,
        },
      );
    }
    return snapshot;
  }
}
