/**
 * Presentation-only Prospect status/lifecycle labels.
 * Does not read or write stored tokens, API values, or generation payloads.
 */
import type { AthenaVerdict } from "@/lib/discussionExecutiveIntel";
import type { ProspectLifecycleStatus } from "@/services/prospects/prospectLifecycle";
import { isProspectLifecycleStatus } from "@/services/prospects/prospectLifecycle";
import type { ProspectDisplayStatus } from "@/services/prospects/prospectStatus";
import { en } from "./messages/en";
import type { TenantMessages } from "./types";

const SAFE_LABEL_FALLBACK = "—";

const LIFECYCLE_KEYS = {
  New: "new",
  Reviewing: "reviewing",
  "Outreach Planned": "outreachPlanned",
  Contacted: "contacted",
  "Follow-up": "followUp",
  Engaged: "engaged",
  Qualified: "qualified",
  "Not a Fit": "notAFit",
  Completed: "completed",
} as const satisfies Record<
  ProspectLifecycleStatus,
  keyof TenantMessages["prospects"]["lifecycle"]
>;

const READINESS_KEYS = {
  Queued: "queued",
  Processing: "processing",
  "Learning from Website": "learningFromWebsite",
  "Generating Executive Intelligence": "generatingExecutiveIntelligence",
  Ready: "ready",
  "Processing Failed": "processingFailed",
} as const;

type ProspectReadinessKey = keyof typeof READINESS_KEYS;

const VERDICT_KEYS = {
  "Worth pursuing": "verdictWorthPursuing",
  Monitor: "verdictMonitor",
  "Low priority": "verdictLowPriority",
} as const satisfies Record<
  AthenaVerdict,
  keyof TenantMessages["prospects"]["executive"]
>;

const HOMEPAGE_KEYS = {
  none: "homepageNone",
  incomplete: "homepageIncomplete",
  learned: "homepageLearned",
  pending: "homepagePending",
} as const;

function lifecycleCopy(
  messages: TenantMessages,
  key: keyof TenantMessages["prospects"]["lifecycle"],
): string {
  const localized = messages.prospects.lifecycle[key];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  const fallback = en.prospects.lifecycle[key];
  return typeof fallback === "string" && fallback.trim()
    ? fallback
    : SAFE_LABEL_FALLBACK;
}

/**
 * Presentation-only Prospect lifecycle label.
 * Unknown tokens remain verbatim.
 */
export function getLocalizedProspectLifecycleLabel(
  messages: TenantMessages,
  status: string | null | undefined,
): string {
  const trimmed = String(status ?? "").trim();
  if (!trimmed) {
    return lifecycleCopy(messages, "new");
  }
  if (!isProspectLifecycleStatus(trimmed)) {
    return trimmed;
  }
  return lifecycleCopy(messages, LIFECYCLE_KEYS[trimmed]);
}

/**
 * Presentation-only Prospect readiness label.
 * Unknown tokens remain verbatim.
 */
export function getLocalizedProspectReadinessLabel(
  messages: TenantMessages,
  status: string | null | undefined,
): string {
  const trimmed = String(status ?? "").trim();
  if (!trimmed) {
    return "";
  }
  const key = READINESS_KEYS[trimmed as ProspectReadinessKey];
  if (!key) {
    return trimmed;
  }
  const localized = messages.prospects.readiness[key];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  return en.prospects.readiness[key];
}

export function isProspectReadinessToken(
  value: string | null | undefined,
): value is ProspectDisplayStatus {
  return Boolean(value && value in READINESS_KEYS);
}

/**
 * Presentation-only Athena verdict label from Prospect executive chrome.
 * Does not change stored recommendation tokens.
 */
export function getLocalizedProspectVerdict(
  messages: TenantMessages,
  verdict: AthenaVerdict,
): string {
  const localized = messages.prospects.executive[VERDICT_KEYS[verdict]];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  return en.prospects.executive[VERDICT_KEYS[verdict]];
}

export type ProspectHomepageLearningKey = keyof typeof HOMEPAGE_KEYS;

/**
 * Presentation-only homepage-learning chrome from structured conditions.
 * Does not translate website_intelligence.error text.
 */
export function getLocalizedProspectHomepageLearning(
  messages: TenantMessages,
  key: ProspectHomepageLearningKey,
): string {
  const localized = messages.prospects.homepage[HOMEPAGE_KEYS[key]];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  return en.prospects.homepage[HOMEPAGE_KEYS[key]];
}

export function resolveProspectHomepageLearningKey(input: {
  website?: string | null;
  websiteError?: unknown;
  scrapedAt?: unknown;
}): ProspectHomepageLearningKey {
  if (!input.website) return "none";
  if (typeof input.websiteError === "string" && input.websiteError) {
    return "incomplete";
  }
  if (typeof input.scrapedAt === "string") return "learned";
  return "pending";
}
