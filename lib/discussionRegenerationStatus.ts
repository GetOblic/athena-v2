export type RegenerationStatusSnapshot = {
  latestAnalysisId: string | null;
  latestAnalysisCreatedAt: string | null;
  latestAnalysisUpdatedAt: string | null;
  blueprintUpdatedAt: string | null;
  regenerationInFlight: boolean;
  jobId?: string | null;
  jobStatus?: string | null;
  jobTriggerType?: string | null;
  jobStage?: string | null;
};

export type RegenerationStatusResponse = {
  success?: boolean;
  discussionId?: string;
  regenerationInFlight?: boolean;
  latestAnalysisId?: string | null;
  latestAnalysisCreatedAt?: string | null;
  latestAnalysisUpdatedAt?: string | null;
  blueprintUpdatedAt?: string | null;
  jobId?: string | null;
  jobStatus?: string | null;
  jobTriggerType?: string | null;
  jobStage?: string | null;
  error?: string;
};

/** Initial poll cadence while a durable job is active. */
export const REGENERATION_POLL_INTERVAL_MS = 2_500;
/** Back off after the job has been running for a while. */
export const REGENERATION_POLL_INTERVAL_BACKOFF_MS = 7_500;
export const REGENERATION_POLL_BACKOFF_AFTER_MS = 60_000;
/**
 * Soft client ceiling. Does not mark the job complete or idle —
 * polling continues at a restrained cadence while the durable job is active.
 */
export const REGENERATION_POLL_SAFETY_CEILING_MS = 15 * 60 * 1000;
/** @deprecated Prefer REGENERATION_POLL_SAFETY_CEILING_MS — timeout must not hide active jobs. */
export const REGENERATION_POLL_TIMEOUT_MS = REGENERATION_POLL_SAFETY_CEILING_MS;
export const REGENERATION_SUCCESS_BUTTON_MS = 5_000;
export const REGENERATION_LONG_RUNNING_MS = 60_000;

export const REGENERATION_STILL_RUNNING_NOTICE =
  "Generation is still running in the background. Refresh this page to check its latest status.";

export const REGENERATION_FAILED_PRESERVE_NOTICE =
  "Latest regeneration failed. Your previous Executive Version remains available.";

const ACTIVE_JOB_STATUSES = new Set([
  "queued",
  "processing",
  "retryable",
  "claimed",
]);

export function emptyRegenerationSnapshot(): RegenerationStatusSnapshot {
  return {
    latestAnalysisId: null,
    latestAnalysisCreatedAt: null,
    latestAnalysisUpdatedAt: null,
    blueprintUpdatedAt: null,
    regenerationInFlight: false,
  };
}

export function isActiveRegenerationJobStatus(
  jobStatus: string | null | undefined,
): boolean {
  if (!jobStatus) return false;
  return ACTIVE_JOB_STATUSES.has(String(jobStatus).trim().toLowerCase());
}

export function isTerminalFailedRegeneration(
  current: Pick<
    RegenerationStatusSnapshot,
    "regenerationInFlight" | "jobStatus"
  >,
): boolean {
  if (current.regenerationInFlight) return false;
  return String(current.jobStatus ?? "").trim().toLowerCase() === "failed";
}

export function nextRegenerationPollIntervalMs(input: {
  elapsedMs: number;
  documentHidden?: boolean;
  pastSafetyCeiling?: boolean;
}): number {
  if (input.documentHidden || input.pastSafetyCeiling) {
    return 10_000;
  }
  if (input.elapsedMs >= REGENERATION_POLL_BACKOFF_AFTER_MS) {
    return REGENERATION_POLL_INTERVAL_BACKOFF_MS;
  }
  return REGENERATION_POLL_INTERVAL_MS;
}

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

  if (isActiveRegenerationJobStatus(current.jobStatus)) {
    return false;
  }

  if (isTerminalFailedRegeneration(current)) {
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

  // Durable completion is detected via pipeline fingerprints above.
  // Do not treat a stale completed job as success without fingerprint change.
  return false;
}

export async function fetchRegenerationStatus(
  discussionId: string,
): Promise<RegenerationStatusSnapshot | null> {
  try {
    const response = await fetch(`/api/discussions/${discussionId}/status`, {
      cache: "no-store",
    });

    if (response.status === 401 || response.status === 403) {
      return {
        ...emptyRegenerationSnapshot(),
        regenerationInFlight: false,
        jobStatus: "auth_lost",
      };
    }

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
      jobId: data.jobId ?? null,
      jobStatus: data.jobStatus ?? null,
      jobTriggerType: data.jobTriggerType ?? null,
      jobStage: data.jobStage ?? null,
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

    // Keep session while a long durable job may still be active.
    // Resume path also re-checks regenerationInFlight from the status API.
    if (Date.now() - parsed.startedAtMs > REGENERATION_POLL_SAFETY_CEILING_MS) {
      // Retain baseline for resume messaging; still return so UI can continue.
      return parsed;
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
