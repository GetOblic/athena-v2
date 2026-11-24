/**
 * Canonical public website identity for supported Monitor adapters.
 * Equivalent homepage forms share one host. A different host is a different website.
 * This module does not fetch a page and does not accept scraping code.
 */

import { MonitorOperationError } from "@/services/monitor/monitorErrors";
import {
  getMonitorSource,
  isHardDeniedMonitorUrl,
  type MonitorSourceDefinition,
} from "@/services/monitor/monitorSources";
import {
  MONITOR_ADAPTER_VERSION,
  type MonitorExtractionConfig,
} from "@/services/monitor/monitorTypes";

const CATEGORY_KEY = /^[a-z0-9][a-z0-9./_-]{0,199}$/;

export type SupportedWebsiteIdentity = {
  normalizedHost: string;
  canonicalUrl: string;
  registeredSourceId: string;
  platform: MonitorSourceDefinition["adapter"];
  adapterId: MonitorSourceDefinition["adapter"];
  adapterVersion: typeof MONITOR_ADAPTER_VERSION;
  registrableDomain: string;
  extractionConfig: MonitorExtractionConfig;
};

export function categoryKeyFromUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  const key = decodeURIComponent(parsed.pathname).replace(/^\/+/, "").toLowerCase();
  if (!CATEGORY_KEY.test(key) || key === "whole_catalog") {
    throw new MonitorOperationError("INVALID_CONFIGURATION", "Category identity is invalid.");
  }
  return key;
}

export function assertCategoryKey(value: string): string {
  const key = value.trim().toLowerCase();
  if (!CATEGORY_KEY.test(key) || key === "whole_catalog") {
    throw new MonitorOperationError("INVALID_CONFIGURATION", "Category identity is invalid.");
  }
  return key;
}

export function extractionConfigFor(source: MonitorSourceDefinition): MonitorExtractionConfig {
  return {
    version: 1,
    registrableDomain: source.registrableDomain,
    adapterId: source.adapter,
    adapterVersion: MONITOR_ADAPTER_VERSION,
    platform: source.adapter,
  };
}

/**
 * Collapses scheme case, a single leading www label, a trailing dot, and a trailing slash.
 * Leaves every other subdomain intact so two storefronts are not merged by name.
 */
export function normalizeSupportedWebsite(rawUrl: string): SupportedWebsiteIdentity {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new MonitorOperationError("UNSUPPORTED_SOURCE", "A supported website URL is required.");
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new MonitorOperationError("UNSUPPORTED_SOURCE", "Website URL is invalid.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new MonitorOperationError("UNSUPPORTED_SOURCE", "Website URL must be https.");
  }
  if (parsed.port && parsed.port !== "443") {
    throw new MonitorOperationError("UNSUPPORTED_SOURCE", "Website URL port is not supported.");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  if (!hostname || hostname.includes("..")) {
    throw new MonitorOperationError("UNSUPPORTED_SOURCE", "Website host is invalid.");
  }
  const source = [...sourceList()].find((item) => item.registrableDomain === hostname);
  if (!source) {
    throw new MonitorOperationError(
      "UNSUPPORTED_SOURCE",
      "This website has no registered Monitor adapter.",
    );
  }
  const canonicalUrl = `https://${hostname}/`;
  if (isHardDeniedMonitorUrl(parsed.toString())) {
    throw new MonitorOperationError("UNSUPPORTED_SOURCE", "Website URL is not allowed.");
  }
  return {
    normalizedHost: hostname,
    canonicalUrl,
    registeredSourceId: source.id,
    platform: source.adapter,
    adapterId: source.adapter,
    adapterVersion: MONITOR_ADAPTER_VERSION,
    registrableDomain: source.registrableDomain,
    extractionConfig: extractionConfigFor(source),
  };
}

function sourceList(): readonly MonitorSourceDefinition[] {
  return [
    getMonitorSource("toscane"),
    getMonitorSource("breal"),
    getMonitorSource("bonobo"),
    getMonitorSource("cache-cache"),
  ].filter((source): source is MonitorSourceDefinition => source != null);
}

const CUSTOMER_FIELD = /^(organizationId|organization_id|objective|criterion|threshold|userId|monitorId)$/i;

export function sharedSourceHasCustomerFields(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => sharedSourceHasCustomerFields(item));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, child]) => CUSTOMER_FIELD.test(key) || sharedSourceHasCustomerFields(child),
  );
}
