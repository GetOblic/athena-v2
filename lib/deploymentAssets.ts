import type { DeploymentAsset } from "@/components/deployment/DeploymentAssets";
import type { AthenaReview } from "@/services/reviewService";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";
import type { Opportunity } from "@/services/opportunityService";
import {
  PERSONA_ANALYSIS_ASSET_KEYS,
  PERSONA_ANALYSIS_ASSET_META,
  PERSONA_DEPLOYMENT_ASSET_KEYS,
  PERSONA_DEPLOYMENT_ASSET_META,
} from "@/services/ai/prompts/personaDeploymentAssetsConstraints";
import {
  PROSPECT_DEPLOYMENT_ASSET_KEYS,
  PROSPECT_DEPLOYMENT_ASSET_META,
} from "@/services/ai/prompts/prospectDeploymentAssetsConstraints";
import { canonicalDeploymentAssetType } from "@/services/assetInteractions/assetInteractionKeys";
import {
  getPersonaPublishableDeploymentCatalogKeys,
  splitPersonaIntelligenceSuggestedCta,
} from "@/lib/personaIntelligenceAssetCatalog";

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
    // Deduplicate by canonical asset identity, not body text, so two
    // different assets with identical content both remain visible.
    const key = (asset.assetKey ?? asset.title).trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

const DISCUSSION_LABELS: Record<string, { title: string; objective: string }> = {
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
  NEWSLETTER_IDEA: {
    title: "Newsletter Idea",
    objective:
      "Concept for the Athena client's audience newsletter — not prospect outreach.",
  },
  BLOG_POST_IDEA: {
    title: "Blog Post Idea",
    objective:
      "Concept for the Athena client's audience blog — not a full article or prospect outreach.",
  },
  SHORT_VIDEO_PROMPT: {
    title: "Short Video Prompt",
    objective:
      "Paste-ready AI video generation prompt (~8s, cinematic, social-friendly).",
  },
  VISUAL_MESSAGE_PROMPT: {
    title: "Visual Message Prompt",
    objective:
      "Paste-ready single-image AI generation prompt — one message, one emotion.",
  },
};

const LABELS: Record<string, { title: string; objective: string }> = {
  ...DISCUSSION_LABELS,
  // Persona Analysis meta first; Prospect meta wins for shared alias labels
  // (e.g. OBJECTION_HANDLING → Objection Anticipation on Prospect paths).
  // Persona Analysis UI uses PERSONA_ANALYSIS_ASSET_META via dedicated builders.
  ...PERSONA_DEPLOYMENT_ASSET_META,
  ...PROSPECT_DEPLOYMENT_ASSET_META,
};

/**
 * Normalize human/model heading variants into canonical LABEL: keys
 * before labeled parsing.
 */
export function canonicalizeDeploymentAssetHeadings(text: string): string {
  return text
    .replace(
      /(^|\n)\s*KNOWLEDGE[\s_-]*BASE[\s_-]*ENHANCEMENT\s*:/gi,
      "$1KNOWLEDGE_BASE_ENHANCEMENT:",
    )
    .replace(/(^|\n)\s*HIDDEN[\s_-]*GEMS\s*:/gi, "$1HIDDEN_GEMS:")
    // Longer Substack / Skool variants before shorter POST forms.
    .replace(/(^|\n)\s*SUBSTACK[\s_-]*NOTE\s*:/gi, "$1SUBSTACK_NOTE:")
    .replace(/(^|\n)\s*SUBSTACK[\s_-]*POST\s*:/gi, "$1SUBSTACK_POST:")
    .replace(/(^|\n)\s*REDDIT[\s_-]*POST\s*:/gi, "$1REDDIT_POST:")
    .replace(
      /(^|\n)\s*SKOOL[\s_-]*COURSE[\s_-]*IDEA\s*:/gi,
      "$1SKOOL_COURSE_IDEA:",
    )
    .replace(/(^|\n)\s*SKOOL[\s_-]*POST\s*:/gi, "$1SKOOL_POST:")
    .replace(
      /(^|\n)\s*SOCIAL[\s_-]*VOICE[\s_-]*POST\s*:/gi,
      "$1SOCIAL_VOICE_POST:",
    )
    .replace(
      /(^|\n)\s*SHORT[\s_-]*VIDEO[\s_-]*PROMPT\s*:/gi,
      "$1SHORT_VIDEO_PROMPT:",
    )
    .replace(
      /(^|\n)\s*VISUAL[\s_-]*MESSAGE[\s_-]*PROMPT\s*:/gi,
      "$1VISUAL_MESSAGE_PROMPT:",
    )
    .replace(
      /(^|\n)\s*LOCAL[\s_-]*OUTREACH[\s_-]*IMAGE[\s_-]*PROMPT\s*:/gi,
      "$1LOCAL_OUTREACH_IMAGE_PROMPT:",
    );
}

// Longer labels first so FOLLOW_UP_EMAIL / FOLLOW_UP_SEQUENCE win over FOLLOW_UP.
const LABELED_ASSET_PATTERN = new RegExp(
  `(?:^|\\n)(${[
    ...PROSPECT_DEPLOYMENT_ASSET_KEYS,
    ...PERSONA_DEPLOYMENT_ASSET_KEYS,
    "COMMUNITY_REPLY",
    "PRIVATE_MESSAGE",
    "SOCIAL_POST",
    "CALL_TO_ACTION",
    "NEWSLETTER_IDEA",
    "BLOG_POST_IDEA",
    "SHORT_VIDEO_PROMPT",
    "VISUAL_MESSAGE_PROMPT",
    "LOCAL_OUTREACH_IMAGE_PROMPT",
    "FOLLOW_UP",
  ].join("|")}):\\s*`,
  "g",
);

function parseLabeledAssets(value?: string | null): DeploymentAsset[] {
  if (!isNonEmpty(value)) {
    return [];
  }

  const normalized = canonicalizeDeploymentAssetHeadings(value);
  const matches = [...normalized.matchAll(LABELED_ASSET_PATTERN)];

  if (matches.length === 0) {
    return [];
  }

  const assets: DeploymentAsset[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const label = match[1];
    const start = (match.index ?? 0) + match[0].length;
    const next = matches[index + 1];
    const end = next?.index ?? normalized.length;
    const content = normalized.slice(start, end).trim();

    if (!content) {
      continue;
    }

    const meta = LABELS[label] ?? {
      title: label.replace(/_/g, " "),
      objective: "Generated deployment asset.",
    };

    assets.push({
      assetKey: canonicalDeploymentAssetType(label),
      title: meta.title,
      objective: meta.objective,
      content,
    });
  }

  return assets;
}

/** Public parse helper for tests. */
export function parseLabeledDeploymentAssets(
  value?: string | null,
): DeploymentAsset[] {
  return parseLabeledAssets(value);
}

const PERSONA_ANALYSIS_ASSET_KEY_SET = new Set<string>(
  PERSONA_ANALYSIS_ASSET_KEYS,
);

function personaAnalysisInteractionKey(label: string): string {
  // Keep Analysis OBJECTION_HANDLING distinct from Prospect OBJECTION_ANTICIPATION.
  if (label === "OBJECTION_HANDLING") {
    return "objection_handling";
  }
  return label.toLowerCase();
}

function extractOrderedLabeledAssets(
  text: string,
  orderedKeys: readonly string[],
  metaForKey: (
    key: string,
  ) => { title: string; objective: string } | undefined,
  assetKeyForLabel: (label: string) => string,
): DeploymentAsset[] {
  if (!text.trim() || orderedKeys.length === 0) {
    return [];
  }

  const keySet = new Set(orderedKeys);
  const headingPattern = new RegExp(
    `(?:^|\\n)(${[...orderedKeys].sort((a, b) => b.length - a.length).join("|")}):[ \\t]*`,
    "g",
  );
  const matches = [...text.matchAll(headingPattern)];
  const byKey = new Map<string, string>();

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const label = match[1];
    if (!keySet.has(label) || byKey.has(label)) continue;
    const start = (match.index ?? 0) + match[0].length;
    const next = matches[index + 1];
    const end = next?.index ?? text.length;
    const content = text.slice(start, end).trim();
    if (!content) continue;
    byKey.set(label, content);
  }

  const assets: DeploymentAsset[] = [];
  for (const key of orderedKeys) {
    const content = byKey.get(key);
    if (!content) continue;
    const meta = metaForKey(key) ?? {
      title: key.replace(/_/g, " "),
      objective: "Generated deployment asset.",
    };
    assets.push({
      assetKey: assetKeyForLabel(key),
      title: meta.title,
      objective: meta.objective,
      content,
    });
  }

  return dedupeAssets(assets);
}

/**
 * Build Persona publish-ready Deployment Assets from a combined or legacy CTA.
 * Uses exact catalog membership — never classifies Analysis keys as Deployment.
 */
export function buildPersonaPublishableDeploymentAssets(
  suggestedCta?: string | null,
): DeploymentAsset[] {
  const split = splitPersonaIntelligenceSuggestedCta(suggestedCta);
  const ordered = getPersonaPublishableDeploymentCatalogKeys().filter(
    (key) => !PERSONA_ANALYSIS_ASSET_KEY_SET.has(key),
  );
  return extractOrderedLabeledAssets(
    split.deploymentCta,
    ordered,
    (key) =>
      PROSPECT_DEPLOYMENT_ASSET_META[
        key as keyof typeof PROSPECT_DEPLOYMENT_ASSET_META
      ],
    (label) => canonicalDeploymentAssetType(label),
  );
}

/**
 * Build Persona Analysis Assets from a combined V15 CTA or legacy Analysis-only CTA.
 * Uses exact Analysis key membership — OBJECTION_HANDLING stays Analysis.
 */
export function buildPersonaAnalysisAssets(
  suggestedCta?: string | null,
): DeploymentAsset[] {
  const split = splitPersonaIntelligenceSuggestedCta(suggestedCta);
  return extractOrderedLabeledAssets(
    split.analysisCta,
    PERSONA_ANALYSIS_ASSET_KEYS,
    (key) =>
      PERSONA_ANALYSIS_ASSET_META[
        key as keyof typeof PERSONA_ANALYSIS_ASSET_META
      ],
    personaAnalysisInteractionKey,
  );
}

export function buildDiscussionDeploymentAssets(
  analysis: DiscussionAnalysis | null,
  options?: {
    platform?: string | null;
    prospectMode?: boolean;
    personaMode?: boolean;
  },
): DeploymentAsset[] {
  if (!analysis) {
    return [];
  }

  const isProspect =
    options?.prospectMode === true ||
    options?.platform === "prospect_intelligence";
  const isPersona =
    options?.personaMode === true ||
    options?.platform === "persona_intelligence";

  // Persona mode: Deployment Assets = publish-ready Prospect catalog only.
  // Analysis Assets are exposed separately via buildPersonaAnalysisAssets.
  if (isPersona) {
    return buildPersonaPublishableDeploymentAssets(analysis.suggested_cta);
  }

  const structuredAssets = parseLabeledAssets(analysis.suggested_cta);
  if (structuredAssets.length > 0) {
    return dedupeAssets(structuredAssets);
  }

  // Prospect / Persona Intelligence must never collapse malformed output into Primary Reply.
  if (isProspect || isPersona) {
    return [];
  }

  const assets: DeploymentAsset[] = [];

  if (isNonEmpty(analysis.suggested_cta)) {
    assets.push({
      assetKey: "primary_reply",
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
        assetKey: "community_reply",
        title: "Community Reply",
        objective: "Public community response ready to post.",
        content: latestReview.recommended_response,
      });
    }
  }

  if (latestReview && isNonEmpty(latestReview.cta)) {
    assets.push({
      assetKey: "call_to_action",
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
        assetKey: "call_to_action",
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
      assetKey: "community_reply",
      title: "Community Reply",
      objective: "Public community response ready to post.",
      content: review.recommended_response,
    });
  }

  if (isNonEmpty(review.cta)) {
    assets.push({
      assetKey: "call_to_action",
      title: "Call to Action",
      objective: "Exact CTA for the next engagement step.",
      content: review.cta,
    });
  }

  return normalizeSingleAsset(dedupeAssets(assets));
}
