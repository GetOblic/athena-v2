/**
 * Bounded Monitor result selection.
 * Full observation payloads are paged after filters and sorting.
 * Historical comparison uses compact facts, capped at the discovery family bound.
 */

import { compareMonitorExecutions, type MonitorComparison } from "@/services/monitor/monitorComparison";
import { priceCents } from "@/services/monitor/monitorObservation";
import { MONITOR_SOURCES } from "@/services/monitor/monitorSources";
import type { MonitorJob, MonitorObservation } from "@/services/monitor/monitorTypes";

export const MONITOR_RESULT_FACT_LIMIT = 20_000;

export type MonitorResultSort = "website" | "category" | "variations" | "price" | "observed" | "change";

export type MonitorObservationFact = {
  id: string;
  sourceId: string;
  familyId: string;
  observedAt: string;
  reused: boolean;
  thresholdMatch: boolean | null;
  publicObservationId: string;
  category: string | null;
  priceAmount: string | null;
  currency: string | null;
  distinctVariationCount: number | null;
  colorPatternIds: string[] | null;
};

export type MonitorObservationPageQuery = {
  organizationId: string;
  jobId: string;
  page: number;
  pageSize: number;
  sourceIds: string[] | null;
  category: string | null;
  minVariations: number | null;
  maxPrice: number | null;
  observedAfter: string | null;
  sort: Exclude<MonitorResultSort, "change">;
};

export type MonitorObservationPage = {
  observations: MonitorObservation[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type MonitorResultFields = {
  id: string;
  sourceId: string;
  retailer: string;
  category: string | null;
  priceAmount: string | null;
  distinctVariationCount: number | null;
  observedAt: string;
  changeRank: number;
};

export function resolveMonitorResultSourceIds(website: string | null | undefined): string[] | null {
  if (!website || !website.trim()) return null;
  const trimmed = website.trim();
  return MONITOR_SOURCES.filter(
    (source) => source.id === trimmed || source.displayName === trimmed,
  ).map((source) => source.id);
}

export function monitorResultPrice(amount: string | null | undefined): number | null {
  if (!amount) return null;
  const cents = priceCents(amount);
  return cents == null ? null : Number(cents) / 100;
}

export function pageWindow(total: number, page: number, pageSize: number): {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  offset: number;
} {
  const safeSize = pageSize > 0 ? pageSize : 24;
  const pageCount = Math.max(1, Math.ceil(total / safeSize));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  return {
    page: safePage,
    pageSize: safeSize,
    pageCount,
    total,
    offset: (safePage - 1) * safeSize,
  };
}

export function monitorResultMatches(
  fields: MonitorResultFields,
  query: {
    website?: string | null;
    category?: string | null;
    minVariations?: number | null;
    maxPrice?: number | null;
    observedAfter?: string | null;
    change?: string | null;
  },
): boolean {
  if (query.website && fields.sourceId !== query.website && fields.retailer !== query.website) {
    return false;
  }
  if (query.category && fields.category !== query.category) return false;
  if (
    query.minVariations != null &&
    (fields.distinctVariationCount == null || fields.distinctVariationCount < query.minVariations)
  ) {
    return false;
  }
  if (query.maxPrice != null) {
    const price = monitorResultPrice(fields.priceAmount);
    if (price == null || price > query.maxPrice) return false;
  }
  if (query.observedAfter) {
    const observed = Date.parse(fields.observedAt);
    const bound = Date.parse(query.observedAfter);
    if (!Number.isFinite(observed) || !Number.isFinite(bound) || observed < bound) return false;
  }
  return true;
}

export function compareMonitorResultFields(
  left: MonitorResultFields,
  right: MonitorResultFields,
  sort: MonitorResultSort,
): number {
  let primary = 0;
  switch (sort) {
    case "website":
      primary = left.retailer.localeCompare(right.retailer);
      break;
    case "category":
      primary = (left.category ?? "").localeCompare(right.category ?? "");
      break;
    case "variations":
      primary = (right.distinctVariationCount ?? -1) - (left.distinctVariationCount ?? -1);
      break;
    case "price":
      primary =
        (monitorResultPrice(left.priceAmount) ?? Number.POSITIVE_INFINITY) -
        (monitorResultPrice(right.priceAmount) ?? Number.POSITIVE_INFINITY);
      break;
    case "change":
      primary = right.changeRank - left.changeRank;
      break;
    case "observed":
    default:
      primary = right.observedAt.localeCompare(left.observedAt);
      break;
  }
  if (primary !== 0) return primary;
  return left.id.localeCompare(right.id);
}

export function factFromObservation(observation: MonitorObservation): MonitorObservationFact {
  return {
    id: observation.id,
    sourceId: observation.sourceId,
    familyId: observation.familyId,
    observedAt: observation.observedAt,
    reused: observation.reused,
    thresholdMatch: observation.thresholdMatch,
    publicObservationId: observation.publicObservationId,
    category: observation.payload.category,
    priceAmount: observation.payload.price.amount,
    currency: observation.payload.price.currency,
    distinctVariationCount: observation.payload.distinctVariationCount,
    colorPatternIds: observation.payload.colorPatternIds,
  };
}

export function observationFromFact(
  fact: MonitorObservationFact,
  organizationId: string,
  jobId: string,
): MonitorObservation {
  return {
    id: fact.id,
    organizationId,
    monitorId: "",
    jobId,
    sourceId: fact.sourceId,
    familyId: fact.familyId,
    productUrl: "https://monitor.invalid/fact",
    observedAt: fact.observedAt,
    thresholdMatch: fact.thresholdMatch,
    payloadVersion: 1,
    payload: {
      version: 1,
      productName: null,
      category: fact.category,
      price: { amount: fact.priceAmount, currency: fact.currency },
      colorPatternIds: fact.colorPatternIds,
      colorPatternNames: null,
      distinctVariationCount: fact.distinctVariationCount,
      sizes: null,
      lengths: null,
      imageUrl: null,
      thresholdMatch: fact.thresholdMatch,
    },
    publicObservationId: fact.publicObservationId,
    sharedSourceId: "",
    reused: fact.reused,
    adapterId: "",
    adapterVersion: "",
    schemaVersion: 1,
    contentKey: "",
    categoryIds: [],
    discoveryCoverageId: null,
    createdAt: fact.observedAt,
  };
}

export function compareObservationFacts(input: {
  baselineJob: MonitorJob;
  currentJob: MonitorJob;
  baselineFacts: readonly MonitorObservationFact[];
  currentFacts: readonly MonitorObservationFact[];
}): MonitorComparison {
  return compareMonitorExecutions(
    {
      job: input.baselineJob,
      observations: input.baselineFacts.map((fact) =>
        observationFromFact(fact, input.baselineJob.organizationId, input.baselineJob.id),
      ),
    },
    {
      job: input.currentJob,
      observations: input.currentFacts.map((fact) =>
        observationFromFact(fact, input.currentJob.organizationId, input.currentJob.id),
      ),
    },
  );
}
