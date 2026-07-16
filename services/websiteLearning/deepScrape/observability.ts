/**
 * Structured Deep Scrape observability — never logs page bodies.
 */

export type DeepScrapeEventName =
  | "deep_scrape_started"
  | "sitemap_found"
  | "sitemap_fallback_to_homepage"
  | "homepage_only_crawl_selected"
  | "deep_scrape_discovery_diagnostic"
  | "page_crawled"
  | "page_failed"
  | "crawl_completed"
  | "deep_intelligence_promoted"
  | "brain_retraining_started"
  | "brain_retraining_completed"
  | "prospect_generation_started"
  | "executive_version_published"
  | "deep_scrape_failed";

export type DeepScrapeEventMeta = {
  organizationId?: string | null;
  jobId?: string | null;
  sourceType?: "brain" | "prospect" | null;
  identityId?: string | null;
  prospectId?: string | null;
  discussionId?: string | null;
  domain?: string | null;
  rootUrl?: string | null;
  pagesDiscovered?: number;
  pagesCrawled?: number;
  pagesAnalyzed?: number;
  elapsedMs?: number;
  failureCode?: string | null;
  executiveVersionId?: string | null;
  followOnJobId?: string | null;
  pageType?: string | null;
  stage?: string | null;
  /** Structured diagnostic metadata only — never HTML/text bodies. */
  diagnostic?: Record<string, unknown> | null;
};

export function logDeepScrapeEvent(
  event: DeepScrapeEventName,
  meta: DeepScrapeEventMeta = {},
): void {
  console.log(`[ATHENA_DEEP_SCRAPE] ${event}`, {
    event,
    organizationId: meta.organizationId ?? null,
    jobId: meta.jobId ?? null,
    sourceType: meta.sourceType ?? null,
    identityId: meta.identityId ?? null,
    prospectId: meta.prospectId ?? null,
    discussionId: meta.discussionId ?? null,
    domain: meta.domain ?? null,
    rootUrl: meta.rootUrl ?? null,
    pagesDiscovered: meta.pagesDiscovered ?? null,
    pagesCrawled: meta.pagesCrawled ?? null,
    pagesAnalyzed: meta.pagesAnalyzed ?? null,
    elapsedMs: meta.elapsedMs ?? null,
    failureCode: meta.failureCode ?? null,
    executiveVersionId: meta.executiveVersionId ?? null,
    followOnJobId: meta.followOnJobId ?? null,
    pageType: meta.pageType ?? null,
    stage: meta.stage ?? null,
    diagnostic: meta.diagnostic ?? null,
  });
}
