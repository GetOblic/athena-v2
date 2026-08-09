/**
 * Durable Athena Estimate generation job persistence and lease operations (V26).
 * Independent of athena_generation_jobs, SEO, Ads, and deep scrape jobs.
 *
 * L2: enqueue/read. L5: heartbeat/complete/fail (+ claim wrappers for executor).
 * Worker claim-loop integration remains a later phase — do not wire into athenaWorker.
 */

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAthenaWorkerConfig } from "@/services/generationJobs/generationJobWorkerConfig";
import {
  ESTIMATE_GENERATION_JOB_RETRY_BACKOFF_MS,
  ESTIMATE_GENERATION_JOB_RPCS,
  mapEstimateGenerationJobRow,
  type AthenaEstimateGenerationJob,
} from "@/services/estimate/estimateGenerationJobs/estimateGenerationJobTypes";

export class ActiveEstimateGenerationJobConflictError extends Error {
  readonly existing: AthenaEstimateGenerationJob;

  constructor(existing: AthenaEstimateGenerationJob) {
    super("An active Estimate generation job already exists for this Estimate.");
    this.name = "ActiveEstimateGenerationJobConflictError";
    this.existing = existing;
  }
}

function touch(): string {
  return new Date().toISOString();
}

function unwrapRpcRow(data: unknown): Record<string, unknown> | null {
  if (!data) return null;
  if (Array.isArray(data)) {
    return (data[0] as Record<string, unknown> | undefined) ?? null;
  }
  if (typeof data === "object") {
    return data as Record<string, unknown>;
  }
  return null;
}

export async function getActiveEstimateGenerationJobForEstimate(input: {
  estimateId: string;
  licenseeAccountId: string;
}): Promise<AthenaEstimateGenerationJob | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_estimate_generation_jobs")
    .select("*")
    .eq("licensee_account_id", input.licenseeAccountId)
    .eq("estimate_id", input.estimateId)
    .in("status", ["queued", "processing", "retryable"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_ESTIMATE_JOBS] active_lookup_failed", {
      estimateId: input.estimateId,
      error: error.message,
    });
    return null;
  }
  return data
    ? mapEstimateGenerationJobRow(data as Record<string, unknown>)
    : null;
}

export async function getEstimateGenerationJobById(input: {
  jobId: string;
  licenseeAccountId: string;
}): Promise<AthenaEstimateGenerationJob | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_estimate_generation_jobs")
    .select("*")
    .eq("id", input.jobId)
    .eq("licensee_account_id", input.licenseeAccountId)
    .maybeSingle();

  if (error || !data) return null;
  return mapEstimateGenerationJobRow(data as Record<string, unknown>);
}

export async function enqueueAthenaEstimateGenerationJob(input: {
  licenseeAccountId: string;
  organizationId: string;
  estimateId: string;
  requestedBy?: string | null;
  allowExisting?: boolean;
}): Promise<{ job: AthenaEstimateGenerationJob; created: boolean }> {
  const existing = await getActiveEstimateGenerationJobForEstimate({
    estimateId: input.estimateId,
    licenseeAccountId: input.licenseeAccountId,
  });

  if (existing) {
    if (input.allowExisting) {
      return { job: existing, created: false };
    }
    throw new ActiveEstimateGenerationJobConflictError(existing);
  }

  const now = touch();
  const { data, error } = await supabaseAdmin
    .from("athena_estimate_generation_jobs")
    .insert({
      licensee_account_id: input.licenseeAccountId,
      organization_id: input.organizationId,
      estimate_id: input.estimateId,
      status: "queued",
      generation_stage: "assembling_context",
      attempt_count: 0,
      max_attempts: getAthenaWorkerConfig().maxAttempts,
      requested_by: input.requestedBy ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const raced = await getActiveEstimateGenerationJobForEstimate({
        estimateId: input.estimateId,
        licenseeAccountId: input.licenseeAccountId,
      });
      if (raced) {
        if (input.allowExisting) {
          return { job: raced, created: false };
        }
        throw new ActiveEstimateGenerationJobConflictError(raced);
      }
    }
    console.error("[ATHENA_ESTIMATE_JOBS] enqueue_failed", {
      estimateId: input.estimateId,
      error: error.message,
    });
    throw error;
  }

  return {
    job: mapEstimateGenerationJobRow(data as Record<string, unknown>),
    created: true,
  };
}

/** Claim wrapper for executor tests / future worker — not wired into athenaWorker yet. */
export async function claimNextEstimateGenerationJob(input: {
  workerId: string;
  leaseSeconds?: number;
}): Promise<{ job: AthenaEstimateGenerationJob; claimToken: string } | null> {
  const claimToken = randomUUID();
  const { data, error } = await supabaseAdmin.rpc(
    ESTIMATE_GENERATION_JOB_RPCS.claim,
    {
      p_worker_id: input.workerId,
      p_claim_token: claimToken,
      p_lease_seconds: input.leaseSeconds ?? getAthenaWorkerConfig().leaseSeconds,
    },
  );

  if (error) {
    console.error("[ATHENA_ESTIMATE_JOBS] claim_failed", {
      workerId: input.workerId,
      error: error.message,
    });
    throw error;
  }

  const row = unwrapRpcRow(data);
  if (!row?.id) return null;
  return {
    job: mapEstimateGenerationJobRow(row),
    claimToken,
  };
}

export async function heartbeatEstimateGenerationJob(input: {
  jobId: string;
  claimToken: string;
  leaseSeconds?: number;
  stage?: string | null;
}): Promise<AthenaEstimateGenerationJob | null> {
  const { data, error } = await supabaseAdmin.rpc(
    ESTIMATE_GENERATION_JOB_RPCS.heartbeat,
    {
      p_job_id: input.jobId,
      p_claim_token: input.claimToken,
      p_lease_seconds: input.leaseSeconds ?? getAthenaWorkerConfig().leaseSeconds,
      p_stage: input.stage ?? null,
    },
  );

  if (error) {
    console.error("[ATHENA_ESTIMATE_JOBS] heartbeat_failed", {
      jobId: input.jobId,
      error: error.message,
    });
    return null;
  }

  const row = unwrapRpcRow(data);
  if (!row?.id) return null;
  return mapEstimateGenerationJobRow(row);
}

export async function completeEstimateGenerationJobWithClaim(input: {
  jobId: string;
  claimToken: string;
  packageJson: Record<string, unknown>;
}): Promise<AthenaEstimateGenerationJob | null> {
  const { data, error } = await supabaseAdmin.rpc(
    ESTIMATE_GENERATION_JOB_RPCS.complete,
    {
      p_job_id: input.jobId,
      p_claim_token: input.claimToken,
      p_package_json: input.packageJson,
    },
  );

  if (error) {
    console.error("[ATHENA_ESTIMATE_JOBS] complete_failed", {
      jobId: input.jobId,
      error: error.message,
    });
    return null;
  }

  const row = unwrapRpcRow(data);
  return row ? mapEstimateGenerationJobRow(row) : null;
}

export async function failEstimateGenerationJobWithClaim(input: {
  jobId: string;
  claimToken: string;
  errorCode: string;
  errorMessage: string;
  retryable?: boolean;
  failedStage?: string | null;
  errorMetadata?: Record<string, unknown> | null;
}): Promise<AthenaEstimateGenerationJob | null> {
  let nextAttemptAt: string | null = null;
  if (input.retryable) {
    nextAttemptAt = new Date(
      Date.now() + ESTIMATE_GENERATION_JOB_RETRY_BACKOFF_MS[0],
    ).toISOString();
  }

  const { data, error } = await supabaseAdmin.rpc(
    ESTIMATE_GENERATION_JOB_RPCS.fail,
    {
      p_job_id: input.jobId,
      p_claim_token: input.claimToken,
      p_error_code: input.errorCode,
      p_error_message: input.errorMessage,
      p_retryable: Boolean(input.retryable),
      p_next_attempt_at: nextAttemptAt,
      p_error_metadata: input.errorMetadata ?? null,
      p_failed_stage: input.failedStage ?? null,
    },
  );

  if (error) {
    console.error("[ATHENA_ESTIMATE_JOBS] fail_failed", {
      jobId: input.jobId,
      error: error.message,
    });
    return null;
  }

  const row = unwrapRpcRow(data);
  return row ? mapEstimateGenerationJobRow(row) : null;
}
