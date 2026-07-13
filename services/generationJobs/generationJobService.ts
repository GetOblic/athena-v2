import { randomUUID } from "crypto";
import {
  FOLLOW_UP_TRIGGER_RAW_KEY,
  parseFollowUpTrigger,
  preferFollowUpTrigger,
} from "@/lib/generationContinuity";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeClaimRpcResult } from "@/services/generationJobs/generationJobClaimResult";
import {
  GENERATION_JOB_RETRY_BACKOFF_MS,
  type AthenaGenerationJob,
  type AthenaGenerationTriggerType,
} from "@/services/generationJobs/generationJobTypes";
import { getAthenaWorkerConfig } from "@/services/generationJobs/generationJobWorkerConfig";

export function mapGenerationJobRow(
  row: Record<string, unknown>,
): AthenaGenerationJob {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    discussion_id: row.discussion_id as string,
    discussion_update_id: (row.discussion_update_id as string | null) ?? null,
    trigger_type: row.trigger_type as AthenaGenerationTriggerType,
    requested_by: (row.requested_by as string | null) ?? null,
    status: row.status as AthenaGenerationJob["status"],
    current_stage: (row.current_stage as string | null) ?? null,
    progress: (row.progress as Record<string, unknown>) ?? {},
    attempt_count: Number(row.attempt_count ?? 0),
    max_attempts: Number(row.max_attempts ?? getAthenaWorkerConfig().maxAttempts),
    regeneration_run_id: (row.regeneration_run_id as string | null) ?? null,
    analysis_id: (row.analysis_id as string | null) ?? null,
    opportunity_id: (row.opportunity_id as string | null) ?? null,
    review_id: (row.review_id as string | null) ?? null,
    blueprint_id: (row.blueprint_id as string | null) ?? null,
    executive_version_id: (row.executive_version_id as string | null) ?? null,
    published_version_id: (row.published_version_id as string | null) ?? null,
    error_code: (row.error_code as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    error_metadata:
      (row.error_metadata as Record<string, unknown> | null) ?? null,
    claimed_by: (row.claimed_by as string | null) ?? null,
    claim_token: (row.claim_token as string | null) ?? null,
    claimed_at: (row.claimed_at as string | null) ?? null,
    claim_expires_at: (row.claim_expires_at as string | null) ?? null,
    heartbeat_at: (row.heartbeat_at as string | null) ?? null,
    next_attempt_at: (row.next_attempt_at as string | null) ?? null,
    started_at: (row.started_at as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function touch(): string {
  return new Date().toISOString();
}

export class ActiveGenerationJobConflictError extends Error {
  existingJob: AthenaGenerationJob;

  constructor(existingJob: AthenaGenerationJob) {
    super("ACTIVE_JOB_EXISTS");
    this.name = "ActiveGenerationJobConflictError";
    this.existingJob = existingJob;
  }
}

export async function getActiveGenerationJobForDiscussion(
  discussionId: string,
  organizationId: string,
): Promise<AthenaGenerationJob | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_generation_jobs")
    .select("*")
    .eq("discussion_id", discussionId)
    .eq("organization_id", organizationId)
    .in("status", ["queued", "processing", "retryable"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_JOB] Failed to load active job:", {
      discussionId,
      organizationId,
      error: error.message,
    });
    return null;
  }

  return data ? mapGenerationJobRow(data) : null;
}

/** Most recently updated job for a discussion (active or terminal). */
export async function getLatestGenerationJobForDiscussion(
  discussionId: string,
  organizationId: string,
): Promise<AthenaGenerationJob | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_generation_jobs")
    .select("*")
    .eq("discussion_id", discussionId)
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_JOB] Failed to load latest job:", {
      discussionId,
      organizationId,
      error: error.message,
    });
    return null;
  }

  return data ? mapGenerationJobRow(data) : null;
}

export async function getDiscussionPendingGenerationFollowUp(
  discussionId: string,
  organizationId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("discussions")
    .select("pending_generation_follow_up")
    .eq("id", discussionId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_JOB] Failed to read pending follow-up flag:", {
      discussionId,
      error: error.message,
    });
    return false;
  }

  return Boolean(
    (data as { pending_generation_follow_up?: boolean } | null)
      ?.pending_generation_follow_up,
  );
}

export async function getGenerationJobById(
  jobId: string,
  organizationId?: string,
): Promise<AthenaGenerationJob | null> {
  let query = supabaseAdmin
    .from("athena_generation_jobs")
    .select("*")
    .eq("id", jobId);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("[ATHENA_JOB] Failed to load job:", {
      jobId,
      error: error.message,
    });
    return null;
  }

  return data ? mapGenerationJobRow(data) : null;
}

export async function createGenerationJob(input: {
  organizationId: string;
  discussionId: string;
  discussionUpdateId?: string | null;
  triggerType: AthenaGenerationTriggerType;
  requestedBy?: string | null;
  regenerationRunId?: string | null;
}): Promise<AthenaGenerationJob> {
  const now = touch();
  const { data, error } = await supabaseAdmin
    .from("athena_generation_jobs")
    .insert({
      organization_id: input.organizationId,
      discussion_id: input.discussionId,
      discussion_update_id: input.discussionUpdateId ?? null,
      trigger_type: input.triggerType,
      requested_by: input.requestedBy ?? null,
      status: "queued",
      current_stage: "queued",
      progress: {},
      attempt_count: 0,
      max_attempts: getAthenaWorkerConfig().maxAttempts,
      regeneration_run_id: input.regenerationRunId ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const existing = await getActiveGenerationJobForDiscussion(
        input.discussionId,
        input.organizationId,
      );
      if (existing) {
        throw new ActiveGenerationJobConflictError(existing);
      }
    }

    console.error("[ATHENA_JOB] Failed to create job:", {
      discussionId: input.discussionId,
      organizationId: input.organizationId,
      triggerType: input.triggerType,
      error: error.message,
    });
    throw error;
  }

  console.log("[ATHENA_JOB] queued", {
    jobId: data.id,
    organizationId: input.organizationId,
    discussionId: input.discussionId,
    triggerType: input.triggerType,
  });

  return mapGenerationJobRow(data);
}

export async function claimNextGenerationJob(input: {
  workerId: string;
  leaseSeconds?: number;
}): Promise<{ job: AthenaGenerationJob; claimToken: string } | null> {
  const claimToken = randomUUID();
  const { data, error } = await supabaseAdmin.rpc("claim_athena_generation_job", {
    p_worker_id: input.workerId,
    p_claim_token: claimToken,
    p_lease_seconds: input.leaseSeconds ?? getAthenaWorkerConfig().leaseSeconds,
  });

  if (error) {
    console.error("[ATHENA_JOB] claim_attempt_failed", {
      workerId: input.workerId,
      error: error.message,
    });
    throw error;
  }

  const normalized = normalizeClaimRpcResult(
    data,
    mapGenerationJobRow,
    claimToken,
  );

  if (normalized.kind === "empty") {
    return null;
  }

  if (normalized.kind === "invalid") {
    console.error("[ATHENA_JOB] invalid_claim_result", {
      workerId: input.workerId,
      shape: normalized.shape,
      hasId: normalized.hasId,
      reason: normalized.reason,
    });
    return null;
  }

  return { job: normalized.job, claimToken: normalized.claimToken };
}

export async function heartbeatGenerationJob(input: {
  jobId: string;
  claimToken: string;
  leaseSeconds?: number;
  stage?: string | null;
  progress?: Record<string, unknown> | null;
}): Promise<AthenaGenerationJob | null> {
  const { data, error } = await supabaseAdmin.rpc(
    "heartbeat_athena_generation_job",
    {
      p_job_id: input.jobId,
      p_claim_token: input.claimToken,
      p_lease_seconds: input.leaseSeconds ?? getAthenaWorkerConfig().leaseSeconds,
      p_stage: input.stage ?? null,
      p_progress: input.progress ?? null,
    },
  );

  if (error) {
    console.error("[ATHENA_JOB] job_heartbeat_failed", {
      jobId: input.jobId,
      error: error.message,
    });
    return null;
  }

  if (!data) {
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapGenerationJobRow(row as Record<string, unknown>) : null;
}

export async function completeGenerationJobWithClaim(input: {
  jobId: string;
  claimToken: string;
  analysisId?: string | null;
  opportunityId?: string | null;
  reviewId?: string | null;
  blueprintId?: string | null;
  executiveVersionId?: string | null;
  publishedVersionId?: string | null;
}): Promise<AthenaGenerationJob | null> {
  const { data, error } = await supabaseAdmin.rpc(
    "complete_athena_generation_job",
    {
      p_job_id: input.jobId,
      p_claim_token: input.claimToken,
      p_analysis_id: input.analysisId ?? null,
      p_opportunity_id: input.opportunityId ?? null,
      p_review_id: input.reviewId ?? null,
      p_blueprint_id: input.blueprintId ?? null,
      p_executive_version_id: input.executiveVersionId ?? null,
      p_published_version_id:
        input.publishedVersionId ?? input.executiveVersionId ?? null,
    },
  );

  if (error) {
    console.error("[ATHENA_JOB] Failed to complete job:", {
      jobId: input.jobId,
      error: error.message,
    });
    return null;
  }

  if (!data) {
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapGenerationJobRow(row as Record<string, unknown>) : null;
}

export async function failGenerationJobWithClaim(input: {
  jobId: string;
  claimToken: string;
  errorCode: string;
  errorMessage: string;
  retryable?: boolean;
  errorMetadata?: Record<string, unknown>;
  failedStage?: string | null;
  attemptCount?: number;
}): Promise<AthenaGenerationJob | null> {
  const attempt = Math.max(1, input.attemptCount ?? 1);
  const backoffMs =
    GENERATION_JOB_RETRY_BACKOFF_MS[
      Math.min(attempt - 1, GENERATION_JOB_RETRY_BACKOFF_MS.length - 1)
    ] ?? 120_000;

  const nextAttemptAt = input.retryable
    ? new Date(Date.now() + backoffMs).toISOString()
    : null;

  const { data, error } = await supabaseAdmin.rpc("fail_athena_generation_job", {
    p_job_id: input.jobId,
    p_claim_token: input.claimToken,
    p_error_code: input.errorCode,
    p_error_message: input.errorMessage,
    p_retryable: Boolean(input.retryable),
    p_next_attempt_at: nextAttemptAt,
    p_error_metadata: input.errorMetadata ?? null,
    p_failed_stage: input.failedStage ?? null,
  });

  if (error) {
    console.error("[ATHENA_JOB] Failed to record failure:", {
      jobId: input.jobId,
      error: error.message,
    });
    return null;
  }

  if (!data) {
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapGenerationJobRow(row as Record<string, unknown>) : null;
}

export type PendingFollowUpConsumption = {
  pending: boolean;
  triggerType: AthenaGenerationTriggerType | null;
};

export async function markDiscussionPendingGenerationFollowUp(
  discussionId: string,
  organizationId: string,
  options?: { triggerType?: AthenaGenerationTriggerType },
): Promise<void> {
  const { data: existing, error: readError } = await supabaseAdmin
    .from("discussions")
    .select("raw_json, pending_generation_follow_up")
    .eq("id", discussionId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (readError) {
    console.error("[ATHENA_JOB] Failed to read discussion for follow-up:", {
      discussionId,
      organizationId,
      error: readError.message,
    });
    throw readError;
  }

  const rawJson =
    existing && typeof existing.raw_json === "object" && existing.raw_json
      ? { ...(existing.raw_json as Record<string, unknown>) }
      : {};
  const existingTrigger = parseFollowUpTrigger(
    rawJson[FOLLOW_UP_TRIGGER_RAW_KEY],
  );
  const preferred = preferFollowUpTrigger(
    existingTrigger,
    options?.triggerType ?? null,
  );

  if (preferred) {
    rawJson[FOLLOW_UP_TRIGGER_RAW_KEY] = preferred;
  }

  const { error } = await supabaseAdmin
    .from("discussions")
    .update({
      pending_generation_follow_up: true,
      raw_json: rawJson,
    })
    .eq("id", discussionId)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("[ATHENA_JOB] Failed to set pending follow-up:", {
      discussionId,
      organizationId,
      error: error.message,
    });
    throw error;
  }

  console.log("[ATHENA_JOB] follow_up_requested", {
    discussionId,
    triggerType: preferred,
    alreadyPending: Boolean(
      (existing as { pending_generation_follow_up?: boolean } | null)
        ?.pending_generation_follow_up,
    ),
  });
}

export async function consumeDiscussionPendingGenerationFollowUp(
  discussionId: string,
  organizationId: string,
): Promise<PendingFollowUpConsumption> {
  const { data, error } = await supabaseAdmin
    .from("discussions")
    .select("pending_generation_follow_up, raw_json")
    .eq("id", discussionId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_JOB] Failed to read pending follow-up:", {
      discussionId,
      error: error.message,
    });
    return { pending: false, triggerType: null };
  }

  const row = data as {
    pending_generation_follow_up?: boolean;
    raw_json?: Record<string, unknown> | null;
  } | null;

  if (!row?.pending_generation_follow_up) {
    return { pending: false, triggerType: null };
  }

  const rawJson =
    row.raw_json && typeof row.raw_json === "object" ? { ...row.raw_json } : {};
  const triggerType = parseFollowUpTrigger(rawJson[FOLLOW_UP_TRIGGER_RAW_KEY]);
  delete rawJson[FOLLOW_UP_TRIGGER_RAW_KEY];

  const { error: clearError } = await supabaseAdmin
    .from("discussions")
    .update({
      pending_generation_follow_up: false,
      raw_json: rawJson,
    })
    .eq("id", discussionId)
    .eq("organization_id", organizationId)
    .eq("pending_generation_follow_up", true);

  if (clearError) {
    console.error("[ATHENA_JOB] Failed to clear pending follow-up:", {
      discussionId,
      error: clearError.message,
    });
    return { pending: false, triggerType: null };
  }

  return { pending: true, triggerType };
}

export function isActiveGenerationJobStatus(
  status: AthenaGenerationJob["status"],
): boolean {
  return (
    status === "queued" || status === "processing" || status === "retryable"
  );
}
