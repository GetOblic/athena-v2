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

const LABELS: Record<string, { title: string; objective: string }> = {
  COMMUNITY_REPLY: {
    title: "Community Reply",
    objective: "Public reply ready to post directly in the discussion.",
  },
  PRIVATE_MESSAGE: {
    title: "Private Message",
    objective: "Direct message version for moving the conversation privately.",
  },
  SOCIAL_POST: {
    title: "Social Media Post",
    objective: "Standalone post inspired by this opportunity.",
  },
  FOLLOW_UP: {
    title: "Follow-up Reply",
    objective: "Short reply to use if the prospect responds positively.",
  },
  CALL_TO_ACTION: {
    title: "Call to Action",
    objective: "Exact CTA sentence ready to paste.",
  },
};

function parseLabeledAssets(value?: string | null): DeploymentAsset[] {
  if (!isNonEmpty(value)) {
    return [];
  }

  const matches = [...value.matchAll(/(?:^|\n)(COMMUNITY_REPLY|PRIVATE_MESSAGE|SOCIAL_POST|FOLLOW_UP|CALL_TO_ACTION):\s*/g)];

  if (matches.length === 0) {
    return [];
  }

  return matches
    .map((match, index) => {
      const label = match[1];
      const start = (match.index ?? 0) + match[0].length;
      const next = matches[index + 1];
      const end = next?.index ?? value.length;
      const content = value.slice(start, end).trim();

      if (!content) {
        return null;
      }

      const meta = LABELS[label];

      return {
        title: meta.title,
        objective: meta.objective,
        content,
      };
    })
    .filter((asset): asset is DeploymentAsset => Boolean(asset));
}

export function buildDiscussionDeploymentAssets(
  analysis: DiscussionAnalysis | null,
): DeploymentAsset[] {
  if (!analysis) {
    return [];
  }

  const structuredAssets = parseLabeledAssets(analysis.suggested_cta);
  if (structuredAssets.length > 0) {
    return dedupeAssets(structuredAssets);
  }

  const assets: DeploymentAsset[] = [];

  if (isNonEmpty(analysis.suggested_cta)) {
    assets.push({
      title: "Primary Reply",
      objective: "Copy-ready response generated from Athena's analysis.",
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
    const structuredAssets = parseLabeledAssets(latestReview.recommended_response);

    if (structuredAssets.length > 0) {
      assets.push(...structuredAssets);
    } else {
      assets.push({
        title: "Community Reply",
        objective: "Public community response ready to post.",
        content: latestReview.recommended_response,
      });
    }
  }

  if (latestReview && isNonEmpty(latestReview.cta)) {
    assets.push({
      title: "Call to Action",
      objective: "Exact CTA from the executive briefing.",
      content: latestReview.cta,
    });
  }

  if (isNonEmpty(opportunity.suggested_cta)) {
    const structuredAssets = parseLabeledAssets(opportunity.suggested_cta);

    if (structuredAssets.length > 0) {
      assets.push(...structuredAssets);
    } else {
      assets.push({
        title: "Call to Action",
        objective: "Suggested call to action from opportunity analysis.",
        content: opportunity.suggested_cta,
      });
    }
  }

  return normalizeSingleAsset(dedupeAssets(assets));
}

export function buildBriefingDeploymentAssets(
  review: AthenaReview,
): DeploymentAsset[] {
  const assets: DeploymentAsset[] = [];

  const structuredAssets = parseLabeledAssets(review.recommended_response);
  if (structuredAssets.length > 0) {
    assets.push(...structuredAssets);
  } else if (isNonEmpty(review.recommended_response)) {
    assets.push({
      title: "Community Reply",
      objective: "Public community response ready to post.",
      content: review.recommended_response,
    });
  }

  if (isNonEmpty(review.cta)) {
    assets.push({
      title: "Call to Action",
      objective: "Exact CTA for the next engagement step.",
      content: review.cta,
    });
  }

  return normalizeSingleAsset(dedupeAssets(assets));
}
