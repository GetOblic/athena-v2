/** Non-production Breakthrough evaluation harness constants. */

export const HARNESS_VERSION = "breakthrough-eval-harness-v1";

export const DOCTRINE_FILENAME = "breakthrough_doctrine.v1.txt";

/** Delimiter between Standard assembly and Breakthrough doctrine append. */
export const DOCTRINE_APPEND_DELIMITER = "\n\n=== ATHENA BREAKTHROUGH DOCTRINE ===\n\n";

export const PILOT_DEPLOYMENT_ASSET_KEYS = [
  "PERSONALIZED_OUTREACH_EMAIL",
  "LINKEDIN_CONNECTION",
  "PERSONALIZED_VALUE_PROPOSITION",
  "OBJECTION_ANTICIPATION",
  "NEWSLETTER_IDEA",
  "SOCIAL_VOICE_POST",
  "SHORT_VIDEO_PROMPT",
  "HIDDEN_GEMS",
] as const;

export const PILOT_STRATEGIC_ASSET_KEYS = [
  "image_prompt",
  "social_prompt",
] as const;

export const PILOT_ASSET_KEYS = [
  ...PILOT_DEPLOYMENT_ASSET_KEYS,
  ...PILOT_STRATEGIC_ASSET_KEYS,
] as const;

export type PilotAssetKey = (typeof PILOT_ASSET_KEYS)[number];

export const PILOT_ASSET_META: Record<
  PilotAssetKey,
  { displayName: string; stage: "deployment_assets" | "strategic_blueprint" }
> = {
  PERSONALIZED_OUTREACH_EMAIL: {
    displayName: "Personalized Outreach Email",
    stage: "deployment_assets",
  },
  LINKEDIN_CONNECTION: {
    displayName: "LinkedIn Connection Message",
    stage: "deployment_assets",
  },
  PERSONALIZED_VALUE_PROPOSITION: {
    displayName: "Personalized Value Proposition",
    stage: "deployment_assets",
  },
  OBJECTION_ANTICIPATION: {
    displayName: "Objection Anticipation",
    stage: "deployment_assets",
  },
  NEWSLETTER_IDEA: {
    displayName: "Newsletter Idea",
    stage: "deployment_assets",
  },
  SOCIAL_VOICE_POST: {
    displayName: "Social Voice Post",
    stage: "deployment_assets",
  },
  SHORT_VIDEO_PROMPT: {
    displayName: "Short Video Prompt",
    stage: "deployment_assets",
  },
  HIDDEN_GEMS: {
    displayName: "Hidden Gems",
    stage: "deployment_assets",
  },
  image_prompt: {
    displayName: "Image Prompt",
    stage: "strategic_blueprint",
  },
  social_prompt: {
    displayName: "Social Prompt",
    stage: "strategic_blueprint",
  },
};

export const EXPECTED_FIXTURE_SLOTS = [
  "P1",
  "P2",
  "P3",
  "P4",
  "P5",
  "P6",
  "P7",
  "P8",
] as const;
