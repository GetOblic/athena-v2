/**
 * Pure scope ↔ trigger_type mapping for partial asset-family refreshes.
 * Kept free of DB/service imports for safe unit testing.
 */

import type { AthenaPartialRefreshTriggerType } from "@/services/generationJobs/generationJobTypes";

export type PartialRefreshScope = "deployment_assets" | "strategic_assets";

export function parsePartialRefreshScope(
  value: unknown,
): PartialRefreshScope | null {
  const raw = String(value ?? "").trim();
  if (raw === "deployment_assets" || raw === "strategic_assets") {
    return raw;
  }
  return null;
}

export function triggerTypeForPartialRefreshScope(
  scope: PartialRefreshScope,
): AthenaPartialRefreshTriggerType {
  return scope === "deployment_assets"
    ? "deployment_assets_refresh"
    : "strategic_assets_refresh";
}
