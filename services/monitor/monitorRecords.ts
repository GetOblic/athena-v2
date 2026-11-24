/**
 * Row mapping and empty-claim normalization for Monitor persistence.
 * PostgREST can represent a null composite claim as an all-null object.
 * A null id is an empty result, not a job.
 */

import {
  MONITOR_CONFIGURATION_VERSION,
  MONITOR_OBSERVATION_PAYLOAD_VERSION,
  type MonitorConfiguration,
  type MonitorExecutionCursor,
  type MonitorJob,
  type MonitorJobStatus,
  type MonitorObservation,
  type MonitorObservationPayload,
  type MonitorProgress,
  type MonitorSourceCoverage,
  type SavedMonitor,
} from "@/services/monitor/monitorTypes";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function readMonitorRpcRow(data: unknown): Record<string, unknown> | null {
  if (data == null) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const record = row as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id.trim()) return null;
  return record;
}

export function readMonitorRpcInteger(data: unknown): number | null {
  if (typeof data === "number" && Number.isInteger(data)) return data;
  if (typeof data === "string" && /^-?\d+$/.test(data)) return Number(data);
  return null;
}

export function mapSavedMonitor(row: Record<string, unknown>): SavedMonitor {
  const configuration = row.configuration as MonitorConfiguration;
  return {
    id: text(row.id) ?? "",
    organizationId: text(row.organization_id) ?? "",
    name: text(row.name) ?? configuration.name,
    configurationVersion: integer(row.configuration_version) ?? MONITOR_CONFIGURATION_VERSION,
    configuration,
    lastSuccessfulJobId: text(row.last_successful_job_id),
    lastSuccessfulAt: text(row.last_successful_at),
    createdBy: text(row.created_by),
    createdAt: text(row.created_at) ?? "",
    updatedAt: text(row.updated_at) ?? "",
  };
}

export function mapMonitorJob(row: Record<string, unknown>): MonitorJob {
  return {
    id: text(row.id) ?? "",
    organizationId: text(row.organization_id) ?? "",
    monitorId: text(row.monitor_id) ?? "",
    status: row.status as MonitorJobStatus,
    configurationVersion: integer(row.configuration_version) ?? MONITOR_CONFIGURATION_VERSION,
    configurationSnapshot: row.configuration_snapshot as MonitorConfiguration,
    claimedBy: text(row.claimed_by),
    claimToken: text(row.claim_token),
    claimedAt: text(row.claimed_at),
    claimExpiresAt: text(row.claim_expires_at),
    heartbeatAt: text(row.heartbeat_at),
    executionDeadlineAt: text(row.execution_deadline_at),
    batchDeadlineAt: text(row.batch_deadline_at),
    requestTimeoutMs: integer(row.request_timeout_ms),
    batchCompletedAt: text(row.batch_completed_at),
    cancellationRequestedAt: text(row.cancellation_requested_at),
    progress: row.progress as MonitorProgress,
    sourceCoverage: row.source_coverage as MonitorSourceCoverage[],
    executionCursor: row.execution_cursor as MonitorExecutionCursor,
    errorCode: text(row.error_code),
    errorMessage: text(row.error_message),
    errorMetadata: (row.error_metadata as Record<string, unknown> | null) ?? null,
    attemptCount: integer(row.attempt_count) ?? 0,
    startedAt: text(row.started_at),
    completedAt: text(row.completed_at),
    createdAt: text(row.created_at) ?? "",
    updatedAt: text(row.updated_at) ?? "",
  };
}

export function mapMonitorObservation(row: Record<string, unknown>): MonitorObservation {
  const payload = row.payload as MonitorObservationPayload;
  return {
    id: text(row.id) ?? "",
    organizationId: text(row.organization_id) ?? "",
    monitorId: text(row.monitor_id) ?? "",
    jobId: text(row.job_id) ?? "",
    sourceId: text(row.source_id) ?? "",
    familyId: text(row.family_id) ?? "",
    productUrl: text(row.product_url) ?? "",
    observedAt: text(row.observed_at) ?? "",
    thresholdMatch:
      typeof row.threshold_match === "boolean" ? row.threshold_match : null,
    payloadVersion: integer(row.payload_version) ?? MONITOR_OBSERVATION_PAYLOAD_VERSION,
    payload,
    publicObservationId: text(row.public_observation_id) ?? "",
    sharedSourceId: text(row.shared_source_id) ?? "",
    reused: row.reused === true,
    adapterId: text(row.adapter_id) ?? "",
    adapterVersion: text(row.adapter_version) ?? "",
    schemaVersion: integer(row.schema_version) ?? 1,
    contentKey: text(row.content_key) ?? "",
    categoryIds: Array.isArray(row.category_ids)
      ? row.category_ids.filter((item): item is string => typeof item === "string")
      : [],
    discoveryCoverageId: text(row.discovery_coverage_id),
    createdAt: text(row.created_at) ?? "",
  };
}

export function observationToRpcItem(observation: MonitorObservation): Record<string, unknown> {
  return {
    sourceId: observation.sourceId,
    familyId: observation.familyId,
    productUrl: observation.productUrl,
    observedAt: observation.observedAt,
    thresholdMatch: observation.thresholdMatch,
    productName: observation.payload.productName,
    priceAmount: observation.payload.price.amount,
    currency: observation.payload.price.currency,
    colorPatternIds: observation.payload.colorPatternIds,
    colorPatternNames: observation.payload.colorPatternNames,
    distinctVariationCount: observation.payload.distinctVariationCount,
    sizes: observation.payload.sizes,
    lengths: observation.payload.lengths,
    imageUrl: observation.payload.imageUrl,
    category: observation.payload.category,
    categoryIds: observation.categoryIds,
    contentKey: observation.contentKey,
    reused: observation.reused,
  };
}
