import type { DiscussionAgeKey } from "@/lib/discussionAge";
import type {
  DiscussionLifecycleKey,
  DiscussionQueueKey,
} from "@/lib/discussionStatus";
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
