import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  STALE_PROCESSING_JOB_MS,
  type AthenaGenerationJob,
  type AthenaGenerationJobStatus,
  type AthenaGenerationTriggerType,
} from "@/services/generationJobs/generationJobTypes";

function mapJob(row: Record<string, unknown>): AthenaGenerationJob {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    discussion_id: row.discussion_id as string,
    discussion_update_id: (row.discussion_update_id as string | null) ?? null,
    trigger_type: row.trigger_type as AthenaGenerationTriggerType,
    requested_by: (row.requested_by as string | null) ?? null,
    status: row.status as AthenaGenerationJobStatus,
    current_stage: (row.current_stage as string | null) ?? null,
    progress: (row.progress as Record<string, unknown>) ?? {},
    attempt_count: Number(row.attempt_count ?? 0),
    max_attempts: Number(row.max_attempts ?? 3),
    regeneration_run_id: (row.regeneration_run_id as string | null) ?? null,
    analysis_id: (row.analysis_id as string | null) ?? null,
    opportunity_id: (row.opportunity_id as string | null) ?? null,
    review_id: (row.review_id as string | null) ?? null,
    blueprint_id: (row.blueprint_id as string | null) ?? null,
    executive_version_id: (row.executive_version_id as string | null) ?? null,
    error_code: (row.error_code as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    error_metadata:
      (row.error_metadata as Record<string, unknown> | null) ?? null,
    started_at: (row.started_at as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function touch(): string {
  return new Date().toISOString();
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
    .in("status", ["queued", "processing"])
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

  return data ? mapJob(data) : null;
}

export async function getGenerationJobById(
  jobId: string,
  organizationId: string,
): Promise<AthenaGenerationJob | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_generation_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_JOB] Failed to load job:", {
      jobId,
      organizationId,
      error: error.message,
    });
    return null;
  }

  return data ? mapJob(data) : null;
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
      max_attempts: 3,
      regeneration_run_id: input.regenerationRunId ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    // Unique active-job constraint → surface as conflict for callers.
    if (error.code === "23505") {
      const existing = await getActiveGenerationJobForDiscussion(
        input.discussionId,
        input.organizationId,
      );
      if (existing) {
        const conflict = new Error("ACTIVE_JOB_EXISTS");
        (conflict as Error & { existingJob: AthenaGenerationJob }).existingJob =
          existing;
        throw conflict;
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

  return mapJob(data);
}

export async function markGenerationJobProcessing(
  jobId: string,
): Promise<AthenaGenerationJob | null> {
  const now = touch();
  const { data: existing } = await supabaseAdmin
    .from("athena_generation_jobs")
    .select("attempt_count")
    .eq("id", jobId)
    .maybeSingle();

  const { data, error } = await supabaseAdmin
    .from("athena_generation_jobs")
    .update({
      status: "processing",
      current_stage: "discussion_analysis",
      attempt_count: Number(existing?.attempt_count ?? 0) + 1,
      started_at: now,
      updated_at: now,
      error_code: null,
      error_message: null,
    })
    .eq("id", jobId)
    .in("status", ["queued", "retryable", "processing"])
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_JOB] Failed to mark processing:", {
      jobId,
      error: error.message,
    });
    return null;
  }

  return data ? mapJob(data) : null;
}

export async function updateGenerationJobStage(
  jobId: string,
  stage: string,
  progress?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("athena_generation_jobs")
    .update({
      current_stage: stage,
      progress: progress ?? {},
      updated_at: touch(),
    })
    .eq("id", jobId);

  if (error) {
    console.error("[ATHENA_JOB] Failed to update stage:", {
      jobId,
      stage,
      error: error.message,
    });
  }
}

export async function completeGenerationJob(
  jobId: string,
  result: {
    analysisId?: string | null;
    opportunityId?: string | null;
    reviewId?: string | null;
    blueprintId?: string | null;
    executiveVersionId?: string | null;
  },
): Promise<void> {
  const now = touch();
  const { error } = await supabaseAdmin
    .from("athena_generation_jobs")
    .update({
      status: "completed",
      current_stage: "completed",
      analysis_id: result.analysisId ?? null,
      opportunity_id: result.opportunityId ?? null,
      review_id: result.reviewId ?? null,
      blueprint_id: result.blueprintId ?? null,
      executive_version_id: result.executiveVersionId ?? null,
      completed_at: now,
      updated_at: now,
      error_code: null,
      error_message: null,
    })
    .eq("id", jobId);

  if (error) {
    console.error("[ATHENA_JOB] Failed to complete job:", {
      jobId,
      error: error.message,
    });
    return;
  }

  console.log("[ATHENA_JOB] completed", { jobId });
}

export async function failGenerationJob(
  jobId: string,
  input: {
    errorCode: string;
    errorMessage: string;
    errorMetadata?: Record<string, unknown>;
    retryable?: boolean;
  },
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from("athena_generation_jobs")
    .select("attempt_count, max_attempts")
    .eq("id", jobId)
    .maybeSingle();

  const attemptCount = Number(existing?.attempt_count ?? 1);
  const maxAttempts = Number(existing?.max_attempts ?? 3);
  const canRetry =
    Boolean(input.retryable) && attemptCount < maxAttempts;

  const now = touch();
  const { error } = await supabaseAdmin
    .from("athena_generation_jobs")
    .update({
      status: canRetry ? "retryable" : "failed",
      error_code: input.errorCode,
      error_message: input.errorMessage.slice(0, 1000),
      error_metadata: input.errorMetadata ?? null,
      completed_at: canRetry ? null : now,
      updated_at: now,
    })
    .eq("id", jobId);

  if (error) {
    console.error("[ATHENA_JOB] Failed to record failure:", {
      jobId,
      error: error.message,
    });
    return;
  }

  console.log("[ATHENA_JOB] failed", {
    jobId,
    errorCode: input.errorCode,
    status: canRetry ? "retryable" : "failed",
    attemptCount,
  });
}

export async function requeueRetryableJob(
  jobId: string,
): Promise<AthenaGenerationJob | null> {
  const now = touch();
  const { data, error } = await supabaseAdmin
    .from("athena_generation_jobs")
    .update({
      status: "queued",
      current_stage: "queued",
      updated_at: now,
      error_code: null,
      error_message: null,
    })
    .eq("id", jobId)
    .eq("status", "retryable")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_JOB] Failed to requeue retryable job:", {
      jobId,
      error: error.message,
    });
    return null;
  }

  return data ? mapJob(data) : null;
}

export async function listRecoverableGenerationJobs(limit = 20): Promise<
  AthenaGenerationJob[]
> {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_JOB_MS).toISOString();

  const { data: queued, error: queuedError } = await supabaseAdmin
    .from("athena_generation_jobs")
    .select("*")
    .in("status", ["queued", "retryable"])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (queuedError) {
    console.error("[ATHENA_JOB] Failed to list recoverable queued jobs:", {
      error: queuedError.message,
    });
  }

  const { data: stale, error: staleError } = await supabaseAdmin
    .from("athena_generation_jobs")
    .select("*")
    .eq("status", "processing")
    .lt("updated_at", staleBefore)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (staleError) {
    console.error("[ATHENA_JOB] Failed to list stale processing jobs:", {
      error: staleError.message,
    });
  }

  const jobs = [...(queued ?? []), ...(stale ?? [])].map((row) =>
    mapJob(row),
  );

  // Deduplicate by id
  const byId = new Map<string, AthenaGenerationJob>();
  for (const job of jobs) {
    byId.set(job.id, job);
  }
  return [...byId.values()];
}

export async function markStaleProcessingJobRetryable(
  job: AthenaGenerationJob,
): Promise<AthenaGenerationJob | null> {
  if (job.status !== "processing") {
    return job;
  }

  const ageMs = Date.now() - Date.parse(job.updated_at);
  if (Number.isNaN(ageMs) || ageMs < STALE_PROCESSING_JOB_MS) {
    return job;
  }

  await failGenerationJob(job.id, {
    errorCode: "STALE_PROCESSING",
    errorMessage: "Processing job became stale and was marked retryable.",
    retryable: true,
  });

  return requeueRetryableJob(job.id);
}

export function isActiveGenerationJobStatus(
  status: AthenaGenerationJobStatus,
): boolean {
  return status === "queued" || status === "processing";
}
