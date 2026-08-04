/**
 * Durable SEO generation job persistence and lease operations.
 * Independent of athena_generation_jobs, Ads jobs, and deep scrape jobs.
 */

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  SEO_GENERATION_JOB_RETRY_BACKOFF_MS,
  isActiveSeoGenerationJobStatus,
  mapSeoGenerationJobRow,
  type AthenaSeoGenerationJob,
} from "@/services/seo/seoGenerationJobs/seoGenerationJobTypes";
import { getAthenaWorkerConfig } from "@/services/generationJobs/generationJobWorkerConfig";

export class ActiveSeoGenerationJobConflictError extends Error {
  readonly existing: AthenaSeoGenerationJob;

  constructor(existing: AthenaSeoGenerationJob) {
    super("An active SEO generation job already exists for this report.");
    this.name = "ActiveSeoGenerationJobConflictError";
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

export async function getActiveSeoGenerationJobForReport(input: {
  reportId: string;
  organizationId: string;
}): Promise<AthenaSeoGenerationJob | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_seo_generation_jobs")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("report_id", input.reportId)
    .in("status", ["queued", "processing", "retryable"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_SEO_JOBS] active_lookup_failed", {
      reportId: input.reportId,
      error: error.message,
    });
    return null;
  }
  return data ? mapSeoGenerationJobRow(data as Record<string, unknown>) : null;
}

export async function getSeoGenerationJobById(input: {
  jobId: string;
  organizationId: string;
}): Promise<AthenaSeoGenerationJob | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_seo_generation_jobs")
    .select("*")
    .eq("id", input.jobId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (error || !data) return null;
  return mapSeoGenerationJobRow(data as Record<string, unknown>);
}

export async function enqueueSeoGenerationJob(input: {
  organizationId: string;
  reportId: string;
  requestedBy?: string | null;
  allowExisting?: boolean;
}): Promise<{ job: AthenaSeoGenerationJob; created: boolean }> {
  const existing = await getActiveSeoGenerationJobForReport({
    reportId: input.reportId,
    organizationId: input.organizationId,
  });

  if (existing) {
    if (input.allowExisting) {
      return { job: existing, created: false };
    }
    throw new ActiveSeoGenerationJobConflictError(existing);
  }

  const now = touch();
  const { data, error } = await supabaseAdmin
    .from("athena_seo_generation_jobs")
    .insert({
      organization_id: input.organizationId,
      report_id: input.reportId,
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
      const raced = await getActiveSeoGenerationJobForReport({
        reportId: input.reportId,
        organizationId: input.organizationId,
      });
      if (raced) {
        if (input.allowExisting) {
          return { job: raced, created: false };
        }
        throw new ActiveSeoGenerationJobConflictError(raced);
      }
    }
    console.error("[ATHENA_SEO_JOBS] enqueue_failed", {
      reportId: input.reportId,
      error: error.message,
    });
    throw error;
  }

  return {
    job: mapSeoGenerationJobRow(data as Record<string, unknown>),
    created: true,
  };
}

export async function claimNextSeoGenerationJob(input: {
  workerId: string;
  leaseSeconds?: number;
}): Promise<{ job: AthenaSeoGenerationJob; claimToken: string } | null> {
  const claimToken = randomUUID();
  const { data, error } = await supabaseAdmin.rpc(
    "claim_athena_seo_generation_job",
    {
      p_worker_id: input.workerId,
      p_claim_token: claimToken,
      p_lease_seconds: input.leaseSeconds ?? getAthenaWorkerConfig().leaseSeconds,
    },
  );

  if (error) {
    console.error("[ATHENA_SEO_JOBS] claim_failed", {
      workerId: input.workerId,
      error: error.message,
    });
    throw error;
  }

  const row = unwrapRpcRow(data);
  if (!row?.id) return null;
  return {
    job: mapSeoGenerationJobRow(row),
    claimToken,
  };
}

export async function heartbeatSeoGenerationJob(input: {
  jobId: string;
  claimToken: string;
  leaseSeconds?: number;
  stage?: string | null;
}): Promise<AthenaSeoGenerationJob | null> {
  const { data, error } = await supabaseAdmin.rpc(
    "heartbeat_athena_seo_generation_job",
    {
      p_job_id: input.jobId,
      p_claim_token: input.claimToken,
      p_lease_seconds: input.leaseSeconds ?? getAthenaWorkerConfig().leaseSeconds,
      p_stage: input.stage ?? null,
    },
  );

  if (error) {
    console.error("[ATHENA_SEO_JOBS] heartbeat_failed", {
      jobId: input.jobId,
      error: error.message,
    });
    return null;
  }

  const row = unwrapRpcRow(data);
  if (!row?.id) return null;
  return mapSeoGenerationJobRow(row);
}

export async function completeSeoGenerationJobWithClaim(input: {
  jobId: string;
  claimToken: string;
  packageJson: Record<string, unknown>;
}): Promise<AthenaSeoGenerationJob | null> {
  const { data, error } = await supabaseAdmin.rpc(
    "complete_athena_seo_generation_job",
    {
      p_job_id: input.jobId,
      p_claim_token: input.claimToken,
      p_package_json: input.packageJson,
    },
  );

  if (error) {
    console.error("[ATHENA_SEO_JOBS] complete_failed", {
      jobId: input.jobId,
      error: error.message,
    });
    return null;
  }

  const row = unwrapRpcRow(data);
  return row ? mapSeoGenerationJobRow(row) : null;
}

export async function failSeoGenerationJobWithClaim(input: {
  jobId: string;
  claimToken: string;
  errorCode: string;
  errorMessage: string;
  retryable?: boolean;
  failedStage?: string | null;
  errorMetadata?: Record<string, unknown> | null;
}): Promise<AthenaSeoGenerationJob | null> {
  let nextAttemptAt: string | null = null;
  if (input.retryable) {
    const backoffIndex = 0;
    nextAttemptAt = new Date(
      Date.now() + SEO_GENERATION_JOB_RETRY_BACKOFF_MS[backoffIndex],
    ).toISOString();
  }

  const { data, error } = await supabaseAdmin.rpc(
    "fail_athena_seo_generation_job",
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
    console.error("[ATHENA_SEO_JOBS] fail_failed", {
      jobId: input.jobId,
      error: error.message,
    });
    return null;
  }

  const row = unwrapRpcRow(data);
  return row ? mapSeoGenerationJobRow(row) : null;
}

export { isActiveSeoGenerationJobStatus };
