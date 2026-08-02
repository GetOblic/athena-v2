/**
 * Durable Ads generation job persistence and lease operations.
 * Independent of athena_generation_jobs and deep scrape jobs.
 */

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  AD_GENERATION_JOB_RETRY_BACKOFF_MS,
  isActiveAdGenerationJobStatus,
  mapAdGenerationJobRow,
  type AthenaAdGenerationJob,
} from "@/services/ads/adsGenerationJobs/adGenerationJobTypes";
import { getAthenaWorkerConfig } from "@/services/generationJobs/generationJobWorkerConfig";

export class ActiveAdGenerationJobConflictError extends Error {
  readonly existing: AthenaAdGenerationJob;

  constructor(existing: AthenaAdGenerationJob) {
    super("An active Ads generation job already exists for this campaign.");
    this.name = "ActiveAdGenerationJobConflictError";
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

export async function getActiveAdGenerationJobForCampaign(input: {
  campaignId: string;
  organizationId: string;
}): Promise<AthenaAdGenerationJob | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_ad_generation_jobs")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("campaign_id", input.campaignId)
    .in("status", ["queued", "processing", "retryable"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_ADS_JOBS] active_lookup_failed", {
      campaignId: input.campaignId,
      error: error.message,
    });
    return null;
  }
  return data ? mapAdGenerationJobRow(data as Record<string, unknown>) : null;
}

export async function getAdGenerationJobById(input: {
  jobId: string;
  organizationId: string;
}): Promise<AthenaAdGenerationJob | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_ad_generation_jobs")
    .select("*")
    .eq("id", input.jobId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (error || !data) return null;
  return mapAdGenerationJobRow(data as Record<string, unknown>);
}

export async function enqueueAdGenerationJob(input: {
  organizationId: string;
  campaignId: string;
  requestedBy?: string | null;
  allowExisting?: boolean;
}): Promise<{ job: AthenaAdGenerationJob; created: boolean }> {
  const existing = await getActiveAdGenerationJobForCampaign({
    campaignId: input.campaignId,
    organizationId: input.organizationId,
  });

  if (existing) {
    if (input.allowExisting) {
      return { job: existing, created: false };
    }
    throw new ActiveAdGenerationJobConflictError(existing);
  }

  const now = touch();
  const { data, error } = await supabaseAdmin
    .from("athena_ad_generation_jobs")
    .insert({
      organization_id: input.organizationId,
      campaign_id: input.campaignId,
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
      const raced = await getActiveAdGenerationJobForCampaign({
        campaignId: input.campaignId,
        organizationId: input.organizationId,
      });
      if (raced) {
        if (input.allowExisting) {
          return { job: raced, created: false };
        }
        throw new ActiveAdGenerationJobConflictError(raced);
      }
    }
    console.error("[ATHENA_ADS_JOBS] enqueue_failed", {
      campaignId: input.campaignId,
      error: error.message,
    });
    throw error;
  }

  return {
    job: mapAdGenerationJobRow(data as Record<string, unknown>),
    created: true,
  };
}

export async function claimNextAdGenerationJob(input: {
  workerId: string;
  leaseSeconds?: number;
}): Promise<{ job: AthenaAdGenerationJob; claimToken: string } | null> {
  const claimToken = randomUUID();
  const { data, error } = await supabaseAdmin.rpc(
    "claim_athena_ad_generation_job",
    {
      p_worker_id: input.workerId,
      p_claim_token: claimToken,
      p_lease_seconds: input.leaseSeconds ?? getAthenaWorkerConfig().leaseSeconds,
    },
  );

  if (error) {
    console.error("[ATHENA_ADS_JOBS] claim_failed", {
      workerId: input.workerId,
      error: error.message,
    });
    throw error;
  }

  const row = unwrapRpcRow(data);
  if (!row?.id) return null;
  return {
    job: mapAdGenerationJobRow(row),
    claimToken,
  };
}

export async function heartbeatAdGenerationJob(input: {
  jobId: string;
  claimToken: string;
  leaseSeconds?: number;
  stage?: string | null;
}): Promise<AthenaAdGenerationJob | null> {
  const { data, error } = await supabaseAdmin.rpc(
    "heartbeat_athena_ad_generation_job",
    {
      p_job_id: input.jobId,
      p_claim_token: input.claimToken,
      p_lease_seconds: input.leaseSeconds ?? getAthenaWorkerConfig().leaseSeconds,
      p_stage: input.stage ?? null,
    },
  );

  if (error) {
    console.error("[ATHENA_ADS_JOBS] heartbeat_failed", {
      jobId: input.jobId,
      error: error.message,
    });
    return null;
  }

  const row = unwrapRpcRow(data);
  if (!row?.id) return null;
  return mapAdGenerationJobRow(row);
}

export async function completeAdGenerationJobWithClaim(input: {
  jobId: string;
  claimToken: string;
  packageJson: Record<string, unknown>;
}): Promise<AthenaAdGenerationJob | null> {
  const { data, error } = await supabaseAdmin.rpc(
    "complete_athena_ad_generation_job",
    {
      p_job_id: input.jobId,
      p_claim_token: input.claimToken,
      p_package_json: input.packageJson,
    },
  );

  if (error) {
    console.error("[ATHENA_ADS_JOBS] complete_failed", {
      jobId: input.jobId,
      error: error.message,
    });
    return null;
  }

  const row = unwrapRpcRow(data);
  return row ? mapAdGenerationJobRow(row) : null;
}

export async function failAdGenerationJobWithClaim(input: {
  jobId: string;
  claimToken: string;
  errorCode: string;
  errorMessage: string;
  retryable?: boolean;
  failedStage?: string | null;
  errorMetadata?: Record<string, unknown> | null;
}): Promise<AthenaAdGenerationJob | null> {
  let nextAttemptAt: string | null = null;
  if (input.retryable) {
    // attempt_count already incremented on claim; use prior attempt for backoff index
    const backoffIndex = Math.max(
      0,
      Math.min(
        AD_GENERATION_JOB_RETRY_BACKOFF_MS.length - 1,
        // Will be resolved after we know attempt — use first backoff as default
        0,
      ),
    );
    nextAttemptAt = new Date(
      Date.now() + AD_GENERATION_JOB_RETRY_BACKOFF_MS[backoffIndex],
    ).toISOString();
  }

  const { data, error } = await supabaseAdmin.rpc(
    "fail_athena_ad_generation_job",
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
    console.error("[ATHENA_ADS_JOBS] fail_failed", {
      jobId: input.jobId,
      error: error.message,
    });
    return null;
  }

  const row = unwrapRpcRow(data);
  return row ? mapAdGenerationJobRow(row) : null;
}

export { isActiveAdGenerationJobStatus };
