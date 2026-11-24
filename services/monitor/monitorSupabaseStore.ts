/**
 * Supabase persistence adapter for the future athena-v2-monitor-worker.
 * User reads filter on organization_id. Claim fencing goes through SQL functions.
 * Importing this module does not connect. The client is loaded only when a store is created.
 * This adapter is not executed by the Gate 3B tests.
 */

import { MonitorOperationError } from "@/services/monitor/monitorErrors";
import {
  mapMonitorJob,
  mapMonitorObservation,
  mapSavedMonitor,
  observationToRpcItem,
  readMonitorRpcInteger,
  readMonitorRpcRow,
} from "@/services/monitor/monitorRecords";
import {
  MONITOR_RESULT_FACT_LIMIT,
  type MonitorObservationFact,
  type MonitorObservationPageQuery,
} from "@/services/monitor/monitorResultPage";
import type { MonitorStore } from "@/services/monitor/monitorStore";
import {
  ATHENA_MONITOR_WORKER_DEFAULTS,
} from "@/services/monitor/monitorRuntime";
import type {
  MonitorJob,
  MonitorObservation,
  SavedMonitor,
  SharedDiscoveryCoverage,
  SharedMonitorCategory,
  SharedMonitorSource,
  SharedPublicObservation,
} from "@/services/monitor/monitorTypes";

type PostgrestError = { code?: string; message?: string } | null;
type PostgrestResult = { data: unknown; error: PostgrestError };

interface FilterBuilder extends PromiseLike<PostgrestResult> {
  select(columns: string): FilterBuilder;
  eq(column: string, value: string): FilterBuilder;
  order(column: string, options: { ascending: boolean }): FilterBuilder;
  limit(count: number): FilterBuilder;
  maybeSingle(): Promise<PostgrestResult>;
  single(): Promise<PostgrestResult>;
}

interface TableBuilder {
  select(columns: string): FilterBuilder;
  insert(value: unknown): FilterBuilder;
  update(value: unknown): FilterBuilder;
  delete(): FilterBuilder;
}

type SupabaseLike = {
  from: (table: string) => TableBuilder;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<PostgrestResult>;
};

function raise(error: { code?: string; message?: string }): never {
  if (error.code === "23505") {
    throw new MonitorOperationError("ACTIVE_JOB_EXISTS");
  }
  if (error.code === "23503") {
    throw new MonitorOperationError("CROSS_ORGANIZATION");
  }
  throw new MonitorOperationError("PERSISTENCE_FAILED", error.message ?? "PERSISTENCE_FAILED");
}

function flattenObservation(row: Record<string, unknown>): Record<string, unknown> {
  const nested = row.athena_monitor_public_observations;
  const publicRow = Array.isArray(nested) ? nested[0] : nested;
  if (!publicRow || typeof publicRow !== "object") return row;
  const shared = publicRow as Record<string, unknown>;
  return {
    ...row,
    shared_source_id: shared.source_id,
    adapter_id: shared.adapter_id,
    adapter_version: shared.adapter_version,
    schema_version: shared.schema_version,
    content_key: shared.content_key,
    observed_at: shared.observed_at ?? row.observed_at,
    product_url: shared.canonical_url ?? row.product_url,
    family_id: shared.family_id ?? row.family_id,
    payload: row.payload ?? {
      version: 1,
      productName: shared.product_name ?? null,
      category: typeof shared.category_name === "string" ? shared.category_name : null,
      price: { amount: shared.price_amount ?? null, currency: shared.currency ?? null },
      colorPatternIds: shared.color_pattern_ids ?? null,
      colorPatternNames: shared.color_pattern_names ?? null,
      distinctVariationCount: shared.distinct_variation_count ?? null,
      sizes: shared.sizes ?? null,
      lengths: shared.lengths ?? null,
      imageUrl: shared.image_url ?? null,
      thresholdMatch: row.threshold_match ?? null,
    },
  };
}

async function listRows(query: FilterBuilder): Promise<Record<string, unknown>[]> {
  const result = await query;
  if (result.error) raise(result.error);
  return Array.isArray(result.data) ? (result.data as Record<string, unknown>[]) : [];
}

export async function createSupabaseMonitorStore(): Promise<MonitorStore> {
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  const supabase = supabaseAdmin as unknown as SupabaseLike;

  return {
    async insertMonitor(monitor: SavedMonitor) {
      const result = await supabase
        .from("athena_monitors")
        .insert({
          id: monitor.id,
          organization_id: monitor.organizationId,
          name: monitor.name,
          configuration_version: monitor.configurationVersion,
          configuration: monitor.configuration,
          created_by: monitor.createdBy,
          created_at: monitor.createdAt,
          updated_at: monitor.updatedAt,
        })
        .select("*")
        .single();
      if (result.error) raise(result.error);
      const row = readMonitorRpcRow(result.data);
      if (!row) throw new MonitorOperationError("PERSISTENCE_FAILED");
      return mapSavedMonitor(row);
    },

    async updateMonitorConfiguration(monitor) {
      const result = await supabase
        .from("athena_monitors")
        .update({
          name: monitor.name,
          configuration_version: monitor.configurationVersion,
          configuration: monitor.configuration,
          updated_at: monitor.updatedAt,
        })
        .eq("id", monitor.id)
        .eq("organization_id", monitor.organizationId)
        .select("*")
        .maybeSingle();
      if (result.error) raise(result.error);
      const row = readMonitorRpcRow(result.data);
      return row ? mapSavedMonitor(row) : null;
    },

    async listMonitors(organizationId) {
      const result = await listRows(
        supabase
          .from("athena_monitors")
          .select("*")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: true }),
      );
      return result.map((row) => mapSavedMonitor(row));
    },

    async getMonitor(organizationId, monitorId) {
      const result = await supabase
        .from("athena_monitors")
        .select("*")
        .eq("id", monitorId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (result.error) raise(result.error);
      const row = readMonitorRpcRow(result.data);
      return row ? mapSavedMonitor(row) : null;
    },

    async insertJob(job: MonitorJob) {
      const result = await supabase
        .from("athena_monitor_jobs")
        .insert({
          id: job.id,
          organization_id: job.organizationId,
          monitor_id: job.monitorId,
          status: job.status,
          configuration_version: job.configurationVersion,
          configuration_snapshot: job.configurationSnapshot,
          progress: job.progress,
          source_coverage: job.sourceCoverage,
          execution_cursor: job.executionCursor,
          attempt_count: job.attemptCount,
          created_at: job.createdAt,
          updated_at: job.updatedAt,
        })
        .select("*")
        .single();
      if (result.error) raise(result.error);
      const row = readMonitorRpcRow(result.data);
      if (!row) throw new MonitorOperationError("PERSISTENCE_FAILED");
      return mapMonitorJob(row);
    },

    async getJob(organizationId, jobId) {
      const result = await supabase
        .from("athena_monitor_jobs")
        .select("*")
        .eq("id", jobId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (result.error) raise(result.error);
      const row = readMonitorRpcRow(result.data);
      return row ? mapMonitorJob(row) : null;
    },

    async getJobById(jobId) {
      const result = await supabase
        .from("athena_monitor_jobs")
        .select("*")
        .eq("id", jobId)
        .maybeSingle();
      if (result.error) raise(result.error);
      const row = readMonitorRpcRow(result.data);
      return row ? mapMonitorJob(row) : null;
    },

    async listJobs(input) {
      let query = supabase
        .from("athena_monitor_jobs")
        .select("*")
        .eq("organization_id", input.organizationId);
      if (input.monitorId) {
        query = query.eq("monitor_id", input.monitorId);
      }
      const rows = await listRows(
        query.order("created_at", { ascending: false }).limit(input.limit),
      );
      return rows.map((row) => mapMonitorJob(row));
    },

    async listObservations(organizationId, jobId) {
      const result = await listRows(
        supabase
          .from("athena_monitor_observations")
          .select("*, athena_monitor_public_observations(*)")
          .eq("organization_id", organizationId)
          .eq("job_id", jobId)
          .order("created_at", { ascending: true }),
      );
      return result.map((row) => mapMonitorObservation(flattenObservation(row)));
    },

    async claimNext(input) {
      const result = await supabase.rpc("claim_athena_monitor_job", {
        p_worker_id: input.workerId,
        p_claim_token: input.claimToken,
        p_lease_seconds: input.leaseSeconds,
        p_deadline_seconds: input.executionDeadlineSeconds,
        p_batch_deadline_seconds: input.batchDeadlineSeconds,
        p_request_timeout_ms: input.requestTimeoutMs,
      });
      if (result.error) raise(result.error);
      const row = readMonitorRpcRow(result.data);
      return row ? mapMonitorJob(row) : null;
    },

    async heartbeat(input) {
      const result = await supabase.rpc("heartbeat_athena_monitor_job", {
        p_job_id: input.jobId,
        p_claim_token: input.claimToken,
        p_lease_seconds: input.leaseSeconds,
        p_progress: input.progress,
        p_source_coverage: input.sourceCoverage,
        p_execution_cursor: input.executionCursor,
      });
      if (result.error) raise(result.error);
      const row = readMonitorRpcRow(result.data);
      return row ? mapMonitorJob(row) : null;
    },

    async publishObservations(input) {
      if (input.observations.length > ATHENA_MONITOR_WORKER_DEFAULTS.batchSize) {
        throw new MonitorOperationError("BATCH_BOUND");
      }
      const result = await supabase.rpc("publish_athena_monitor_observations", {
        p_job_id: input.jobId,
        p_claim_token: input.claimToken,
        p_observations: input.observations.map((observation: MonitorObservation) =>
          observationToRpcItem(observation),
        ),
      });
      if (result.error) raise(result.error);
      return readMonitorRpcInteger(result.data);
    },

    async finalize(input) {
      const result = await supabase.rpc("finalize_athena_monitor_job", {
        p_job_id: input.jobId,
        p_claim_token: input.claimToken,
        p_status: input.status,
        p_error_code: input.errorCode,
        p_error_message: input.errorMessage,
        p_error_metadata: input.errorMetadata,
        p_source_coverage: input.sourceCoverage,
        p_progress: input.progress,
        p_execution_cursor: input.executionCursor,
      });
      if (result.error) raise(result.error);
      const row = readMonitorRpcRow(result.data);
      return row ? mapMonitorJob(row) : null;
    },

    async requestCancellation(input) {
      const result = await supabase.rpc("request_athena_monitor_job_cancellation", {
        p_organization_id: input.organizationId,
        p_job_id: input.jobId,
      });
      if (result.error) raise(result.error);
      const row = readMonitorRpcRow(result.data);
      return row ? mapMonitorJob(row) : null;
    },

    async recoverExpired() {
      const result = await supabase.rpc("recover_athena_monitor_jobs", {});
      if (result.error) raise(result.error);
      return readMonitorRpcInteger(result.data) ?? 0;
    },

    async yieldJob(input) {
      const result = await supabase.rpc("yield_athena_monitor_job", {
        p_job_id: input.jobId,
        p_claim_token: input.claimToken,
        p_progress: input.progress,
        p_source_coverage: input.sourceCoverage,
        p_execution_cursor: input.executionCursor,
      });
      if (result.error) raise(result.error);
      const row = readMonitorRpcRow(result.data);
      return row ? mapMonitorJob(row) : null;
    },

    async ensureSharedSource(source: SharedMonitorSource) {
      const existing = await supabase
        .from("athena_monitor_sources")
        .select("*")
        .eq("normalized_host", source.normalizedHost)
        .maybeSingle();
      if (existing.error) raise(existing.error);
      const found = readMonitorRpcRow(existing.data);
      if (found) return mapSharedSource(found);
      const inserted = await supabase
        .from("athena_monitor_sources")
        .insert(sharedSourceToRow(source))
        .select("*")
        .single();
      if (inserted.error) raise(inserted.error);
      const row = readMonitorRpcRow(inserted.data);
      if (!row) throw new MonitorOperationError("PERSISTENCE_FAILED");
      return mapSharedSource(row);
    },

    async getSharedSourceByHost(normalizedHost) {
      const result = await supabase
        .from("athena_monitor_sources")
        .select("*")
        .eq("normalized_host", normalizedHost)
        .maybeSingle();
      if (result.error) raise(result.error);
      const row = readMonitorRpcRow(result.data);
      return row ? mapSharedSource(row) : null;
    },

    async getSharedSourceByRegisteredId(registeredSourceId) {
      const result = await supabase
        .from("athena_monitor_sources")
        .select("*")
        .eq("registered_source_id", registeredSourceId)
        .maybeSingle();
      if (result.error) raise(result.error);
      const row = readMonitorRpcRow(result.data);
      return row ? mapSharedSource(row) : null;
    },

    async listSharedSources() {
      const rows = await listRows(
        supabase.from("athena_monitor_sources").select("*").order("normalized_host", { ascending: true }),
      );
      return rows.map((row) => mapSharedSource(row));
    },

    async recordSourceDiscovery(input) {
      const result = await supabase
        .from("athena_monitor_sources")
        .update({
          discovery_status: input.discoveryStatus,
          last_discovered_at: input.discoveredAt,
          updated_at: input.discoveredAt,
        })
        .eq("id", input.sourceId)
        .select("*")
        .maybeSingle();
      if (result.error) raise(result.error);
      const row = readMonitorRpcRow(result.data);
      return row ? mapSharedSource(row) : null;
    },

    async recordTechnicalAccess(input) {
      const result = await supabase
        .from("athena_monitor_sources")
        .update({
          access_status: input.accessStatus,
          retry_after: input.retryAfter,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.sourceId)
        .select("*")
        .maybeSingle();
      if (result.error) raise(result.error);
      const row = readMonitorRpcRow(result.data);
      return row ? mapSharedSource(row) : null;
    },

    async saveSharedCategories(sourceId, categories: SharedMonitorCategory[]) {
      const removed = await supabase.from("athena_monitor_source_categories").delete().eq("source_id", sourceId);
      if (removed.error) raise(removed.error);
      if (categories.length === 0) return [];
      const inserted = await supabase
        .from("athena_monitor_source_categories")
        .insert(categories.map((category) => sharedCategoryToRow(category)))
        .select("*");
      if (inserted.error) raise(inserted.error);
      return (Array.isArray(inserted.data) ? inserted.data : []).map((row) =>
        mapSharedCategory(row as Record<string, unknown>),
      );
    },

    async listSharedCategories(sourceId) {
      const rows = await listRows(
        supabase
          .from("athena_monitor_source_categories")
          .select("*")
          .eq("source_id", sourceId)
          .order("category_key", { ascending: true }),
      );
      return rows.map((row) => mapSharedCategory(row));
    },

    async savePublicObservation(observation: SharedPublicObservation) {
      const inserted = await supabase
        .from("athena_monitor_public_observations")
        .insert(publicObservationToRow(observation))
        .select("*")
        .maybeSingle();
      if (inserted.error?.code === "23505") {
        const existing = await supabase
          .from("athena_monitor_public_observations")
          .select("*")
          .eq("source_id", observation.sourceId)
          .eq("content_key", observation.contentKey)
          .maybeSingle();
        if (existing.error) raise(existing.error);
        const row = readMonitorRpcRow(existing.data);
        if (!row) throw new MonitorOperationError("PERSISTENCE_FAILED");
        return { observation: mapPublicObservation(row), created: false };
      }
      if (inserted.error) raise(inserted.error);
      const row = readMonitorRpcRow(inserted.data);
      if (!row) throw new MonitorOperationError("PERSISTENCE_FAILED");
      return { observation: mapPublicObservation(row), created: true };
    },

    async listPublicObservations(sourceId) {
      const rows = await listRows(
        supabase
          .from("athena_monitor_public_observations")
          .select("*")
          .eq("source_id", sourceId)
          .order("observed_at", { ascending: true }),
      );
      return rows.map((row) => mapPublicObservation(row));
    },

    async getPublicObservation(id) {
      const result = await supabase
        .from("athena_monitor_public_observations")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (result.error) raise(result.error);
      const row = readMonitorRpcRow(result.data);
      return row ? mapPublicObservation(row) : null;
    },

    async saveDiscoveryCoverage(coverage: SharedDiscoveryCoverage) {
      const inserted = await supabase
        .from("athena_monitor_discovery_coverage")
        .insert(discoveryCoverageToRow(coverage))
        .select("*")
        .single();
      if (inserted.error) raise(inserted.error);
      const row = readMonitorRpcRow(inserted.data);
      if (!row) throw new MonitorOperationError("PERSISTENCE_FAILED");
      return mapDiscoveryCoverage(row);
    },

    async listDiscoveryCoverage(sourceId) {
      const rows = await listRows(
        supabase
          .from("athena_monitor_discovery_coverage")
          .select("*")
          .eq("source_id", sourceId)
          .order("discovered_at", { ascending: true }),
      );
      return rows.map((row) => mapDiscoveryCoverage(row));
    },

    async attachResolvedPublicObservations(input) {
      const jobResult = await supabase
        .from("athena_monitor_jobs")
        .select("*")
        .eq("id", input.jobId)
        .maybeSingle();
      if (jobResult.error) raise(jobResult.error);
      const jobRow = readMonitorRpcRow(jobResult.data);
      if (!jobRow) return null;
      const job = mapMonitorJob(jobRow);
      const observations: MonitorObservation[] = [];
      for (const link of input.links) {
        const sharedResult = await supabase
          .from("athena_monitor_public_observations")
          .select("*")
          .eq("id", link.publicObservationId)
          .maybeSingle();
        if (sharedResult.error) raise(sharedResult.error);
        const sharedRow = readMonitorRpcRow(sharedResult.data);
        const shared = sharedRow ? mapPublicObservation(sharedRow) : null;
        if (!shared || !job.configurationSnapshot.sources.some((source) => source.sourceId === shared.registeredSourceId)) {
          throw new MonitorOperationError("PUBLIC_OBSERVATION_NOT_ATTACHABLE");
        }
        observations.push({
          id: shared.id,
          organizationId: job.organizationId,
          monitorId: job.monitorId,
          jobId: job.id,
          sourceId: shared.registeredSourceId,
          familyId: shared.familyId,
          productUrl: shared.canonicalUrl,
          observedAt: shared.observedAt,
          thresholdMatch: link.thresholdMatch,
          payloadVersion: 1,
          payload: {
            version: 1,
            productName: shared.productName,
            category: shared.categoryName,
            price: { amount: shared.priceAmount, currency: shared.currency },
            colorPatternIds: shared.colorPatternIds,
            colorPatternNames: shared.colorPatternNames,
            distinctVariationCount: shared.distinctVariationCount,
            sizes: shared.sizes,
            lengths: shared.lengths,
            imageUrl: shared.imageUrl,
            thresholdMatch: link.thresholdMatch,
          },
          publicObservationId: shared.id,
          sharedSourceId: shared.sourceId,
          reused: true,
          adapterId: shared.adapterId,
          adapterVersion: shared.adapterVersion,
          schemaVersion: shared.schemaVersion,
          contentKey: shared.contentKey,
          categoryIds: link.categoryIds,
          discoveryCoverageId: link.discoveryCoverageId,
          createdAt: shared.createdAt,
        });
      }
      if (observations.length > ATHENA_MONITOR_WORKER_DEFAULTS.batchSize) {
        throw new MonitorOperationError("BATCH_BOUND");
      }
      const published = await supabase.rpc("publish_athena_monitor_observations", {
        p_job_id: input.jobId,
        p_claim_token: input.claimToken,
        p_observations: observations.map((observation) => observationToRpcItem(observation)),
      });
      if (published.error) raise(published.error);
      return readMonitorRpcInteger(published.data);
    },

    async pageObservations(input: MonitorObservationPageQuery) {
      const result = await supabase.rpc("page_athena_monitor_observations", {
        p_organization_id: input.organizationId,
        p_job_id: input.jobId,
        p_page: input.page,
        p_page_size: input.pageSize,
        p_source_ids: input.sourceIds,
        p_category: input.category,
        p_min_variations: input.minVariations,
        p_max_price: input.maxPrice,
        p_observed_after: input.observedAfter,
        p_sort: input.sort,
      });
      if (result.error) raiseResultError(result.error);
      const payload = readJsonObject(result.data);
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      return {
        observations: rows.map((row) => observationFromResultRow(row)),
        total: readMonitorRpcInteger(payload?.total) ?? 0,
        page: readMonitorRpcInteger(payload?.page) ?? input.page,
        pageSize: readMonitorRpcInteger(payload?.pageSize) ?? input.pageSize,
        pageCount: readMonitorRpcInteger(payload?.pageCount) ?? 1,
      };
    },

    async listObservationFacts(organizationId, jobId) {
      const result = await supabase.rpc("list_athena_monitor_observation_facts", {
        p_organization_id: organizationId,
        p_job_id: jobId,
      });
      if (result.error) raiseResultError(result.error);
      const rows = readJsonArray(result.data);
      if (rows.length > MONITOR_RESULT_FACT_LIMIT) {
        throw new MonitorOperationError("RESULT_BOUND");
      }
      return rows.map((row) => factFromResultRow(row));
    },

    async getObservationsByIds(organizationId, jobId, observationIds) {
      if (observationIds.length > 24) throw new MonitorOperationError("RESULT_BOUND");
      const result = await supabase.rpc("get_athena_monitor_observations_by_ids", {
        p_organization_id: organizationId,
        p_job_id: jobId,
        p_observation_ids: [...observationIds],
      });
      if (result.error) raiseResultError(result.error);
      return readJsonArray(result.data).map((row) => observationFromResultRow(row));
    },
  };
}

function readJsonObject(data: unknown): Record<string, unknown> | null {
  const value = typeof data === "string" ? JSON.parse(data) as unknown : data;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readJsonArray(data: unknown): Record<string, unknown>[] {
  const value = typeof data === "string" ? JSON.parse(data) as unknown : data;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item));
}

function raiseResultError(error: { code?: string; message?: string }): never {
  if (error.message?.includes("monitor_result_fact_bound") || error.message?.includes("monitor_result_page_bound")) {
    throw new MonitorOperationError("RESULT_BOUND", error.message);
  }
  raise(error);
}

function observationFromResultRow(row: Record<string, unknown>): ReturnType<typeof mapMonitorObservation> {
  return mapMonitorObservation({
    ...row,
    payload: {
      version: 1,
      productName: typeof row.product_name === "string" ? row.product_name : null,
      category: typeof row.category_name === "string" ? row.category_name : null,
      price: {
        amount: typeof row.price_amount === "string" ? row.price_amount : null,
        currency: typeof row.currency === "string" ? row.currency : null,
      },
      colorPatternIds: Array.isArray(row.color_pattern_ids) ? row.color_pattern_ids : null,
      colorPatternNames: Array.isArray(row.color_pattern_names) ? row.color_pattern_names : null,
      distinctVariationCount:
        typeof row.distinct_variation_count === "number" ? row.distinct_variation_count : null,
      sizes: Array.isArray(row.sizes) ? row.sizes : null,
      lengths: Array.isArray(row.lengths) ? row.lengths : null,
      imageUrl: typeof row.image_url === "string" ? row.image_url : null,
      thresholdMatch: typeof row.threshold_match === "boolean" ? row.threshold_match : null,
    },
  });
}

function factFromResultRow(row: Record<string, unknown>): MonitorObservationFact {
  return {
    id: String(row.id ?? ""),
    sourceId: String(row.sourceId ?? row.source_id ?? ""),
    familyId: String(row.familyId ?? row.family_id ?? ""),
    observedAt: String(row.observedAt ?? row.observed_at ?? ""),
    reused: row.reused === true,
    thresholdMatch: typeof row.thresholdMatch === "boolean"
      ? row.thresholdMatch
      : typeof row.threshold_match === "boolean"
        ? row.threshold_match
        : null,
    publicObservationId: String(row.publicObservationId ?? row.public_observation_id ?? ""),
    category: typeof row.category === "string" ? row.category : null,
    priceAmount: typeof row.priceAmount === "string"
      ? row.priceAmount
      : typeof row.price_amount === "string"
        ? row.price_amount
        : null,
    currency: typeof row.currency === "string" ? row.currency : null,
    distinctVariationCount:
      typeof row.distinctVariationCount === "number"
        ? row.distinctVariationCount
        : typeof row.distinct_variation_count === "number"
          ? row.distinct_variation_count
          : null,
    colorPatternIds: Array.isArray(row.colorPatternIds)
      ? row.colorPatternIds as string[]
      : Array.isArray(row.color_pattern_ids)
        ? row.color_pattern_ids as string[]
        : null,
  };
}

function mapSharedSource(row: Record<string, unknown>): SharedMonitorSource {
  return {
    id: String(row.id),
    normalizedHost: String(row.normalized_host),
    canonicalUrl: String(row.canonical_url),
    registeredSourceId: String(row.registered_source_id),
    platform: String(row.platform),
    adapterId: String(row.adapter_id),
    adapterVersion: String(row.adapter_version),
    extractionConfig: row.extraction_config as SharedMonitorSource["extractionConfig"],
    discoveryStatus: row.discovery_status as SharedMonitorSource["discoveryStatus"],
    lastDiscoveredAt: typeof row.last_discovered_at === "string" ? row.last_discovered_at : null,
    accessStatus: row.access_status as SharedMonitorSource["accessStatus"],
    retryAfter: typeof row.retry_after === "string" ? row.retry_after : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function sharedSourceToRow(source: SharedMonitorSource): Record<string, unknown> {
  return {
    id: source.id,
    normalized_host: source.normalizedHost,
    canonical_url: source.canonicalUrl,
    registered_source_id: source.registeredSourceId,
    platform: source.platform,
    adapter_id: source.adapterId,
    adapter_version: source.adapterVersion,
    extraction_config: source.extractionConfig,
    discovery_status: source.discoveryStatus,
    last_discovered_at: source.lastDiscoveredAt,
    access_status: source.accessStatus,
    retry_after: source.retryAfter,
    created_at: source.createdAt,
    updated_at: source.updatedAt,
  };
}

function mapSharedCategory(row: Record<string, unknown>): SharedMonitorCategory {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    categoryKey: String(row.category_key),
    displayName: String(row.display_name),
    canonicalUrl: String(row.canonical_url),
    parentCategoryId: typeof row.parent_category_id === "string" ? row.parent_category_id : null,
    parentCategoryKey: typeof row.parent_category_key === "string" ? row.parent_category_key : null,
    discoveredAt: String(row.discovered_at ?? ""),
    discoveryStatus: row.discovery_status as SharedMonitorCategory["discoveryStatus"],
    productFamilyCount: typeof row.product_family_count === "number" ? row.product_family_count : null,
    productFamilyCountBasis: row.product_family_count_basis as SharedMonitorCategory["productFamilyCountBasis"],
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function sharedCategoryToRow(category: SharedMonitorCategory): Record<string, unknown> {
  return {
    id: category.id,
    source_id: category.sourceId,
    category_key: category.categoryKey,
    display_name: category.displayName,
    canonical_url: category.canonicalUrl,
    parent_category_id: category.parentCategoryId,
    parent_category_key: category.parentCategoryKey,
    discovered_at: category.discoveredAt,
    discovery_status: category.discoveryStatus,
    product_family_count: category.productFamilyCount,
    product_family_count_basis: category.productFamilyCountBasis,
    created_at: category.createdAt,
    updated_at: category.updatedAt,
  };
}

function mapPublicObservation(row: Record<string, unknown>): SharedPublicObservation {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    registeredSourceId: String(row.registered_source_id),
    familyId: String(row.family_id),
    adapterId: String(row.adapter_id),
    adapterVersion: String(row.adapter_version),
    schemaVersion: typeof row.schema_version === "number" ? row.schema_version : 1,
    productName: typeof row.product_name === "string" ? row.product_name : null,
    canonicalUrl: String(row.canonical_url),
    priceAmount: typeof row.price_amount === "string" ? row.price_amount : null,
    currency: typeof row.currency === "string" ? row.currency : null,
    colorPatternIds: Array.isArray(row.color_pattern_ids) ? row.color_pattern_ids as string[] : null,
    colorPatternNames: Array.isArray(row.color_pattern_names) ? row.color_pattern_names as string[] : null,
    distinctVariationCount:
      typeof row.distinct_variation_count === "number" ? row.distinct_variation_count : null,
    sizes: Array.isArray(row.sizes) ? row.sizes as string[] : null,
    lengths: Array.isArray(row.lengths) ? row.lengths as string[] : null,
    imageUrl: typeof row.image_url === "string" ? row.image_url : null,
    categoryName: typeof row.category_name === "string" ? row.category_name : null,
    observedAt: String(row.observed_at ?? ""),
    provenance: row.provenance as SharedPublicObservation["provenance"],
    contentKey: String(row.content_key),
    createdAt: String(row.created_at ?? ""),
  };
}

function publicObservationToRow(observation: SharedPublicObservation): Record<string, unknown> {
  return {
    id: observation.id,
    source_id: observation.sourceId,
    registered_source_id: observation.registeredSourceId,
    family_id: observation.familyId,
    adapter_id: observation.adapterId,
    adapter_version: observation.adapterVersion,
    schema_version: observation.schemaVersion,
    product_name: observation.productName,
    canonical_url: observation.canonicalUrl,
    price_amount: observation.priceAmount,
    currency: observation.currency,
    color_pattern_ids: observation.colorPatternIds,
    color_pattern_names: observation.colorPatternNames,
    distinct_variation_count: observation.distinctVariationCount,
    sizes: observation.sizes,
    lengths: observation.lengths,
    image_url: observation.imageUrl,
    observed_at: observation.observedAt,
    provenance: observation.provenance,
    content_key: observation.contentKey,
    created_at: observation.createdAt,
  };
}

function mapDiscoveryCoverage(row: Record<string, unknown>): SharedDiscoveryCoverage {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    scopeKind: row.scope_kind as SharedDiscoveryCoverage["scopeKind"],
    categoryId: typeof row.category_id === "string" ? row.category_id : null,
    scopeKey: String(row.scope_key),
    status: row.status as SharedDiscoveryCoverage["status"],
    adapterId: String(row.adapter_id),
    adapterVersion: String(row.adapter_version),
    schemaVersion: typeof row.schema_version === "number" ? row.schema_version : 1,
    discoveredAt: String(row.discovered_at ?? ""),
    familyIds: Array.isArray(row.family_ids) ? row.family_ids.filter((item): item is string => typeof item === "string") : [],
    familyCount: typeof row.family_count === "number" ? row.family_count : 0,
    createdAt: String(row.created_at ?? ""),
  };
}

function discoveryCoverageToRow(coverage: SharedDiscoveryCoverage): Record<string, unknown> {
  return {
    id: coverage.id,
    source_id: coverage.sourceId,
    scope_kind: coverage.scopeKind,
    category_id: coverage.categoryId,
    scope_key: coverage.scopeKey,
    status: coverage.status,
    adapter_id: coverage.adapterId,
    adapter_version: coverage.adapterVersion,
    schema_version: coverage.schemaVersion,
    discovered_at: coverage.discoveredAt,
    family_ids: coverage.familyIds,
    family_count: coverage.familyCount,
    created_at: coverage.createdAt,
  };
}
