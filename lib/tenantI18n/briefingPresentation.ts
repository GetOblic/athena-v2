/**
 * Presentation-only Briefing status and list-summary chrome.
 * Does not read or write stored tokens, API values, or generation payloads.
 */
import type { DeploymentAssetsChrome } from "@/components/deployment/DeploymentAssets";
import type { StrategicAssetBlueprintChrome } from "@/components/assetBlueprints/StrategicAssetBlueprint";
import { getBriefingListSummary } from "@/lib/briefingDisplay";
import {
  normalizeBriefingStatus,
  type BriefingStatusKey,
} from "@/lib/briefingStatus";
import type { AthenaReview } from "@/services/reviewService";
import {
  getAssetCopyChrome,
  toStrategicAssetBlueprintChrome,
} from "./opportunityPresentation";
import { en } from "./messages/en";
import type { TenantMessages } from "./types";

const SAFE_LABEL_FALLBACK = "—";
const UNTITLED_SENTINEL = "Untitled briefing";

const STATUS_KEYS = {
  draft: "draft",
  approved: "approved",
  needs_revision: "needsRevision",
  rejected: "rejected",
} as const satisfies Record<
  BriefingStatusKey,
  keyof TenantMessages["briefings"]["status"]
>;

function statusCopy(
  messages: TenantMessages,
  key: keyof TenantMessages["briefings"]["status"],
): string {
  const localized = messages.briefings.status[key];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  const fallback = en.briefings.status[key];
  return typeof fallback === "string" && fallback.trim()
    ? fallback
    : SAFE_LABEL_FALLBACK;
}

/**
 * Presentation-only Briefing editorial-status label.
 * Uses the existing product normalizer; unknown tokens follow that fallback.
 */
export function getLocalizedBriefingStatusLabel(
  messages: TenantMessages,
  status?: string | null,
): string {
  const key = normalizeBriefingStatus(status);
  return statusCopy(messages, STATUS_KEYS[key]);
}

export function getBriefingStatusLabelMap(
  messages: TenantMessages,
): Record<BriefingStatusKey, string> {
  return {
    draft: getLocalizedBriefingStatusLabel(messages, "draft"),
    approved: getLocalizedBriefingStatusLabel(messages, "approved"),
    needs_revision: getLocalizedBriefingStatusLabel(messages, "needs_revision"),
    rejected: getLocalizedBriefingStatusLabel(messages, "rejected"),
  };
}

/**
 * Presentation-only Briefing queue-section title.
 * Reuses editorial status labels; does not change queue keys.
 */
export function getLocalizedBriefingQueueTitle(
  messages: TenantMessages,
  queueKey: BriefingStatusKey,
): string {
  return getLocalizedBriefingStatusLabel(messages, queueKey);
}

/**
 * List-summary presentation. Generated/stored summaries stay verbatim.
 * Only the application-owned untitled fallback is localized.
 */
export function getLocalizedBriefingListSummary(
  briefing: AthenaReview,
  untitled: string,
): string {
  const summary = getBriefingListSummary(briefing);
  if (summary === UNTITLED_SENTINEL) {
    return untitled;
  }
  return summary;
}

export function getBriefingDeploymentAssetsChrome(
  messages: TenantMessages,
): DeploymentAssetsChrome {
  return {
    help: messages.briefings.detail.deploymentAssetsHelp,
    copy: getAssetCopyChrome(messages),
  };
}

export function getBriefingStrategicAssetBlueprintChrome(
  messages: TenantMessages,
): StrategicAssetBlueprintChrome {
  return {
    ...toStrategicAssetBlueprintChrome(
      messages.briefings.detail,
      messages.briefings.emptyValue,
    ),
    copy: getAssetCopyChrome(messages),
  };
}
