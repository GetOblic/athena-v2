/**
 * Presentation-only prospect intelligence / working-status labels.
 * Stored readiness and lifecycle tokens remain unchanged.
 */
import {
  getLocalizedProspectLifecycleLabel,
  getLocalizedProspectReadinessLabel,
} from "@/lib/tenantI18n/prospectPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";

const PROCESSING_STATUSES = new Set([
  "Queued",
  "Processing",
  "Learning from Website",
  "Generating Executive Intelligence",
]);

export function getProspectIntelligenceStatusLabel(
  messages: TenantMessages,
  readiness: string | null | undefined,
): string {
  const convert = messages.prospects.convert;
  switch (String(readiness ?? "").trim()) {
    case "Queued":
      return convert.athenaStarting;
    case "Processing":
      return convert.athenaWorking;
    case "Learning from Website":
      return convert.athenaLearningWebsite;
    case "Generating Executive Intelligence":
      return convert.athenaWriting;
    case "Ready":
      return convert.intelligenceReady;
    case "Processing Failed":
      return convert.intelligenceFailed;
    default:
      return getLocalizedProspectReadinessLabel(messages, readiness);
  }
}

export function getProspectWorkingStatusLabel(
  messages: TenantMessages,
  lifecycle: string | null | undefined,
): string {
  return getLocalizedProspectLifecycleLabel(messages, lifecycle);
}

export function isProspectIntelligenceProcessing(
  readiness: string | null | undefined,
): boolean {
  return PROCESSING_STATUSES.has(String(readiness ?? "").trim());
}

export function isProspectIntelligenceFailed(
  readiness: string | null | undefined,
): boolean {
  return String(readiness ?? "").trim() === "Processing Failed";
}

export function isProspectIntelligenceReady(
  readiness: string | null | undefined,
): boolean {
  return String(readiness ?? "").trim() === "Ready";
}
