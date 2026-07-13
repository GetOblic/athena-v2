/**
 * Structured Prospect generation diagnostics — production-safe, no PII payloads.
 */

export type ProspectGenerationLogEvent =
  | "prospect_generation_started"
  | "website_discovery_started"
  | "website_discovery_completed"
  | "website_pages_selected"
  | "website_page_fetch_failed"
  | "website_learning_completed"
  | "stored_website_intelligence_loaded"
  | "website_learning_skipped"
  | "analysis_generation_started"
  | "analysis_generation_completed"
  | "deployment_generation_started"
  | "deployment_generation_completed"
  | "deployment_parse_completed"
  | "deployment_parse_incomplete"
  | "blueprint_generation_started"
  | "blueprint_generation_completed"
  | "executive_version_persist_started"
  | "executive_version_persist_completed"
  | "current_version_publish_started"
  | "current_version_publish_completed"
  | "prospect_generation_failed"
  | "prospect_generation_completed"
  | "prior_website_intelligence_preserved";

export type ProspectGenerationLogContext = {
  jobId?: string | null;
  prospectId?: string | null;
  discussionId?: string | null;
  organizationId?: string | null;
  triggerType?: string | null;
  regenerationRunId?: string | null;
  stage?: string | null;
  durationMs?: number | null;
  pagesSelected?: number | null;
  pagesFetched?: number | null;
  pagesFailed?: number | null;
  pagesAnalyzed?: number | null;
  mergedKnowledgeChars?: number | null;
  rawOutputChars?: number | null;
  parsedAssetKeys?: string[] | null;
  missingRequiredAssetKeys?: string[] | null;
  executiveVersionId?: string | null;
  retryable?: boolean | null;
  errorMessage?: string | null;
  crawlPartial?: boolean | null;
  crawlTimeout?: boolean | null;
  skipReason?: string | null;
};

function boundedKeys(keys: string[] | null | undefined): string[] | undefined {
  if (!keys) return undefined;
  return keys.slice(0, 40);
}

export function logProspectGenerationEvent(
  event: ProspectGenerationLogEvent,
  context: ProspectGenerationLogContext = {},
): void {
  const payload = {
    event,
    jobId: context.jobId ?? undefined,
    prospectId: context.prospectId ?? undefined,
    discussionId: context.discussionId ?? undefined,
    organizationId: context.organizationId ?? undefined,
    triggerType: context.triggerType ?? undefined,
    regenerationRunId: context.regenerationRunId ?? undefined,
    stage: context.stage ?? undefined,
    durationMs: context.durationMs ?? undefined,
    pagesSelected: context.pagesSelected ?? undefined,
    pagesFetched: context.pagesFetched ?? undefined,
    pagesFailed: context.pagesFailed ?? undefined,
    pagesAnalyzed: context.pagesAnalyzed ?? undefined,
    mergedKnowledgeChars: context.mergedKnowledgeChars ?? undefined,
    rawOutputChars: context.rawOutputChars ?? undefined,
    parsedAssetKeys: boundedKeys(context.parsedAssetKeys),
    missingRequiredAssetKeys: boundedKeys(context.missingRequiredAssetKeys),
    executiveVersionId: context.executiveVersionId ?? undefined,
    retryable: context.retryable ?? undefined,
    errorMessage: context.errorMessage
      ? String(context.errorMessage).slice(0, 400)
      : undefined,
    crawlPartial: context.crawlPartial ?? undefined,
    crawlTimeout: context.crawlTimeout ?? undefined,
    skipReason: context.skipReason ?? undefined,
  };

  console.log(
    `[ATHENA_PROSPECT_GEN] ${event}`,
    JSON.stringify(payload),
  );
}
