import { isApprovedStatus } from "@/lib/briefingStatus";
import { normalizeOpportunityStatus } from "@/lib/opportunityStatus";
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

export function buildDiscussionWorkflowSteps(input: {
  analysis: DiscussionAnalysis | null;
  opportunity: Opportunity | null;
  briefing: AthenaReview | null;
  assetBlueprint: AthenaAssetBlueprint | null;
}): DiscussionWorkflowStep[] {
  const hasAnalysis = Boolean(input.analysis);
  const hasOpportunity = Boolean(input.opportunity);
  const hasBriefing = Boolean(input.briefing);
  const hasAssets = Boolean(input.assetBlueprint);
  const briefingApproved = isApprovedStatus(input.briefing?.status);
  const salesStatus = normalizeOpportunityStatus(input.opportunity?.status);
  const hasOutcome =
    briefingApproved ||
    salesStatus === "won" ||
    salesStatus === "lost";

  const steps: Omit<DiscussionWorkflowStep, "current">[] = [
    { key: "analysis", label: "Analysis", complete: hasAnalysis },
    { key: "opportunity", label: "Opportunity", complete: hasOpportunity },
    { key: "briefing", label: "Briefing", complete: hasBriefing },
    { key: "assets", label: "Assets", complete: hasAssets },
    {
      key: "outcome",
      label: hasOutcome ? "Published" : "Outcome",
      complete: hasOutcome,
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
