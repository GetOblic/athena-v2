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
  KNOWLEDGE_BASE_ENHANCEMENT: "knowledge_base_enhancement",
  HIDDEN_GEMS: "hidden_gems",
  SUBSTACK_POST: "substack_post",
  SUBSTACK_NOTE: "substack_note",
  REDDIT_POST: "reddit_post",
  SKOOL_POST: "skool_post",
  SKOOL_COURSE_IDEA: "skool_course_idea",
  SOCIAL_VOICE_POST: "social_voice_post",
  SHORT_VIDEO_PROMPT: "short_video_prompt",
  VISUAL_MESSAGE_PROMPT: "visual_message_prompt",
  LOCAL_OUTREACH_IMAGE_PROMPT: "local_outreach_image_prompt",
  PRIMARY_REPLY: "primary_reply",
  // Persona Analysis Assets (OBJECTION_HANDLING intentionally distinct below).
  PERSONA_EXECUTIVE_PROFILE: "persona_executive_profile",
  MESSAGING_FRAMEWORK: "messaging_framework",
  VALUE_PROPOSITION: "value_proposition",
  LANGUAGE_AND_TONE_GUIDE: "language_and_tone_guide",
  OFFER_POSITIONING: "offer_positioning",
  CHANNEL_STRATEGY: "channel_strategy",
  CAMPAIGN_CONCEPTS: "campaign_concepts",
  CONTENT_THEMES: "content_themes",
  ADVERTISEMENT_CONCEPTS: "advertisement_concepts",
  LANDING_PAGE_DIRECTION: "landing_page_direction",
  VISUAL_AND_IMAGE_PROMPT_DIRECTION: "visual_and_image_prompt_direction",
  CUSTOMER_EXPERIENCE_GUIDANCE: "customer_experience_guidance",
  VALIDATION_AND_LEARNING_PLAN: "validation_and_learning_plan",
};

/**
 * Persona Analysis OBJECTION_HANDLING must not share Prospect's
 * objection_anticipation interaction key. Applied only when callers pass this
 * explicit analysis key (see buildPersonaAnalysisAssets).
 */
export const PERSONA_ANALYSIS_OBJECTION_HANDLING_ASSET_TYPE =
  "objection_handling" as const;

export const BLUEPRINT_ASSET_TYPES = {
  image_prompt: "blueprint_image_prompt",
  pdf_prompt: "blueprint_pdf_prompt",
  social_prompt: "blueprint_social_prompt",
  trend_social_prompt: "blueprint_trend_social_prompt",
  notes: "blueprint_notes",
} as const;

const SUPPORTED_ASSET_INTERACTION_TYPES = new Set<string>([
  ...Object.values(DEPLOYMENT_ASSET_TYPE_BY_LABEL),
  ...Object.values(BLUEPRINT_ASSET_TYPES),
  PERSONA_ANALYSIS_OBJECTION_HANDLING_ASSET_TYPE,
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
