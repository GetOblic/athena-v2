/**
 * Organization-scoped Monitor API for the customer workspace.
 * Organization identity comes from the authenticated context.
 * Category refresh is one bounded discovery request. Enqueue does not extract.
 */

import { NextResponse } from "next/server";

import { categoryKeyFromUrl } from "@/services/monitor/monitorWebsiteIdentity";
import { MonitorOperationError } from "@/services/monitor/monitorErrors";
import { getMonitorSource } from "@/services/monitor/monitorSources";
import type { MonitorService } from "@/services/monitor/monitorService";
import type { MonitorAdapterCategory } from "@/services/monitor/monitorAdapter";
import type { MonitorComparison } from "@/services/monitor/monitorComparison";
import {
  compareObservationFacts,
  resolveMonitorResultSourceIds,
  type MonitorObservationFact,
} from "@/services/monitor/monitorResultPage";
import type { MonitorJob, MonitorObservation } from "@/services/monitor/monitorTypes";
import {
  attachHistoricalChanges,
  filterMonitorCards,
  MONITOR_RESULTS_PAGE_SIZE,
  pageMonitorCards,
  presentCategoryCount,
  presentMonitorProgress,
  presentResultCard,
  resolveMonitorPage,
  retailerName,
  sortMonitorCards,
  type MonitorCustomerCategory,
  type MonitorHistoricalChange,
  type MonitorResultsQuery,
  type MonitorWebsiteState,
} from "@/lib/monitor/monitorWorkspaceModel";
import type {
  SavedMonitor,
  SharedMonitorCategory,
} from "@/services/monitor/monitorTypes";

const CHANGES = new Set<MonitorHistoricalChange>([
  "newly_observed",
  "reused_inclusion",
  "crossed_up",
  "crossed_down",
  "variations_added",
  "variations_removed",
  "price_change",
  "not_found",
]);

const SORTS = new Set(["website", "category", "variations", "price", "observed", "change"]);

const CATEGORY_DISCOVERY_TIMEOUT_MS = 8_000;
const CATEGORY_DISCOVERY_LIMIT = 50;

export type MonitorCategoryDiscoverer = (input: {
  sourceId: string;
  canonicalUrl: string;
  registrableDomain: string;
}) => Promise<
  | { ok: true; categories: MonitorAdapterCategory[] }
  | { ok: false; code: "access_blocked" | "unsupported" | "fetch_failed" }
>;

type WebsiteInspection = {
  state: MonitorWebsiteState;
  sourceId: string | null;
  displayName: string | null;
  canonicalUrl: string | null;
  selectable: boolean;
  categoriesFresh: boolean;
  categories: MonitorCustomerCategory[];
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isOrganizationAccessError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "OrganizationAccessError" || error.name === "OrganizationContextMissingError")
  );
}

function publicError(error: unknown) {
  if (isOrganizationAccessError(error)) {
    return json({ ok: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } }, 401);
  }
  if (error instanceof MonitorOperationError) {
    if (
      error.code === "FOREIGN_KEY_VIOLATION" ||
      error.code === "CONSTRAINT_VIOLATION" ||
      error.code === "PERSISTENCE_FAILED" ||
      error.code === "JOB_EXECUTION_FAILED"
    ) {
      return json(
        { ok: false, error: { code: "REQUEST_FAILED", message: "Athena could not complete that request." } },
        500,
      );
    }
    const status =
      error.code === "ENTITLEMENT_REQUIRED"
        ? 403
        : error.code === "NOT_FOUND"
          ? 404
          : error.code === "ACTIVE_JOB_EXISTS"
            ? 409
            : error.code === "INVALID_CONFIGURATION" ||
                error.code === "INVALID_REQUEST" ||
                error.code === "UNSUPPORTED_SOURCE"
              ? 400
              : 400;
    const message =
      error.code === "ENTITLEMENT_REQUIRED"
        ? "Full Athena is required."
        : error.code === "NOT_FOUND"
          ? "Not found."
          : error.code === "ACTIVE_JOB_EXISTS"
            ? "An active search already exists."
            : error.code === "UNSUPPORTED_SOURCE"
              ? "This website is not supported."
              : error.code === "INVALID_CONFIGURATION" &&
                  error.message.includes("at least one discovered category")
                ? "Select at least one category, or choose the entire catalog explicitly."
                : "The request could not be accepted.";
    return json({ ok: false, error: { code: error.code, message } }, status);
  }
  return json(
    { ok: false, error: { code: "REQUEST_FAILED", message: "Athena could not complete that request." } },
    500,
  );
}

export async function monitorResponse(work: () => Promise<unknown>) {
  try {
    const data = await work();
    return json({ ok: true, ...(data as Record<string, unknown>) });
  } catch (error) {
    return publicError(error);
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 64_000) {
    throw new MonitorOperationError("INVALID_REQUEST");
  }
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new MonitorOperationError("INVALID_REQUEST");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof MonitorOperationError) throw error;
    throw new MonitorOperationError("INVALID_REQUEST");
  }
}

function rejectClientAttachment(body: Record<string, unknown>) {
  if ("publicObservationId" in body || "publicObservationIds" in body) {
    throw new MonitorOperationError("INVALID_REQUEST");
  }
}

function presentMonitor(monitor: SavedMonitor) {
  return {
    id: monitor.id,
    name: monitor.name,
    configuration: monitor.configuration,
    lastSuccessfulJobId: monitor.lastSuccessfulJobId,
    lastSuccessfulAt: monitor.lastSuccessfulAt,
    createdAt: monitor.createdAt,
    updatedAt: monitor.updatedAt,
  };
}

function presentJob(job: MonitorJob, categoryNames?: ReadonlyMap<string, string>) {
  return {
    id: job.id,
    monitorId: job.monitorId,
    status: job.status,
    configurationSnapshot: job.configurationSnapshot,
    progress: presentMonitorProgress(job, new Date(), categoryNames),
    cancellationRequestedAt: job.cancellationRequestedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    errorCode: job.errorCode,
    forceFresh: job.progress.forceFresh === true,
  };
}

function presentCategories(categories: readonly SharedMonitorCategory[]): MonitorCustomerCategory[] {
  return categories
    .filter((category) => category.discoveryStatus !== "removed")
    .map((category) => ({
      categoryKey: category.categoryKey,
      displayName: category.displayName,
      canonicalUrl: category.canonicalUrl,
      parentCategoryKey: category.parentCategoryKey,
      productFamilyCount: presentCategoryCount(
        category.productFamilyCount,
        category.productFamilyCountBasis,
      ),
    }));
}

function configurationFrom(body: Record<string, unknown>): unknown {
  rejectClientAttachment(body);
  if (!body.configuration || typeof body.configuration !== "object") {
    throw new MonitorOperationError("INVALID_CONFIGURATION");
  }
  return body.configuration;
}

export async function readMonitors(service: MonitorService) {
  const context = await service.authorizeOperator();
  const monitors = await service.listMonitors(context.organizationId);
  return { monitors: monitors.map(presentMonitor) };
}

export async function createMonitorForOperator(service: MonitorService, body: Record<string, unknown>) {
  const context = await service.authorizeOperator();
  const monitor = await service.createMonitor({
    organizationId: context.organizationId,
    userId: context.userId,
    configuration: configurationFrom(body),
  });
  return { monitor: presentMonitor(monitor) };
}

export async function readMonitor(service: MonitorService, monitorId: string) {
  const context = await service.authorizeOperator();
  const monitor = await service.getMonitor(context.organizationId, monitorId);
  return { monitor: presentMonitor(monitor) };
}

export async function updateMonitorForOperator(
  service: MonitorService,
  monitorId: string,
  body: Record<string, unknown>,
) {
  const context = await service.authorizeOperator();
  const monitor = await service.updateMonitor({
    organizationId: context.organizationId,
    monitorId,
    configuration: configurationFrom(body),
  });
  return { monitor: presentMonitor(monitor) };
}

export async function readJobs(service: MonitorService, monitorId: string | null) {
  const context = await service.authorizeOperator();
  const jobs = await service.listMonitorJobs(context.organizationId, monitorId ?? undefined);
  return { jobs: jobs.map((job) => presentJob(job)) };
}

export async function enqueueForOperator(
  service: MonitorService,
  monitorId: string,
  body: Record<string, unknown>,
) {
  rejectClientAttachment(body);
  if ("code" in body || "script" in body || "scraper" in body) {
    throw new MonitorOperationError("INVALID_REQUEST");
  }
  const context = await service.authorizeOperator();
  const job = await service.enqueueMonitorJob({
    organizationId: context.organizationId,
    monitorId,
    forceFresh: body.forceFresh === true,
  });
  return { job: presentJob(job) };
}

export async function readJob(service: MonitorService, jobId: string) {
  const context = await service.authorizeOperator();
  const job = await service.getMonitorJob(context.organizationId, jobId);
  return { job: presentJob(job) };
}

export async function cancelJob(service: MonitorService, jobId: string) {
  const context = await service.authorizeOperator();
  const job = await service.requestMonitorCancellation({
    organizationId: context.organizationId,
    jobId,
  });
  return { job: presentJob(job) };
}

function queryFrom(params: URLSearchParams): MonitorResultsQuery {
  const change = params.get("change");
  const sort = params.get("sort");
  const minVariations = params.get("minVariations");
  const maxPrice = params.get("maxPrice");
  return {
    page: resolveMonitorPage(params.get("page")),
    website: params.get("website"),
    category: params.get("category"),
    minVariations: minVariations && Number.isInteger(Number(minVariations)) ? Number(minVariations) : null,
    maxPrice: maxPrice && Number.isFinite(Number(maxPrice)) ? Number(maxPrice) : null,
    observedAfter: params.get("observedAfter"),
    change: change && CHANGES.has(change as MonitorHistoricalChange) ? (change as MonitorHistoricalChange) : null,
    sort: sort && SORTS.has(sort) ? (sort as MonitorResultsQuery["sort"]) : "observed",
  };
}

function emptyPage(pageSize: number) {
  return { observations: [] as MonitorObservation[], total: 0, page: 1, pageSize, pageCount: 1 };
}

async function historicalContext(
  service: MonitorService,
  organizationId: string,
  job: MonitorJob,
  baselineJobId: string | null,
  currentFacts?: readonly MonitorObservationFact[],
) {
  if (!baselineJobId) {
    return { comparison: null as MonitorComparison | null, currentFacts: currentFacts ?? null };
  }
  const baseline = await service.getMonitorJob(organizationId, baselineJobId);
  const [baselineFacts, facts] = await Promise.all([
    service.listMonitorObservationFacts(organizationId, baseline.id),
    currentFacts
      ? Promise.resolve(currentFacts)
      : service.listMonitorObservationFacts(organizationId, job.id),
  ]);
  return {
    comparison: compareObservationFacts({
      baselineJob: baseline,
      currentJob: job,
      baselineFacts,
      currentFacts: facts,
    }),
    currentFacts: facts,
  };
}

export async function readResults(service: MonitorService, jobId: string, params: URLSearchParams) {
  const context = await service.authorizeOperator();
  const baseline = params.get("baselineJobId");
  const query = queryFrom(params);
  const job = await service.getMonitorJob(context.organizationId, jobId);
  const sourceIds = resolveMonitorResultSourceIds(query.website);
  const needsHistoricalOrdering = query.change != null || query.sort === "change" || baseline != null;

  if (query.change != null || query.sort === "change") {
    const facts = await service.listMonitorObservationFacts(context.organizationId, job.id);
    const history = await historicalContext(
      service,
      context.organizationId,
      job,
      baseline,
      facts,
    );
    const stamped = attachHistoricalChanges(
      facts.map((fact) => ({
        observationId: fact.id,
        sourceId: fact.sourceId,
        retailer: retailerName(fact.sourceId),
        familyId: fact.familyId,
        productName: fact.familyId,
        category: fact.category,
        priceAmount: fact.priceAmount,
        currency: fact.currency,
        distinctVariationCount: fact.distinctVariationCount,
        colorPatternNames: [],
        observedAt: fact.observedAt,
        productUrl: null,
        imageUrl: null,
        reused: fact.reused,
        thresholdMatch: fact.thresholdMatch,
        changes: [],
      })),
      history.comparison,
    );
    const filtered = sortMonitorCards(filterMonitorCards(stamped.cards, query), query.sort);
    const window = pageMonitorCards(filtered, query.page ?? 1);
    const ids = window.items.map((card) => card.observationId);
    const full = ids.length
      ? await service.getMonitorObservationsByIds({
          organizationId: context.organizationId,
          jobId: job.id,
          observationIds: ids,
        })
      : [];
    const byId = new Map(full.map((observation) => [observation.id, observation]));
    const results = window.items.flatMap((card) => {
      const observation = byId.get(card.observationId);
      if (!observation) return [];
      return [{ ...presentResultCard(observation), changes: card.changes }];
    });
    return {
      job: presentJob(job),
      networkRequests: 0,
      comparison: history.comparison,
      missing: stamped.missing,
      page: window.page,
      pageSize: window.pageSize,
      total: window.total,
      pageCount: window.pageCount,
      results,
    };
  }

  const paged = sourceIds && sourceIds.length === 0
    ? emptyPage(MONITOR_RESULTS_PAGE_SIZE)
    : await service.pageMonitorObservations({
        organizationId: context.organizationId,
        jobId: job.id,
        page: query.page ?? 1,
        pageSize: MONITOR_RESULTS_PAGE_SIZE,
        sourceIds,
        category: query.category ?? null,
        minVariations: query.minVariations ?? null,
        maxPrice: query.maxPrice ?? null,
        observedAfter: query.observedAfter ?? null,
        sort: query.sort ?? "observed",
      });
  const history = needsHistoricalOrdering
    ? await historicalContext(service, context.organizationId, job, baseline)
    : { comparison: null, currentFacts: null };
  const presented = paged.observations.map((observation) => presentResultCard(observation));
  const attached = attachHistoricalChanges(presented, history.comparison);
  return {
    job: presentJob(job),
    networkRequests: 0,
    comparison: history.comparison,
    missing: attached.missing,
    page: paged.page,
    pageSize: paged.pageSize,
    total: paged.total,
    pageCount: paged.pageCount,
    results: attached.cards,
  };
}

export async function refilterJob(service: MonitorService, jobId: string, body: Record<string, unknown>) {
  rejectClientAttachment(body);
  const minimum = body.minimum;
  if (typeof minimum !== "number") {
    throw new MonitorOperationError("INVALID_CONFIGURATION");
  }
  const context = await service.authorizeOperator();
  const refiltered = await service.refilterMonitorJob({
    organizationId: context.organizationId,
    jobId,
    minimum,
  });
  if (refiltered.networkRequests !== 0) {
    throw new MonitorOperationError("INVALID_REQUEST");
  }
  const job = await service.getMonitorJob(context.organizationId, jobId);
  const matching = refiltered.observations.filter((observation) => observation.thresholdMatch === true);
  const page = pageMonitorCards(matching, 1);
  const ids = page.items.map((observation) => observation.observationId);
  const full = ids.length
    ? await service.getMonitorObservationsByIds({
        organizationId: context.organizationId,
        jobId: job.id,
        observationIds: ids,
      })
    : [];
  const byId = new Map(full.map((observation) => [observation.id, observation]));
  const thresholds = new Map(
    refiltered.observations.map((observation) => [observation.observationId, observation.thresholdMatch]),
  );
  return {
    networkRequests: 0 as const,
    criterionMinimum: refiltered.criterionMinimum,
    job: presentJob(job),
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
    pageCount: page.pageCount,
    results: ids.flatMap((id) => {
      const observation = byId.get(id);
      if (!observation) return [];
      return [presentResultCard(observation, thresholds.get(id) ?? null)];
    }),
  };
}

export async function compareJobs(service: MonitorService, body: Record<string, unknown>) {
  rejectClientAttachment(body);
  if (typeof body.baselineJobId !== "string" || typeof body.currentJobId !== "string") {
    throw new MonitorOperationError("INVALID_REQUEST");
  }
  const context = await service.authorizeOperator();
  const comparison = await service.compareMonitorJobs({
    organizationId: context.organizationId,
    baselineJobId: body.baselineJobId,
    currentJobId: body.currentJobId,
  });
  const paged = await service.pageMonitorObservations({
    organizationId: context.organizationId,
    jobId: body.currentJobId,
    page: 1,
    pageSize: MONITOR_RESULTS_PAGE_SIZE,
    sourceIds: null,
    category: null,
    minVariations: null,
    maxPrice: null,
    observedAfter: null,
    sort: "observed",
  });
  const attached = attachHistoricalChanges(
    paged.observations.map((observation) => presentResultCard(observation)),
    comparison,
  );
  return {
    comparison,
    missing: attached.missing.slice(0, MONITOR_RESULTS_PAGE_SIZE),
    results: attached.cards,
  };
}

function categoriesFromAdapter(categories: readonly MonitorAdapterCategory[], stamp: string) {
  const bounded = categories.slice(0, CATEGORY_DISCOVERY_LIMIT);
  const rows = [];
  for (const category of bounded) {
    let categoryKey: string;
    try {
      categoryKey = categoryKeyFromUrl(category.canonicalUrl);
    } catch {
      continue;
    }
    rows.push({
      categoryKey,
      displayName: category.displayName,
      canonicalUrl: category.canonicalUrl,
      parentCategoryKey: category.parentCategoryKey,
      discoveredAt: stamp,
      discoveryStatus: "current" as const,
      productFamilyCount: null,
      productFamilyCountBasis: null,
    });
  }
  return rows;
}

export async function inspectWebsite(
  service: MonitorService,
  body: Record<string, unknown>,
  discover?: MonitorCategoryDiscoverer,
): Promise<{ website: WebsiteInspection }> {
  rejectClientAttachment(body);
  if (typeof body.websiteUrl !== "string") {
    throw new MonitorOperationError("INVALID_REQUEST");
  }
  const context = await service.authorizeOperator();
  let listed;
  try {
    listed = await service.listDiscoveredCategories(context.organizationId, body.websiteUrl);
  } catch (error) {
    if (error instanceof MonitorOperationError && error.code === "UNSUPPORTED_SOURCE") {
      return {
        website: {
          state: "unsupported",
          sourceId: null,
          displayName: null,
          canonicalUrl: null,
          selectable: false,
          categoriesFresh: false,
          categories: [],
        },
      };
    }
    throw error;
  }
  const registered = getMonitorSource(listed.source.registeredSourceId);
  const blocked =
    registered?.productionAccess === "blocked" || listed.source.accessStatus === "blocked";
  if (blocked) {
    return {
      website: {
        state: "access_unavailable",
        sourceId: listed.source.registeredSourceId,
        displayName: retailerName(listed.source.registeredSourceId),
        canonicalUrl: listed.source.canonicalUrl,
        selectable: false,
        categoriesFresh: false,
        categories: [],
      },
    };
  }
  let categories = listed.categories;
  let fresh = listed.fresh;
  if (body.refresh === true && discover) {
    const discovered = await discover({
      sourceId: listed.source.registeredSourceId,
      canonicalUrl: listed.source.canonicalUrl,
      registrableDomain: registered?.registrableDomain ?? listed.source.normalizedHost,
    });
    if (!discovered.ok) {
      const state: MonitorWebsiteState =
        discovered.code === "access_blocked"
          ? "access_unavailable"
          : discovered.code === "unsupported"
            ? "unsupported"
            : "temporary_error";
      return {
        website: {
          state,
          sourceId: listed.source.registeredSourceId,
          displayName: retailerName(listed.source.registeredSourceId),
          canonicalUrl: listed.source.canonicalUrl,
          selectable: false,
          categoriesFresh: false,
          categories: presentCategories(categories),
        },
      };
    }
    const stamp = new Date().toISOString();
    const rows = categoriesFromAdapter(discovered.categories, stamp);
    if (rows.length > 0) {
      const refresh = await service.recordSharedCategoryDiscovery({
        organizationId: context.organizationId,
        websiteUrl: body.websiteUrl,
        discoveredAt: stamp,
        authoritativeTaxonomy: false,
        categories: rows,
      });
      categories = refresh.categories;
      fresh = refresh.freshnessAdvanced && categories.some((category) => category.discoveryStatus === "current");
    } else {
      fresh = false;
    }
  }
  if (listed.source.accessStatus === "cooldown" && !fresh) {
    return {
      website: {
        state: "temporary_error",
        sourceId: listed.source.registeredSourceId,
        displayName: retailerName(listed.source.registeredSourceId),
        canonicalUrl: listed.source.canonicalUrl,
        selectable: false,
        categoriesFresh: false,
        categories: [],
      },
    };
  }
  const presented = presentCategories(categories);
  const state: MonitorWebsiteState = fresh && presented.length > 0 ? "available" : "discovering";
  return {
    website: {
      state,
      sourceId: listed.source.registeredSourceId,
      displayName: retailerName(listed.source.registeredSourceId),
      canonicalUrl: listed.source.canonicalUrl,
      selectable: state === "available",
      categoriesFresh: fresh,
      categories: presented,
    },
  };
}

export async function createBoundedCategoryDiscoverer(): Promise<MonitorCategoryDiscoverer> {
  const [{ productionAdapterFor }, { createMonitorPageFetch, createMonitorResources }] = await Promise.all([
    import("@/services/monitor/monitorRegistry"),
    import("@/services/monitor/monitorHttp"),
  ]);
  return async (input) => {
    const adapter = productionAdapterFor(input.sourceId);
    if (!adapter) return { ok: false, code: "unsupported" };
    const resources = createMonitorResources();
    try {
      const fetchPage = createMonitorPageFetch(resources);
      const result = await adapter.discoverCategories({
        canonicalUrl: input.canonicalUrl,
        registrableDomain: input.registrableDomain,
        fetchPage,
        timeoutMs: CATEGORY_DISCOVERY_TIMEOUT_MS,
        signal: AbortSignal.timeout(CATEGORY_DISCOVERY_TIMEOUT_MS),
      });
      if (!result.ok) {
        return {
          ok: false,
          code:
            result.code === "access_blocked"
              ? "access_blocked"
              : result.code === "unsupported"
                ? "unsupported"
                : "fetch_failed",
        };
      }
      return { ok: true, categories: result.value.categories.slice(0, CATEGORY_DISCOVERY_LIMIT) };
    } finally {
      resources.close();
    }
  };
}

export async function monitorServiceForRequest(): Promise<MonitorService> {
  const [{ createSupabaseMonitorStore }, { createMonitorService }, { defaultResolveMonitorPlan }] =
    await Promise.all([
      import("@/services/monitor/monitorSupabaseStore"),
      import("@/services/monitor/monitorService"),
      import("@/services/monitor/monitorAuthorization"),
    ]);
  return createMonitorService({
    store: await createSupabaseMonitorStore(),
    resolvePlan: defaultResolveMonitorPlan,
  });
}
