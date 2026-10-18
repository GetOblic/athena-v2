/**
 * Presentation for the initial Deep Scrape that runs before Brain compilation
 * or the first Prospect Intelligence generation.
 *
 * Reads the durable job the status APIs already load. It does not enqueue,
 * crawl, or invent page counts, percentages, or a success the job has not reached.
 */

import { readInitialResearchOrchestration } from "@/lib/websiteLearning/initialResearchOrchestration";

export const INITIAL_RESEARCH_PROGRESS_POLL_MS = 5_000;

const ACTIVE_DEEP_SCRAPE = new Set(["queued", "processing", "retryable"]);
const ACTIVE_GENERATION = new Set(["queued", "processing", "retryable"]);

export type InitialResearchFallback = "idle" | "pending" | "settled";

export type InitialResearchStatusPayload = {
  applies: boolean;
  jobId: string | null;
  status: string | null;
  stage: string | null;
  phase: string | null;
  promoted: boolean;
  fallback: InitialResearchFallback | null;
  researchFailed: boolean;
  followOnJobId: string | null;
  updatedAt: string | null;
};

export type GenerationObservation = {
  status: string | null;
  inFlight: boolean;
  evidenceFree: boolean;
};

export type IdentityProgressKind =
  | "brain_status"
  | "researching"
  | "training"
  | "research_failed_continuing"
  | "ready"
  | "compilation_failed"
  | "terminal_failed";

export type IdentityProgressView =
  | { kind: "brain_status" }
  | { kind: "researching" }
  | { kind: "training" }
  | { kind: "research_failed_continuing" }
  | { kind: "ready"; researchFailed: boolean }
  | { kind: "compilation_failed" }
  | { kind: "terminal_failed" };

export type ProspectProgressKind =
  | "existing"
  | "researching"
  | "generating"
  | "evidence_free_generating"
  | "ready"
  | "failed";

export type ProspectProgressView =
  | { kind: "existing" }
  | { kind: "researching" }
  | { kind: "generating" }
  | { kind: "evidence_free_generating" }
  | { kind: "ready" }
  | { kind: "failed" };

export type IdentityInitialResearchCopy = {
  researching: string;
  training: string;
  researchFailedReady: string;
  researchContinuing: string;
  compilationFailed: string;
  terminalFailed: string;
  retry: string;
};

export type ProspectInitialResearchCopy = {
  researching: string;
  generating: string;
  usingAvailableInformation: string;
};

export type BrainStatusLabels = {
  ready: string;
  pending: string;
  processing: string;
};

type DeepScrapeStatusJob = {
  id: string;
  status: string;
  current_stage: string;
  progress: Record<string, unknown> | null;
  promoted_at: string | null;
  follow_on_generation_job_id: string | null;
  error_metadata: Record<string, unknown> | null;
  updated_at: string;
};

export function emptyInitialResearchStatus(): InitialResearchStatusPayload {
  return {
    applies: false,
    jobId: null,
    status: null,
    stage: null,
    phase: null,
    promoted: false,
    fallback: null,
    researchFailed: false,
    followOnJobId: null,
    updatedAt: null,
  };
}

export function serializeInitialResearchStatus(
  job: DeepScrapeStatusJob | null | undefined,
): InitialResearchStatusPayload {
  if (!job) return emptyInitialResearchStatus();
  const orchestration = readInitialResearchOrchestration(job.progress);
  const phase =
    typeof job.progress?.phase === "string" && job.progress.phase.trim()
      ? job.progress.phase
      : null;
  const metadata = job.error_metadata;
  const researchFailed = Boolean(
    orchestration &&
      (orchestration.fallback === "pending" ||
        orchestration.fallback === "settled" ||
        metadata?.researchSucceeded === false ||
        metadata?.phase === "initial_research_fallback"),
  );
  return {
    applies: orchestration != null,
    jobId: job.id,
    status: job.status,
    stage: job.current_stage,
    phase,
    promoted: Boolean(job.promoted_at),
    fallback: orchestration?.fallback ?? null,
    researchFailed,
    followOnJobId: job.follow_on_generation_job_id,
    updatedAt: job.updated_at?.trim() ? job.updated_at : null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function readInitialResearchStatusPayload(
  value: unknown,
): InitialResearchStatusPayload | null {
  const raw = asRecord(value);
  if (!raw || typeof raw.applies !== "boolean") return null;
  if (
    raw.fallback != null &&
    raw.fallback !== "idle" &&
    raw.fallback !== "pending" &&
    raw.fallback !== "settled"
  ) {
    return null;
  }
  return {
    applies: raw.applies,
    jobId: readOptionalString(raw.jobId),
    status: readOptionalString(raw.status),
    stage: readOptionalString(raw.stage),
    phase: readOptionalString(raw.phase),
    promoted: raw.promoted === true,
    fallback:
      raw.fallback === "idle" ||
      raw.fallback === "pending" ||
      raw.fallback === "settled"
        ? raw.fallback
        : null,
    researchFailed: raw.researchFailed === true,
    followOnJobId: readOptionalString(raw.followOnJobId),
    updatedAt: readOptionalString(raw.updatedAt),
  };
}

export function readDiscussionGenerationObservation(
  value: unknown,
): GenerationObservation | null {
  const raw = asRecord(value);
  if (!raw || raw.success !== true) return null;
  return {
    status: readOptionalString(raw.jobStatus),
    inFlight: raw.regenerationInFlight === true,
    evidenceFree: raw.initialResearchFallback === true,
  };
}

/**
 * Ignore an observation that is older than the one already shown.
 * A missing timestamp cannot replace a known job, and it cannot invent progress.
 */
export function shouldAcceptResearchObservation(input: {
  previousUpdatedAt: string | null;
  nextUpdatedAt: string | null;
}): boolean {
  const next = input.nextUpdatedAt?.trim() || "";
  if (!next) return false;
  const previous = input.previousUpdatedAt?.trim() || "";
  if (!previous) return true;
  return next >= previous;
}

export function reconcileResearchSnapshot<
  T extends { research: InitialResearchStatusPayload },
>(current: T, incoming: T): T {
  if (
    !shouldAcceptResearchObservation({
      previousUpdatedAt: current.research.updatedAt,
      nextUpdatedAt: incoming.research.updatedAt,
    })
  ) {
    return current;
  }
  return incoming;
}

function brainCompiling(research: InitialResearchStatusPayload): boolean {
  return (
    research.promoted ||
    research.stage === "retraining" ||
    research.phase === "brain_deep_scrape"
  );
}

export function presentIdentityInitialResearch(input: {
  brainStatus: string | null;
  research: InitialResearchStatusPayload | null;
}): IdentityProgressView {
  const research = input.research;
  if (!research?.applies) return { kind: "brain_status" };

  const brain = (input.brainStatus ?? "pending").trim() || "pending";
  if (brain === "ready") {
    return {
      kind: "ready",
      researchFailed: research.researchFailed && !research.promoted,
    };
  }

  const status = research.status ?? "";
  const compiling = brainCompiling(research);
  if (
    research.fallback === "pending" &&
    !research.promoted &&
    ACTIVE_DEEP_SCRAPE.has(status)
  ) {
    return { kind: "research_failed_continuing" };
  }
  if (
    compiling &&
    (ACTIVE_DEEP_SCRAPE.has(status) || status === "awaiting_follow_on")
  ) {
    return { kind: "training" };
  }
  if (ACTIVE_DEEP_SCRAPE.has(status) && !compiling) {
    return { kind: "researching" };
  }
  if (status === "completed") {
    return compiling ? { kind: "training" } : { kind: "researching" };
  }
  if (status === "failed") {
    if (research.promoted || research.stage === "retraining") {
      return { kind: "compilation_failed" };
    }
    return { kind: "terminal_failed" };
  }
  return { kind: "brain_status" };
}

export function brainStatusLabelFor(
  brainStatus: string | null | undefined,
  labels: BrainStatusLabels,
): string {
  if (brainStatus === "ready") return labels.ready;
  if (brainStatus === "processing") return labels.processing;
  return labels.pending;
}

export function describeIdentityInitialResearch(input: {
  brainStatus: string | null;
  research: InitialResearchStatusPayload | null;
  labels: BrainStatusLabels;
  copy: IdentityInitialResearchCopy;
}): {
  view: IdentityProgressView;
  label: string;
  notice: string | null;
  retryLabel: string | null;
} {
  const view = presentIdentityInitialResearch(input);
  const brainLabel = brainStatusLabelFor(input.brainStatus, input.labels);
  switch (view.kind) {
    case "brain_status":
      return { view, label: brainLabel, notice: null, retryLabel: null };
    case "researching":
      return {
        view,
        label: input.copy.researching,
        notice: null,
        retryLabel: null,
      };
    case "training":
      return { view, label: input.copy.training, notice: null, retryLabel: null };
    case "research_failed_continuing":
      return {
        view,
        label: input.copy.training,
        notice: input.copy.researchContinuing,
        retryLabel: null,
      };
    case "ready":
      return {
        view,
        label: input.labels.ready,
        notice: view.researchFailed ? input.copy.researchFailedReady : null,
        retryLabel: null,
      };
    case "compilation_failed":
      return {
        view,
        label: input.copy.compilationFailed,
        notice: null,
        retryLabel: input.copy.retry,
      };
    case "terminal_failed":
      return {
        view,
        label: input.copy.terminalFailed,
        notice: null,
        retryLabel: input.copy.retry,
      };
  }
}

export function identityProgressIsLive(kind: IdentityProgressKind): boolean {
  return (
    kind === "researching" ||
    kind === "training" ||
    kind === "research_failed_continuing"
  );
}

export function shouldRefreshIdentityProgress(kind: IdentityProgressKind): boolean {
  return (
    kind === "ready" ||
    kind === "compilation_failed" ||
    kind === "terminal_failed"
  );
}

function generationIsActive(
  generation: GenerationObservation | null | undefined,
): boolean {
  if (!generation?.inFlight) return false;
  return ACTIVE_GENERATION.has(generation.status ?? "");
}

export function presentProspectInitialResearch(input: {
  displayStatus: string;
  hasCurrentVersion: boolean;
  research: InitialResearchStatusPayload | null;
  generation: GenerationObservation | null;
}): ProspectProgressView {
  const research = input.research;
  if (!research?.applies) return { kind: "existing" };

  const display = String(input.displayStatus ?? "").trim();
  const genActive = generationIsActive(input.generation);
  const evidenceFree = Boolean(input.generation?.evidenceFree);
  if (genActive && evidenceFree && research.researchFailed) {
    return { kind: "evidence_free_generating" };
  }
  if (genActive) {
    return { kind: "generating" };
  }
  if (
    input.generation?.status === "failed" &&
    !input.hasCurrentVersion
  ) {
    return { kind: "failed" };
  }
  if (input.hasCurrentVersion && display !== "Processing Failed") {
    return { kind: "ready" };
  }
  if (research.status === "awaiting_follow_on") {
    return { kind: "generating" };
  }
  if (
    !research.promoted &&
    research.fallback !== "settled" &&
    ACTIVE_DEEP_SCRAPE.has(research.status ?? "")
  ) {
    return { kind: "researching" };
  }
  if (display === "Processing Failed" || research.status === "failed") {
    return { kind: "failed" };
  }
  if (display === "Ready" || input.hasCurrentVersion) {
    return { kind: "ready" };
  }
  return { kind: "existing" };
}

export const PROSPECT_RESEARCHING_STATUS = "Researching Website";

export function prospectIntelligenceStatusForProgress(
  view: ProspectProgressView,
  existingStatus: string,
): string {
  switch (view.kind) {
    case "researching":
      return PROSPECT_RESEARCHING_STATUS;
    case "generating":
    case "evidence_free_generating":
      return "Generating Executive Intelligence";
    case "failed":
      return "Processing Failed";
    case "ready":
      return "Ready";
    default:
      return existingStatus;
  }
}

export function describeProspectInitialResearch(input: {
  displayStatus: string;
  hasCurrentVersion: boolean;
  research: InitialResearchStatusPayload | null;
  generation: GenerationObservation | null;
  existingLabel: string;
  failedLabel: string;
  copy: ProspectInitialResearchCopy;
}): {
  view: ProspectProgressView;
  label: string;
  notice: string | null;
  statusToken: string;
} {
  const view = presentProspectInitialResearch(input);
  const statusToken = prospectIntelligenceStatusForProgress(
    view,
    input.displayStatus,
  );
  switch (view.kind) {
    case "researching":
      return {
        view,
        label: input.copy.researching,
        notice: null,
        statusToken,
      };
    case "generating":
      return {
        view,
        label: input.copy.generating,
        notice: null,
        statusToken,
      };
    case "evidence_free_generating":
      return {
        view,
        label: input.copy.generating,
        notice: input.copy.usingAvailableInformation,
        statusToken,
      };
    case "failed":
      return {
        view,
        label: input.failedLabel,
        notice: null,
        statusToken,
      };
    default:
      return {
        view,
        label: input.existingLabel,
        notice: null,
        statusToken,
      };
  }
}

const PROSPECT_GENERATE_HELD_KINDS = new Set<ProspectProgressKind>([
  "researching",
  "generating",
  "evidence_free_generating",
]);

/** Generate/Refresh stays quiet while the initial-research view is still active. */
export function prospectGenerateHeldForInitialResearch(
  kind: ProspectProgressKind | null | undefined,
): boolean {
  return kind != null && PROSPECT_GENERATE_HELD_KINDS.has(kind);
}

/**
 * Localized label for the held Generate action.
 * Uses the existing progress copy. It is never a failure message.
 */
export function describeProspectGenerateHold(input: {
  kind: ProspectProgressKind | null | undefined;
  copy?: Pick<ProspectInitialResearchCopy, "researching" | "generating"> | null;
}): {
  held: boolean;
  kind: ProspectProgressKind | null;
  label: string;
  impliesError: false;
} {
  const kind = input.kind ?? null;
  if (!prospectGenerateHeldForInitialResearch(kind)) {
    return { held: false, kind, label: "", impliesError: false };
  }
  const label =
    kind === "researching"
      ? input.copy?.researching?.trim() || "Researching website"
      : input.copy?.generating?.trim() || "Generating Intelligence";
  return { held: true, kind, label, impliesError: false };
}

export function prospectProgressIsLive(kind: ProspectProgressKind): boolean {
  return (
    kind === "researching" ||
    kind === "generating" ||
    kind === "evidence_free_generating"
  );
}

export function shouldRefreshProspectProgress(kind: ProspectProgressKind): boolean {
  return (
    kind === "generating" ||
    kind === "evidence_free_generating" ||
    kind === "ready" ||
    kind === "failed"
  );
}

export function shouldReadProspectGeneration(input: {
  discussionId: string | null;
  research: InitialResearchStatusPayload;
  currentKind: ProspectProgressKind;
}): boolean {
  if (!input.discussionId) return false;
  if (
    input.currentKind === "generating" ||
    input.currentKind === "evidence_free_generating"
  ) {
    return true;
  }
  return (
    input.research.status === "awaiting_follow_on" ||
    input.research.status === "failed" ||
    input.research.status === "completed" ||
    Boolean(input.research.followOnJobId) ||
    input.research.researchFailed
  );
}

export type IdentityObservationState = {
  brainStatus: string;
  research: InitialResearchStatusPayload;
};

export function reduceIdentityObservation(input: {
  previous: IdentityObservationState;
  brainStatus: string | null;
  research: InitialResearchStatusPayload | null;
}): IdentityObservationState {
  if (!input.research) return input.previous;
  const next = {
    brainStatus: input.brainStatus?.trim() || input.previous.brainStatus,
    research: input.research,
  };
  return reconcileResearchSnapshot(input.previous, next);
}

export type ProspectObservationState = {
  research: InitialResearchStatusPayload;
  generation: GenerationObservation | null;
};

export function reduceProspectObservation(input: {
  previous: ProspectObservationState;
  research: InitialResearchStatusPayload | null;
  generation: GenerationObservation | null;
  generationRead: boolean;
}): ProspectObservationState {
  if (!input.research) return input.previous;
  const next = {
    research: input.research,
    generation: input.generationRead
      ? input.generation
      : input.previous.generation,
  };
  return reconcileResearchSnapshot(input.previous, next);
}
