/**
 * Pure helpers for coalesced Refresh → durable follow-up continuity.
 * Keeps one user Refresh as one logical regeneration in the client.
 */

import type { AthenaGenerationTriggerType } from "@/services/generationJobs/generationJobTypes";

export const FOLLOW_UP_TRIGGER_RAW_KEY =
  "pending_generation_follow_up_trigger";

export const REGENERATION_CHAIN_POLL_TIMEOUT_MS = 600_000;
/** Polls to wait for follow-up materialization after parent goes idle. */
export const FOLLOW_UP_HANDOFF_MAX_POLLS = 6;

const TRIGGER_PRIORITY: Record<AthenaGenerationTriggerType, number> = {
  manual_refresh: 3,
  discussion_update: 2,
  discussion_import: 1,
};

export function preferFollowUpTrigger(
  existing: AthenaGenerationTriggerType | null | undefined,
  incoming: AthenaGenerationTriggerType | null | undefined,
): AthenaGenerationTriggerType | null {
  if (!incoming && !existing) return null;
  if (!incoming) return existing ?? null;
  if (!existing) return incoming;
  return TRIGGER_PRIORITY[incoming] >= TRIGGER_PRIORITY[existing]
    ? incoming
    : existing;
}

export function parseFollowUpTrigger(
  value: unknown,
): AthenaGenerationTriggerType | null {
  if (
    value === "manual_refresh" ||
    value === "discussion_update" ||
    value === "discussion_import"
  ) {
    return value;
  }
  return null;
}

export type ContinuityTrackPhase = "parent" | "handoff" | "followup" | "done";

export type ContinuityTrackState = {
  awaitingFollowUp: boolean;
  parentJobId: string | null;
  trackedJobId: string | null;
  phase: ContinuityTrackPhase;
  handoffPolls: number;
  /** Baseline Current Version id when Refresh began (for visibility checks). */
  baselineCurrentVersionId: string | null;
};

export type ContinuityStatusView = {
  regenerationInFlight: boolean;
  pendingGenerationFollowUp: boolean;
  jobId: string | null;
  jobStatus: string | null;
  /** Latest job for the discussion (active or terminal). */
  latestJobId?: string | null;
  latestJobStatus?: string | null;
  latestJobErrorCode?: string | null;
  latestJobErrorMessage?: string | null;
  currentVersionId?: string | null;
};

export type ContinuityDecision =
  | { action: "continue"; state: ContinuityTrackState; note?: string }
  | {
      action: "complete";
      state: ContinuityTrackState;
      note?: string;
    }
  | {
      action: "fail";
      state: ContinuityTrackState;
      error: string;
      note?: string;
    };

export function createContinuityTrackState(input: {
  awaitingFollowUp: boolean;
  parentJobId: string | null;
  baselineCurrentVersionId?: string | null;
}): ContinuityTrackState {
  return {
    awaitingFollowUp: input.awaitingFollowUp,
    parentJobId: input.parentJobId,
    trackedJobId: input.parentJobId,
    phase: input.awaitingFollowUp ? "parent" : "done",
    handoffPolls: 0,
    baselineCurrentVersionId: input.baselineCurrentVersionId ?? null,
  };
}

/**
 * Advance coalesced Refresh tracking.
 * Non-coalesced callers should not use this path.
 */
export function advanceCoalescedRefreshContinuity(
  state: ContinuityTrackState,
  status: ContinuityStatusView,
): ContinuityDecision {
  if (!state.awaitingFollowUp) {
    return { action: "complete", state: { ...state, phase: "done" } };
  }

  const next: ContinuityTrackState = { ...state };
  const activeId = status.jobId;
  const latestStatus = status.latestJobStatus ?? status.jobStatus;
  const latestId = status.latestJobId ?? status.jobId;

  // Detect follow-up materialization (new active job id ≠ parent).
  if (
    activeId &&
    next.parentJobId &&
    activeId !== next.parentJobId &&
    next.phase !== "followup"
  ) {
    next.trackedJobId = activeId;
    next.phase = "followup";
    next.handoffPolls = 0;
    return {
      action: "continue",
      state: next,
      note: "follow_up_materialized",
    };
  }

  if (activeId) {
    next.trackedJobId = activeId;
    if (activeId === next.parentJobId) {
      next.phase = "parent";
    }
    return { action: "continue", state: next };
  }

  // No active job.
  if (status.pendingGenerationFollowUp) {
    next.phase = next.phase === "followup" ? "followup" : "handoff";
    return {
      action: "continue",
      state: next,
      note: "awaiting_follow_up_flag",
    };
  }

  // Terminal failure only after follow-up is the tracked job (not parent completion).
  if (
    latestStatus === "failed" &&
    latestId &&
    next.phase === "followup" &&
    (latestId === next.trackedJobId || latestId !== next.parentJobId)
  ) {
    const message =
      status.latestJobErrorMessage?.trim() ||
      status.latestJobErrorCode?.trim() ||
      "Generation failed.";
    return {
      action: "fail",
      state: { ...next, phase: "done" },
      error: message,
      note: "terminal_failure",
    };
  }

  if (next.phase === "parent") {
    next.phase = "handoff";
    next.handoffPolls = 1;
    return {
      action: "continue",
      state: next,
      note: "parent_terminal_handoff",
    };
  }

  if (next.phase === "handoff") {
    next.handoffPolls += 1;
    if (next.handoffPolls <= FOLLOW_UP_HANDOFF_MAX_POLLS) {
      return {
        action: "continue",
        state: next,
        note: "handoff_wait",
      };
    }
    // Flag cleared and no follow-up appeared — chain ended without a second job.
    if (latestStatus === "failed") {
      const message =
        status.latestJobErrorMessage?.trim() ||
        status.latestJobErrorCode?.trim() ||
        "Generation failed.";
      return {
        action: "fail",
        state: { ...next, phase: "done" },
        error: message,
        note: "handoff_exhausted_failure",
      };
    }
    return {
      action: "complete",
      state: { ...next, phase: "done" },
      note: "handoff_exhausted_complete",
    };
  }

  // followup phase, idle, flag clear → logical Refresh complete
  return {
    action: "complete",
    state: { ...next, phase: "done" },
    note: "follow_up_terminal",
  };
}

/**
 * Whether Current Version visibility is acceptable after a logical Refresh.
 * In-place patches keep the same version id — that still counts as visible.
 */
export function isCurrentVersionVisibleAfterRefresh(input: {
  baselineCurrentVersionId: string | null;
  currentVersionId: string | null;
}): boolean {
  if (!input.currentVersionId) {
    return false;
  }
  // New Current or patched same Current both OK once query returns a Current.
  return true;
}
