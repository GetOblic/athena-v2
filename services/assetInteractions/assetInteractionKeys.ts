/**
 * Canonical asset keys for copy Done traceability.
 * Never use UI labels or full content as database keys.
 */

export const LIVE_EXECUTIVE_VERSION_SENTINEL =
  "00000000-0000-0000-0000-000000000000";

export type AssetInteractionSourceType = "discussion" | "prospect";

export const DEPLOYMENT_ASSET_TYPE_BY_LABEL: Record<string, string> = {
  COMMUNITY_REPLY: "community_reply",
  PRIVATE_MESSAGE: "private_message",
  SOCIAL_POST: "social_post",
  FOLLOW_UP: "follow_up",
  CALL_TO_ACTION: "call_to_action",
  NEWSLETTER_IDEA: "newsletter_idea",
  BLOG_POST_IDEA: "blog_post_idea",
  PERSONALIZED_OUTREACH_EMAIL: "email_outreach",
  COLD_EMAIL: "email_outreach",
  FOLLOW_UP_EMAIL: "follow_up_email",
  LINKEDIN_CONNECTION: "linkedin_connection",
  LINKEDIN_FOLLOW_UP: "linkedin_follow_up",
  COLD_CALL_OPENING: "cold_call_opening",
  DISCOVERY_QUESTIONS: "discovery_questions",
  PERSONALIZED_VALUE_PROPOSITION: "personalized_value_proposition",
  OBJECTION_ANTICIPATION: "objection_anticipation",
  OBJECTION_HANDLING: "objection_anticipation",
  MEETING_PREPARATION: "meeting_preparation",
  RECOMMENDED_CTA: "recommended_cta",
  FOLLOW_UP_SEQUENCE: "follow_up_sequence",
  PERSONALIZED_VIDEO_SCRIPT: "personalized_video_script",
  WHATSAPP_OUTREACH: "whatsapp_outreach",
  PRIMARY_REPLY: "primary_reply",
};

export const BLUEPRINT_ASSET_TYPES = {
  image_prompt: "blueprint_image_prompt",
  pdf_prompt: "blueprint_pdf_prompt",
  social_prompt: "blueprint_social_prompt",
  notes: "blueprint_notes",
} as const;

const SUPPORTED_ASSET_INTERACTION_TYPES = new Set<string>([
  ...Object.values(DEPLOYMENT_ASSET_TYPE_BY_LABEL),
  ...Object.values(BLUEPRINT_ASSET_TYPES),
]);

export function isSupportedAssetInteractionType(assetType: string): boolean {
  const key = assetType.trim().toLowerCase();
  return Boolean(key) && SUPPORTED_ASSET_INTERACTION_TYPES.has(key);
}

export function canonicalDeploymentAssetType(label: string): string {
  const upper = label.trim().toUpperCase();
  return (
    DEPLOYMENT_ASSET_TYPE_BY_LABEL[upper] ??
    upper.toLowerCase().replace(/\s+/g, "_")
  );
}

export function resolveExecutiveVersionScopeId(
  executiveVersionId?: string | null,
): string {
  const trimmed = String(executiveVersionId ?? "").trim();
  return trimmed || LIVE_EXECUTIVE_VERSION_SENTINEL;
}
