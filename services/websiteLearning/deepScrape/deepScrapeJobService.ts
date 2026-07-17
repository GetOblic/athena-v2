/**
 * Durable Deep Website Scrape job persistence and lease operations.
 */

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAthenaWorkerConfig } from "@/services/generationJobs/generationJobWorkerConfig";
import {
  type AthenaWebsiteDeepScrapeJob,
  mapDeepScrapeJobRow,
} from "@/services/websiteLearning/deepScrape/deepScrapeJobTypes";
import {
  assertPersistedDeepScrapeStage,
  DeepScrapeStateTransitionError,
  isPersistedDeepScrapeStage,
} from "@/services/websiteLearning/deepScrape/deepScrapeStages";
import { normalizeRootWebsiteUrl } from "@/services/websiteLearning/deepScrape/urlSafety";

export type HeartbeatDeepScrapeResult =
  | { ok: true; job: AthenaWebsiteDeepScrapeJob }
  | {
      ok: false;
      reason: "validation" | "claim_lost" | "transport";
      code: string;
      message: string;
    };

export class ActiveDeepScrapeJobConflictError extends Error {
  readonly existing: AthenaWebsiteDeepScrapeJob;

  constructor(existing: AthenaWebsiteDeepScrapeJob) {
    super("An active deep scrape job already exists for this source.");
    this.name = "ActiveDeepScrapeJobConflictError";
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

export async function getActiveDeepScrapeJobForBrain(input: {
  identityId: string;
  organizationId: string;
}): Promise<AthenaWebsiteDeepScrapeJob | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_website_deep_scrape_jobs")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("identity_id", input.identityId)
    .eq("source_type", "brain")
    .in("status", ["queued", "processing", "awaiting_follow_on", "retryable"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_DEEP_SCRAPE] active_brain_lookup_failed", {
      identityId: input.identityId,
      error: error.message,
    });
    return null;
  }
  return data ? mapDeepScrapeJobRow(data as Record<string, unknown>) : null;
}

export async function getActiveDeepScrapeJobForProspect(input: {
  prospectId: string;
  organizationId: string;
}): Promise<AthenaWebsiteDeepScrapeJob | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_website_deep_scrape_jobs")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("prospect_id", input.prospectId)
    .eq("source_type", "prospect")
    .in("status", ["queued", "processing", "awaiting_follow_on", "retryable"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_DEEP_SCRAPE] active_prospect_lookup_failed", {
      prospectId: input.prospectId,
      error: error.message,
    });
    return null;
  }
  return data ? mapDeepScrapeJobRow(data as Record<string, unknown>) : null;
}

export async function getLatestDeepScrapeJobForBrain(input: {
  identityId: string;
  organizationId: string;
}): Promise<AthenaWebsiteDeepScrapeJob | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_website_deep_scrape_jobs")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("identity_id", input.identityId)
    .eq("source_type", "brain")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapDeepScrapeJobRow(data as Record<string, unknown>);
}

export async function getLatestDeepScrapeJobForProspect(input: {
  prospectId: string;
  organizationId: string;
}): Promise<AthenaWebsiteDeepScrapeJob | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_website_deep_scrape_jobs")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("prospect_id", input.prospectId)
    .eq("source_type", "prospect")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapDeepScrapeJobRow(data as Record<string, unknown>);
}

export async function getDeepScrapeJobById(input: {
  jobId: string;
  organizationId: string;
}): Promise<AthenaWebsiteDeepScrapeJob | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_website_deep_scrape_jobs")
    .select("*")
    .eq("id", input.jobId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (error || !data) return null;
  return mapDeepScrapeJobRow(data as Record<string, unknown>);
}

export async function enqueueBrainDeepScrapeJob(input: {
  organizationId: string;
  identityId: string;
  websiteUrl: string;
  requestedBy?: string | null;
}): Promise<{
  job: AthenaWebsiteDeepScrapeJob;
  created: boolean;
}> {
  const active = await getActiveDeepScrapeJobForBrain({
    identityId: input.identityId,
    organizationId: input.organizationId,
  });
  if (active) {
    return { job: active, created: false };
  }

  const root = normalizeRootWebsiteUrl(input.websiteUrl);
  if (!root) {
    throw new Error("INVALID_WEBSITE_URL");
  }

  const now = touch();
  const { data, error } = await supabaseAdmin
    .from("athena_website_deep_scrape_jobs")
    .insert({
      organization_id: input.organizationId,
      source_type: "brain",
      identity_id: input.identityId,
      prospect_id: null,
      discussion_id: null,
      root_url: root.url,
      normalized_domain: root.registrableDomain,
      status: "queued",
      current_stage: "queued",
      progress: {},
      max_attempts: getAthenaWorkerConfig().maxAttempts,
      requested_by: input.requestedBy ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const existing = await getActiveDeepScrapeJobForBrain({
        identityId: input.identityId,
        organizationId: input.organizationId,
      });
      if (existing) {
        return { job: existing, created: false };
      }
      throw new ActiveDeepScrapeJobConflictError(
        existing as unknown as AthenaWebsiteDeepScrapeJob,
      );
    }
    throw error;
  }

  return {
    job: mapDeepScrapeJobRow(data as Record<string, unknown>),
    created: true,
  };
}

export async function enqueueProspectDeepScrapeJob(input: {
  organizationId: string;
  prospectId: string;
  discussionId?: string | null;
  websiteUrl: string;
  requestedBy?: string | null;
}): Promise<{
  job: AthenaWebsiteDeepScrapeJob;
  created: boolean;
}> {
  const active = await getActiveDeepScrapeJobForProspect({
    prospectId: input.prospectId,
    organizationId: input.organizationId,
  });
  if (active) {
    return { job: active, created: false };
  }

  const root = normalizeRootWebsiteUrl(input.websiteUrl);
  if (!root) {
    throw new Error("INVALID_WEBSITE_URL");
  }

  const now = touch();
  const { data, error } = await supabaseAdmin
    .from("athena_website_deep_scrape_jobs")
    .insert({
      organization_id: input.organizationId,
      source_type: "prospect",
      identity_id: null,
      prospect_id: input.prospectId,
      discussion_id: input.discussionId ?? null,
      root_url: root.url,
      normalized_domain: root.registrableDomain,
      status: "queued",
      current_stage: "queued",
      progress: {},
      max_attempts: getAthenaWorkerConfig().maxAttempts,
      requested_by: input.requestedBy ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const existing = await getActiveDeepScrapeJobForProspect({
        prospectId: input.prospectId,
        organizationId: input.organizationId,
      });
      if (existing) {
        return { job: existing, created: false };
      }
    }
    throw error;
  }

  return {
    job: mapDeepScrapeJobRow(data as Record<string, unknown>),
    created: true,
  };
}

export async function claimNextDeepScrapeJob(input: {
  workerId: string;
  leaseSeconds?: number;
}): Promise<{ job: AthenaWebsiteDeepScrapeJob; claimToken: string } | null> {
  const claimToken = randomUUID();
  const { data, error } = await supabaseAdmin.rpc(
    "claim_athena_website_deep_scrape_job",
    {
      p_worker_id: input.workerId,
      p_claim_token: claimToken,
      p_lease_seconds: input.leaseSeconds ?? getAthenaWorkerConfig().leaseSeconds,
    },
  );

  if (error) {
    console.error("[ATHENA_DEEP_SCRAPE] claim_failed", {
      workerId: input.workerId,
      error: error.message,
    });
    throw error;
  }

  const row = unwrapRpcRow(data);
  if (!row?.id) return null;
  return {
    job: mapDeepScrapeJobRow(row),
    claimToken,
  };
}

export async function heartbeatDeepScrapeJob(input: {
  jobId: string;
  claimToken: string;
  leaseSeconds?: number;
  stage?: string | null;
  progress?: Record<string, unknown> | null;
  /** When true (default), reject non-persisted stages before the RPC. */
  allowStage?: boolean;
}): Promise<HeartbeatDeepScrapeResult> {
  let stage: string | null = null;
  if (input.stage != null && input.stage !== "") {
    if (input.allowStage === false) {
      stage = null;
    } else {
      try {
        stage = assertPersistedDeepScrapeStage(
          input.stage,
          "heartbeatDeepScrapeJob",
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid heartbeat stage";
        return {
          ok: false,
          reason: "validation",
          code: "DEEP_SCRAPE_STATE_TRANSITION_INVALID",
          message,
        };
      }
    }
  }

  const { data, error } = await supabaseAdmin.rpc(
    "heartbeat_athena_website_deep_scrape_job",
    {
      p_job_id: input.jobId,
      p_claim_token: input.claimToken,
      p_lease_seconds: input.leaseSeconds ?? getAthenaWorkerConfig().leaseSeconds,
      p_stage: stage,
      p_progress: input.progress ?? null,
    },
  );

  if (error) {
    const message = error.message ?? "heartbeat_failed";
    const isConstraint =
      /current_stage_check|check constraint|violates check/i.test(message);
    console.error("[ATHENA_DEEP_SCRAPE] heartbeat_failed", {
      jobId: input.jobId,
      error: message,
      stage,
    });
    if (isConstraint) {
      return {
        ok: false,
        reason: "validation",
        code: "DEEP_SCRAPE_STATE_TRANSITION_INVALID",
        message,
      };
    }
    return {
      ok: false,
      reason: "transport",
      code: "HEARTBEAT_TRANSPORT_FAILED",
      message,
    };
  }

  const row = unwrapRpcRow(data);
  if (!row?.id) {
    return {
      ok: false,
      reason: "claim_lost",
      code: "CLAIM_LOST",
      message: "Deep scrape claim is no longer valid.",
    };
  }
  return { ok: true, job: mapDeepScrapeJobRow(row) };
}

export async function updateDeepScrapeJobFields(input: {
  jobId: string;
  organizationId: string;
  patch: Record<string, unknown>;
}): Promise<AthenaWebsiteDeepScrapeJob | null> {
  if ("current_stage" in input.patch) {
    const stage = input.patch.current_stage;
    if (stage != null && !isPersistedDeepScrapeStage(stage)) {
      throw new DeepScrapeStateTransitionError(
        `updateDeepScrapeJobFields refused invalid current_stage "${String(stage)}"`,
        null,
        String(stage),
      );
    }
  }

  const { data, error } = await supabaseAdmin
    .from("athena_website_deep_scrape_jobs")
    .update({
      ...input.patch,
      updated_at: touch(),
    })
    .eq("id", input.jobId)
    .eq("organization_id", input.organizationId)
    .select("*")
    .maybeSingle();

  if (error || !data) return null;
  return mapDeepScrapeJobRow(data as Record<string, unknown>);
}

export async function completeDeepScrapeJobWithClaim(input: {
  jobId: string;
  claimToken: string;
  organizationId?: string;
  pagesAnalyzed?: number | null;
  resultExecutiveVersionId?: string | null;
  brainRetrainedAt?: string | null;
  crawlSummary?: Record<string, unknown> | null;
}): Promise<AthenaWebsiteDeepScrapeJob | null> {
  const { data, error } = await supabaseAdmin.rpc(
    "complete_athena_website_deep_scrape_job",
    {
      p_job_id: input.jobId,
      p_claim_token: input.claimToken,
      p_pages_analyzed: input.pagesAnalyzed ?? null,
      p_result_executive_version_id: input.resultExecutiveVersionId ?? null,
      p_brain_retrained_at: input.brainRetrainedAt ?? null,
      p_crawl_summary: input.crawlSummary ?? null,
    },
  );

  if (error) {
    console.error("[ATHENA_DEEP_SCRAPE] complete_failed", {
      jobId: input.jobId,
      error: error.message,
    });
    return null;
  }

  const row = unwrapRpcRow(data);
  if (row) return mapDeepScrapeJobRow(row);

  // Idempotent: already completed (or claim released after terminal write).
  if (input.organizationId) {
    const existing = await getDeepScrapeJobById({
      jobId: input.jobId,
      organizationId: input.organizationId,
    });
    if (existing?.status === "completed") return existing;
  }
  return null;
}

export async function failDeepScrapeJobWithClaim(input: {
  jobId: string;
  claimToken: string;
  organizationId?: string;
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
  failedStage?: string | null;
  errorMetadata?: Record<string, unknown> | null;
  attemptCount: number;
}): Promise<AthenaWebsiteDeepScrapeJob | null> {
  const failedStage =
    input.failedStage != null && input.failedStage !== ""
      ? isPersistedDeepScrapeStage(input.failedStage)
        ? input.failedStage
        : null
      : null;

  const { data, error } = await supabaseAdmin.rpc(
    "fail_athena_website_deep_scrape_job",
    {
      p_job_id: input.jobId,
      p_claim_token: input.claimToken,
      p_error_code: input.errorCode,
      p_error_message: input.errorMessage,
      p_retryable: input.retryable,
      p_next_attempt_at: input.retryable
        ? new Date(Date.now() + 30_000).toISOString()
        : null,
      p_error_metadata: input.errorMetadata ?? null,
      p_failed_stage: failedStage,
    },
  );

  if (error) {
    console.error("[ATHENA_DEEP_SCRAPE] fail_failed", {
      jobId: input.jobId,
      error: error.message,
    });
    return null;
  }

  const row = unwrapRpcRow(data);
  if (row) return mapDeepScrapeJobRow(row);

  if (input.organizationId) {
    const existing = await getDeepScrapeJobById({
      jobId: input.jobId,
      organizationId: input.organizationId,
    });
    if (
      existing &&
      (existing.status === "failed" || existing.status === "retryable")
    ) {
      return existing;
    }
  }
  return null;
}
