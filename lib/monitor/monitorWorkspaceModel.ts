/**
 * Customer presentation for Monitor.
 * Retailer names, category names, and product fields stay in their published language.
 * This module does not fetch a website or read a plan.
 */

import type { MonitorComparison } from "@/services/monitor/monitorComparison";
import { completedSourceIsAccounted } from "@/services/monitor/monitorExecution";
import {
  compareMonitorResultFields,
  monitorResultMatches,
} from "@/services/monitor/monitorResultPage";
import { getMonitorSource } from "@/services/monitor/monitorSources";
import {
  isTerminalMonitorStatus,
  type MonitorJob,
  type MonitorObservation,
  type MonitorSelection,
  type MonitorSourceCoverage,
} from "@/services/monitor/monitorTypes";

export const MONITOR_RESULTS_PAGE_SIZE = 24;

export const MONITOR_WEBSITE_STATES = [
  "available",
  "discovering",
  "access_unavailable",
  "unsupported",
  "temporary_error",
] as const;

export type MonitorWebsiteState = (typeof MONITOR_WEBSITE_STATES)[number];

export type MonitorCustomerCategory = {
  categoryKey: string;
  displayName: string;
  canonicalUrl: string;
  parentCategoryKey: string | null;
  productFamilyCount: number | null;
};

export type MonitorHistoricalChange =
  | "newly_observed"
  | "reused_inclusion"
  | "crossed_up"
  | "crossed_down"
  | "variations_added"
  | "variations_removed"
  | "price_change"
  | "not_found";

export type MonitorResultCard = {
  observationId: string;
  sourceId: string;
  retailer: string;
  familyId: string;
  productName: string;
  category: string | null;
  priceAmount: string | null;
  currency: string | null;
  distinctVariationCount: number | null;
  colorPatternNames: string[];
  observedAt: string;
  productUrl: string | null;
  imageUrl: string | null;
  reused: boolean;
  thresholdMatch: boolean | null;
  changes: MonitorHistoricalChange[];
};

export type MonitorMissingModel = {
  sourceId: string;
  retailer: string;
  familyId: string;
};

export type MonitorProgressView = {
  jobId: string;
  monitorId: string;
  status: MonitorJob["status"];
  terminal: boolean;
  catalogComplete: boolean;
  elapsedSeconds: number | null;
  currentSourceId: string | null;
  currentRetailer: string | null;
  phase: "discover" | "extract" | null;
  categories: string[];
  wholeCatalog: boolean;
  familiesDiscovered: number;
  familiesAnalyzed: number;
  familiesMatching: number;
  familiesExtracted: number;
  familiesReused: number;
  familiesFailed: number;
  sources: Array<{
    sourceId: string;
    retailer: string;
    status: MonitorSourceCoverage["status"];
    familiesDiscovered: number;
    familiesAnalyzed: number;
    familiesMatching: number;
    familiesExtracted: number;
    familiesReused: number;
    familiesFailed: number;
  }>;
};

export type MonitorResultsQuery = {
  page?: number;
  website?: string | null;
  category?: string | null;
  minVariations?: number | null;
  maxPrice?: number | null;
  observedAfter?: string | null;
  change?: MonitorHistoricalChange | null;
  sort?: "website" | "category" | "variations" | "price" | "observed" | "change";
};

const HTTPS = /^https:\/\//i;

export function shouldPollMonitorJob(status: MonitorJob["status"]): boolean {
  return !isTerminalMonitorStatus(status);
}

export function customerJobStatus(job: Pick<MonitorJob, "status" | "sourceCoverage">): MonitorJob["status"] {
  if (
    job.status === "completed" &&
    job.sourceCoverage.some((source) => !completedSourceIsAccounted(source))
  ) {
    return "partial";
  }
  return job.status;
}

export function catalogIsComplete(job: Pick<MonitorJob, "status" | "sourceCoverage">): boolean {
  return (
    customerJobStatus(job) === "completed" &&
    job.sourceCoverage.length > 0 &&
    job.sourceCoverage.every((source) => completedSourceIsAccounted(source))
  );
}

export function retailerName(sourceId: string): string {
  return getMonitorSource(sourceId)?.displayName ?? sourceId;
}

function httpsUrl(value: string | null | undefined): string | null {
  if (!value || !HTTPS.test(value.trim())) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function presentCategoryCount(
  count: number | null | undefined,
  basis: "verified" | "estimated" | null | undefined,
): number | null {
  if (basis == null || typeof count !== "number" || !Number.isInteger(count) || count < 0) {
    return null;
  }
  return count;
}

function selectionLabels(
  selection: MonitorSelection,
  names: ReadonlyMap<string, string>,
): { wholeCatalog: boolean; categories: string[] } {
  if (selection.mode === "whole_catalog") {
    return { wholeCatalog: true, categories: [] };
  }
  const categories = (selection.categoryIds ?? []).map((key) => names.get(key) ?? key);
  return { wholeCatalog: false, categories };
}

export function presentMonitorProgress(
  job: MonitorJob,
  now: Date,
  categoryNames: ReadonlyMap<string, string> = new Map(),
): MonitorProgressView {
  const status = customerJobStatus(job);
  const start = Date.parse(job.startedAt ?? job.createdAt);
  const end = Date.parse(job.completedAt ?? now.toISOString());
  const elapsedSeconds =
    Number.isFinite(start) && Number.isFinite(end)
      ? Math.max(0, Math.floor((end - start) / 1000))
      : null;
  const selections = job.configurationSnapshot.sources.map((source) =>
    selectionLabels(source.selection, categoryNames),
  );
  return {
    jobId: job.id,
    monitorId: job.monitorId,
    status,
    terminal: isTerminalMonitorStatus(status),
    catalogComplete: catalogIsComplete({ status, sourceCoverage: job.sourceCoverage }),
    elapsedSeconds,
    currentSourceId: job.progress.currentSourceId ?? null,
    currentRetailer: job.progress.currentSourceId ? retailerName(job.progress.currentSourceId) : null,
    phase: job.progress.phase ?? null,
    categories: selections.flatMap((selection) => selection.categories),
    wholeCatalog: selections.some((selection) => selection.wholeCatalog),
    familiesDiscovered: job.progress.familiesDiscovered,
    familiesAnalyzed: job.progress.familiesAnalyzed,
    familiesMatching: job.progress.familiesMatching ?? 0,
    familiesExtracted: job.progress.familiesExtracted ?? 0,
    familiesReused: job.progress.familiesReused ?? 0,
    familiesFailed: job.progress.familiesFailed ?? 0,
    sources: job.sourceCoverage.map((source) => ({
      sourceId: source.sourceId,
      retailer: retailerName(source.sourceId),
      status: source.status,
      familiesDiscovered: source.familiesDiscovered ?? 0,
      familiesAnalyzed: source.familiesAnalyzed,
      familiesMatching: source.familiesMatching ?? 0,
      familiesExtracted: source.familiesExtracted ?? 0,
      familiesReused: source.familiesReused ?? 0,
      familiesFailed: source.familiesFailed ?? 0,
    })),
  };
}

function changeRank(changes: readonly MonitorHistoricalChange[]): number {
  if (changes.includes("not_found")) return 7;
  if (changes.includes("crossed_up") || changes.includes("crossed_down")) return 6;
  if (changes.includes("price_change")) return 5;
  if (changes.includes("variations_added") || changes.includes("variations_removed")) return 4;
  if (changes.includes("newly_observed") || changes.includes("reused_inclusion")) return 3;
  return 0;
}

export function attachHistoricalChanges(
  cards: readonly MonitorResultCard[],
  comparison: MonitorComparison | null,
): { cards: MonitorResultCard[]; missing: MonitorMissingModel[] } {
  if (!comparison) {
    return { cards: cards.map((card) => ({ ...card, changes: [] })), missing: [] };
  }
  const byFamily = new Map<string, MonitorHistoricalChange[]>();
  const remember = (sourceId: string, familyId: string, change: MonitorHistoricalChange) => {
    const key = `${sourceId}:${familyId}`;
    const current = byFamily.get(key) ?? [];
    current.push(change);
    byFamily.set(key, current);
  };
  const missing: MonitorMissingModel[] = [];
  for (const source of comparison.sources) {
    if (!source.comparable) continue;
    for (const familyId of source.newlyObserved) {
      const card = cards.find((item) => item.sourceId === source.sourceId && item.familyId === familyId);
      remember(
        source.sourceId,
        familyId,
        card?.reused ? "reused_inclusion" : "newly_observed",
      );
    }
    for (const familyId of source.thresholdCrossedUp) remember(source.sourceId, familyId, "crossed_up");
    for (const familyId of source.thresholdCrossedDown) remember(source.sourceId, familyId, "crossed_down");
    for (const change of source.variationsAdded) remember(source.sourceId, change.familyId, "variations_added");
    for (const change of source.variationsRemoved) remember(source.sourceId, change.familyId, "variations_removed");
    for (const change of source.priceChanges) remember(source.sourceId, change.familyId, "price_change");
    for (const familyId of source.notFound) {
      missing.push({
        sourceId: source.sourceId,
        retailer: retailerName(source.sourceId),
        familyId,
      });
    }
  }
  return {
    cards: cards.map((card) => ({
      ...card,
      changes: byFamily.get(`${card.sourceId}:${card.familyId}`) ?? [],
    })),
    missing,
  };
}

export function presentResultCard(
  observation: MonitorObservation,
  thresholdMatch: boolean | null = observation.thresholdMatch,
): MonitorResultCard {
  return {
    observationId: observation.id,
    sourceId: observation.sourceId,
    retailer: retailerName(observation.sourceId),
    familyId: observation.familyId,
    productName: observation.payload.productName?.trim() || observation.familyId,
    category: observation.payload.category,
    priceAmount: observation.payload.price.amount,
    currency: observation.payload.price.currency,
    distinctVariationCount: observation.payload.distinctVariationCount,
    colorPatternNames: observation.payload.colorPatternNames ?? [],
    observedAt: observation.observedAt,
    productUrl: httpsUrl(observation.productUrl),
    imageUrl: httpsUrl(observation.payload.imageUrl),
    reused: observation.reused,
    thresholdMatch,
    changes: [],
  };
}

function resultFields(card: MonitorResultCard) {
  return {
    id: card.observationId,
    sourceId: card.sourceId,
    retailer: card.retailer,
    category: card.category,
    priceAmount: card.priceAmount,
    distinctVariationCount: card.distinctVariationCount,
    observedAt: card.observedAt,
    changeRank: changeRank(card.changes),
  };
}

export function filterMonitorCards(
  cards: readonly MonitorResultCard[],
  query: MonitorResultsQuery,
): MonitorResultCard[] {
  return cards.filter((card) => {
    if (!monitorResultMatches(resultFields(card), query)) return false;
    if (query.change && !card.changes.includes(query.change)) return false;
    return true;
  });
}

export function sortMonitorCards(
  cards: readonly MonitorResultCard[],
  sort: MonitorResultsQuery["sort"],
): MonitorResultCard[] {
  const copy = [...cards];
  const order = sort ?? "observed";
  copy.sort((left, right) => compareMonitorResultFields(resultFields(left), resultFields(right), order));
  return copy;
}

export function resolveMonitorPage(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : typeof value === "number" ? value : 1;
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

export function pageMonitorCards<T>(items: readonly T[], page: number): {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  items: T[];
} {
  const pageSize = MONITOR_RESULTS_PAGE_SIZE;
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    pageSize,
    total,
    pageCount,
    items: items.slice(start, start + pageSize),
  };
}

export function presentElapsed(seconds: number | null): { minutes: number; remainder: number } | null {
  if (seconds == null) return null;
  return { minutes: Math.floor(seconds / 60), remainder: seconds % 60 };
}
