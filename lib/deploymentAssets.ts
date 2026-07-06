import type { DeploymentAsset } from "@/components/deployment/DeploymentAssets";
import type { AthenaReview } from "@/services/reviewService";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";
import type { Opportunity } from "@/services/opportunityService";

function isNonEmpty(value?: string | null): value is string {
  return Boolean(value?.trim());
}

function normalizeSingleAsset(assets: DeploymentAsset[]): DeploymentAsset[] {
  if (assets.length === 1) {
    return [{ ...assets[0], title: "Primary Reply" }];
  }
  return assets;
}

function dedupeAssets(assets: DeploymentAsset[]): DeploymentAsset[] {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    const key = asset.content.trim();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function buildDiscussionDeploymentAssets(
  analysis: DiscussionAnalysis | null,
): DeploymentAsset[] {
  if (!analysis) {
    return [];
  }

  const assets: DeploymentAsset[] = [];

  if (isNonEmpty(analysis.suggested_cta)) {
    assets.push({
      title: "Call to Action",
      objective: "Soft CTA ready to paste into community engagement.",
      content: analysis.suggested_cta,
    });
  }

  return normalizeSingleAsset(assets);
}

export function buildOpportunityDeploymentAssets(
  opportunity: Opportunity,
  latestReview: AthenaReview | null,
): DeploymentAsset[] {
  const assets: DeploymentAsset[] = [];

  if (latestReview && isNonEmpty(latestReview.recommended_response)) {
    assets.push({
      title: "Community Reply",
      objective: "Public community response ready to post.",
      content: latestReview.recommended_response,
    });
  }

  if (latestReview && isNonEmpty(latestReview.cta)) {
    assets.push({
      title: "CTA",
      objective: "Call to action from the executive briefing.",
      content: latestReview.cta,
    });
  }

  if (isNonEmpty(opportunity.suggested_cta)) {
    assets.push({
      title: "CTA",
      objective: "Suggested call to action from opportunity analysis.",
      content: opportunity.suggested_cta,
    });
  }

  return normalizeSingleAsset(dedupeAssets(assets));
}

export function buildBriefingDeploymentAssets(
  review: AthenaReview,
): DeploymentAsset[] {
  const assets: DeploymentAsset[] = [];

  if (isNonEmpty(review.recommended_response)) {
    assets.push({
      title: "Community Reply",
      objective: "Public community response ready to post.",
      content: review.recommended_response,
    });
  }

  if (isNonEmpty(review.cta)) {
    assets.push({
      title: "CTA",
      objective: "Call to action for the next engagement step.",
      content: review.cta,
    });
  }

  return normalizeSingleAsset(assets);
}
