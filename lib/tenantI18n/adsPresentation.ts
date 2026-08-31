/**
 * Presentation-only Ads status, stage, and shared chrome.
 * Does not read or write stored tokens, API values, or generation payloads.
 */
import type { ConfirmDeleteChrome } from "@/components/ui/ConfirmDeleteControl";
import type { AdCampaignGenerationStage } from "@/services/ads/adCampaignTypes";
import { AD_CAMPAIGN_STATUSES } from "@/services/ads/adCampaignTypes";
import { getAssetCopyChrome } from "./opportunityPresentation";
import { en } from "./messages/en";
import type { TenantMessages } from "./types";

const SAFE_LABEL_FALLBACK = "—";

const STATUS_KEYS = {
  Queued: "queued",
  Processing: "processing",
  Ready: "ready",
  "Processing Failed": "processingFailed",
} as const satisfies Record<
  (typeof AD_CAMPAIGN_STATUSES)[number],
  keyof TenantMessages["ads"]["status"]
>;

const STAGE_KEYS = {
  assembling_context: "assemblingContext",
  strategy: "strategy",
  facebook: "facebook",
  instagram: "instagram",
  tiktok: "tiktok",
  google_search: "googleSearch",
  keyword_themes: "keywordThemes",
  validating: "validating",
  completed: "completed",
  failed: "failed",
} as const satisfies Record<
  AdCampaignGenerationStage,
  keyof TenantMessages["ads"]["stages"]
>;

function adsCopy(
  messages: TenantMessages,
  read: (bundle: TenantMessages["ads"]) => string,
  fallback: string,
): string {
  const localized = read(messages.ads);
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  return fallback;
}

/**
 * Presentation-only Ads campaign status label.
 * Unknown tokens remain verbatim.
 */
export function getLocalizedAdCampaignStatusLabel(
  messages: TenantMessages,
  status?: string | null,
): string {
  const trimmed = String(status ?? "").trim();
  if (!trimmed) {
    return adsCopy(messages, (ads) => ads.status.queued, en.ads.status.queued);
  }
  const key = STATUS_KEYS[trimmed as keyof typeof STATUS_KEYS];
  if (!key) {
    return trimmed;
  }
  const localized = messages.ads.status[key];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  const fallback = en.ads.status[key];
  return typeof fallback === "string" && fallback.trim()
    ? fallback
    : SAFE_LABEL_FALLBACK;
}

/**
 * Presentation-only Ads generation-stage label.
 * Unknown tokens remain verbatim; missing stage uses the queued fallback.
 */
export function getLocalizedAdGenerationStageLabel(
  messages: TenantMessages,
  stage?: string | null,
): string {
  const trimmed = String(stage ?? "").trim();
  if (!trimmed) {
    return adsCopy(
      messages,
      (ads) => ads.statusPanel.queuedFallback,
      en.ads.statusPanel.queuedFallback,
    );
  }
  const key = STAGE_KEYS[trimmed as keyof typeof STAGE_KEYS];
  if (!key) {
    return trimmed;
  }
  const localized = messages.ads.stages[key];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  return en.ads.stages[key];
}

export function getAdsCopyChrome(messages: TenantMessages) {
  return getAssetCopyChrome(messages);
}

export function getAdsConfirmDeleteChrome(
  messages: TenantMessages,
): ConfirmDeleteChrome {
  return {
    delete: messages.common.delete,
    cancel: messages.common.cancel,
    confirmDelete: messages.common.confirmDelete,
    deleting: messages.common.deleting,
    confirmDeletion: messages.common.confirmDeletion,
  };
}
