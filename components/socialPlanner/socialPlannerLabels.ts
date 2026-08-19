/**
 * Social Planner presentation labels. Keep mappings here — not in global Athena constants.
 */

import type {
  SocialPlannerAssetType,
  SocialPlannerObjective,
  SocialPlannerPlatform,
} from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import type { SocialCalendarGenerationMode } from "@/services/socialPlanner/socialCalendarTypes";

export const SOCIAL_PLANNER_ASSET_TYPE_LABELS: Record<
  SocialPlannerAssetType,
  string
> = {
  image: "Image",
  photo: "Photo",
  branded_graphic: "Branded Graphic",
  infographic: "Infographic",
  quote_visual: "Quote Visual",
  meme_or_humor: "Meme or Humor",
  testimonial_visual: "Testimonial Visual",
  before_after: "Before & After",
  carousel: "Carousel",
  story_sequence: "Story Sequence",
  storyboard: "Storyboard",
  comparison: "Comparison",
  step_by_step: "Step by Step",
  talking_head_video: "Talking Head Video",
  explainer_video: "Explainer Video",
  scenario_video: "Scenario Video",
  skit_video: "Skit Video",
  pov_video: "POV Video",
  interview_or_qa_video: "Interview or Q&A Video",
  testimonial_video: "Testimonial Video",
  demonstration_video: "Demonstration Video",
  behind_the_scenes_video: "Behind the Scenes Video",
  cinematic_brand_video: "Cinematic Brand Video",
  pdf_guide: "PDF Guide",
  checklist: "Checklist",
  cheat_sheet: "Cheat Sheet",
  mini_report: "Mini Report",
  poll: "Poll",
  question_post: "Question Post",
  challenge: "Challenge",
  quiz: "Quiz",
  myth_vs_fact: "Myth vs. Fact",
};

export const SOCIAL_PLANNER_PLATFORM_LABELS: Record<
  SocialPlannerPlatform,
  string
> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube_shorts: "YouTube Shorts",
  x: "X",
  threads: "Threads",
};

export const SOCIAL_PLANNER_OBJECTIVE_LABELS: Record<
  SocialPlannerObjective,
  string
> = {
  educate: "Educate",
  build_authority: "Build Authority",
  engage: "Engage",
  nurture: "Nurture",
  convert: "Convert",
  promote: "Promote",
  community: "Community",
  entertain: "Entertain",
  trust: "Trust",
  thought_leadership: "Thought Leadership",
};

export const SOCIAL_PLANNER_GENERATION_MODE_LABELS: Record<
  SocialCalendarGenerationMode,
  string
> = {
  standard: "Standard",
  think_differently: "Think Differently",
  conversation_revision: "Conversation Revision",
};

export const SOCIAL_PLANNER_STAGE_LABELS: Record<string, string> = {
  queued: "Preparing your calendar",
  calendar_context: "Reading the week",
  intelligence: "Reviewing your Athena intelligence",
  generation: "Creating your seven assets",
  diversity: "Making sure the week feels original",
  source_divergence: "Making sure this version thinks differently",
  revision_satisfaction: "Applying the requested changes",
  finalizing: "Finalizing your calendar",
};

const SPECIAL_TOKEN_LABELS: Record<string, string> = {
  ...SOCIAL_PLANNER_ASSET_TYPE_LABELS,
  ...SOCIAL_PLANNER_PLATFORM_LABELS,
  ...SOCIAL_PLANNER_OBJECTIVE_LABELS,
  pdf: "PDF",
  pov: "POV",
  qa: "Q&A",
  vs: "vs.",
};

function titleCaseToken(token: string): string {
  const mapped = SPECIAL_TOKEN_LABELS[token];
  if (mapped) return mapped;
  if (token.length <= 3) return token.toUpperCase();
  return token.charAt(0).toUpperCase() + token.slice(1);
}

export function humanizeSocialPlannerToken(value: string): string {
  const exact =
    SOCIAL_PLANNER_ASSET_TYPE_LABELS[value as SocialPlannerAssetType] ??
    SOCIAL_PLANNER_PLATFORM_LABELS[value as SocialPlannerPlatform] ??
    SOCIAL_PLANNER_OBJECTIVE_LABELS[value as SocialPlannerObjective];
  if (exact) return exact;
  return value
    .split("_")
    .filter(Boolean)
    .map((token) => titleCaseToken(token))
    .join(" ");
}

export function socialPlannerAssetTypeLabel(value: string): string {
  return (
    SOCIAL_PLANNER_ASSET_TYPE_LABELS[value as SocialPlannerAssetType] ??
    humanizeSocialPlannerToken(value)
  );
}

export function socialPlannerPlatformLabel(value: string): string {
  return (
    SOCIAL_PLANNER_PLATFORM_LABELS[value as SocialPlannerPlatform] ??
    humanizeSocialPlannerToken(value)
  );
}

export function socialPlannerObjectiveLabel(value: string): string {
  return (
    SOCIAL_PLANNER_OBJECTIVE_LABELS[value as SocialPlannerObjective] ??
    humanizeSocialPlannerToken(value)
  );
}

export function socialPlannerGenerationModeLabel(value: string): string {
  return (
    SOCIAL_PLANNER_GENERATION_MODE_LABELS[value as SocialCalendarGenerationMode] ??
    humanizeSocialPlannerToken(value)
  );
}

export function socialPlannerStageLabel(
  stage: string | null | undefined,
): string | null {
  if (!stage) return null;
  return SOCIAL_PLANNER_STAGE_LABELS[stage] ?? null;
}

export function socialPlannerHistoryStatusLabel(
  status: string | null | undefined,
): string {
  if (status === "Ready") return "Ready";
  if (status === "Processing Failed") return "Failed";
  if (status === "Queued" || status === "Processing") return "Generating";
  return "Generating";
}
