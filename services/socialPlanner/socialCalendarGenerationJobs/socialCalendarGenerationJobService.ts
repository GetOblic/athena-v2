/**
 * Durable Social Calendar generation job persistence and lease operations.
 * Independent of athena_generation_jobs, Ads, SEO, Estimate, and deep scrape.
 */

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  SOCIAL_CALENDAR_GENERATION_JOB_RETRY_BACKOFF_MS,
  SOCIAL_CALENDAR_GENERATION_JOB_RPCS,
  isActiveSocialCalendarGenerationJobStatus,
  mapSocialCalendarGenerationJobRow,
  type AthenaSocialCalendarGenerationJob,
} from "@/services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobTypes";
import { getAthenaWorkerConfig } from "@/services/generationJobs/generationJobWorkerConfig";

export const SOCIAL_CALENDAR_GENERATION_JOB_TABLE =
  "athena_social_calendar_generation_jobs" as const;

export class ActiveSocialCalendarGenerationJobConflictError extends Error {
  readonly existing: AthenaSocialCalendarGenerationJob;

  constructor(existing: AthenaSocialCalendarGenerationJob) {
    super("An active Social Calendar generation job already exists for this calendar.");
    this.name = "ActiveSocialCalendarGenerationJobConflictError";
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

export async function getActiveSocialCalendarGenerationJob(input: {
  calendarId: string;
  organizationId: string;
}): Promise<AthenaSocialCalendarGenerationJob | null> {
  const { data, error } = await supabaseAdmin
    .from(SOCIAL_CALENDAR_GENERATION_JOB_TABLE)
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("calendar_id", input.calendarId)
    .in("status", ["queued", "processing", "retryable"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_SOCIAL_PLANNER_JOBS] active_lookup_failed", {
      calendarId: input.calendarId,
      error: error.message,
    });
    return null;
  }
  return data
    ? mapSocialCalendarGenerationJobRow(data as Record<string, unknown>)
    : null;
}

export async function enqueueSocialCalendarGenerationJob(input: {
  organizationId: string;
  calendarId: string;
  requestedBy?: string | null;
  allowExisting?: boolean;
}): Promise<{ job: AthenaSocialCalendarGenerationJob; created: boolean }> {
  const existing = await getActiveSocialCalendarGenerationJob({
    calendarId: input.calendarId,
    organizationId: input.organizationId,
  });

  if (existing) {
    if (input.allowExisting) {
      return { job: existing, created: false };
    }
    throw new ActiveSocialCalendarGenerationJobConflictError(existing);
  }

  const now = touch();
  const { data, error } = await supabaseAdmin
    .from(SOCIAL_CALENDAR_GENERATION_JOB_TABLE)
    .insert({
      organization_id: input.organizationId,
      calendar_id: input.calendarId,
      status: "queued",
      generation_stage: "queued",
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
      const raced = await getActiveSocialCalendarGenerationJob({
        calendarId: input.calendarId,
        organizationId: input.organizationId,
      });
      if (raced) {
        if (input.allowExisting) {
          return { job: raced, created: false };
        }
        throw new ActiveSocialCalendarGenerationJobConflictError(raced);
      }
    }
    console.error("[ATHENA_SOCIAL_PLANNER_JOBS] enqueue_failed", {
      calendarId: input.calendarId,
      error: error.message,
    });
    throw error;
  }

  return {
    job: mapSocialCalendarGenerationJobRow(data as Record<string, unknown>),
    created: true,
  };
}

export async function claimNextSocialCalendarGenerationJob(input: {
  workerId: string;
  leaseSeconds?: number;
}): Promise<{ job: AthenaSocialCalendarGenerationJob; claimToken: string } | null> {
  const claimToken = randomUUID();
  const { data, error } = await supabaseAdmin.rpc(
    SOCIAL_CALENDAR_GENERATION_JOB_RPCS.claim,
    {
      p_worker_id: input.workerId,
      p_claim_token: claimToken,
      p_lease_seconds: input.leaseSeconds ?? getAthenaWorkerConfig().leaseSeconds,
    },
  );

  if (error) {
    console.error("[ATHENA_SOCIAL_PLANNER_JOBS] claim_failed", {
      workerId: input.workerId,
      error: error.message,
    });
    throw error;
  }

  const row = unwrapRpcRow(data);
  if (!row?.id) return null;
  return {
    job: mapSocialCalendarGenerationJobRow(row),
    claimToken,
  };
}

export async function heartbeatSocialCalendarGenerationJob(input: {
  jobId: string;
  claimToken: string;
  leaseSeconds?: number;
  stage?: string | null;
}): Promise<AthenaSocialCalendarGenerationJob | null> {
  const { data, error } = await supabaseAdmin.rpc(
    SOCIAL_CALENDAR_GENERATION_JOB_RPCS.heartbeat,
    {
      p_job_id: input.jobId,
      p_claim_token: input.claimToken,
      p_lease_seconds: input.leaseSeconds ?? getAthenaWorkerConfig().leaseSeconds,
      p_stage: input.stage ?? null,
    },
  );

  if (error) {
    console.error("[ATHENA_SOCIAL_PLANNER_JOBS] heartbeat_failed", {
      jobId: input.jobId,
      error: error.message,
    });
    return null;
  }

  const row = unwrapRpcRow(data);
  if (!row?.id) return null;
  return mapSocialCalendarGenerationJobRow(row);
}

export async function completeSocialCalendarGenerationJobWithClaim(input: {
  jobId: string;
  claimToken: string;
  packageJson: Record<string, unknown>;
  calendarContextJson: Record<string, unknown>;
  provenanceJson: Record<string, unknown>;
}): Promise<AthenaSocialCalendarGenerationJob | null> {
  const { data, error } = await supabaseAdmin.rpc(
    SOCIAL_CALENDAR_GENERATION_JOB_RPCS.complete,
    {
      p_job_id: input.jobId,
      p_claim_token: input.claimToken,
      p_package_json: input.packageJson,
      p_calendar_context_json: input.calendarContextJson,
      p_provenance_json: input.provenanceJson,
    },
  );

  if (error) {
    console.error("[ATHENA_SOCIAL_PLANNER_JOBS] complete_failed", {
      jobId: input.jobId,
      error: error.message,
    });
    return null;
  }

  const row = unwrapRpcRow(data);
  return row ? mapSocialCalendarGenerationJobRow(row) : null;
}

export async function failSocialCalendarGenerationJobWithClaim(input: {
  jobId: string;
  claimToken: string;
  errorCode: string;
  errorMessage: string;
  retryable?: boolean;
  failedStage?: string | null;
  errorMetadata?: Record<string, unknown> | null;
}): Promise<AthenaSocialCalendarGenerationJob | null> {
  let nextAttemptAt: string | null = null;
  if (input.retryable) {
    nextAttemptAt = new Date(
      Date.now() + SOCIAL_CALENDAR_GENERATION_JOB_RETRY_BACKOFF_MS[0],
    ).toISOString();
  }

  const { data, error } = await supabaseAdmin.rpc(
    SOCIAL_CALENDAR_GENERATION_JOB_RPCS.fail,
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
    console.error("[ATHENA_SOCIAL_PLANNER_JOBS] fail_failed", {
      jobId: input.jobId,
      error: error.message,
    });
    return null;
  }

  const row = unwrapRpcRow(data);
  return row ? mapSocialCalendarGenerationJobRow(row) : null;
}

export { isActiveSocialCalendarGenerationJobStatus };
