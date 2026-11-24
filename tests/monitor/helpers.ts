import type { AthenaPlan } from "../../services/athenaPlan";
import { createMemoryMonitorStore } from "../../services/monitor/monitorMemoryStore";
import { createMonitorService, type MonitorService } from "../../services/monitor/monitorService";
import type { MonitorStore } from "../../services/monitor/monitorStore";
import type { MonitorObservationDraft } from "../../services/monitor/monitorObservation";
import type { MonitorJob, MonitorSourceCoverage } from "../../services/monitor/monitorTypes";

export const ORG_A = "11111111-1111-4111-8111-111111111111";
export const ORG_B = "22222222-2222-4222-8222-222222222222";
export const USER_A = "33333333-3333-4333-8333-333333333333";

export function createClock(start = "2026-11-24T12:00:00.000Z") {
  let current = Date.parse(start);
  return {
    now: () => new Date(current),
    advance(milliseconds: number) {
      current += milliseconds;
    },
  };
}

export function toscaneConfiguration(input?: {
  name?: string;
  minimum?: number;
  selection?:
    | { mode: "whole_catalog" }
    | { mode: "categories"; categoryUrls: string[] };
  objective?: string;
}) {
  return {
    version: 1 as const,
    name: input?.name ?? "Toscane colors",
    objective: input?.objective ?? "Find families with several distinct color patterns.",
    sources: [
      {
        sourceId: "toscane",
        websiteUrl: "https://www.toscane-boutique.fr/",
        selection: input?.selection ?? { mode: "whole_catalog" as const },
      },
    ],
    criterion: {
      id: "distinctColorPatternCount",
      operator: "gte" as const,
      minimum: input?.minimum ?? 3,
    },
  };
}

export function mixedConfiguration() {
  return {
    ...toscaneConfiguration(),
    name: "Toscane and Breal",
    sources: [
      ...toscaneConfiguration().sources,
      {
        sourceId: "breal",
        websiteUrl: "https://www.breal.net/",
        selection: {
          mode: "categories" as const,
          categoryUrls: ["https://www.breal.net/jeans-femme-sc_010300"],
        },
      },
    ],
  };
}

export function observationDraft(
  familyId: string,
  count: number | null,
  overrides: Partial<MonitorObservationDraft> = {},
): MonitorObservationDraft {
  return {
    sourceId: "toscane",
    familyId,
    productUrl: `https://www.toscane-boutique.fr/fr/pantalons/toscane/modele-p-${familyId}-coul-1.htm`,
    productName: `Family ${familyId}`,
    category: "Pantalons",
    priceAmount: "49.00",
    currency: "EUR",
    colorPatternIds:
      count == null ? null : Array.from({ length: count }, (_, index) => `c${index + 1}`),
    colorPatternNames:
      count == null ? null : Array.from({ length: count }, (_, index) => `Color ${index + 1}`),
    distinctVariationCount: count,
    sizes: ["1", "2"],
    lengths: null,
    imageUrl: "https://cdn.toscane-boutique.fr/products_images/front.jpg",
    observedAt: "2026-11-24T12:00:00.000Z",
    ...overrides,
  };
}

export function completedCoverage(job: MonitorJob): MonitorSourceCoverage[] {
  return job.sourceCoverage.map((source) =>
    source.status === "blocked"
      ? source
      : {
          ...source,
          status: "completed",
          errorCode: null,
          discoveryStatus: "completed",
          discoveryScopeKey:
            source.discoveryScopeKey ??
            (source.selection.mode === "whole_catalog"
              ? "whole_catalog"
              : (source.selection.categoryIds ?? []).join(",")),
          discoveryCoverageId: source.discoveryCoverageId ?? "00000000-0000-4000-8000-0000000000c1",
          discoveredAt: source.discoveredAt ?? "2026-11-24T12:00:00.000Z",
          failedFamilyIds: [],
          familiesFailed: 0,
        },
  );
}

export function createFoundation(input?: {
  plans?: Record<string, AthenaPlan>;
  clock?: ReturnType<typeof createClock>;
}) {
  const clock = input?.clock ?? createClock();
  const plans = new Map<string, AthenaPlan>(
    Object.entries(input?.plans ?? { [ORG_A]: "full", [ORG_B]: "free" }),
  );
  const calls: string[] = [];
  const store = createMemoryMonitorStore({ now: clock.now });
  const countingStore: MonitorStore = {
    ...store,
    insertMonitor: (monitor) => store.insertMonitor(monitor),
    updateMonitorConfiguration: (monitor) => store.updateMonitorConfiguration(monitor),
    listMonitors: async (organizationId) => {
      calls.push(`listMonitors:${organizationId}`);
      return store.listMonitors(organizationId);
    },
    getMonitor: async (organizationId, monitorId) => {
      calls.push(`getMonitor:${organizationId}`);
      return store.getMonitor(organizationId, monitorId);
    },
    insertJob: (job) => store.insertJob(job),
    getJob: async (organizationId, jobId) => {
      calls.push(`getJob:${organizationId}`);
      return store.getJob(organizationId, jobId);
    },
    getJobById: (jobId) => store.getJobById(jobId),
    listJobs: (input) => store.listJobs(input),
    listObservations: async (organizationId, jobId) => {
      calls.push(`listObservations:${organizationId}`);
      return store.listObservations(organizationId, jobId);
    },
    claimNext: (claim) => store.claimNext(claim),
    heartbeat: (heartbeat) => store.heartbeat(heartbeat),
    publishObservations: async (publish) => {
      calls.push("publishObservations");
      return store.publishObservations(publish);
    },
    finalize: (finalize) => store.finalize(finalize),
    requestCancellation: (cancellation) => store.requestCancellation(cancellation),
    recoverExpired: () => store.recoverExpired(),
  };
  const service: MonitorService = createMonitorService({
    store: countingStore,
    now: clock.now,
    resolvePlan: async (organizationId) => {
      calls.push(`resolvePlan:${organizationId}`);
      const plan = plans.get(organizationId);
      if (!plan) throw new Error(`missing plan ${organizationId}`);
      return plan;
    },
    requireOrganizationContext: async () => ({ organizationId: ORG_A, userId: USER_A }),
  });
  return { clock, plans, calls, store, service };
}
