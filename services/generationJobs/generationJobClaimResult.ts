/**
 * Normalize claim_athena_generation_job RPC responses.
 *
 * PostgreSQL `RETURNS athena_generation_jobs` + `RETURN NULL` is represented by
 * PostgREST/Supabase as a composite object (or one-element array) whose fields
 * are all null — not JavaScript null. Treating that as a claimed job is the
 * empty-queue production defect.
 */

import {
  ATHENA_GENERATION_TRIGGER_TYPES,
  type AthenaGenerationJob,
  type AthenaGenerationTriggerType,
} from "@/services/generationJobs/generationJobTypes";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TRIGGER_SET = new Set<string>(ATHENA_GENERATION_TRIGGER_TYPES);

/** Reject null/undefined/"null"/"undefined"/empty and non-UUID strings. */
export function isGenerationJobUuid(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") {
    return false;
  }
  return UUID_RE.test(trimmed);
}

export function describeClaimRpcDataShape(data: unknown): string {
  if (data === null) return "null";
  if (data === undefined) return "undefined";
  if (Array.isArray(data)) return `array(len=${data.length})`;
  if (typeof data === "object") return "object";
  return typeof data;
}

/**
 * Extract the first composite row from a claim RPC payload, or null when the
 * payload is an empty-queue representation.
 */
export function extractClaimRpcRow(
  data: unknown,
): Record<string, unknown> | null {
  if (data == null) {
    return null;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return null;
    }
    const first = data[0];
    if (first == null || typeof first !== "object" || Array.isArray(first)) {
      return null;
    }
    return first as Record<string, unknown>;
  }

  if (typeof data === "object") {
    return data as Record<string, unknown>;
  }

  return null;
}

/**
 * PostgREST null-composite / empty-queue rows have a null primary id.
 * That is the normal empty-queue signal — not an error.
 */
export function isEmptyClaimCompositeRow(
  row: Record<string, unknown>,
): boolean {
  return row.id == null;
}

export function isValidGenerationTriggerType(
  value: unknown,
): value is AthenaGenerationTriggerType {
  return typeof value === "string" && TRIGGER_SET.has(value);
}

export type ClaimedJobCandidate = {
  job: AthenaGenerationJob;
  claimToken: string;
};

/**
 * Defence-in-depth: required identifiers for safe execution.
 */
export function isExecutableClaimedJob(
  claimed: ClaimedJobCandidate | null | undefined,
): claimed is ClaimedJobCandidate {
  if (!claimed?.job || typeof claimed.claimToken !== "string") {
    return false;
  }

  const token = claimed.claimToken.trim();
  if (!isGenerationJobUuid(token)) {
    return false;
  }

  const { job } = claimed;
  if (!isGenerationJobUuid(job.id)) return false;
  if (!isGenerationJobUuid(job.organization_id)) return false;
  if (!isGenerationJobUuid(job.discussion_id)) return false;
  if (!isValidGenerationTriggerType(job.trigger_type)) return false;
  if (job.status !== "processing") return false;

  const jobToken = job.claim_token;
  if (jobToken != null && !isGenerationJobUuid(jobToken)) {
    return false;
  }

  return true;
}

export type NormalizedClaimRpcResult =
  | { kind: "empty" }
  | {
      kind: "invalid";
      shape: string;
      hasId: boolean;
      reason: string;
    }
  | { kind: "claimed"; job: AthenaGenerationJob; claimToken: string };

/**
 * Map a raw claim RPC payload into empty / invalid / claimed.
 * Pure — safe to unit test without Supabase.
 */
export function normalizeClaimRpcResult(
  data: unknown,
  mapRow: (row: Record<string, unknown>) => AthenaGenerationJob,
  fallbackClaimToken: string,
): NormalizedClaimRpcResult {
  if (data == null) {
    return { kind: "empty" };
  }

  if (Array.isArray(data) && data.length === 0) {
    return { kind: "empty" };
  }

  const row = extractClaimRpcRow(data);
  if (!row) {
    return {
      kind: "invalid",
      shape: describeClaimRpcDataShape(data),
      hasId: false,
      reason: "unrecognized_rpc_payload",
    };
  }

  if (isEmptyClaimCompositeRow(row)) {
    return { kind: "empty" };
  }

  if (!isGenerationJobUuid(row.id)) {
    return {
      kind: "invalid",
      shape: describeClaimRpcDataShape(data),
      hasId: row.id != null,
      reason: "missing_or_invalid_job_id",
    };
  }

  if (!isGenerationJobUuid(row.organization_id)) {
    return {
      kind: "invalid",
      shape: describeClaimRpcDataShape(data),
      hasId: true,
      reason: "missing_or_invalid_organization_id",
    };
  }

  if (!isGenerationJobUuid(row.discussion_id)) {
    return {
      kind: "invalid",
      shape: describeClaimRpcDataShape(data),
      hasId: true,
      reason: "missing_or_invalid_discussion_id",
    };
  }

  if (!isValidGenerationTriggerType(row.trigger_type)) {
    return {
      kind: "invalid",
      shape: describeClaimRpcDataShape(data),
      hasId: true,
      reason: "missing_or_invalid_trigger_type",
    };
  }

  if (row.status !== "processing") {
    return {
      kind: "invalid",
      shape: describeClaimRpcDataShape(data),
      hasId: true,
      reason: "unexpected_claim_status",
    };
  }

  const job = mapRow(row);
  const claimToken =
    (isGenerationJobUuid(job.claim_token) ? job.claim_token : null) ??
    (isGenerationJobUuid(fallbackClaimToken) ? fallbackClaimToken : null);

  if (!claimToken) {
    return {
      kind: "invalid",
      shape: describeClaimRpcDataShape(data),
      hasId: true,
      reason: "missing_or_invalid_claim_token",
    };
  }

  const claimed = { job, claimToken };
  if (!isExecutableClaimedJob(claimed)) {
    return {
      kind: "invalid",
      shape: describeClaimRpcDataShape(data),
      hasId: true,
      reason: "failed_claim_validation",
    };
  }

  return { kind: "claimed", job, claimToken };
}
