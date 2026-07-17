import type { AthenaAssetBlueprint } from "@/services/assetBlueprints/assetBlueprintService";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";
import type { Opportunity } from "@/services/opportunityService";
import type { AthenaReview } from "@/services/reviewService";

/** Pipeline tag for future analytics — not a UI concept. */
export const EXECUTIVE_INTELLIGENCE_PIPELINE_VERSION =
  "executive_intelligence_v1";

/** Routing profile label shown in executive version metadata. */
export const EXECUTIVE_ROUTING_PROFILE_PREMIUM_V2 = "Premium V2";

/** Explicit Think Differently marker persisted on the version intelligence snapshot. */
export type ExecutiveVersionGenerationMode = "think_differently";

/**
 * Complete immutable executive intelligence captured at publish time.
 * Structured for future side-by-side comparison, diffs, and analytics.
 */
export type ExecutiveIntelligencePayload = {
  analysis: DiscussionAnalysis;
  opportunity: Opportunity | null;
  briefing: AthenaReview | null;
  blueprint: AthenaAssetBlueprint | null;
  /**
   * Present only for Think Differently publications.
   * Absent / undefined means Standard Generate Intelligence.
   * Persisted inside the existing intelligence JSONB snapshot (no migration).
   */
  generationMode?: ExecutiveVersionGenerationMode;
};

export type ExecutiveVersionReasoningEffort = Record<string, string>;

export type ExecutiveIntelligenceVersion = {
  id: string;
  discussion_id: string;
  organization_id: string;
  user_id: string | null;
  version_number: number;
  is_current: boolean;
  generated_at: string;
  generation_duration_ms: number | null;
  models_used: string | null;
  routing_profile: string | null;
  reasoning_profile: string | null;
  reasoning_effort: ExecutiveVersionReasoningEffort | null;
  pipeline_version: string;
  regeneration_run_id: string | null;
  analysis_id: string | null;
  opportunity_id: string | null;
  review_id: string | null;
  blueprint_id: string | null;
  intelligence: ExecutiveIntelligencePayload;
  created_at: string;
};

/** Lightweight list row for the Executive Versions panel. */
export type ExecutiveVersionSummary = {
  id: string;
  version_number: number;
  is_current: boolean;
  generated_at: string;
  models_used: string | null;
  routing_profile: string | null;
  generation_duration_ms: number | null;
};

/** True when the version was published through Think Differently. */
export function isThinkDifferentlyExecutiveVersion(
  version: Pick<ExecutiveIntelligenceVersion, "intelligence">,
): boolean {
  return version.intelligence?.generationMode === "think_differently";
}
