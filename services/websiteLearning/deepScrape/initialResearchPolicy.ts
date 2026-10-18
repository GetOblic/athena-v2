/**
 * Initial Deep Scrape orchestration decisions.
 *
 * Durable classification lives in the existing deep-scrape progress jsonb
 * (`orchestration.role = initial_research`). No new table or entitlement.
 * Manual Deep Scrape jobs omit the marker and keep their current lifecycle.
 *
 * The marker constants and reader live in the client-safe orchestration
 * module and are re-exported here. Do not copy that parser.
 */

import { isThinkDifferentlyJobProgress } from "@/services/brain/generationContracts/executiveGenerationMode";
import { hasUsableStoredHomepageLearning } from "@/services/identity/identityHomepageLearning";
import { websiteIntelligenceHasUsableContent } from "@/services/prospects/prospectWebsiteLearningPolicy";
import { normalizeRootWebsiteUrl } from "@/services/websiteLearning/deepScrape/urlSafety";
import {
  INITIAL_RESEARCH_PROGRESS_KEY,
  INITIAL_RESEARCH_ROLE,
  readInitialResearchOrchestration,
  type InitialResearchFallbackState,
  type InitialResearchOrchestration,
} from "@/lib/websiteLearning/initialResearchOrchestration";

export {
  INITIAL_RESEARCH_PROGRESS_KEY,
  INITIAL_RESEARCH_ROLE,
  readInitialResearchOrchestration,
  type InitialResearchFallbackState,
  type InitialResearchOrchestration,
};

export const INITIAL_RESEARCH_FALLBACK_GENERATION_KEY =
  "initialResearchFallback" as const;

/** First-generation follow-on. Included in the existing reservation. */
export const INITIAL_RESEARCH_FOLLOW_ON_TRIGGER = "discussion_import" as const;
/** Manual Deep Scrape follow-on. Unchanged. */
export const MANUAL_DEEP_SCRAPE_FOLLOW_ON_TRIGGER =
  "prospect_deep_scrape" as const;

/** Initial research is not a second Free generation. */
export const INITIAL_RESEARCH_USES_SEPARATE_ENTITLEMENT = false;

/**
 * Bounded evidence-free settlement tries. Independent of crawl attempt_count.
 * fail_athena_website_deep_scrape_job forces status failed once
 * attempt_count >= max_attempts, and claim_athena_website_deep_scrape_job
 * never selects failed or awaiting_follow_on.
 */
export const MAX_FALLBACK_SETTLE_ATTEMPTS = 3;

/**
 * An active generation without the fallback marker is blocking enqueue.
 * This is contention, not a failed settlement try.
 */
export const UNRELATED_ACTIVE_GENERATION_BLOCK = "UNRELATED_ACTIVE_GENERATION";

/**
 * The fallback-marker lookup could not be read. Distinct from an empty result.
 */
export const FALLBACK_GENERATION_LOOKUP_FAILED =
  "FALLBACK_GENERATION_LOOKUP_FAILED";

/**
 * The active-generation read could not be completed. Distinct from a
 * successful read that found no queued, processing, or retryable job.
 */
export const ACTIVE_GENERATION_LOOKUP_FAILED =
  "ACTIVE_GENERATION_LOOKUP_FAILED";

export type ProspectInitialResearchDecision =
  | { schedule: false; reason: ProspectInitialResearchDenyReason }
  | { schedule: true; reason: "schedule_initial_research" };

export type ProspectInitialResearchDenyReason =
  | "explicit_skip"
  | "fallback_generation"
  | "think_differently"
  | "discussion_update"
  | "deep_scrape_follow_on"
  | "unsupported_trigger"
  | "no_website"
  | "invalid_website"
  | "usable_intelligence"
  | "existing_executive_version";

export type IdentityInitialTrainDecision =
  | "wait_for_active_research"
  | "enqueue_initial_research"
  | "compile_existing"
  | "compile_without_website_fetch";

export type InitialResearchContinuation =
  | { kind: "scrape" }
  | { kind: "promoted_phase_b" }
  | {
      kind: "evidence_free_prospect_fallback";
      reuseFollowOn: boolean;
    }
  | { kind: "evidence_free_brain_compile"; alreadyReady: boolean }
  | { kind: "terminal_failure_only" };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function buildInitialResearchProgress(): Record<string, unknown> {
  return {
    [INITIAL_RESEARCH_PROGRESS_KEY]: {
      role: INITIAL_RESEARCH_ROLE,
      fallback: "idle",
      failureCode: null,
      failureMessage: null,
      fallbackAttempts: 0,
    } satisfies InitialResearchOrchestration,
  };
}

export function buildInitialResearchFallbackGenerationProgress(): Record<
  string,
  unknown
> {
  return { [INITIAL_RESEARCH_FALLBACK_GENERATION_KEY]: true };
}

export function isInitialResearchProgress(
  progress: Record<string, unknown> | null | undefined,
): boolean {
  return readInitialResearchOrchestration(progress) != null;
}

export function isInitialResearchFallbackGenerationProgress(
  progress: Record<string, unknown> | null | undefined,
): boolean {
  return progress?.[INITIAL_RESEARCH_FALLBACK_GENERATION_KEY] === true;
}

export function mergePreservedInitialResearchProgress(
  existing: Record<string, unknown> | null | undefined,
  next: Record<string, unknown>,
): Record<string, unknown> {
  if (readInitialResearchOrchestration(next)) return next;
  const preserved = readInitialResearchOrchestration(existing);
  if (!preserved) return next;
  return {
    ...next,
    [INITIAL_RESEARCH_PROGRESS_KEY]: preserved,
  };
}

export function withInitialResearchFallback(
  progress: Record<string, unknown> | null | undefined,
  patch: Partial<
    Pick<
      InitialResearchOrchestration,
      "fallback" | "failureCode" | "failureMessage" | "fallbackAttempts"
    >
  >,
): Record<string, unknown> {
  const current =
    readInitialResearchOrchestration(progress) ??
    (buildInitialResearchProgress()[INITIAL_RESEARCH_PROGRESS_KEY] as InitialResearchOrchestration);
  return {
    ...(progress ?? {}),
    [INITIAL_RESEARCH_PROGRESS_KEY]: {
      ...current,
      ...patch,
      role: INITIAL_RESEARCH_ROLE,
    },
  };
}

export function deepScrapeFailureIsTerminal(input: {
  retryable: boolean;
  attemptCount: number;
  maxAttempts: number;
}): boolean {
  if (input.retryable && input.attemptCount < input.maxAttempts) {
    return false;
  }
  return true;
}

export function selectProspectFollowOnTrigger(
  progress: Record<string, unknown> | null | undefined,
): typeof INITIAL_RESEARCH_FOLLOW_ON_TRIGGER | typeof MANUAL_DEEP_SCRAPE_FOLLOW_ON_TRIGGER {
  return isInitialResearchProgress(progress)
    ? INITIAL_RESEARCH_FOLLOW_ON_TRIGGER
    : MANUAL_DEEP_SCRAPE_FOLLOW_ON_TRIGGER;
}

export function shouldSuppressProspectHomepageScrape(
  progress: Record<string, unknown> | null | undefined,
): boolean {
  return isInitialResearchFallbackGenerationProgress(progress);
}

export function sameNormalizedWebsite(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = normalizeRootWebsiteUrl(left);
  const b = normalizeRootWebsiteUrl(right);
  if (!a || !b) return false;
  return a.url === b.url;
}

export function isFailedInitialResearchForWebsite(
  job: {
    progress: Record<string, unknown> | null;
    status: string;
    promoted_at: string | null;
    root_url: string;
  } | null,
  website: string | null | undefined,
): boolean {
  if (!job) return false;
  if (!isInitialResearchProgress(job.progress ?? undefined)) return false;
  if (job.status !== "failed" || job.promoted_at) return false;
  return sameNormalizedWebsite(job.root_url, website);
}

/**
 * First-generation Prospect scheduling gate.
 * GetOblic/Google conversion, Audience, refresh-with-intelligence,
 * discussion_update, and explicit regeneration never reach `schedule: true`
 * because they are not this call (or they already have a version / usable WI).
 */
export function decideProspectInitialResearch(input: {
  triggerType?: string | null;
  website?: string | null;
  websiteIntelligence?: Record<string, unknown> | null;
  hasCurrentExecutiveVersion: boolean;
  progress?: Record<string, unknown> | null;
  skipInitialResearch?: boolean;
}): ProspectInitialResearchDecision {
  if (input.skipInitialResearch) {
    return { schedule: false, reason: "explicit_skip" };
  }
  if (isInitialResearchFallbackGenerationProgress(input.progress)) {
    return { schedule: false, reason: "fallback_generation" };
  }
  if (isThinkDifferentlyJobProgress(input.progress)) {
    return { schedule: false, reason: "think_differently" };
  }

  const trigger = String(input.triggerType ?? "discussion_import").trim();
  if (trigger === "discussion_update") {
    return { schedule: false, reason: "discussion_update" };
  }
  if (trigger === "prospect_deep_scrape") {
    return { schedule: false, reason: "deep_scrape_follow_on" };
  }
  if (trigger !== "discussion_import" && trigger !== "manual_refresh") {
    return { schedule: false, reason: "unsupported_trigger" };
  }
  if (!String(input.website ?? "").trim()) {
    return { schedule: false, reason: "no_website" };
  }
  if (!normalizeRootWebsiteUrl(input.website)) {
    return { schedule: false, reason: "invalid_website" };
  }
  if (websiteIntelligenceHasUsableContent(input.websiteIntelligence)) {
    return { schedule: false, reason: "usable_intelligence" };
  }
  if (input.hasCurrentExecutiveVersion) {
    return { schedule: false, reason: "existing_executive_version" };
  }
  return { schedule: true, reason: "schedule_initial_research" };
}

export type ProspectInitialResearchConcurrency =
  | "enqueue_deep_scrape"
  | "reuse_active_deep_scrape"
  | "reuse_active_generation"
  | "enqueue_generation"
  | "defer_active_generation_lookup";

export function concurrentProspectInitialResearch(input: {
  schedule: boolean;
  activeDeepScrape: boolean;
  /** Queued, processing, or retryable generation for this discussion. */
  activeGeneration?: boolean;
  /**
   * Set only when initial research is being scheduled. `error` is not an
   * empty read. Callers that are not scheduling initial research omit it.
   */
  activeGenerationRead?: "found" | "none" | "error";
}): ProspectInitialResearchConcurrency {
  if (!input.schedule) return "enqueue_generation";
  if (input.activeGenerationRead === "error") {
    return "defer_active_generation_lookup";
  }
  if (input.activeGenerationRead === "found" || input.activeGeneration) {
    return "reuse_active_generation";
  }
  if (input.activeDeepScrape) return "reuse_active_deep_scrape";
  return "enqueue_deep_scrape";
}

export function decideIdentityInitialTrain(input: {
  brainObtained: boolean;
  website?: string | null;
  websiteIntelligence?: unknown;
  masterProfile?: Record<string, unknown> | null;
  activeInitialResearch: boolean;
  failedInitialResearchForWebsite: boolean;
}): IdentityInitialTrainDecision {
  if (input.brainObtained) return "compile_existing";
  if (input.activeInitialResearch) return "wait_for_active_research";
  if (input.failedInitialResearchForWebsite) {
    return "compile_without_website_fetch";
  }
  const intelligence = asRecord(input.websiteIntelligence);
  if (
    websiteIntelligenceHasUsableContent(intelligence) ||
    hasUsableStoredHomepageLearning(input.masterProfile)
  ) {
    return "compile_existing";
  }
  if (!normalizeRootWebsiteUrl(input.website)) return "compile_existing";
  return "enqueue_initial_research";
}

export function continuationForClaimedInitialResearch(input: {
  isInitialResearch: boolean;
  promoted: boolean;
  fallback: InitialResearchFallbackState;
  fallbackAttempts: number;
  sourceType: "brain" | "prospect" | "persona";
  terminalFailure: boolean;
  followOnJobId: string | null;
  followOnMatchesFallback: boolean;
  brainReady: boolean;
}): InitialResearchContinuation {
  if (!input.isInitialResearch) {
    return input.promoted ? { kind: "promoted_phase_b" } : { kind: "scrape" };
  }
  if (input.promoted) return { kind: "promoted_phase_b" };

  const settle =
    input.fallback === "pending" ||
    input.fallback === "settled" ||
    input.terminalFailure;
  if (!settle) return { kind: "scrape" };

  if (input.fallback === "settled") {
    return { kind: "terminal_failure_only" };
  }

  const exhaustedSettles =
    input.fallbackAttempts >= MAX_FALLBACK_SETTLE_ATTEMPTS &&
    !input.followOnJobId &&
    !input.followOnMatchesFallback &&
    !input.brainReady;
  if (exhaustedSettles) return { kind: "terminal_failure_only" };

  if (input.sourceType === "brain") {
    return {
      kind: "evidence_free_brain_compile",
      alreadyReady: input.brainReady,
    };
  }
  if (input.sourceType === "prospect") {
    return {
      kind: "evidence_free_prospect_fallback",
      reuseFollowOn: Boolean(input.followOnJobId) || input.followOnMatchesFallback,
    };
  }
  return { kind: "scrape" };
}

/**
 * Statuses claim_athena_website_deep_scrape_job can select.
 * processing is claimable only after the lease expires.
 * retryable is claimable when next_attempt_at is null or due.
 * The claim does not consult attempt_count or max_attempts.
 * failed, completed, and awaiting_follow_on are never selected.
 */
export function deepScrapeStatusIsClaimable(status: string): boolean {
  return (
    status === "queued" || status === "retryable" || status === "processing"
  );
}

/**
 * fail_athena_website_deep_scrape_job:
 * if p_retryable and attempt_count < max_attempts then retryable else failed.
 */
export function deepScrapeFailRpcWouldRetry(input: {
  retryable: boolean;
  attemptCount: number;
  maxAttempts: number;
}): boolean {
  return input.retryable && input.attemptCount < input.maxAttempts;
}

export type UnresolvedFallbackWrite =
  | { method: "direct_retryable"; settleVisibleStatus: false }
  | {
      method: "fail_rpc";
      retryable: boolean;
      settleVisibleStatus: boolean;
    };

/**
 * Crawl attempt_count must not end fallback settlement.
 * When the fail RPC would store failed, write retryable directly so the
 * claim can run settlement again. A persisted follow-on is terminal for the
 * deep-scrape row and must not enqueue another generation.
 */
export function decideUnresolvedFallbackWrite(input: {
  fallbackAttemptsAfterFailure: number;
  crawlAttemptCount: number;
  crawlMaxAttempts: number;
  followOnPersisted: boolean;
}): UnresolvedFallbackWrite {
  if (input.followOnPersisted) {
    return { method: "fail_rpc", retryable: false, settleVisibleStatus: false };
  }
  const withinBound =
    input.fallbackAttemptsAfterFailure < MAX_FALLBACK_SETTLE_ATTEMPTS;
  if (!withinBound) {
    return { method: "fail_rpc", retryable: false, settleVisibleStatus: true };
  }
  if (
    deepScrapeFailRpcWouldRetry({
      retryable: true,
      attemptCount: input.crawlAttemptCount,
      maxAttempts: input.crawlMaxAttempts,
    })
  ) {
    return { method: "fail_rpc", retryable: true, settleVisibleStatus: false };
  }
  return { method: "direct_retryable", settleVisibleStatus: false };
}

export type DeferredFallbackSettlement =
  | { method: "direct_retryable" }
  | { method: "fail_rpc" };

/**
 * Unrelated active generation and an unreadable fallback lookup do not
 * consume fallbackAttempts and do not give up. The job stays retryable.
 * When fail_athena_website_deep_scrape_job would store failed because
 * crawl attempt_count reached max_attempts, the caller releases the
 * current claim directly. Otherwise the retryable fail RPC applies the
 * same delay.
 */
export function decideDeferredFallbackSettlement(input: {
  crawlAttemptCount: number;
  crawlMaxAttempts: number;
}): DeferredFallbackSettlement {
  if (
    deepScrapeFailRpcWouldRetry({
      retryable: true,
      attemptCount: input.crawlAttemptCount,
      maxAttempts: input.crawlMaxAttempts,
    })
  ) {
    return { method: "fail_rpc" };
  }
  return { method: "direct_retryable" };
}

/** Blocked settlement leaves the bounded try count unchanged. */
export function unchangedFallbackAttempts(attempts: number): number {
  const current = Number(attempts);
  if (!Number.isFinite(current) || current <= 0) return 0;
  return current;
}

export function nonConsumingFallbackBlockMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (
    error.message === UNRELATED_ACTIVE_GENERATION_BLOCK ||
    error.message === FALLBACK_GENERATION_LOOKUP_FAILED ||
    error.message === ACTIVE_GENERATION_LOOKUP_FAILED
  ) {
    return error.message;
  }
  return null;
}

export type EvidenceFreeProspectFallbackPlan =
  | { action: "reuse"; jobId: string }
  | { action: "defer_unrelated_active_generation" }
  | { action: "defer_lookup_unavailable" }
  | { action: "defer_active_generation_lookup" }
  | { action: "enqueue" };

/**
 * A failed read is not an empty result. A known fallback-marked job is
 * reused even when a newer unrelated generation is active, and even when
 * the active-generation read failed. Enqueue happens only when the
 * fallback lookup and the active-generation read both succeeded empty.
 */
export function planEvidenceFreeProspectFallback(input: {
  lookupUnavailable: boolean;
  activeLookupUnavailable?: boolean;
  existingFallbackJobId?: string | null;
  activeJobId?: string | null;
  activeProgress?: Record<string, unknown> | null;
}): EvidenceFreeProspectFallbackPlan {
  if (input.lookupUnavailable) {
    return { action: "defer_lookup_unavailable" };
  }
  const existingFallbackJobId = String(input.existingFallbackJobId ?? "").trim();
  if (existingFallbackJobId) {
    return { action: "reuse", jobId: existingFallbackJobId };
  }
  if (input.activeLookupUnavailable) {
    return { action: "defer_active_generation_lookup" };
  }
  const activeJobId = String(input.activeJobId ?? "").trim();
  if (
    activeJobId &&
    isInitialResearchFallbackGenerationProgress(input.activeProgress)
  ) {
    return { action: "reuse", jobId: activeJobId };
  }
  if (
    fallbackEnqueueBlockedByActiveJob({
      activeJobId,
      activeProgress: input.activeProgress,
    })
  ) {
    return { action: "defer_unrelated_active_generation" };
  }
  return { action: "enqueue" };
}

export type AwaitingFollowOnTerminalFailure =
  | "terminal_initial_research"
  | "retry_manual_deep_scrape";

/**
 * A failed initial-research follow-on must not return the deep-scrape job to
 * retryable. Claim would run Phase B again and enqueue another generation
 * after Free release. Manual Prospect and Persona jobs keep the retry.
 */
export function decideAwaitingFollowOnTerminalFailure(input: {
  isInitialResearch: boolean;
}): AwaitingFollowOnTerminalFailure {
  return input.isInitialResearch
    ? "terminal_initial_research"
    : "retry_manual_deep_scrape";
}

export type VisibleFallbackGiveUp = {
  identityBrainStatus: "pending" | null;
  prospectStatus: "Processing Failed" | null;
};

/**
 * Final give-up without a follow-on. Does not describe intelligence, manual
 * business fields, or executive versions — callers may update only the
 * returned status columns.
 */
export function visibleStatusAfterFallbackGiveUp(input: {
  sourceType: "brain" | "prospect" | "persona";
  identityBrainStatus?: string | null;
}): VisibleFallbackGiveUp {
  if (input.sourceType === "brain") {
    if (input.identityBrainStatus === "processing") {
      return { identityBrainStatus: "pending", prospectStatus: null };
    }
    return { identityBrainStatus: null, prospectStatus: null };
  }
  if (input.sourceType === "prospect") {
    return {
      identityBrainStatus: null,
      prospectStatus: "Processing Failed",
    };
  }
  return { identityBrainStatus: null, prospectStatus: null };
}

/**
 * Earliest fallback-marked generation for one organization and discussion.
 * Newer jobs without the marker, and jobs from another tenant or discussion,
 * are not the follow-on.
 */
export function selectFallbackGenerationJob(
  jobs: readonly {
    id: string;
    organizationId: string;
    discussionId: string;
    createdAt: string;
    progress: Record<string, unknown> | null | undefined;
  }[],
  organizationId: string,
  discussionId: string,
): string | null {
  const matches = jobs
    .filter(
      (job) =>
        job.organizationId === organizationId &&
        job.discussionId === discussionId &&
        isInitialResearchFallbackGenerationProgress(job.progress),
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  return matches[0]?.id ?? null;
}

/** Adopt a generation only when it carries the fallback marker. */
export function adoptedFallbackFollowOnId(input: {
  jobId?: string | null;
  progress?: Record<string, unknown> | null;
}): string | null {
  const jobId = String(input.jobId ?? "").trim();
  if (!jobId) return null;
  if (!isInitialResearchFallbackGenerationProgress(input.progress)) return null;
  return jobId;
}

/** An active generation without the fallback marker must not be stored as the follow-on. */
export function fallbackEnqueueBlockedByActiveJob(input: {
  activeJobId?: string | null;
  activeProgress?: Record<string, unknown> | null;
}): boolean {
  const activeJobId = String(input.activeJobId ?? "").trim();
  if (!activeJobId) return false;
  return !isInitialResearchFallbackGenerationProgress(input.activeProgress);
}
