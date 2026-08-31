/**
 * Presentation-only Social Planner status, asset-type, and chrome helpers.
 * Does not read or write stored tokens, API values, or generation payloads.
 */
import type { CopyButtonChrome } from "@/components/deployment/CopyButton";
import type { SocialPlannerErrorChrome } from "@/components/socialPlanner/socialPlannerClient";
import {
  humanizeSocialPlannerToken,
  socialPlannerPlatformLabel,
} from "@/components/socialPlanner/socialPlannerLabels";
import type {
  SocialPlannerAssetType,
  SocialPlannerObjective,
} from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import type { SocialCalendarGenerationMode } from "@/services/socialPlanner/socialCalendarTypes";
import { SOCIAL_CALENDAR_STATUSES } from "@/services/socialPlanner/socialCalendarTypes";
import { getAssetCopyChrome } from "./opportunityPresentation";
import { interpolateTenantMessage } from "./interpolate";
import { en } from "./messages/en";
import type { TenantMessages } from "./types";

const SAFE_LABEL_FALLBACK = "—";

const STATUS_KEYS = {
  Queued: "queued",
  Processing: "processing",
  Ready: "ready",
  "Processing Failed": "processingFailed",
} as const satisfies Record<
  (typeof SOCIAL_CALENDAR_STATUSES)[number],
  keyof TenantMessages["socialPlanner"]["status"]
>;

const HISTORY_STATUS_KEYS = {
  Ready: "ready",
  "Processing Failed": "failed",
  Queued: "generating",
  Processing: "generating",
} as const;

const STAGE_KEYS = {
  queued: "queued",
  calendar_context: "calendarContext",
  intelligence: "intelligence",
  generation: "generation",
  diversity: "diversity",
  source_divergence: "sourceDivergence",
  revision_satisfaction: "revisionSatisfaction",
  finalizing: "finalizing",
} as const satisfies Record<string, keyof TenantMessages["socialPlanner"]["stages"]>;

const ASSET_TYPE_KEYS = {
  image: "image",
  photo: "photo",
  branded_graphic: "brandedGraphic",
  infographic: "infographic",
  quote_visual: "quoteVisual",
  meme_or_humor: "memeOrHumor",
  testimonial_visual: "testimonialVisual",
  before_after: "beforeAfter",
  carousel: "carousel",
  story_sequence: "storySequence",
  storyboard: "storyboard",
  comparison: "comparison",
  step_by_step: "stepByStep",
  talking_head_video: "talkingHeadVideo",
  explainer_video: "explainerVideo",
  scenario_video: "scenarioVideo",
  skit_video: "skitVideo",
  pov_video: "povVideo",
  interview_or_qa_video: "interviewOrQaVideo",
  testimonial_video: "testimonialVideo",
  demonstration_video: "demonstrationVideo",
  behind_the_scenes_video: "behindTheScenesVideo",
  cinematic_brand_video: "cinematicBrandVideo",
  pdf_guide: "pdfGuide",
  checklist: "checklist",
  cheat_sheet: "cheatSheet",
  mini_report: "miniReport",
  poll: "poll",
  question_post: "questionPost",
  challenge: "challenge",
  quiz: "quiz",
  myth_vs_fact: "mythVsFact",
} as const satisfies Record<
  SocialPlannerAssetType,
  keyof TenantMessages["socialPlanner"]["assetTypes"]
>;

const OBJECTIVE_KEYS = {
  educate: "educate",
  build_authority: "buildAuthority",
  engage: "engage",
  nurture: "nurture",
  convert: "convert",
  promote: "promote",
  community: "community",
  entertain: "entertain",
  trust: "trust",
  thought_leadership: "thoughtLeadership",
} as const satisfies Record<
  SocialPlannerObjective,
  keyof TenantMessages["socialPlanner"]["objectives"]
>;

const GENERATION_MODE_KEYS = {
  standard: "standard",
  think_differently: "thinkDifferently",
  conversation_revision: "conversationRevision",
} as const satisfies Record<
  SocialCalendarGenerationMode,
  keyof TenantMessages["socialPlanner"]["generationModes"]
>;

function plannerCopy(
  messages: TenantMessages,
  read: (bundle: TenantMessages["socialPlanner"]) => string,
  fallback: string,
): string {
  const localized = read(messages.socialPlanner);
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  return fallback;
}

/**
 * Presentation-only Social Planner status label.
 * Unknown tokens remain verbatim.
 */
export function getLocalizedSocialPlannerStatusLabel(
  messages: TenantMessages,
  status?: string | null,
): string {
  const trimmed = String(status ?? "").trim();
  if (!trimmed) {
    return plannerCopy(
      messages,
      (bundle) => bundle.status.queued,
      en.socialPlanner.status.queued,
    );
  }
  const key = STATUS_KEYS[trimmed as keyof typeof STATUS_KEYS];
  if (!key) {
    return trimmed;
  }
  const localized = messages.socialPlanner.status[key];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  const fallback = en.socialPlanner.status[key];
  return typeof fallback === "string" && fallback.trim()
    ? fallback
    : SAFE_LABEL_FALLBACK;
}

/**
 * Presentation-only history-card status (Generating / Ready / Failed).
 * Canonical stored tokens stay Queued | Processing | Ready | Processing Failed.
 */
export function getLocalizedSocialPlannerHistoryStatusLabel(
  messages: TenantMessages,
  status?: string | null,
): string {
  const trimmed = String(status ?? "").trim();
  const key =
    HISTORY_STATUS_KEYS[trimmed as keyof typeof HISTORY_STATUS_KEYS] ??
    "generating";
  return plannerCopy(
    messages,
    (bundle) => bundle.status[key],
    en.socialPlanner.status[key],
  );
}

export function getLocalizedSocialPlannerStatusEyebrow(
  messages: TenantMessages,
  status: string,
): string {
  if (status === "Queued" || status === "Processing") {
    return plannerCopy(
      messages,
      (bundle) => bundle.status.generating,
      en.socialPlanner.status.generating,
    );
  }
  if (status === "Processing Failed") {
    return plannerCopy(
      messages,
      (bundle) => bundle.status.failed,
      en.socialPlanner.status.failed,
    );
  }
  return getLocalizedSocialPlannerStatusLabel(messages, status);
}

/**
 * Presentation-only generation-stage label.
 * Unknown tokens return null so the existing leave-and-return fallback applies.
 */
export function getLocalizedSocialPlannerStageLabel(
  messages: TenantMessages,
  stage?: string | null,
): string | null {
  if (!stage) return null;
  const key = STAGE_KEYS[stage as keyof typeof STAGE_KEYS];
  if (!key) return null;
  return plannerCopy(
    messages,
    (bundle) => bundle.stages[key],
    en.socialPlanner.stages[key],
  );
}

/**
 * Presentation-only asset-type label.
 * Canonical tokens remain unchanged. Unknown values use the existing
 * deterministic humanize fallback.
 */
export function getLocalizedSocialPlannerAssetTypeLabel(
  messages: TenantMessages,
  value: string,
): string {
  const key = ASSET_TYPE_KEYS[value as SocialPlannerAssetType];
  if (!key) {
    return humanizeSocialPlannerToken(value);
  }
  return plannerCopy(
    messages,
    (bundle) => bundle.assetTypes[key],
    en.socialPlanner.assetTypes[key],
  );
}

export function getLocalizedSocialPlannerObjectiveLabel(
  messages: TenantMessages,
  value: string,
): string {
  const key = OBJECTIVE_KEYS[value as SocialPlannerObjective];
  if (!key) {
    return humanizeSocialPlannerToken(value);
  }
  return plannerCopy(
    messages,
    (bundle) => bundle.objectives[key],
    en.socialPlanner.objectives[key],
  );
}

export function getLocalizedSocialPlannerGenerationModeLabel(
  messages: TenantMessages,
  value: string,
): string {
  const key = GENERATION_MODE_KEYS[value as SocialCalendarGenerationMode];
  if (!key) {
    return humanizeSocialPlannerToken(value);
  }
  return plannerCopy(
    messages,
    (bundle) => bundle.generationModes[key],
    en.socialPlanner.generationModes[key],
  );
}

/**
 * Platform / channel names stay brand-identical.
 */
export function getLocalizedSocialPlannerPlatformLabel(value: string): string {
  return socialPlannerPlatformLabel(value);
}

export function getSocialPlannerCopyChrome(
  messages: TenantMessages,
): CopyButtonChrome {
  return {
    ...getAssetCopyChrome(messages),
    saveTagFailed: messages.copyChrome.saveTagFailed,
    usageTagLabels: {
      selected: messages.copyChrome.usageTags.selected,
      scheduled: messages.copyChrome.usageTags.scheduled,
      sent: messages.copyChrome.usageTags.sent,
      published: messages.copyChrome.usageTags.published,
      used: messages.copyChrome.usageTags.used,
    },
  };
}

export function getSocialPlannerErrorChrome(
  messages: TenantMessages,
): SocialPlannerErrorChrome {
  const copy = messages.socialPlanner;
  return {
    authenticationRequired: copy.authenticationRequired,
    notFound: copy.notFound,
    notReadyThinkDifferently: copy.notReadyThinkDifferently,
    checkWeek: copy.checkWeek,
    somethingWentWrong: copy.somethingWentWrong,
    failedToStart: copy.failedToStart,
    failedThinkDifferently: copy.failedThinkDifferently,
    cannotApplyYet: copy.cannotApplyYet,
    failedApply: copy.failedApply,
  };
}

export function formatSocialPlannerVersionLabel(
  messages: TenantMessages,
  versionNumber: number,
): string {
  const template = messages.socialPlanner.versionN.includes("{n}")
    ? messages.socialPlanner.versionN
    : en.socialPlanner.versionN;
  return interpolateTenantMessage(template, { n: versionNumber });
}

export function formatSocialPlannerShowingLabel(
  messages: TenantMessages,
  start: number,
  end: number,
  total: number,
): string {
  const template = messages.socialPlanner.showing.includes("{start}")
    ? messages.socialPlanner.showing
    : en.socialPlanner.showing;
  return interpolateTenantMessage(template, { start, end, total });
}

export function formatSocialPlannerAssetsCount(
  messages: TenantMessages,
  count: number,
  typeSummary: string,
): string {
  if (!typeSummary) {
    const template = messages.socialPlanner.assetsCount.includes("{count}")
      ? messages.socialPlanner.assetsCount
      : en.socialPlanner.assetsCount;
    return interpolateTenantMessage(template, { count });
  }
  const template = messages.socialPlanner.assetsCountWithTypes.includes(
    "{count}",
  )
    ? messages.socialPlanner.assetsCountWithTypes
    : en.socialPlanner.assetsCountWithTypes;
  return interpolateTenantMessage(template, { count, types: typeSummary });
}

export function formatSocialPlannerJumpToDayAria(
  messages: TenantMessages,
  label: string,
): string {
  const template = messages.socialPlanner.jumpToDayAria.includes("{label}")
    ? messages.socialPlanner.jumpToDayAria
    : en.socialPlanner.jumpToDayAria;
  return interpolateTenantMessage(template, { label });
}

export function formatSocialPlannerDiscussingLabel(
  messages: TenantMessages,
  day: string,
  assetType: string,
): string {
  const template = messages.socialPlanner.discussing.includes("{day}")
    ? messages.socialPlanner.discussing
    : en.socialPlanner.discussing;
  return interpolateTenantMessage(template, { day, assetType });
}

export function formatSocialPlannerCalendarOpportunity(
  messages: TenantMessages,
  label: string,
): string {
  const template = messages.socialPlanner.calendarOpportunity.includes(
    "{label}",
  )
    ? messages.socialPlanner.calendarOpportunity
    : en.socialPlanner.calendarOpportunity;
  return interpolateTenantMessage(template, { label });
}
