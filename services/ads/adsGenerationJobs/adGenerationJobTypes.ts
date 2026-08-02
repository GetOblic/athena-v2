/**
 * Durable Ads generation job types (independent of athena_generation_jobs).
 */

import type { AdCampaignGenerationStage } from "@/services/ads/adCampaignTypes";

export const AD_GENERATION_JOB_STATUSES = [
  "queued",
  "processing",
  "completed",
  "failed",
  "retryable",
] as const;

export type AdGenerationJobStatus = (typeof AD_GENERATION_JOB_STATUSES)[number];

export const AD_GENERATION_JOB_RETRY_BACKOFF_MS = [30_000, 120_000] as const;

export type AthenaAdGenerationJob = {
  id: string;
  organization_id: string;
  campaign_id: string;
  status: AdGenerationJobStatus;
  generation_stage: AdCampaignGenerationStage | string | null;
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

export function isActiveAdGenerationJobStatus(
  status: string,
): boolean {
  return status === "queued" || status === "processing" || status === "retryable";
}

export function mapAdGenerationJobRow(
  row: Record<string, unknown>,
): AthenaAdGenerationJob {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    campaign_id: String(row.campaign_id),
    status: row.status as AdGenerationJobStatus,
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
