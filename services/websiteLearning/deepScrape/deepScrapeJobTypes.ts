import {
  DEEP_SCRAPE_PERSISTED_STAGES,
  type DeepScrapePersistedStage,
} from "@/services/websiteLearning/deepScrape/deepScrapeStages";

export const DEEP_SCRAPE_SOURCE_TYPES = ["brain", "prospect"] as const;
export type DeepScrapeSourceType = (typeof DEEP_SCRAPE_SOURCE_TYPES)[number];

export const DEEP_SCRAPE_JOB_STATUSES = [
  "queued",
  "processing",
  "awaiting_follow_on",
  "completed",
  "failed",
  "retryable",
] as const;
export type DeepScrapeJobStatus = (typeof DEEP_SCRAPE_JOB_STATUSES)[number];

/** Alias of the authoritative persisted stage union (matches DB constraint). */
export const DEEP_SCRAPE_STAGES = DEEP_SCRAPE_PERSISTED_STAGES;
export type DeepScrapeStage = DeepScrapePersistedStage;

export type AthenaWebsiteDeepScrapeJob = {
  id: string;
  organization_id: string;
  source_type: DeepScrapeSourceType;
  identity_id: string | null;
  prospect_id: string | null;
  discussion_id: string | null;
  root_url: string;
  normalized_domain: string;
  status: DeepScrapeJobStatus;
  current_stage: string;
  progress: Record<string, unknown>;
  crawl_result: Record<string, unknown> | null;
  crawl_summary: Record<string, unknown> | null;
  pages_discovered: number;
  pages_crawled: number;
  pages_analyzed: number;
  promoted_at: string | null;
  follow_on_generation_job_id: string | null;
  result_executive_version_id: string | null;
  brain_retrained_at: string | null;
  attempt_count: number;
  max_attempts: number;
  claimed_by: string | null;
  claim_token: string | null;
  claimed_at: string | null;
  claim_expires_at: string | null;
  heartbeat_at: string | null;
  next_attempt_at: string | null;
  error_code: string | null;
  error_message: string | null;
  error_metadata: Record<string, unknown> | null;
  requested_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export function mapDeepScrapeJobRow(
  row: Record<string, unknown>,
): AthenaWebsiteDeepScrapeJob {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    source_type: row.source_type as DeepScrapeSourceType,
    identity_id: (row.identity_id as string | null) ?? null,
    prospect_id: (row.prospect_id as string | null) ?? null,
    discussion_id: (row.discussion_id as string | null) ?? null,
    root_url: String(row.root_url ?? ""),
    normalized_domain: String(row.normalized_domain ?? ""),
    status: row.status as DeepScrapeJobStatus,
    current_stage: String(row.current_stage ?? "queued"),
    progress: (row.progress as Record<string, unknown>) ?? {},
    crawl_result: (row.crawl_result as Record<string, unknown> | null) ?? null,
    crawl_summary:
      (row.crawl_summary as Record<string, unknown> | null) ?? null,
    pages_discovered: Number(row.pages_discovered ?? 0),
    pages_crawled: Number(row.pages_crawled ?? 0),
    pages_analyzed: Number(row.pages_analyzed ?? 0),
    promoted_at: (row.promoted_at as string | null) ?? null,
    follow_on_generation_job_id:
      (row.follow_on_generation_job_id as string | null) ?? null,
    result_executive_version_id:
      (row.result_executive_version_id as string | null) ?? null,
    brain_retrained_at: (row.brain_retrained_at as string | null) ?? null,
    attempt_count: Number(row.attempt_count ?? 0),
    max_attempts: Number(row.max_attempts ?? 3),
    claimed_by: (row.claimed_by as string | null) ?? null,
    claim_token: (row.claim_token as string | null) ?? null,
    claimed_at: (row.claimed_at as string | null) ?? null,
    claim_expires_at: (row.claim_expires_at as string | null) ?? null,
    heartbeat_at: (row.heartbeat_at as string | null) ?? null,
    next_attempt_at: (row.next_attempt_at as string | null) ?? null,
    error_code: (row.error_code as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    error_metadata:
      (row.error_metadata as Record<string, unknown> | null) ?? null,
    requested_by: (row.requested_by as string | null) ?? null,
    started_at: (row.started_at as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export function formatDeepScrapeErrorMessage(
  errorCode: string | null | undefined,
  fallback?: string | null,
): string {
  switch (String(errorCode ?? "").toUpperCase()) {
    case "PRIVATE_IP_REJECTED":
      return "The website resolved to a protected network address and could not be crawled safely.";
    case "IP_LITERAL_REJECTED":
      return "IP-address website targets are not allowed for deep scrape.";
    case "ROBOTS_DENIED":
      return "This website does not permit automated crawling.";
    case "ROOT_FETCH_FAILED":
    case "DNS_LOOKUP_FAILED":
    case "FETCH_FAILED":
      return "Athena could not reach the website homepage.";
    case "UNSUPPORTED_CONTENT_TYPE":
    case "PAGE_UNSUPPORTED_CONTENT":
      return "The website did not return readable HTML content.";
    case "NO_USABLE_PAGES":
      return "Athena could not find any readable business pages on this website.";
    case "EMPTY_OR_UNUSABLE_CORPUS":
      return "Athena could not extract usable business content from this website.";
    case "EXTRACTION_COLLAPSED_TO_SHARED_TEMPLATE":
      return "Athena could not separate unique page content from repeated website template text.";
    case "MALFORMED_ANALYSIS_CONTRACT":
      return "Athena could not produce a valid executive analysis for this website.";
    case "EMPTY_OR_THIN_HOMEPAGE":
    case "INSUFFICIENT_USEFUL_CONTENT":
      return "Athena could not extract enough readable business content from this website.";
    case "NO_PERMISSIBLE_CRAWL_TARGETS":
      return "No permissible pages were available to crawl on this website.";
    case "DEEP_SCRAPE_STATE_TRANSITION_INVALID":
      return "Athena stopped this Deep Scrape because its background workflow lost a valid processing state. No further requests will be made until the scrape is restarted.";
    case "BRAIN_DEEP_SCRAPE_PAGE_PARITY_FAILED":
      return "Athena stopped this Deep Scrape because the multi-page website corpus could not be saved consistently to Athena Brain. No further requests will be made until the scrape is restarted.";
    default:
      return (
        fallback?.trim() ||
        "Deep website scrape failed. Please try again later."
      );
  }
}

export function formatDeepScrapeStatusLabel(job: {
  status: string;
  current_stage: string;
  pages_crawled?: number;
  progress?: Record<string, unknown>;
  source_type?: string;
}): string {
  if (job.status === "failed") return "Failed";
  if (job.status === "completed") return "Completed";
  if (job.status === "queued") return "Queued";
  if (job.status === "awaiting_follow_on") {
    return "Generating Executive Intelligence";
  }

  const stage = job.current_stage;
  const crawled =
    typeof job.progress?.pagesCrawled === "number"
      ? job.progress.pagesCrawled
      : (job.pages_crawled ?? 0);
  const target =
    typeof job.progress?.pagesTarget === "number"
      ? job.progress.pagesTarget
      : null;

  const progressPhase =
    typeof job.progress?.phase === "string" ? job.progress.phase : null;
  const isRenderingPhase = progressPhase === "rendering";

  switch (stage) {
    case "discovering":
      return job.source_type === "brain"
        ? "Discovering Website"
        : "Discovering";
    case "crawling": {
      if (isRenderingPhase) {
        const rendered =
          typeof job.progress?.pagesRendered === "number"
            ? job.progress.pagesRendered
            : crawled;
        return target
          ? `Rendering JavaScript page ${rendered} of ${target}`
          : `Rendering JavaScript page ${rendered}`;
      }
      return target
        ? `Crawling ${crawled} of ${target} candidate pages`
        : `Crawling ${crawled} candidate pages`;
    }
    case "synthesizing":
      return job.source_type === "brain"
        ? "Synthesizing Website Intelligence"
        : "Synthesizing";
    case "persisting":
      return "Synthesizing Website Intelligence";
    case "retraining":
      return "Retraining Athena Brain";
    case "regenerating":
      return "Generating Executive Intelligence";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return "Queued";
  }
}
