import type { DiscussionAgeKey } from "@/lib/discussionAge";
import type { ConfidenceLabel } from "@/lib/confidenceDisplay";
import type {
  AthenaVerdict,
  ResponseTiming,
} from "@/lib/discussionExecutiveIntel";
import type {
  DiscussionLifecycleKey,
  DiscussionQueueKey,
  DiscussionStatusOption,
} from "@/lib/discussionStatus";
import { normalizeDiscussionLifecycleKey } from "@/lib/discussionStatus";
import { en } from "./messages/en";
import type { TenantMessages } from "./types";

const SAFE_LABEL_FALLBACK = "—";

const QUEUE_TITLE_KEYS = {
  new: "queueNew",
  in_review: "queueInReview",
  processed: "queueProcessed",
} as const satisfies Record<DiscussionQueueKey, keyof TenantMessages["discussions"]>;

const LIFECYCLE_LABEL_KEYS = {
  new: "lifecycleNew",
  reviewing: "lifecycleReviewing",
  monitoring: "lifecycleMonitoring",
  completed: "lifecycleCompleted",
} as const satisfies Record<
  DiscussionLifecycleKey,
  keyof TenantMessages["discussions"]
>;

const AGE_LABEL_KEYS = {
  fresh: "ageFresh",
  active: "ageActive",
  cooling: "ageCooling",
  dormant: "ageDormant",
} as const satisfies Record<DiscussionAgeKey, keyof TenantMessages["discussions"]>;

function localizedDiscussionLabel(
  messages: TenantMessages,
  key: keyof TenantMessages["discussions"],
): string {
  const localized = messages.discussions[key];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  const fallback = en.discussions[key];
  if (typeof fallback === "string" && fallback.trim()) {
    return fallback;
  }
  return SAFE_LABEL_FALLBACK;
}

/**
 * Presentation-only discussion queue title.
 * Does not read or write stored queue tokens.
 */
export function getLocalizedDiscussionQueueTitle(
  messages: TenantMessages,
  queueKey: DiscussionQueueKey,
): string {
  return localizedDiscussionLabel(messages, QUEUE_TITLE_KEYS[queueKey]);
}

/**
 * Presentation-only discussion list action label.
 * Does not change routing or stored queue tokens.
 */
export function getLocalizedDiscussionActionLabel(
  messages: TenantMessages,
  queueKey: DiscussionQueueKey,
): string {
  return localizedDiscussionLabel(
    messages,
    queueKey === "new" ? "actionAnalyze" : "actionOpen",
  );
}

/**
 * Presentation-only discussion lifecycle label.
 * Does not read or write stored status tokens.
 */
export function getLocalizedDiscussionLifecycleLabel(
  messages: TenantMessages,
  lifecycleKey: DiscussionLifecycleKey,
): string {
  return localizedDiscussionLabel(messages, LIFECYCLE_LABEL_KEYS[lifecycleKey]);
}

/**
 * Presentation-only discussion age label.
 * Does not change age classification.
 */
export function getLocalizedDiscussionAgeLabel(
  messages: TenantMessages,
  ageKey: DiscussionAgeKey,
): string {
  return localizedDiscussionLabel(messages, AGE_LABEL_KEYS[ageKey]);
}

const STATUS_OPTION_LIFECYCLE: Record<
  DiscussionStatusOption,
  DiscussionLifecycleKey
> = {
  New: "new",
  Reviewing: "reviewing",
  Monitoring: "monitoring",
  Completed: "completed",
};

/**
 * Presentation-only label for a stored discussion status option.
 * Does not change PATCH/API tokens.
 */
export function getLocalizedDiscussionStatusOptionLabel(
  messages: TenantMessages,
  status: DiscussionStatusOption,
): string {
  return getLocalizedDiscussionLifecycleLabel(
    messages,
    STATUS_OPTION_LIFECYCLE[status],
  );
}

/**
 * Presentation-only label for a persisted discussion.status value.
 * Unknown tokens are returned unchanged.
 */
export function getLocalizedDiscussionStoredStatusLabel(
  messages: TenantMessages,
  status: string | null | undefined,
): string {
  const lifecycle = normalizeDiscussionLifecycleKey(status);
  if (!lifecycle) {
    const trimmed = String(status ?? "").trim();
    return trimmed || getLocalizedDiscussionLifecycleLabel(messages, "new");
  }
  return getLocalizedDiscussionLifecycleLabel(messages, lifecycle);
}

type ExecutiveCopy = TenantMessages["discussions"]["executive"];

const ANALYSIS_STATUS_KEYS = {
  draft: "analysisStatusDraft",
  review_ready: "analysisStatusReviewReady",
  analysis_completed_no_opportunity: "analysisStatusNoOpportunity",
  analysis_completed_opportunity_unsaved: "analysisStatusOpportunityUnsaved",
  briefing_save_failed: "analysisStatusBriefingFailed",
} as const satisfies Record<string, keyof ExecutiveCopy>;

/**
 * Presentation-only mapping for discussion analysis.status tokens.
 * Unknown tokens stay verbatim.
 */
export function getLocalizedAnalysisStatusLabel(
  messages: TenantMessages,
  status: string | null | undefined,
): string {
  const token = String(status ?? "").trim();
  if (!token) {
    return "";
  }
  const key =
    ANALYSIS_STATUS_KEYS[token as keyof typeof ANALYSIS_STATUS_KEYS];
  if (!key) {
    return token;
  }
  const localized = messages.discussions.executive[key];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  return en.discussions.executive[key];
}

const CONFIDENCE_KEYS = {
  Low: "confidenceLow",
  Medium: "confidenceMedium",
  High: "confidenceHigh",
} as const satisfies Record<ConfidenceLabel, keyof ExecutiveCopy>;

export function getLocalizedEiConfidenceLabel(
  messages: TenantMessages,
  label: ConfidenceLabel,
): string {
  const localized = messages.discussions.executive[CONFIDENCE_KEYS[label]];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  return en.discussions.executive[CONFIDENCE_KEYS[label]];
}

const VERDICT_KEYS = {
  "Worth pursuing": "verdictWorthPursuing",
  Monitor: "verdictMonitor",
  "Low priority": "verdictLowPriority",
} as const satisfies Record<AthenaVerdict, keyof ExecutiveCopy>;

export function getLocalizedAthenaVerdict(
  messages: TenantMessages,
  verdict: AthenaVerdict,
): string {
  const localized = messages.discussions.executive[VERDICT_KEYS[verdict]];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  return en.discussions.executive[VERDICT_KEYS[verdict]];
}

const TIMING_KEYS = {
  "Respond within 12 hours": "timingWithin12Hours",
  "Respond today": "timingRespondToday",
  Monitor: "timingMonitor",
} as const satisfies Record<ResponseTiming, keyof ExecutiveCopy>;

export function getLocalizedResponseTiming(
  messages: TenantMessages,
  timing: ResponseTiming,
): string {
  const localized = messages.discussions.executive[TIMING_KEYS[timing]];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  return en.discussions.executive[TIMING_KEYS[timing]];
}
