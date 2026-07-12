export const ATHENA_GENERATION_TRIGGER_TYPES = [
  "manual_refresh",
  "discussion_import",
  "discussion_update",
] as const;

export type AthenaGenerationTriggerType =
  (typeof ATHENA_GENERATION_TRIGGER_TYPES)[number];

export const ATHENA_GENERATION_JOB_STATUSES = [
  "queued",
  "processing",
  "completed",
  "failed",
  "retryable",
] as const;

export type AthenaGenerationJobStatus =
  (typeof ATHENA_GENERATION_JOB_STATUSES)[number];

export const ATHENA_GENERATION_STAGES = [
  "queued",
  "preparing",
  "discussion_analysis",
  "opportunity",
  "executive_briefing",
  "deployment_assets",
  "strategic_blueprint",
  "executive_version",
  "completed",
] as const;

export type AthenaGenerationStage = (typeof ATHENA_GENERATION_STAGES)[number];

export type AthenaGenerationJob = {
  id: string;
  organization_id: string;
  discussion_id: string;
  discussion_update_id: string | null;
  trigger_type: AthenaGenerationTriggerType;
  requested_by: string | null;
  status: AthenaGenerationJobStatus;
  current_stage: string | null;
  progress: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
  regeneration_run_id: string | null;
  analysis_id: string | null;
  opportunity_id: string | null;
  review_id: string | null;
  blueprint_id: string | null;
  executive_version_id: string | null;
  published_version_id: string | null;
  error_code: string | null;
  error_message: string | null;
  error_metadata: Record<string, unknown> | null;
  claimed_by: string | null;
  claim_token: string | null;
  claimed_at: string | null;
  claim_expires_at: string | null;
  heartbeat_at: string | null;
  next_attempt_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Default lease duration for an active claim (seconds). */
export const GENERATION_JOB_LEASE_SECONDS = 120;

/** Heartbeat interval while processing (ms). */
export const GENERATION_JOB_HEARTBEAT_MS = 20_000;

/** Idle poll interval when the queue is empty (ms). */
export const GENERATION_WORKER_IDLE_POLL_MS = 3_000;

/** Bounded grace period on SIGTERM while finishing current job (ms). */
export const GENERATION_WORKER_SHUTDOWN_GRACE_MS = 90_000;

export const GENERATION_JOB_MAX_ATTEMPTS = 3;

/** Backoff delays after attempt N fails (before next claim). */
export const GENERATION_JOB_RETRY_BACKOFF_MS = [
  30_000, // after attempt 1
  120_000, // after attempt 2
] as const;
