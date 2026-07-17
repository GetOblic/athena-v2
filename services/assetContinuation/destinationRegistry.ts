/**
 * Central Continue destinations for Deployment Assets and Strategic Blueprints.
 * Navigational only — no prompt injection, no OpenRouter changes.
 */

export type AiWorkspaceId =
  | "chatgpt"
  | "gemini"
  | "claude"
  | "mistral"
  | "grok"
  | "perplexity";

export type ImageGeneratorId =
  | "chatgpt"
  | "gemini"
  | "midjourney"
  | "flux"
  | "imagen";

export type PlatformDestinationId =
  | "substack"
  | "reddit"
  | "skool"
  | "skool_course"
  | "gmail"
  | "linkedin"
  | "whatsapp";

export type DestinationId = AiWorkspaceId | ImageGeneratorId | PlatformDestinationId;

export type DestinationDefinition = {
  id: DestinationId;
  label: string;
  url: string;
};

export const AI_WORKSPACE_OPTIONS: Array<{
  id: AiWorkspaceId;
  label: string;
}> = [
  { id: "chatgpt", label: "ChatGPT" },
  { id: "gemini", label: "Gemini" },
  { id: "claude", label: "Claude" },
  { id: "mistral", label: "Mistral" },
  { id: "grok", label: "Grok" },
  { id: "perplexity", label: "Perplexity" },
];

export const IMAGE_GENERATOR_OPTIONS: Array<{
  id: ImageGeneratorId;
  label: string;
}> = [
  { id: "chatgpt", label: "ChatGPT" },
  { id: "gemini", label: "Gemini" },
  { id: "midjourney", label: "Midjourney" },
  { id: "flux", label: "Flux" },
  { id: "imagen", label: "Imagen" },
];

export const DEFAULT_AI_WORKSPACE: AiWorkspaceId = "chatgpt";
export const DEFAULT_IMAGE_GENERATOR: ImageGeneratorId = "chatgpt";

const DESTINATION_URLS: Record<DestinationId, string> = {
  chatgpt: "https://chatgpt.com/",
  gemini: "https://gemini.google.com/app",
  claude: "https://claude.ai/new",
  mistral: "https://chat.mistral.ai/",
  grok: "https://grok.com/",
  perplexity: "https://www.perplexity.ai/",
  midjourney: "https://www.midjourney.com/app",
  flux: "https://flux.ai/",
  imagen: "https://aistudio.google.com/",
  substack: "https://substack.com/home",
  reddit: "https://www.reddit.com/submit",
  skool: "https://www.skool.com/",
  skool_course: "https://www.skool.com/",
  gmail: "https://mail.google.com/mail/u/0/#inbox?compose=new",
  linkedin: "https://www.linkedin.com/messaging/",
  whatsapp: "https://web.whatsapp.com/",
};

const PLATFORM_ASSET_DESTINATIONS: Record<string, PlatformDestinationId> = {
  substack_note: "substack",
  substack_post: "substack",
  reddit_post: "reddit",
  skool_post: "skool",
  skool_course_idea: "skool_course",
  personalized_outreach_email: "gmail",
  follow_up_email: "gmail",
  linkedin_connection: "linkedin",
  linkedin_follow_up: "linkedin",
  whatsapp_outreach: "whatsapp",
};

const IMAGE_GENERATOR_ASSET_TYPES = new Set<string>([
  "blueprint_image_prompt",
  "visual_message_prompt",
  "local_outreach_image_prompt",
  "short_video_prompt",
]);

export type AiWorkspacePreferences = {
  preferredAiWorkspace: AiWorkspaceId;
  preferredImageGenerator: ImageGeneratorId;
};

export const DEFAULT_AI_WORKSPACE_PREFERENCES: AiWorkspacePreferences = {
  preferredAiWorkspace: DEFAULT_AI_WORKSPACE,
  preferredImageGenerator: DEFAULT_IMAGE_GENERATOR,
};

export function isAiWorkspaceId(value: unknown): value is AiWorkspaceId {
  return (
    typeof value === "string" &&
    AI_WORKSPACE_OPTIONS.some((option) => option.id === value)
  );
}

export function isImageGeneratorId(value: unknown): value is ImageGeneratorId {
  return (
    typeof value === "string" &&
    IMAGE_GENERATOR_OPTIONS.some((option) => option.id === value)
  );
}

export function normalizeAiWorkspacePreferences(
  value: unknown,
): AiWorkspacePreferences {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_AI_WORKSPACE_PREFERENCES };
  }
  const record = value as Record<string, unknown>;
  return {
    preferredAiWorkspace: isAiWorkspaceId(record.preferredAiWorkspace)
      ? record.preferredAiWorkspace
      : isAiWorkspaceId(record.preferred_ai_workspace)
        ? record.preferred_ai_workspace
        : DEFAULT_AI_WORKSPACE,
    preferredImageGenerator: isImageGeneratorId(record.preferredImageGenerator)
      ? record.preferredImageGenerator
      : isImageGeneratorId(record.preferred_image_generator)
        ? record.preferred_image_generator
        : DEFAULT_IMAGE_GENERATOR,
  };
}

export function getDestinationDefinition(
  id: DestinationId,
): DestinationDefinition {
  const fromWorkspace = AI_WORKSPACE_OPTIONS.find((option) => option.id === id);
  const fromImage = IMAGE_GENERATOR_OPTIONS.find((option) => option.id === id);
  const platformLabels: Record<PlatformDestinationId, string> = {
    substack: "Substack",
    reddit: "Reddit",
    skool: "Skool",
    skool_course: "Skool",
    gmail: "Gmail",
    linkedin: "LinkedIn",
    whatsapp: "WhatsApp",
  };

  const label =
    fromWorkspace?.label ??
    fromImage?.label ??
    (id in platformLabels
      ? platformLabels[id as PlatformDestinationId]
      : id);

  return {
    id,
    label,
    url: DESTINATION_URLS[id],
  };
}

export type ResolvedContinuationDestination = {
  destinationId: DestinationId;
  label: string;
  url: string;
  kind: "ai_workspace" | "image_generator" | "platform";
};

/**
 * Resolve Continue destination for an asset type using org preferences.
 */
export function resolveAssetContinuationDestination(input: {
  assetType: string | null | undefined;
  preferences?: AiWorkspacePreferences | null;
}): ResolvedContinuationDestination {
  const prefs = normalizeAiWorkspacePreferences(input.preferences);
  const assetType = (input.assetType ?? "").trim().toLowerCase();

  const platformId = PLATFORM_ASSET_DESTINATIONS[assetType];
  if (platformId) {
    const destination = getDestinationDefinition(platformId);
    return {
      destinationId: destination.id,
      label: destination.label,
      url: destination.url,
      kind: "platform",
    };
  }

  if (IMAGE_GENERATOR_ASSET_TYPES.has(assetType)) {
    const destination = getDestinationDefinition(prefs.preferredImageGenerator);
    return {
      destinationId: destination.id,
      label: destination.label,
      url: destination.url,
      kind: "image_generator",
    };
  }

  const destination = getDestinationDefinition(prefs.preferredAiWorkspace);
  return {
    destinationId: destination.id,
    label: destination.label,
    url: destination.url,
    kind: "ai_workspace",
  };
}
