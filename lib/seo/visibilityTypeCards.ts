import type { SeoGenerationType } from "@/services/seo/seoGenerationType";
import type { VisibilityLandingReport } from "@/lib/seo/visibilityLandingState";

export type VisibilityTypeCardState = {
  generationType: SeoGenerationType;
  latest: VisibilityLandingReport | null;
  lastReady: VisibilityLandingReport | null;
};

/**
 * Per-type landing card state from the newest-first report list.
 * Latest and last Ready are independent for each analysis type.
 */
export function deriveVisibilityTypeCardState(
  reports: VisibilityLandingReport[],
  generationType: SeoGenerationType,
): VisibilityTypeCardState {
  const ofType = reports.filter(
    (report) => report.generationType === generationType,
  );
  const latest = ofType[0] ?? null;
  const lastReady = ofType.find((report) => report.status === "Ready") ?? null;

  return {
    generationType,
    latest,
    lastReady,
  };
}

export function scoreSourceForTypeCard(
  state: VisibilityTypeCardState,
): "current" | "lastReady" | "previousReady" | null {
  if (!state.lastReady) return null;
  if (!state.latest || state.latest.id === state.lastReady.id) {
    return state.latest?.status === "Ready" ? "current" : "lastReady";
  }
  if (state.latest.status === "Processing Failed") return "previousReady";
  return "lastReady";
}
