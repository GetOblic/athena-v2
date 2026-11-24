/**
 * Versioned Monitor configuration parser.
 * Rejects generated scraping code and unknown fields.
 * Does not fetch a website and does not call a model.
 */

import { parseMonitorCriterion } from "@/services/monitor/monitorCriterion";
import { MonitorOperationError } from "@/services/monitor/monitorErrors";
import {
  getMonitorSource,
  isMonitorCategoryUrl,
  isMonitorWebsiteUrl,
} from "@/services/monitor/monitorSources";
import {
  assertCategoryKey,
  categoryKeyFromUrl,
} from "@/services/monitor/monitorWebsiteIdentity";
import {
  MONITOR_CONFIGURATION_VERSION,
  type MonitorConfiguration,
  type MonitorSelection,
  type MonitorSourceConfiguration,
} from "@/services/monitor/monitorTypes";

const FORBIDDEN_KEYS = new Set([
  "code",
  "script",
  "scraper",
  "executable",
  "program",
  "eval",
  "html",
  "rawHtml",
  "imageBinary",
  "imageBytes",
]);

const TOP_LEVEL_KEYS = new Set(["version", "name", "objective", "sources", "criterion"]);
const SOURCE_KEYS = new Set(["sourceId", "websiteUrl", "selection"]);
const WHOLE_CATALOG_KEYS = new Set(["mode"]);
const CATEGORY_KEYS = new Set(["mode", "categoryUrls", "categoryIds"]);
const CRITERION_KEYS = new Set(["id", "operator", "minimum"]);

const MAX_SOURCES = 8;
const MAX_CATEGORY_URLS = 50;
const MAX_NAME = 120;
const MAX_OBJECTIVE = 4_000;

function invalid(message: string): never {
  throw new MonitorOperationError("INVALID_CONFIGURATION", message);
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      invalid(`Forbidden configuration field ${key}.`);
    }
    if (!allowed.has(key)) {
      invalid(`Unsupported ${label} field ${key}.`);
    }
  }
}

function assertNoForbiddenTree(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoForbiddenTree(item);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      invalid(`Forbidden configuration field ${key}.`);
    }
    assertNoForbiddenTree(child);
  }
}

function readText(value: unknown, label: string, max: number, allowNewlines: boolean): string {
  if (typeof value !== "string") invalid(`${label} is required.`);
  const text = value.trim();
  if (!text || text.length > max) invalid(`${label} length is invalid.`);
  if ([...text].some((character) => {
    const code = character.charCodeAt(0);
    if (code === 9 || code === 10 || code === 13) return !allowNewlines;
    return code < 32;
  })) {
    invalid(`${label} contains unsupported control characters.`);
  }
  return text;
}

function uniqueCategoryIds(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) invalid("Category identities must be a list.");
  if (value.length > MAX_CATEGORY_URLS) {
    invalid("Category selection exceeds the configured bound.");
  }
  const categoryIds: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") invalid("Category identity is invalid.");
    const key = assertCategoryKey(entry);
    if (seen.has(key)) invalid("Category identities must be unique.");
    seen.add(key);
    categoryIds.push(key);
  }
  return categoryIds;
}

function parseSelection(sourceId: string, value: unknown): MonitorSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("Source selection is required.");
  }
  const record = value as Record<string, unknown>;
  if (record.mode === "whole_catalog") {
    assertAllowedKeys(record, WHOLE_CATALOG_KEYS, "selection");
    return { mode: "whole_catalog" };
  }
  if (record.mode !== "categories") invalid("Source selection mode is invalid.");
  assertAllowedKeys(record, CATEGORY_KEYS, "selection");
  const suppliedUrls = record.categoryUrls ?? [];
  if (!Array.isArray(suppliedUrls)) invalid("Category URLs must be a list.");
  if (suppliedUrls.length > MAX_CATEGORY_URLS) {
    invalid("Category selection exceeds the configured bound.");
  }
  const categoryUrls: string[] = [];
  const seenUrls = new Set<string>();
  for (const entry of suppliedUrls) {
    if (typeof entry !== "string" || !isMonitorCategoryUrl(sourceId, entry)) {
      invalid("Category URL is not a supported category for this source.");
    }
    const canonical = new URL(entry).toString();
    if (seenUrls.has(canonical)) invalid("Category URLs must be unique.");
    seenUrls.add(canonical);
    categoryUrls.push(canonical);
  }
  const suppliedIds = uniqueCategoryIds(record.categoryIds);
  const derivedIds = categoryUrls.map((url) => categoryKeyFromUrl(url));
  if (suppliedIds.length > 0 && derivedIds.length > 0) {
    const left = [...suppliedIds].sort();
    const right = [...derivedIds].sort();
    if (left.length !== right.length || left.some((key, index) => key !== right[index])) {
      invalid("Category identities do not match the category URLs.");
    }
  }
  const categoryIds = suppliedIds.length > 0 ? suppliedIds : derivedIds;
  if (categoryIds.length === 0) {
    invalid("Category selection requires at least one discovered category.");
  }
  return { mode: "categories", categoryUrls, categoryIds };
}

function parseSource(value: unknown): MonitorSourceConfiguration {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("Source configuration is required.");
  }
  const record = value as Record<string, unknown>;
  assertAllowedKeys(record, SOURCE_KEYS, "source");
  if (typeof record.sourceId !== "string" || !getMonitorSource(record.sourceId)) {
    invalid("Unknown Monitor source.");
  }
  if (typeof record.websiteUrl !== "string" || !isMonitorWebsiteUrl(record.sourceId, record.websiteUrl)) {
    invalid("Source website URL is not on the registered domain.");
  }
  return {
    sourceId: record.sourceId,
    websiteUrl: new URL(record.websiteUrl).toString(),
    selection: parseSelection(record.sourceId, record.selection),
  };
}

export function parseMonitorConfiguration(value: unknown): MonitorConfiguration {
  assertNoForbiddenTree(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("Monitor configuration is required.");
  }
  const record = value as Record<string, unknown>;
  assertAllowedKeys(record, TOP_LEVEL_KEYS, "configuration");
  if (record.version !== MONITOR_CONFIGURATION_VERSION) {
    invalid("Unsupported Monitor configuration version.");
  }
  if (!Array.isArray(record.sources) || record.sources.length === 0 || record.sources.length > MAX_SOURCES) {
    invalid("Monitor configuration requires one or more sources.");
  }
  const sources = record.sources.map((source) => parseSource(source));
  const sourceIds = new Set<string>();
  for (const source of sources) {
    if (sourceIds.has(source.sourceId)) invalid("A source can appear only once.");
    sourceIds.add(source.sourceId);
  }
  const criterionRecord = record.criterion;
  if (criterionRecord && typeof criterionRecord === "object" && !Array.isArray(criterionRecord)) {
    assertAllowedKeys(criterionRecord as Record<string, unknown>, CRITERION_KEYS, "criterion");
  }
  return {
    version: MONITOR_CONFIGURATION_VERSION,
    name: readText(record.name, "Name", MAX_NAME, false),
    objective: readText(record.objective, "Objective", MAX_OBJECTIVE, true),
    sources,
    criterion: parseMonitorCriterion(record.criterion),
  };
}

function categoryIdentity(selection: {
  categoryUrls: string[];
  categoryIds?: string[];
}): string[] {
  if (selection.categoryIds && selection.categoryIds.length > 0) {
    return [...selection.categoryIds].sort();
  }
  return selection.categoryUrls.map((url) => categoryKeyFromUrl(url)).sort();
}

export function selectionsEqual(left: MonitorSelection, right: MonitorSelection): boolean {
  if (left.mode !== right.mode) return false;
  if (left.mode === "whole_catalog" && right.mode === "whole_catalog") return true;
  if (left.mode !== "categories" || right.mode !== "categories") return false;
  const leftUrls = [...left.categoryUrls].sort();
  const rightUrls = [...right.categoryUrls].sort();
  if (leftUrls.length !== rightUrls.length || leftUrls.some((url, index) => url !== rightUrls[index])) {
    return false;
  }
  const leftIds = categoryIdentity(left);
  const rightIds = categoryIdentity(right);
  return leftIds.length === rightIds.length && leftIds.every((key, index) => key === rightIds[index]);
}
