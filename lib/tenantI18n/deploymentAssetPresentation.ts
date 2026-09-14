/**
 * Phase 1A presentation-only Deployment Asset TYPE labels.
 *
 * Localizes the UI TYPE label only.
 * Does not translate structural KEY headings.
 * Does not rewrite generated titles or bodies.
 * Does not read Account Language inside workers or composers.
 */
import { en } from "./messages/en";
import type { TenantMessages } from "./types";

const SAFE_LABEL_FALLBACK = "—";

type DeploymentAssetTypeKey = keyof TenantMessages["deploymentAssetTypes"];
type JourneyAssetTitleKey = keyof TenantMessages["personas"]["journey"];

type TypeSource =
  | { bundle: "deploymentAssetTypes"; key: DeploymentAssetTypeKey }
  | { bundle: "journey"; key: JourneyAssetTitleKey };

const ASSET_TYPE_SOURCES = {
  community_reply: { bundle: "deploymentAssetTypes", key: "communityReply" },
  private_message: { bundle: "deploymentAssetTypes", key: "privateMessage" },
  social_post: { bundle: "deploymentAssetTypes", key: "socialPost" },
  follow_up: { bundle: "deploymentAssetTypes", key: "followUp" },
  call_to_action: { bundle: "deploymentAssetTypes", key: "callToAction" },
  newsletter_idea: { bundle: "deploymentAssetTypes", key: "newsletterIdea" },
  blog_post_idea: { bundle: "deploymentAssetTypes", key: "blogPostIdea" },
  short_video_prompt: { bundle: "deploymentAssetTypes", key: "shortVideoPrompt" },
  visual_message_prompt: {
    bundle: "deploymentAssetTypes",
    key: "visualMessagePrompt",
  },
  primary_reply: { bundle: "deploymentAssetTypes", key: "primaryReply" },
  email_outreach: {
    bundle: "deploymentAssetTypes",
    key: "personalizedOutreachEmail",
  },
  follow_up_email: { bundle: "deploymentAssetTypes", key: "followUpEmail" },
  linkedin_connection: {
    bundle: "deploymentAssetTypes",
    key: "linkedinConnection",
  },
  linkedin_follow_up: { bundle: "deploymentAssetTypes", key: "linkedinFollowUp" },
  cold_call_opening: { bundle: "deploymentAssetTypes", key: "coldCallOpening" },
  discovery_questions: {
    bundle: "deploymentAssetTypes",
    key: "discoveryQuestions",
  },
  personalized_value_proposition: {
    bundle: "deploymentAssetTypes",
    key: "personalizedValueProposition",
  },
  objection_anticipation: {
    bundle: "deploymentAssetTypes",
    key: "objectionAnticipation",
  },
  meeting_preparation: {
    bundle: "deploymentAssetTypes",
    key: "meetingPreparation",
  },
  recommended_cta: { bundle: "deploymentAssetTypes", key: "recommendedCta" },
  follow_up_sequence: {
    bundle: "deploymentAssetTypes",
    key: "followUpSequence",
  },
  personalized_video_script: {
    bundle: "deploymentAssetTypes",
    key: "personalizedVideoScript",
  },
  whatsapp_outreach: { bundle: "deploymentAssetTypes", key: "whatsappOutreach" },
  knowledge_base_enhancement: {
    bundle: "deploymentAssetTypes",
    key: "knowledgeBaseEnhancement",
  },
  hidden_gems: { bundle: "deploymentAssetTypes", key: "hiddenGems" },
  substack_post: { bundle: "deploymentAssetTypes", key: "substackPost" },
  substack_note: { bundle: "deploymentAssetTypes", key: "substackNote" },
  reddit_post: { bundle: "deploymentAssetTypes", key: "redditPost" },
  skool_post: { bundle: "deploymentAssetTypes", key: "skoolPost" },
  skool_course_idea: { bundle: "deploymentAssetTypes", key: "skoolCourseIdea" },
  social_voice_post: { bundle: "deploymentAssetTypes", key: "socialVoicePost" },
  local_outreach_image_prompt: {
    bundle: "deploymentAssetTypes",
    key: "localOutreachImagePrompt",
  },
  persona_executive_profile: {
    bundle: "journey",
    key: "assetPersonaExecutiveProfile",
  },
  messaging_framework: { bundle: "journey", key: "assetMessagingFramework" },
  value_proposition: { bundle: "journey", key: "assetValueProposition" },
  objection_handling: { bundle: "journey", key: "assetObjectionHandling" },
  language_and_tone_guide: { bundle: "journey", key: "assetLanguageAndTone" },
  offer_positioning: { bundle: "journey", key: "assetOfferPositioning" },
  channel_strategy: { bundle: "journey", key: "assetChannelStrategy" },
  campaign_concepts: { bundle: "journey", key: "assetCampaignConcepts" },
  content_themes: { bundle: "journey", key: "assetContentThemes" },
  advertisement_concepts: {
    bundle: "journey",
    key: "assetAdvertisementConcepts",
  },
  landing_page_direction: {
    bundle: "journey",
    key: "assetLandingPageDirection",
  },
  visual_and_image_prompt_direction: {
    bundle: "journey",
    key: "assetVisualDirection",
  },
  customer_experience_guidance: {
    bundle: "journey",
    key: "assetCustomerExperience",
  },
  validation_and_learning_plan: {
    bundle: "journey",
    key: "assetValidationPlan",
  },
} as const satisfies Record<string, TypeSource>;

export type DeploymentAssetTypeToken = keyof typeof ASSET_TYPE_SOURCES;

function readTypeLabel(
  messages: TenantMessages,
  source: TypeSource,
  fallback: string,
): string {
  const localized =
    source.bundle === "journey"
      ? messages.personas.journey[source.key]
      : messages.deploymentAssetTypes[source.key];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  const english =
    source.bundle === "journey"
      ? en.personas.journey[source.key]
      : en.deploymentAssetTypes[source.key];
  if (typeof english === "string" && english.trim()) {
    return english;
  }
  return fallback || SAFE_LABEL_FALLBACK;
}

/**
 * Presentation-only TYPE label for a canonical Deployment Asset token.
 * Unknown tokens return the supplied fallback (typically the stored English META
 * title or a generated title) so generated titles stay verbatim.
 */
export function getLocalizedDeploymentAssetTypeLabel(
  messages: TenantMessages,
  assetType?: string | null,
  fallback = "",
): string {
  const token = String(assetType ?? "")
    .trim()
    .toLowerCase();
  if (!token) {
    return fallback;
  }
  const source = ASSET_TYPE_SOURCES[token as DeploymentAssetTypeToken];
  if (!source) {
    return fallback;
  }
  return readTypeLabel(messages, source, fallback);
}

/**
 * Presentation-only map of canonical assetType → localized TYPE label.
 * Used by DeploymentAssets chrome. Does not include generated bodies.
 */
export function getDeploymentAssetTypeLabelMap(
  messages: TenantMessages,
): Record<string, string> {
  return Object.fromEntries(
    Object.keys(ASSET_TYPE_SOURCES).map((token) => [
      token,
      getLocalizedDeploymentAssetTypeLabel(messages, token),
    ]),
  );
}

export const DEPLOYMENT_ASSET_TYPE_TOKENS = Object.keys(
  ASSET_TYPE_SOURCES,
) as DeploymentAssetTypeToken[];
