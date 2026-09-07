/**
 * Presentation-only audience intelligence / working-status labels.
 * Stored readiness and lifecycle enums remain unchanged.
 */
import {
  getLocalizedPersonaLifecycleLabel,
  getLocalizedPersonaReadinessLabel,
} from "@/lib/tenantI18n/personaPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";

const PROCESSING_STATUSES = new Set([
  "Queued",
  "Processing",
  "Learning from Website",
  "Generating Executive Intelligence",
]);

export function getAudienceIntelligenceStatusLabel(
  messages: TenantMessages,
  readiness: string | null | undefined,
): string {
  const traction = messages.personas.traction;
  switch (String(readiness ?? "").trim()) {
    case "Profile Created":
      return traction.intelligenceSaved;
    case "Queued":
      return traction.athenaStarting;
    case "Processing":
      return traction.athenaWorking;
    case "Generating Executive Intelligence":
      return traction.athenaWriting;
    case "Ready":
      return traction.intelligenceReady;
    case "Processing Failed":
      return traction.intelligenceFailed;
    case "Analysis Generated":
      return "";
    default:
      return getLocalizedPersonaReadinessLabel(messages, readiness);
  }
}

export function getAudienceWorkingStatusLabel(
  messages: TenantMessages,
  lifecycle: string | null | undefined,
): string {
  return getLocalizedPersonaLifecycleLabel(messages, lifecycle);
}

export function isAudienceIntelligenceProcessing(
  readiness: string | null | undefined,
): boolean {
  return PROCESSING_STATUSES.has(String(readiness ?? "").trim());
}

export function isAudienceIntelligenceFailed(
  readiness: string | null | undefined,
): boolean {
  return String(readiness ?? "").trim() === "Processing Failed";
}

export function isAudienceIntelligenceReady(
  readiness: string | null | undefined,
): boolean {
  return String(readiness ?? "").trim() === "Ready";
}
