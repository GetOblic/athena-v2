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
  error_code: string | null;
  error_message: string | null;
  error_metadata: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Jobs older than this while processing are considered stale and recoverable. */
export const STALE_PROCESSING_JOB_MS = 10 * 60 * 1000;
