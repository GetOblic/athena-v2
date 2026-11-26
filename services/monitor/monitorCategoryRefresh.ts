/**
 * In-memory simulation of shared category reconciliation.
 * Identity is (source_id, category_key). Existing UUIDs are reused.
 * Production persistence does not use this writer. It calls
 * reconcile_athena_monitor_source_categories, which holds a source-row
 * lock and rolls back on constraint failure. This module does not open
 * a database connection and does not reproduce that lock.
 */

import { randomUUID } from "node:crypto";

import { MonitorOperationError } from "@/services/monitor/monitorErrors";
import type { SharedMonitorCategory } from "@/services/monitor/monitorTypes";
import { sharedSourceHasCustomerFields } from "@/services/monitor/monitorWebsiteIdentity";

export const MONITOR_TAXONOMY_UNVERIFIED_LIMITATION =
  "Category discovery did not establish an authoritative taxonomy. Previously known categories were preserved.";

export const MONITOR_STALE_REFRESH_LIMITATION =
  "An older category refresh was ignored because a newer discovery is already recorded.";

export const MONITOR_EQUAL_TIMESTAMP_LIMITATION =
  "A category publication with the same discovery timestamp was not applied. An equal timestamp does not show that the category sets match.";

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export type SharedCategoryDraft = {
  categoryKey: string;
  displayName: string;
  canonicalUrl: string;
  parentCategoryKey: string | null;
  discoveredAt: string;
  discoveryStatus: "current" | "removed" | "partial";
  productFamilyCount: number | null;
  productFamilyCountBasis: "verified" | "estimated" | null;
};

export type SharedCategoryRefreshInput = {
  sourceId: string;
  discoveredAt: string;
  /**
   * True only when the caller has verified that the supplied set is the full taxonomy.
   * Current production adapters cannot establish that, so they pass false.
   */
  authoritativeTaxonomy: boolean;
  categories: readonly SharedCategoryDraft[];
};

export type SharedCategoryRefreshOutcome = "published" | "stale" | "empty" | "already_published";

export type SharedCategoryRefreshResult = {
  outcome: SharedCategoryRefreshOutcome;
  categories: SharedMonitorCategory[];
  taxonomyCompleteness: "authoritative" | "unverified";
  absentCategoriesPreserved: boolean;
  freshnessAdvanced: boolean;
  limitation: string | null;
};

export type SharedCategoryWriter = {
  readSource(sourceId: string): Promise<{ lastDiscoveredAt: string | null } | null>;
  list(sourceId: string): Promise<SharedMonitorCategory[]>;
  findByKey(sourceId: string, categoryKey: string): Promise<SharedMonitorCategory | null>;
  insert(category: SharedMonitorCategory): Promise<
    "inserted" | "category_key_conflict" | "canonical_url_conflict"
  >;
  updateIfNotNewer(category: SharedMonitorCategory): Promise<"updated" | "stale" | "missing">;
  advanceDiscovery(input: { sourceId: string; discoveredAt: string }): Promise<boolean>;
};

function timestampMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * Category-row guard used by the in-memory writer.
 * Source publication freshness is stricter: an equal source timestamp does not write.
 */
export function categoryTimestampAllowsWrite(stored: string | null, incoming: string): boolean {
  const next = timestampMs(incoming);
  if (!Number.isFinite(next)) return false;
  if (stored == null) return true;
  const previous = timestampMs(stored);
  if (!Number.isFinite(previous)) return true;
  return previous <= next;
}

function assertTimestamp(value: string): void {
  if (!ISO_TIMESTAMP.test(value) || !Number.isFinite(timestampMs(value))) {
    throw new MonitorOperationError("INVALID_REQUEST", "Category discovery time is invalid.");
  }
}

function assertUniqueUrls(categories: readonly SharedCategoryDraft[]): void {
  const urls = new Set<string>();
  for (const category of categories) {
    if (!category.canonicalUrl || urls.has(category.canonicalUrl)) {
      throw new MonitorOperationError("CONSTRAINT_VIOLATION", "The request could not be saved.");
    }
    urls.add(category.canonicalUrl);
  }
}

function publicationOrder(stored: string | null, incoming: string): "newer" | "equal" | "stale" {
  const next = timestampMs(incoming);
  if (stored == null || !Number.isFinite(timestampMs(stored))) return "newer";
  const previous = timestampMs(stored);
  if (next > previous) return "newer";
  if (next === previous) return "equal";
  return "stale";
}

function orderParentsFirst(categories: readonly SharedCategoryDraft[]): SharedCategoryDraft[] {
  const byKey = new Map<string, SharedCategoryDraft>();
  for (const category of categories) {
    if (!category.categoryKey || byKey.has(category.categoryKey)) {
      throw new MonitorOperationError("INVALID_CONFIGURATION", "Duplicate category identity.");
    }
    if (sharedSourceHasCustomerFields(category)) {
      throw new MonitorOperationError("INVALID_CONFIGURATION");
    }
    byKey.set(category.categoryKey, category);
  }
  const ordered: SharedCategoryDraft[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): void => {
    if (visited.has(key)) return;
    if (visiting.has(key)) {
      throw new MonitorOperationError("INVALID_CONFIGURATION", "Parent category is not on this website.");
    }
    visiting.add(key);
    const category = byKey.get(key);
    if (category?.parentCategoryKey && byKey.has(category.parentCategoryKey)) {
      visit(category.parentCategoryKey);
    }
    visiting.delete(key);
    visited.add(key);
    if (category) ordered.push(category);
  };
  for (const category of categories) visit(category.categoryKey);
  return ordered;
}

async function parentIdFor(
  writer: SharedCategoryWriter,
  sourceId: string,
  parentCategoryKey: string | null,
): Promise<string | null> {
  if (!parentCategoryKey) return null;
  const parent = await writer.findByKey(sourceId, parentCategoryKey);
  if (!parent || parent.sourceId !== sourceId) {
    throw new MonitorOperationError("INVALID_CONFIGURATION", "Parent category is not on this website.");
  }
  return parent.id;
}

async function upsertCategory(
  writer: SharedCategoryWriter,
  sourceId: string,
  discoveredAt: string,
  draft: SharedCategoryDraft,
): Promise<void> {
  assertTimestamp(draft.discoveredAt);
  const parentCategoryId = await parentIdFor(writer, sourceId, draft.parentCategoryKey);
  const existing = await writer.findByKey(sourceId, draft.categoryKey);
  if (existing && !categoryTimestampAllowsWrite(existing.discoveredAt, draft.discoveredAt)) {
    return;
  }
  const row: SharedMonitorCategory = {
    id: existing?.id ?? randomUUID(),
    sourceId,
    categoryKey: draft.categoryKey,
    displayName: draft.displayName,
    canonicalUrl: draft.canonicalUrl,
    parentCategoryId,
    parentCategoryKey: draft.parentCategoryKey,
    discoveredAt: draft.discoveredAt,
    discoveryStatus: draft.discoveryStatus,
    productFamilyCount: draft.productFamilyCount,
    productFamilyCountBasis: draft.productFamilyCountBasis,
    createdAt: existing?.createdAt ?? discoveredAt,
    updatedAt: discoveredAt,
  };
  if (!existing) {
    const inserted = await writer.insert(row);
    if (inserted === "inserted") return;
    if (inserted === "canonical_url_conflict") {
      throw new MonitorOperationError("CONSTRAINT_VIOLATION", "The request could not be saved.");
    }
    const winner = await writer.findByKey(sourceId, draft.categoryKey);
    if (!winner) throw new MonitorOperationError("PERSISTENCE_FAILED", "The request could not be saved.");
    if (!categoryTimestampAllowsWrite(winner.discoveredAt, draft.discoveredAt)) return;
    const raced = await writer.updateIfNotNewer({
      ...row,
      id: winner.id,
      createdAt: winner.createdAt,
      parentCategoryId: (await parentIdFor(writer, sourceId, draft.parentCategoryKey)) ?? parentCategoryId,
    });
    if (raced === "updated" || raced === "stale") return;
    throw new MonitorOperationError("PERSISTENCE_FAILED", "The request could not be saved.");
  }
  const updated = await writer.updateIfNotNewer(row);
  if (updated === "updated" || updated === "stale") return;
  const inserted = await writer.insert({ ...row, id: randomUUID(), createdAt: discoveredAt });
  if (inserted === "inserted") return;
  if (inserted === "category_key_conflict") {
    const winner = await writer.findByKey(sourceId, draft.categoryKey);
    if (!winner) throw new MonitorOperationError("PERSISTENCE_FAILED", "The request could not be saved.");
    if (!categoryTimestampAllowsWrite(winner.discoveredAt, draft.discoveredAt)) return;
    const raced = await writer.updateIfNotNewer({ ...row, id: winner.id, createdAt: winner.createdAt });
    if (raced === "updated" || raced === "stale") return;
  }
  throw new MonitorOperationError(
    inserted === "canonical_url_conflict" ? "CONSTRAINT_VIOLATION" : "PERSISTENCE_FAILED",
    "The request could not be saved.",
  );
}

export async function refreshSharedCategories(
  writer: SharedCategoryWriter,
  input: SharedCategoryRefreshInput,
): Promise<SharedCategoryRefreshResult> {
  assertTimestamp(input.discoveredAt);
  if (input.categories.length === 0) {
    return {
      outcome: "empty",
      categories: await writer.list(input.sourceId),
      taxonomyCompleteness: "unverified",
      absentCategoriesPreserved: true,
      freshnessAdvanced: false,
      limitation: MONITOR_TAXONOMY_UNVERIFIED_LIMITATION,
    };
  }
  const ordered = orderParentsFirst(input.categories);
  assertUniqueUrls(ordered);
  const source = await writer.readSource(input.sourceId);
  const order = publicationOrder(source?.lastDiscoveredAt ?? null, input.discoveredAt);
  if (order === "equal") {
    return {
      outcome: "already_published",
      categories: await writer.list(input.sourceId),
      taxonomyCompleteness: "unverified",
      absentCategoriesPreserved: true,
      freshnessAdvanced: false,
      limitation: MONITOR_EQUAL_TIMESTAMP_LIMITATION,
    };
  }
  if (order === "stale") {
    return {
      outcome: "stale",
      categories: await writer.list(input.sourceId),
      taxonomyCompleteness: "unverified",
      absentCategoriesPreserved: true,
      freshnessAdvanced: false,
      limitation: MONITOR_STALE_REFRESH_LIMITATION,
    };
  }
  const present = new Set(ordered.map((category) => category.categoryKey));
  for (const category of ordered) {
    await upsertCategory(writer, input.sourceId, input.discoveredAt, category);
  }
  if (input.authoritativeTaxonomy) {
    const current = await writer.list(input.sourceId);
    for (const category of current) {
      if (present.has(category.categoryKey) || category.discoveryStatus === "removed") continue;
      if (!categoryTimestampAllowsWrite(category.discoveredAt, input.discoveredAt)) continue;
      await writer.updateIfNotNewer({
        ...category,
        discoveryStatus: "removed",
        discoveredAt: input.discoveredAt,
        updatedAt: input.discoveredAt,
      });
    }
  }
  const freshnessAdvanced = await writer.advanceDiscovery({
    sourceId: input.sourceId,
    discoveredAt: input.discoveredAt,
  });
  return {
    outcome: "published",
    categories: await writer.list(input.sourceId),
    taxonomyCompleteness: input.authoritativeTaxonomy ? "authoritative" : "unverified",
    absentCategoriesPreserved: input.authoritativeTaxonomy !== true,
    freshnessAdvanced,
    limitation: input.authoritativeTaxonomy ? null : MONITOR_TAXONOMY_UNVERIFIED_LIMITATION,
  };
}
