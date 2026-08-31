/**
 * Presentation-only Opportunity status, queue, and readiness labels.
 * Does not read or write stored tokens, API values, or generation payloads.
 */
import type { StrategicAssetBlueprintChrome } from "@/components/assetBlueprints/StrategicAssetBlueprint";
import type { CopyButtonChrome } from "@/components/deployment/CopyButton";
import type { DeploymentAssetsChrome } from "@/components/deployment/DeploymentAssets";
import { getDeploymentReadinessFromBriefing } from "@/lib/deploymentReadiness";
import {
  buildWhyNowSummary,
  type OpportunityPriorityKey,
} from "@/lib/opportunityPriority";
import {
  normalizeOpportunityStatus,
  OPPORTUNITY_STATUS_ORDER,
  type OpportunityStatusKey,
} from "@/lib/opportunityStatus";
import type { Opportunity } from "@/services/opportunityService";
import { en } from "./messages/en";
import type { TenantMessages } from "./types";

const SAFE_LABEL_FALLBACK = "—";

const STATUS_KEYS = {
  pending: "pending",
  approved_for_outreach: "approvedForOutreach",
  outreach_started: "outreachStarted",
  conversation_active: "conversationActive",
  qualified: "qualified",
  won: "won",
  lost: "lost",
} as const satisfies Record<
  OpportunityStatusKey,
  keyof TenantMessages["opportunities"]["status"]
>;

const QUEUE_TITLE_KEYS = {
  immediate_action: "immediateAction",
  high_intent: "highIntent",
  monitor: "monitor",
  low_priority: "lowPriority",
} as const satisfies Record<
  OpportunityPriorityKey,
  keyof TenantMessages["opportunities"]["queue"]
>;

const QUEUE_DESCRIPTION_KEYS = {
  immediate_action: "immediateActionDescription",
  high_intent: "highIntentDescription",
  monitor: "monitorDescription",
  low_priority: "lowPriorityDescription",
} as const satisfies Record<
  OpportunityPriorityKey,
  keyof TenantMessages["opportunities"]["queue"]
>;

const READINESS_KEYS = {
  preparing: "preparing",
  ready: "ready",
  blocked: "blocked",
  archived: "archived",
} as const satisfies Record<
  "preparing" | "ready" | "blocked" | "archived",
  keyof TenantMessages["opportunities"]["readiness"]
>;

function statusCopy(
  messages: TenantMessages,
  key: keyof TenantMessages["opportunities"]["status"],
): string {
  const localized = messages.opportunities.status[key];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  const fallback = en.opportunities.status[key];
  return typeof fallback === "string" && fallback.trim()
    ? fallback
    : SAFE_LABEL_FALLBACK;
}

function queueCopy(
  messages: TenantMessages,
  key: keyof TenantMessages["opportunities"]["queue"],
): string {
  const localized = messages.opportunities.queue[key];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  const fallback = en.opportunities.queue[key];
  return typeof fallback === "string" && fallback.trim()
    ? fallback
    : SAFE_LABEL_FALLBACK;
}

/**
 * Presentation-only Opportunity sales-status label.
 * Uses the existing product normalizer; unknown tokens follow that fallback.
 */
export function getLocalizedOpportunityStatusLabel(
  messages: TenantMessages,
  status?: string | null,
): string {
  const key = normalizeOpportunityStatus(status);
  return statusCopy(messages, STATUS_KEYS[key]);
}

export function getOpportunityStatusLabelMap(
  messages: TenantMessages,
): Record<OpportunityStatusKey, string> {
  return Object.fromEntries(
    OPPORTUNITY_STATUS_ORDER.map((key) => [
      key,
      getLocalizedOpportunityStatusLabel(messages, key),
    ]),
  ) as Record<OpportunityStatusKey, string>;
}

/**
 * Presentation-only Opportunity work-queue title.
 * Does not change queue classification or section keys.
 */
export function getLocalizedOpportunityQueueTitle(
  messages: TenantMessages,
  queueKey: OpportunityPriorityKey,
): string {
  return queueCopy(messages, QUEUE_TITLE_KEYS[queueKey]);
}

/**
 * Presentation-only Opportunity work-queue description.
 * Does not change queue classification or section keys.
 */
export function getLocalizedOpportunityQueueDescription(
  messages: TenantMessages,
  queueKey: OpportunityPriorityKey,
): string {
  return queueCopy(messages, QUEUE_DESCRIPTION_KEYS[queueKey]);
}

/**
 * Presentation-only deployment-readiness label derived from briefing status.
 * Does not change readiness classification.
 */
export function getLocalizedDeploymentReadinessLabel(
  messages: TenantMessages,
  briefingStatus?: string | null,
): string {
  const presentation = getDeploymentReadinessFromBriefing(briefingStatus);
  const key =
    READINESS_KEYS[presentation.key as keyof typeof READINESS_KEYS];
  if (!key) {
    return presentation.label;
  }
  const localized = messages.opportunities.readiness[key];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  return en.opportunities.readiness[key];
}

/**
 * Presentation-only Why Now composition.
 * Localizes the static "Urgency is {value}." template only.
 * Stored urgency, recommendation, briefing summary, and reason stay verbatim.
 */
export function getLocalizedWhyNowSummary(
  messages: TenantMessages,
  opportunity: Opportunity,
  briefingSummary?: string | null,
): string | null {
  const localized = messages.opportunities.detail.whyNowUrgency;
  const template =
    typeof localized === "string" && localized.includes("{value}")
      ? localized
      : en.opportunities.detail.whyNowUrgency;
  return buildWhyNowSummary(opportunity, briefingSummary, template);
}

export function getAssetCopyChrome(
  messages: TenantMessages,
): CopyButtonChrome {
  return {
    copy: messages.common.copy,
    copied: messages.common.copied,
    done: messages.copyChrome.done,
    copyAria: messages.copyChrome.copyToClipboard,
    copiedAria: messages.copyChrome.copiedToClipboard,
    doneAria: messages.copyChrome.copiedAtLeastOnce,
    copyFailed: messages.copyChrome.copyFailed,
    saveDoneFailed: messages.copyChrome.saveDoneFailed,
    continue: messages.copyChrome.continue,
    continueAria: messages.copyChrome.continueInWorkspace,
  };
}

export function getOpportunityDeploymentAssetsChrome(
  messages: TenantMessages,
): DeploymentAssetsChrome {
  return {
    help: messages.opportunities.detail.deploymentAssetsHelp,
    copy: getAssetCopyChrome(messages),
  };
}

export function getOpportunityStrategicAssetBlueprintChrome(
  messages: TenantMessages,
): StrategicAssetBlueprintChrome {
  return {
    ...toStrategicAssetBlueprintChrome(
      messages.opportunities.detail,
      messages.opportunities.emptyValue,
    ),
    copy: getAssetCopyChrome(messages),
  };
}

export function toStrategicAssetBlueprintChrome(
  detail: {
    blueprintEmptyEyebrow: string;
    blueprintHelp: string;
    blueprintReadyToProduce: string;
    blueprintAssetOverview: string;
    blueprintUntitledAsset: string;
    blueprintBusinessGoal: string;
    blueprintTargetAudience: string;
    blueprintPriority: string;
    blueprintEstimatedReuse: string;
    blueprintImagePrompt: string;
    blueprintPdfPrompt: string;
    blueprintSocialPrompt: string;
    blueprintTrendSocialPrompt: string;
    blueprintNotes: string;
    blueprintReadinessPdf: string;
    blueprintReadinessImage: string;
    blueprintReadinessSocial: string;
    blueprintReadinessTrendSocial: string;
    blueprintReadinessLeadMagnet: string;
    blueprintReadinessEmail: string;
    blueprintReadinessOther: string;
  },
  emptyValue: string,
): StrategicAssetBlueprintChrome {
  return {
    eyebrow: detail.blueprintEmptyEyebrow,
    help: detail.blueprintHelp,
    readyToProduce: detail.blueprintReadyToProduce,
    assetOverview: detail.blueprintAssetOverview,
    untitledAsset: detail.blueprintUntitledAsset,
    businessGoal: detail.blueprintBusinessGoal,
    targetAudience: detail.blueprintTargetAudience,
    priority: detail.blueprintPriority,
    estimatedReuse: detail.blueprintEstimatedReuse,
    imagePrompt: detail.blueprintImagePrompt,
    pdfPrompt: detail.blueprintPdfPrompt,
    socialPrompt: detail.blueprintSocialPrompt,
    trendSocialPrompt: detail.blueprintTrendSocialPrompt,
    notes: detail.blueprintNotes,
    emptyValue,
    readinessLabels: {
      pdf: detail.blueprintReadinessPdf,
      image: detail.blueprintReadinessImage,
      social: detail.blueprintReadinessSocial,
      "trend-social": detail.blueprintReadinessTrendSocial,
      "lead-magnet": detail.blueprintReadinessLeadMagnet,
      email: detail.blueprintReadinessEmail,
      other: detail.blueprintReadinessOther,
    },
  };
}
