import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";
import type { AthenaAssetBlueprint } from "@/services/assetBlueprints/assetBlueprintService";
import type { Opportunity } from "@/services/opportunityService";
import type { AthenaReview } from "@/services/reviewService";

export type DiscussionWorkflowStepKey =
  | "analysis"
  | "opportunity"
  | "briefing"
  | "assets"
  | "outcome";

export type DiscussionWorkflowStep = {
  key: DiscussionWorkflowStepKey;
  label: string;
  complete: boolean;
  current: boolean;
};

/**
 * Build Workflow Progress milestones.
 * The final node displays the client-controlled status label
 * (Discussion status or Prospect lifecycle_status) — never intelligence readiness.
 */
export function buildDiscussionWorkflowSteps(input: {
  analysis: DiscussionAnalysis | null;
  opportunity: Opportunity | null;
  briefing: AthenaReview | null;
  assetBlueprint: AthenaAssetBlueprint | null;
  /** Client-facing status for the final node (Discussion status or Prospect lifecycle). */
  clientStatusLabel: string;
}): DiscussionWorkflowStep[] {
  const hasAnalysis = Boolean(input.analysis);
  const hasOpportunity = Boolean(input.opportunity);
  const hasBriefing = Boolean(input.briefing);
  const hasAssets = Boolean(input.assetBlueprint);
  const statusLabel = String(input.clientStatusLabel ?? "").trim() || "New";

  const steps: Omit<DiscussionWorkflowStep, "current">[] = [
    { key: "analysis", label: "Analysis", complete: hasAnalysis },
    { key: "opportunity", label: "Opportunity", complete: hasOpportunity },
    { key: "briefing", label: "Briefing", complete: hasBriefing },
    { key: "assets", label: "Assets", complete: hasAssets },
    {
      key: "outcome",
      // Informational status node — not a completion milestone.
      label: `Current Status: ${statusLabel}`,
      complete: false,
    },
  ];

  const firstIncompleteIndex = steps.findIndex((step) => !step.complete);

  return steps.map((step, index) => ({
    ...step,
    current:
      firstIncompleteIndex === -1
        ? index === steps.length - 1
        : index === firstIncompleteIndex,
  }));
}
