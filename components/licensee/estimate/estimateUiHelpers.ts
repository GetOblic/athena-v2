/**
 * Licensee Master Estimate UI helpers (V26 L7).
 * Presentation only — no API/ownership logic.
 */

import type { AthenaEstimateGenerationStage } from "@/services/estimate/athenaEstimateTypes";
import type { AthenaEstimateTimeframe } from "@/services/estimate/athenaEstimateTypes";
import {
  ESTIMATE_PROJECT_NEED_MIN_LENGTH,
  ESTIMATE_REQUEST_FIELD_LIMITS,
} from "@/services/estimate/athenaEstimateRequest";

export const ESTIMATE_POLL_INTERVAL_MS = 5_000;

export const ESTIMATE_TIMEFRAME_OPTIONS: Array<{
  value: AthenaEstimateTimeframe;
  label: string;
}> = [
  { value: "asap", label: "ASAP" },
  { value: "2_4_weeks", label: "2–4 weeks" },
  { value: "1_3_months", label: "1–3 months" },
  { value: "flexible", label: "Flexible" },
];

export {
  ESTIMATE_PROJECT_NEED_MIN_LENGTH,
  ESTIMATE_REQUEST_FIELD_LIMITS,
};

const STAGE_LABELS: Record<string, string> = {
  asserting_authorization: "Confirming client access",
  loading_instruction: "Loading pricing methodology",
  assembling_context: "Assembling client intelligence",
  generating_estimate: "Generating pricing recommendation",
  validating: "Validating Estimate package",
  completed: "Completed",
  failed: "Failed",
};

export function estimateStageLabel(
  stage: AthenaEstimateGenerationStage | string | null | undefined,
): string | null {
  if (!stage) return null;
  return STAGE_LABELS[stage] ?? "Working on your Estimate";
}

export function formatEstimateMoney(
  amount: number,
  currencyCode: string,
): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toLocaleString()}`;
  }
}

export function formatEstimateDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function truncateProjectNeed(value: string, max = 120): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

/** Compact default option for the Estimate Prospect selector. */
export const ESTIMATE_PROSPECT_NONE_OPTION_LABEL =
  "No prospect — estimate for this client" as const;

export const ESTIMATE_PROSPECT_REMOVED_LABEL = "Prospect removed" as const;

export const ESTIMATE_PROSPECT_REMOVED_REGENERATE_MESSAGE =
  "This Prospect has been removed and this Estimate cannot be regenerated." as const;

export const ESTIMATE_PROSPECT_UNAVAILABLE_REGENERATE_MESSAGE =
  "This Prospect is no longer available and this Estimate cannot be regenerated." as const;

/** True when a frozen Prospect business-name snapshot is present (active or removed). */
export function estimateHasProspectTarget(input: {
  prospectBusinessNameSnapshot?: string | null;
}): boolean {
  return Boolean(input.prospectBusinessNameSnapshot?.trim());
}

/**
 * History primary title:
 * - Prospect-targeted (active or removed): frozen Prospect business-name snapshot
 * - Org-only: organization snapshot (V26)
 */
export function formatEstimateHistoryPrimaryLabel(input: {
  organizationNameSnapshot: string;
  prospectBusinessNameSnapshot?: string | null;
}): string {
  const prospect = input.prospectBusinessNameSnapshot?.trim();
  if (prospect) return prospect;
  return input.organizationNameSnapshot;
}
