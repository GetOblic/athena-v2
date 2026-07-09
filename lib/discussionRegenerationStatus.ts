export type RegenerationStatusSnapshot = {
  latestAnalysisId: string | null;
  latestAnalysisCreatedAt: string | null;
  blueprintUpdatedAt: string | null;
  regenerationInFlight: boolean;
};

export type RegenerationStatusResponse = {
  success?: boolean;
  discussionId?: string;
  regenerationInFlight?: boolean;
  latestAnalysisId?: string | null;
  latestAnalysisCreatedAt?: string | null;
  blueprintUpdatedAt?: string | null;
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
    blueprintUpdatedAt: null,
    regenerationInFlight: false,
  };
}

export function isRegenerationComplete(
  baseline: Pick<
    RegenerationStatusSnapshot,
    | "latestAnalysisId"
    | "latestAnalysisCreatedAt"
    | "blueprintUpdatedAt"
  >,
  current: Pick<
    RegenerationStatusSnapshot,
    | "latestAnalysisId"
    | "latestAnalysisCreatedAt"
    | "blueprintUpdatedAt"
  >,
  queuedAtMs: number,
): boolean {
  const queueFloorMs = queuedAtMs - 15_000;

  if (
    current.latestAnalysisId &&
    current.latestAnalysisId !== baseline.latestAnalysisId
  ) {
    const createdMs = Date.parse(current.latestAnalysisCreatedAt ?? "");
    if (!Number.isNaN(createdMs) && createdMs >= queueFloorMs) {
      return true;
    }
  }

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

  return false;
}

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
      blueprintUpdatedAt: data.blueprintUpdatedAt ?? null,
      regenerationInFlight: Boolean(data.regenerationInFlight),
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
    | "latestAnalysisId"
    | "latestAnalysisCreatedAt"
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

    if (Date.now() - parsed.startedAtMs > REGENERATION_POLL_TIMEOUT_MS) {
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
