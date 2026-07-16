/**
 * Authoritative Deep Scrape persisted stage union.
 *
 * Must stay aligned with the DB check constraint
 * athena_website_deep_scrape_jobs_current_stage_check.
 *
 * Progress phases such as "rendering" are UI/engine signals only and must
 * never be written to current_stage.
 */

export const DEEP_SCRAPE_PERSISTED_STAGES = [
  "queued",
  "discovering",
  "crawling",
  "synthesizing",
  "persisting",
  "retraining",
  "regenerating",
  "completed",
  "failed",
] as const;

export type DeepScrapePersistedStage =
  (typeof DEEP_SCRAPE_PERSISTED_STAGES)[number];

/** Engine/UI progress phases that are not persisted as current_stage. */
export const DEEP_SCRAPE_UI_ONLY_PROGRESS_PHASES = ["rendering"] as const;

export type DeepScrapeUiOnlyProgressPhase =
  (typeof DEEP_SCRAPE_UI_ONLY_PROGRESS_PHASES)[number];

const PERSISTED_STAGE_SET = new Set<string>(DEEP_SCRAPE_PERSISTED_STAGES);

/**
 * Legal transitions for executor-driven stage changes.
 * Same-stage renewals are always allowed by heartbeat (lease only).
 * Terminal stages accept no outgoing transitions.
 */
export const LEGAL_DEEP_SCRAPE_TRANSITIONS: Record<
  DeepScrapePersistedStage,
  readonly DeepScrapePersistedStage[]
> = {
  queued: ["discovering", "failed"],
  discovering: ["crawling", "synthesizing", "persisting", "failed"],
  crawling: ["crawling", "synthesizing", "persisting", "failed"],
  synthesizing: ["synthesizing", "persisting", "failed"],
  persisting: ["persisting", "retraining", "regenerating", "failed"],
  retraining: ["retraining", "completed", "failed"],
  regenerating: ["regenerating", "completed", "failed"],
  completed: [],
  failed: [],
};

export const DEEP_SCRAPE_STAGE_PROGRESS: Record<
  DeepScrapePersistedStage,
  number
> = {
  queued: 0,
  discovering: 10,
  crawling: 35,
  synthesizing: 55,
  persisting: 70,
  retraining: 85,
  regenerating: 85,
  completed: 100,
  failed: 100,
};

export class DeepScrapeStateTransitionError extends Error {
  readonly code = "DEEP_SCRAPE_STATE_TRANSITION_INVALID";
  readonly retryable = false;
  readonly priorStage: string | null;
  readonly nextStage: string | null;

  constructor(
    message: string,
    priorStage: string | null,
    nextStage: string | null,
  ) {
    super(message);
    this.name = "DeepScrapeStateTransitionError";
    this.priorStage = priorStage;
    this.nextStage = nextStage;
  }
}

export function isPersistedDeepScrapeStage(
  value: unknown,
): value is DeepScrapePersistedStage {
  return typeof value === "string" && PERSISTED_STAGE_SET.has(value);
}

/**
 * Map crawl/UI progress stages onto persisted DB stages.
 * "rendering" (Playwright) is a crawling sub-phase, not a DB stage.
 */
export function mapProgressStageToPersisted(
  stage: string | null | undefined,
): DeepScrapePersistedStage | null {
  if (stage == null || stage === "") return null;
  if (stage === "rendering") return "crawling";
  if (isPersistedDeepScrapeStage(stage)) return stage;
  return null;
}

export function assertPersistedDeepScrapeStage(
  stage: string | null | undefined,
  context: string,
): DeepScrapePersistedStage | null {
  if (stage == null || stage === "") return null;
  if (isPersistedDeepScrapeStage(stage)) return stage;
  throw new DeepScrapeStateTransitionError(
    `${context}: invalid current_stage "${String(stage)}"`,
    null,
    String(stage),
  );
}

export function isLegalDeepScrapeTransition(
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  if (to == null || to === "") return true;
  if (!isPersistedDeepScrapeStage(to)) return false;
  if (from == null || from === "" || !isPersistedDeepScrapeStage(from)) {
    return to === "discovering" || to === "failed";
  }
  if (from === to) return true;
  return LEGAL_DEEP_SCRAPE_TRANSITIONS[from].includes(to);
}

export function assertLegalDeepScrapeTransition(
  from: string | null | undefined,
  to: string | null | undefined,
): DeepScrapePersistedStage | null {
  if (to == null || to === "") return null;
  if (!isPersistedDeepScrapeStage(to)) {
    throw new DeepScrapeStateTransitionError(
      `Illegal Deep Scrape stage value "${String(to)}"`,
      from == null ? null : String(from),
      String(to),
    );
  }
  if (!isLegalDeepScrapeTransition(from, to)) {
    throw new DeepScrapeStateTransitionError(
      `Illegal Deep Scrape transition ${String(from)} → ${to}`,
      from == null ? null : String(from),
      to,
    );
  }
  return to;
}

const STAGE_ORDER: readonly DeepScrapePersistedStage[] = [
  "queued",
  "discovering",
  "crawling",
  "synthesizing",
  "persisting",
  "retraining",
  "regenerating",
  "completed",
];

function stageRank(stage: string | null | undefined): number {
  if (!stage || !isPersistedDeepScrapeStage(stage)) return -1;
  if (stage === "failed") return 1_000;
  return STAGE_ORDER.indexOf(stage);
}

/**
 * Heartbeat may only advance or retain stage. Backward moves (e.g. reclaim while
 * still synthesizing) renew the lease/progress without rewriting current_stage.
 */
export function coerceHeartbeatStage(
  from: string | null | undefined,
  requested: string | null | undefined,
): DeepScrapePersistedStage | null {
  const mapped = mapProgressStageToPersisted(requested);
  if (!mapped) return null;
  if (!isPersistedDeepScrapeStage(from)) {
    return assertLegalDeepScrapeTransition(from, mapped);
  }
  if (mapped === "failed") {
    return assertLegalDeepScrapeTransition(from, mapped);
  }
  if (stageRank(mapped) < stageRank(from)) {
    return null;
  }
  return assertLegalDeepScrapeTransition(from, mapped);
}
