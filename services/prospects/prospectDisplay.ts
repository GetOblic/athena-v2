/**
 * Pure Prospect status + Opportunity Score display resolution.
 * Prefer durable job + Current Version over contradictory manual state.
 */

import {
  getAthenaVerdict,
  type AthenaVerdict,
} from "@/lib/discussionExecutiveIntel";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";
import {
  PROSPECT_DISPLAY_STATUSES,
  type ProspectDisplayStatus,
} from "@/services/prospects/prospectStatus";

export type { ProspectDisplayStatus };

export function resolveProspectDisplayStatus(input: {
  prospectStatus?: string | null;
  jobStatus?: string | null;
  jobStage?: string | null;
  hasCurrentVersion?: boolean;
}): ProspectDisplayStatus {
  const job = input.jobStatus?.toLowerCase() ?? null;
  const stage = (input.jobStage ?? "").toLowerCase();

  if (job === "failed") return "Processing Failed";
  if (job === "queued") return "Queued";
  if (job === "retryable") return "Processing";
  if (job === "processing") {
    if (stage.includes("website") || stage.includes("scrape")) {
      return "Learning from Website";
    }
    if (stage.includes("prepar")) return "Processing";
    return "Generating Executive Intelligence";
  }

  // No active job — failed refresh must not appear Ready merely because an
  // older Current Version still exists.
  const current = String(input.prospectStatus ?? "").trim();
  if (
    current === "Processing Failed" ||
    /fail/i.test(current)
  ) {
    return "Processing Failed";
  }

  // No active job — prefer Ready when a Current Version exists.
  if (input.hasCurrentVersion) {
    return "Ready";
  }

  if ((PROSPECT_DISPLAY_STATUSES as readonly string[]).includes(current)) {
    return current as ProspectDisplayStatus;
  }

  if (/ready/i.test(current)) return "Ready";
  if (/learn|scrape|website/i.test(current)) return "Learning from Website";
  if (/generat|analyz/i.test(current)) {
    return "Generating Executive Intelligence";
  }
  if (/process/i.test(current)) return "Processing";
  return "Queued";
}

/**
 * Resolve Opportunity Score for display.
 * Prefer canonical opportunity score; never invent zero for missing data.
 */
export function resolveProspectOpportunityScore(input: {
  /** Score from opportunities / version snapshot when available. */
  canonicalScore?: number | null;
  /** Optional denormalized Prospect column. */
  denormalizedScore?: number | null;
}): number | null {
  const candidates = [input.canonicalScore, input.denormalizedScore];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.max(0, Math.min(100, Math.round(value)));
    }
  }
  return null;
}

export function formatProspectOpportunityScore(
  score: number | null | undefined,
): string {
  if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) {
    return "—";
  }
  return String(Math.round(score));
}

/**
 * Pair Opportunity Score with the existing Athena executive recommendation
 * when analysis is available. Does not invent new scoring thresholds.
 */
export function resolveProspectOpportunityRecommendation(
  analysis: DiscussionAnalysis | null | undefined,
): AthenaVerdict | null {
  if (!analysis) return null;
  return getAthenaVerdict(analysis);
}

export function formatProspectOpportunityScoreWithRecommendation(input: {
  score: number | null | undefined;
  recommendation?: AthenaVerdict | null;
}): { scoreLabel: string; recommendation: AthenaVerdict | null } {
  return {
    scoreLabel: formatProspectOpportunityScore(input.score),
    recommendation: input.recommendation ?? null,
  };
}
