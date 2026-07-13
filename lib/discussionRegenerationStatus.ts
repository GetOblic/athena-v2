import {
  advanceCoalescedRefreshContinuity,
  createContinuityTrackState,
  REGENERATION_CHAIN_POLL_TIMEOUT_MS,
  type ContinuityTrackState,
} from "@/lib/generationContinuity";

export type RegenerationStatusSnapshot = {
  latestAnalysisId: string | null;
  latestAnalysisCreatedAt: string | null;
  latestAnalysisUpdatedAt: string | null;
  blueprintUpdatedAt: string | null;
  regenerationInFlight: boolean;
  pendingGenerationFollowUp?: boolean;
  jobId?: string | null;
  jobStatus?: string | null;
  jobTriggerType?: string | null;
  jobStage?: string | null;
  latestJobId?: string | null;
  latestJobStatus?: string | null;
  latestJobErrorCode?: string | null;
  latestJobErrorMessage?: string | null;
  currentVersionId?: string | null;
  publishedVersionId?: string | null;
};

export type RegenerationStatusResponse = {
  success?: boolean;
  discussionId?: string;
  regenerationInFlight?: boolean;
  pendingGenerationFollowUp?: boolean;
  latestAnalysisId?: string | null;
  latestAnalysisCreatedAt?: string | null;
  latestAnalysisUpdatedAt?: string | null;
  blueprintUpdatedAt?: string | null;
  jobId?: string | null;
  jobStatus?: string | null;
  jobTriggerType?: string | null;
  jobStage?: string | null;
  latestJobId?: string | null;
  latestJobStatus?: string | null;
  latestJobErrorCode?: string | null;
  latestJobErrorMessage?: string | null;
  currentVersionId?: string | null;
  publishedVersionId?: string | null;
  error?: string;
};

export const REGENERATION_POLL_INTERVAL_MS = 5_000;
export const REGENERATION_POLL_TIMEOUT_MS = 150_000;
export const REGENERATION_SUCCESS_BUTTON_MS = 5_000;
export const REGENERATION_LONG_RUNNING_MS = 60_000;

export function emptyRegenerationSnapshot(): RegenerationStatusSnapshot {
  return {
    latestAnalysisId: null,
    latestAnalysisCreatedAt: null,
    latestAnalysisUpdatedAt: null,
    blueprintUpdatedAt: null,
    regenerationInFlight: false,
    pendingGenerationFollowUp: false,
  };
}

/**
 * Legacy completion for non-coalesced regenerations (Discussion Analyze,
 * direct Refresh with a new job). Unchanged semantics.
 */
export function isFullPipelineRegenerationComplete(
  baseline: Pick<
    RegenerationStatusSnapshot,
    | "latestAnalysisUpdatedAt"
    | "blueprintUpdatedAt"
  >,
  current: RegenerationStatusSnapshot,
  queuedAtMs: number,
): boolean {
  if (current.regenerationInFlight) {
    return false;
  }

  if (current.pendingGenerationFollowUp) {
    return false;
  }

  const queueFloorMs = queuedAtMs - 15_000;

  if (
    current.blueprintUpdatedAt &&
    current.blueprintUpdatedAt !== baseline.blueprintUpdatedAt
  ) {
    const updatedMs = Date.parse(current.blueprintUpdatedAt);
    const baselineMs = Date.parse(baseline.blueprintUpdatedAt ?? "");
    if (
      !Number.isNaN(updatedMs) &&
      updatedMs >= queueFloorMs &&
      updatedMs > (Number.isNaN(baselineMs) ? 0 : baselineMs)
    ) {
      return true;
    }
  }

  if (
    current.latestAnalysisUpdatedAt &&
    current.latestAnalysisUpdatedAt !== baseline.latestAnalysisUpdatedAt
  ) {
    const updatedMs = Date.parse(current.latestAnalysisUpdatedAt);
    const baselineMs = Date.parse(baseline.latestAnalysisUpdatedAt ?? "");
    if (
      !Number.isNaN(updatedMs) &&
      updatedMs >= queueFloorMs &&
      updatedMs > (Number.isNaN(baselineMs) ? 0 : baselineMs) &&
      !baseline.blueprintUpdatedAt &&
      !current.blueprintUpdatedAt
    ) {
      return true;
    }
  }

  return false;
}

export type TrackQueuedGenerationOptions = {
  followUpRequested?: boolean;
  parentJobId?: string | null;
  jobId?: string | null;
  baselineCurrentVersionId?: string | null;
};

export async function fetchRegenerationStatus(
  discussionId: string,
): Promise<RegenerationStatusSnapshot | null> {
  try {
    const response = await fetch(`/api/discussions/${discussionId}/status`, {
      cache: "no-store",
    });
    const data = (await response.json()) as RegenerationStatusResponse;

    if (!response.ok || !data.success) {
      return null;
    }

    return {
      latestAnalysisId: data.latestAnalysisId ?? null,
      latestAnalysisCreatedAt: data.latestAnalysisCreatedAt ?? null,
      latestAnalysisUpdatedAt: data.latestAnalysisUpdatedAt ?? null,
      blueprintUpdatedAt: data.blueprintUpdatedAt ?? null,
      regenerationInFlight: Boolean(data.regenerationInFlight),
      pendingGenerationFollowUp: Boolean(data.pendingGenerationFollowUp),
      jobId: data.jobId ?? null,
      jobStatus: data.jobStatus ?? null,
      jobTriggerType: data.jobTriggerType ?? null,
      jobStage: data.jobStage ?? null,
      latestJobId: data.latestJobId ?? null,
      latestJobStatus: data.latestJobStatus ?? null,
      latestJobErrorCode: data.latestJobErrorCode ?? null,
      latestJobErrorMessage: data.latestJobErrorMessage ?? null,
      currentVersionId: data.currentVersionId ?? null,
      publishedVersionId: data.publishedVersionId ?? null,
    };
  } catch {
    return null;
  }
}

export type PersistedRegenerationSession = {
  discussionId: string;
  startedAtMs: number;
  baseline: Pick<
    RegenerationStatusSnapshot,
    | "latestAnalysisUpdatedAt"
    | "blueprintUpdatedAt"
  >;
  continuity?: ContinuityTrackState | null;
};

function sessionStorageKey(discussionId: string): string {
  return `athena-regeneration:${discussionId}`;
}

export function readRegenerationSession(
  discussionId: string,
): PersistedRegenerationSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(sessionStorageKey(discussionId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PersistedRegenerationSession;
    if (parsed.discussionId !== discussionId || !parsed.startedAtMs) {
      return null;
    }

    if (
      !parsed.baseline ||
      !Object.prototype.hasOwnProperty.call(
        parsed.baseline,
        "latestAnalysisUpdatedAt",
      )
    ) {
      window.sessionStorage.removeItem(sessionStorageKey(discussionId));
      return null;
    }

    const awaitingFollowUp = Boolean(parsed.continuity?.awaitingFollowUp);
    const timeoutMs = awaitingFollowUp
      ? REGENERATION_CHAIN_POLL_TIMEOUT_MS
      : REGENERATION_POLL_TIMEOUT_MS;

    if (Date.now() - parsed.startedAtMs > timeoutMs) {
      window.sessionStorage.removeItem(sessionStorageKey(discussionId));
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writeRegenerationSession(
  session: PersistedRegenerationSession,
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    sessionStorageKey(session.discussionId),
    JSON.stringify(session),
  );
}

export function clearRegenerationSession(discussionId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(sessionStorageKey(discussionId));
}

export function buildContinuityFromTrackOptions(
  options?: TrackQueuedGenerationOptions,
): ContinuityTrackState | null {
  if (!options?.followUpRequested) {
    return null;
  }

  return createContinuityTrackState({
    awaitingFollowUp: true,
    parentJobId: options.parentJobId ?? options.jobId ?? null,
    baselineCurrentVersionId: options.baselineCurrentVersionId ?? null,
  });
}

export function evaluateRegenerationPoll(input: {
  baseline: Pick<
    RegenerationStatusSnapshot,
    "latestAnalysisUpdatedAt" | "blueprintUpdatedAt"
  >;
  current: RegenerationStatusSnapshot;
  queuedAtMs: number;
  continuity: ContinuityTrackState | null;
}): {
  decision: "continue" | "complete" | "fail" | "timeout";
  continuity: ContinuityTrackState | null;
  error?: string;
  note?: string;
} {
  const awaitingFollowUp = Boolean(input.continuity?.awaitingFollowUp);
  const timeoutMs = awaitingFollowUp
    ? REGENERATION_CHAIN_POLL_TIMEOUT_MS
    : REGENERATION_POLL_TIMEOUT_MS;

  if (Date.now() - input.queuedAtMs >= timeoutMs) {
    return {
      decision: "timeout",
      continuity: input.continuity,
      note: "poll_timeout",
    };
  }

  if (input.continuity?.awaitingFollowUp) {
    const advanced = advanceCoalescedRefreshContinuity(input.continuity, {
      regenerationInFlight: input.current.regenerationInFlight,
      pendingGenerationFollowUp: Boolean(
        input.current.pendingGenerationFollowUp,
      ),
      jobId: input.current.jobId ?? null,
      jobStatus: input.current.jobStatus ?? null,
      latestJobId: input.current.latestJobId ?? null,
      latestJobStatus: input.current.latestJobStatus ?? null,
      latestJobErrorCode: input.current.latestJobErrorCode ?? null,
      latestJobErrorMessage: input.current.latestJobErrorMessage ?? null,
      currentVersionId: input.current.currentVersionId ?? null,
    });

    if (advanced.action === "continue") {
      return {
        decision: "continue",
        continuity: advanced.state,
        note: advanced.note,
      };
    }

    if (advanced.action === "fail") {
      return {
        decision: "fail",
        continuity: advanced.state,
        error: advanced.error,
        note: advanced.note,
      };
    }

    // complete — require a Current Version to be query-visible
    if (!input.current.currentVersionId) {
      return {
        decision: "continue",
        continuity: advanced.state,
        note: "awaiting_current_version",
      };
    }

    return {
      decision: "complete",
      continuity: advanced.state,
      note: advanced.note,
    };
  }

  if (
    isFullPipelineRegenerationComplete(
      input.baseline,
      input.current,
      input.queuedAtMs,
    )
  ) {
    return {
      decision: "complete",
      continuity: null,
      note: "legacy_complete",
    };
  }

  return { decision: "continue", continuity: input.continuity };
}
