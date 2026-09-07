import type { SeoGenerationType } from "@/services/seo/seoGenerationType";

export type VisibilityLandingReport = {
  id: string;
  name: string;
  status: string;
  generationType: SeoGenerationType;
  summary: string | null;
  createdAt: string;
};

export type VisibilityLandingState = {
  latest: VisibilityLandingReport | null;
  lastReady: VisibilityLandingReport | null;
  lastReadyStrategy: VisibilityLandingReport | null;
  lastReadyHealth: VisibilityLandingReport | null;
};

function isReady(report: VisibilityLandingReport): boolean {
  return report.status === "Ready";
}

/**
 * Derives landing spotlight rows from the newest-first report list only.
 * Does not infer technical availability or load Website Intelligence.
 */
export function deriveVisibilityLandingState(
  reports: VisibilityLandingReport[],
): VisibilityLandingState {
  const latest = reports[0] ?? null;
  const lastReady = reports.find(isReady) ?? null;
  const lastReadyStrategy =
    reports.find(
      (report) => isReady(report) && report.generationType === "intelligence",
    ) ?? null;
  const lastReadyHealth =
    reports.find(
      (report) => isReady(report) && report.generationType === "technical",
    ) ?? null;

  return {
    latest,
    lastReady,
    lastReadyStrategy,
    lastReadyHealth,
  };
}

export function otherReadyLens(
  latest: VisibilityLandingReport | null,
  state: VisibilityLandingState,
): VisibilityLandingReport | null {
  if (!latest || latest.status !== "Ready") return null;
  if (latest.generationType === "intelligence") {
    return state.lastReadyHealth && state.lastReadyHealth.id !== latest.id
      ? state.lastReadyHealth
      : null;
  }
  return state.lastReadyStrategy && state.lastReadyStrategy.id !== latest.id
    ? state.lastReadyStrategy
    : null;
}

export function olderReadyThanLatest(
  latest: VisibilityLandingReport | null,
  lastReady: VisibilityLandingReport | null,
): VisibilityLandingReport | null {
  if (!latest || !lastReady) return null;
  if (lastReady.id === latest.id) return null;
  return lastReady;
}
