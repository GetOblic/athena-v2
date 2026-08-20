/**
 * Durable Social Calendar generation job types (V29 L1).
 * Independent of athena_generation_jobs, Ads, SEO, Estimate, and deep scrape jobs.
 */

export const SOCIAL_CALENDAR_GENERATION_JOB_STATUSES = [
  "queued",
  "processing",
  "completed",
  "failed",
  "retryable",
] as const;

export type SocialCalendarGenerationJobStatus =
  (typeof SOCIAL_CALENDAR_GENERATION_JOB_STATUSES)[number];

/** Matches Ads/SEO/Estimate durable job retry backoff defaults. */
export const SOCIAL_CALENDAR_GENERATION_JOB_RETRY_BACKOFF_MS = [
  30_000, 120_000,
] as const;

/** App-side bounds for job error_metadata.failures (error_message is already left(..., 1000)). */
export const SOCIAL_CALENDAR_ERROR_METADATA_FAILURES_MAX = 48;
export const SOCIAL_CALENDAR_ERROR_METADATA_FAILURE_MAX_CHARS = 1000;

export type AthenaSocialCalendarGenerationJob = {
  id: string;
  organization_id: string;
  calendar_id: string;
  status: SocialCalendarGenerationJobStatus;
  generation_stage: string | null;
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

export function isActiveSocialCalendarGenerationJobStatus(
  status: string,
): boolean {
  return (
    status === "queued" || status === "processing" || status === "retryable"
  );
}

export function mapSocialCalendarGenerationJobRow(
  row: Record<string, unknown>,
): AthenaSocialCalendarGenerationJob {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    calendar_id: String(row.calendar_id),
    status: row.status as SocialCalendarGenerationJobStatus,
    generation_stage: (row.generation_stage as string | null) ?? null,
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

/** RPC names — contracts for later worker/service wiring (not implemented in L1). */
export const SOCIAL_CALENDAR_GENERATION_JOB_RPCS = {
  claim: "claim_athena_social_calendar_generation_job",
  heartbeat: "heartbeat_athena_social_calendar_generation_job",
  complete: "complete_athena_social_calendar_generation_job",
  fail: "fail_athena_social_calendar_generation_job",
} as const;
