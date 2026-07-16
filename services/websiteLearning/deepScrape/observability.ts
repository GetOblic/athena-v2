/**
 * Structured Deep Scrape observability — never logs page bodies.
 */

export type DeepScrapeEventName =
  | "deep_scrape_started"
  | "sitemap_found"
  | "sitemap_fallback_to_homepage"
  | "homepage_only_crawl_selected"
  | "deep_scrape_discovery_diagnostic"
  | "deep_scrape_url_safety_diagnostic"
  | "crawlee_job_started"
  | "crawlee_request_enqueued"
  | "cheerio_page_processed"
  | "playwright_fallback_started"
  | "playwright_page_processed"
  | "playwright_extraction_recovered"
  | "readability_extraction_completed"
  | "extraction_method_selected"
  | "shared_template_detected"
  | "boilerplate_removed"
  | "cheerio_extraction_suspect"
  | "duplicate_detected"
  | "corpus_quality_failed"
  | "analysis_contract_normalized"
  | "analysis_contract_rejected"
  | "knowledge_base_deep_context_used"
  | "page_accepted"
  | "page_rejected"
  | "crawlee_job_completed"
  | "crawlee_job_failed"
  | "page_crawled"
  | "page_failed"
  | "crawl_completed"
  | "deep_intelligence_promoted"
  | "brain_retraining_started"
  | "brain_retraining_completed"
  | "prospect_generation_started"
  | "executive_version_published"
  | "deep_scrape_failed"
  | "deep_scrape_job_claimed"
  | "deep_scrape_heartbeat_started"
  | "deep_scrape_heartbeat_succeeded"
  | "deep_scrape_heartbeat_failed"
  | "deep_scrape_heartbeat_stopped"
  | "deep_scrape_stage_transition"
  | "deep_scrape_stage_transition_rejected"
  | "deep_scrape_checkpoint_reused"
  | "deep_scrape_synthesis_started"
  | "deep_scrape_synthesis_completed"
  | "deep_scrape_follow_on_reused"
  | "deep_scrape_job_completed"
  | "deep_scrape_job_failed"
  | "deep_scrape_candidate_scored"
  | "deep_scrape_candidate_priority_upgraded"
  | "deep_scrape_navigation_extracted"
  | "deep_scrape_priority_queue_finalized"
  | "deep_scrape_page_cap_candidate_skipped"
  | "deep_scrape_homepage_discovery_started"
  | "deep_scrape_homepage_discovery_completed"
  | "deep_scrape_navigation_inventory_collected"
  | "deep_scrape_candidate_inventory_finalized"
  | "deep_scrape_ranked_plan_finalized"
  | "deep_scrape_ranked_candidate_excluded"
  | "deep_scrape_ranked_fetch_started"
  | "deep_scrape_ranked_fetch_completed"
  | "deep_scrape_discovery_inventory_candidate_skipped"
  | "deep_scrape_candidate_terminalized"
  | "deep_scrape_fetch_lifecycle_finalized"
  | "deep_scrape_fetch_lifecycle_failed";

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
