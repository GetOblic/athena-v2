/**
 * Licensee Master Estimate UI helpers (V26 L7).
 * Presentation only — no API/ownership logic.
 */

import {
  getLicenseeLocalization,
  type LicenseeMessages,
} from "@/lib/licensee/getLicenseeLocalization";
import type { AthenaEstimateGenerationStage } from "@/services/estimate/athenaEstimateTypes";
import type { AthenaEstimateTimeframe } from "@/services/estimate/athenaEstimateTypes";
import {
  ESTIMATE_PROJECT_NEED_MIN_LENGTH,
  ESTIMATE_REQUEST_FIELD_LIMITS,
} from "@/services/estimate/athenaEstimateRequest";

export const ESTIMATE_POLL_INTERVAL_MS = 5_000;

const ENGLISH = getLicenseeLocalization("en").messages;
const ENGLISH_ESTIMATE = ENGLISH.estimate;
const ENGLISH_ERRORS = ENGLISH.errors;

export const ESTIMATE_TIMEFRAME_OPTIONS: Array<{
  value: AthenaEstimateTimeframe;
  label: string;
}> = [
  { value: "asap", label: ENGLISH_ESTIMATE.timeframeAsap },
  { value: "2_4_weeks", label: ENGLISH_ESTIMATE.timeframe2to4Weeks },
  { value: "1_3_months", label: ENGLISH_ESTIMATE.timeframe1to3Months },
  { value: "flexible", label: ENGLISH_ESTIMATE.timeframeFlexible },
];

export {
  ESTIMATE_PROJECT_NEED_MIN_LENGTH,
  ESTIMATE_REQUEST_FIELD_LIMITS,
};

const STAGE_LABELS: Record<string, string> = {
  asserting_authorization: ENGLISH_ESTIMATE.stageAsserting,
  loading_instruction: ENGLISH_ESTIMATE.stageLoadingInstruction,
  assembling_context: ENGLISH_ESTIMATE.stageAssembling,
  generating_estimate: ENGLISH_ESTIMATE.stageGenerating,
  validating: ENGLISH_ESTIMATE.stageValidating,
  completed: ENGLISH_ESTIMATE.stageCompleted,
  failed: ENGLISH_ESTIMATE.stageFailed,
};

function stageLabelsFromMessages(
  messages: LicenseeMessages,
): Record<string, string> {
  return {
    asserting_authorization: messages.estimate.stageAsserting,
    loading_instruction: messages.estimate.stageLoadingInstruction,
    assembling_context: messages.estimate.stageAssembling,
    generating_estimate: messages.estimate.stageGenerating,
    validating: messages.estimate.stageValidating,
    completed: messages.estimate.stageCompleted,
    failed: messages.estimate.stageFailed,
  };
}

export function estimateStageLabel(
  stage: AthenaEstimateGenerationStage | string | null | undefined,
  messages?: LicenseeMessages,
): string | null {
  if (!stage) return null;
  const labels = messages ? stageLabelsFromMessages(messages) : STAGE_LABELS;
  return labels[stage] ?? (messages?.estimate.stageFallback ?? ENGLISH_ESTIMATE.stageFallback);
}

export function formatEstimateMoney(
  amount: number,
  currencyCode: string,
  locale = "en-US",
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toLocaleString(locale)}`;
  }
}

export function formatEstimateDate(iso: string, locale = "en-US"): string {
  try {
    return new Intl.DateTimeFormat(locale, {
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
  ENGLISH_ESTIMATE.prospectNone;

export const ESTIMATE_PROSPECT_REMOVED_LABEL = ENGLISH_ESTIMATE.prospectRemoved;

export const ESTIMATE_PROSPECT_REMOVED_REGENERATE_MESSAGE =
  ENGLISH_ERRORS.prospectRemovedRegenerate;

export const ESTIMATE_PROSPECT_UNAVAILABLE_REGENERATE_MESSAGE =
  ENGLISH_ERRORS.prospectUnavailableRegenerate;

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
