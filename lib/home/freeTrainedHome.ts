/**
 * Trained Free Home presentation. Summarizes existing Free authority
 * and feature presentations. Not entitlement or completion authority.
 */

import {
  isFreeTrained,
  type FreeStarterHomeKind,
} from "@/lib/organization/freeStarter";
import type { FreeAudiencePresentation } from "@/lib/personas/freeAudiencePresentation";
import type { FreeVisibilityPresentation } from "@/lib/seo/freeVisibilityPresentation";
import type { FreeTractionPresentation } from "@/lib/ads/freeTractionPresentation";
import type { FreeConvertPresentation } from "@/lib/prospects/freeConvertPresentation";
import type { FreeStarterHomeView } from "@/lib/home/freeStarterHome";
import type { DefineKind } from "@/lib/home/homeDomainState";
import {
  createUpgradeCapabilities,
  type UpgradeContextualContent,
  type UpgradeSharedCopy,
} from "@/lib/upgrade/upgradePresentation";
import type { AthenaPlan } from "@/services/athenaPlan";
import type { TenantMessages } from "@/lib/tenantI18n/types";

export const FREE_TRAINED_CAPABILITY_IDS = [
  "visibility",
  "audience",
  "advertising",
  "social",
  "convert",
] as const;

export type FreeTrainedCapabilityId =
  (typeof FREE_TRAINED_CAPABILITY_IDS)[number];

export type FreeTrainedCapabilityStatus =
  | "available"
  | "delivered"
  | "processing"
  | "failed";

export type FreeTrainedHomeStory = "remaining" | "mixed" | "consumed";

export type FreeTrainedContinuationProminence = "secondary" | "elevated";

export type FreeTrainedStarterPlacement = "primary" | "after-progression";

export type FreeTrainedCapabilityView = {
  id: FreeTrainedCapabilityId;
  status: FreeTrainedCapabilityStatus;
  href: string | null;
  statusLine: string;
  ctaLabel: string;
};

export type FreeTrainedPrimaryNext = {
  id: FreeTrainedCapabilityId;
  mode: "link" | "starter";
  href: string | null;
  label: string;
};

export type FreeTrainedHomeView = {
  story: FreeTrainedHomeStory;
  title: string;
  body: string;
  primaryNext: FreeTrainedPrimaryNext | null;
  starterPlacement: FreeTrainedStarterPlacement;
  capabilities: Record<FreeTrainedCapabilityId, FreeTrainedCapabilityView>;
  continuation: UpgradeContextualContent | null;
  continuationProminence: FreeTrainedContinuationProminence | null;
};

export type FreeTrainedHomeInput = {
  athenaPlan: AthenaPlan;
  defineKind: DefineKind;
  visibilityPresentation: FreeVisibilityPresentation;
  visibilityReportId?: string | null;
  audiencePresentation: FreeAudiencePresentation;
  audiencePersonaId?: string | null;
  advertisingPresentation: FreeTractionPresentation;
  advertisingCampaignId?: string | null;
  starter: Pick<FreeStarterHomeView, "kind" | "calendarId" | "weekHref">;
  convertPresentation: FreeConvertPresentation;
  convertProspectId?: string | null;
  copy: TenantMessages["dashboard"]["freeProgression"];
  upgrade: UpgradeSharedCopy;
};

export function shouldShowFreeTrainedHomeContinuation(input: {
  athenaPlan?: AthenaPlan | null;
  defineKind?: DefineKind | null;
}): boolean {
  return isFreeTrained(input);
}

export function mapFreePresentationToHomeStatus(
  presentation:
    | FreeVisibilityPresentation
    | FreeAudiencePresentation
    | FreeTractionPresentation
    | FreeConvertPresentation,
): FreeTrainedCapabilityStatus {
  if (presentation === "available") return "available";
  if (presentation === "consumed") return "delivered";
  if (presentation === "failed") return "failed";
  return "processing";
}

export function mapFreeStarterKindToHomeStatus(
  kind: FreeStarterHomeKind,
): FreeTrainedCapabilityStatus {
  if (kind === "available") return "available";
  if (kind === "ready") return "delivered";
  if (kind === "failed") return "failed";
  return "processing";
}

export function deriveFreeTrainedHomeStory(
  statuses: readonly FreeTrainedCapabilityStatus[],
): FreeTrainedHomeStory {
  const availableCount = statuses.filter((status) => status === "available").length;
  const unfinishedCount = statuses.filter(
    (status) => status === "processing" || status === "failed",
  ).length;

  if (availableCount === 0 && unfinishedCount === 0) {
    return "consumed";
  }
  if (availableCount >= 3) {
    return "remaining";
  }
  return "mixed";
}

export function presentFreeTrainedHome(
  input: FreeTrainedHomeInput,
): FreeTrainedHomeView {
  const visibilityStatus = mapFreePresentationToHomeStatus(
    input.visibilityPresentation,
  );
  const audienceStatus = mapFreePresentationToHomeStatus(
    input.audiencePresentation,
  );
  const advertisingStatus = mapFreePresentationToHomeStatus(
    input.advertisingPresentation,
  );
  const socialStatus = mapFreeStarterKindToHomeStatus(input.starter.kind);
  const convertStatus = mapFreePresentationToHomeStatus(
    input.convertPresentation,
  );

  const capabilities: Record<FreeTrainedCapabilityId, FreeTrainedCapabilityView> =
    {
      visibility: presentVisibilityCapability(
        visibilityStatus,
        input.visibilityReportId ?? null,
        input.copy,
      ),
      audience: presentAudienceCapability(
        audienceStatus,
        input.audiencePersonaId ?? null,
        input.copy,
      ),
      advertising: presentAdvertisingCapability(
        advertisingStatus,
        input.advertisingCampaignId ?? null,
        input.copy,
      ),
      social: presentSocialCapability(socialStatus, input.starter, input.copy),
      convert: presentConvertCapability(
        convertStatus,
        input.convertPresentation,
        input.convertProspectId ?? null,
        input.copy,
      ),
    };

  const story = deriveFreeTrainedHomeStory(
    FREE_TRAINED_CAPABILITY_IDS.map((id) => capabilities[id].status),
  );
  const primaryNext = resolvePrimaryNext(capabilities, input.starter.kind, input.copy);
  const starterPlacement =
    input.starter.kind === "creating" ||
    input.starter.kind === "failed" ||
    primaryNext?.id === "social"
      ? "primary"
      : "after-progression";

  return {
    story,
    title: homeTitle(story, input.copy),
    body: homeBody(story, input.copy),
    primaryNext,
    starterPlacement,
    capabilities,
    continuation: shouldShowFreeTrainedHomeContinuation(input)
      ? homeUpgradeContent({
          story,
          copy: input.copy,
          upgrade: input.upgrade,
        })
      : null,
    continuationProminence: shouldShowFreeTrainedHomeContinuation(input)
      ? story === "consumed"
        ? "elevated"
        : "secondary"
      : null,
  };
}

export function homeUpgradeContent(input: {
  story: FreeTrainedHomeStory;
  copy: TenantMessages["dashboard"]["freeProgression"];
  upgrade: UpgradeSharedCopy;
}): UpgradeContextualContent {
  const headline =
    input.story === "consumed"
      ? input.copy.continuationConsumedHeadline
      : input.story === "mixed"
        ? input.copy.continuationMixedHeadline
        : input.copy.continuationRemainingHeadline;
  const supportingText =
    input.story === "consumed"
      ? input.copy.continuationConsumedSupporting
      : input.story === "mixed"
        ? input.copy.continuationMixedSupporting
        : input.copy.continuationRemainingSupporting;

  return {
    feature: "identity",
    accent: "chrome",
    eyebrow: input.upgrade.fullAthena,
    headline,
    supportingText,
    capabilities: createUpgradeCapabilities([
      input.copy.capability1,
      input.copy.capability2,
      input.copy.capability3,
    ]),
    ctaLabel: input.upgrade.continueWithFullAthena,
    ctaTone: input.story === "consumed" ? "medium" : "quiet",
  };
}

function homeTitle(
  story: FreeTrainedHomeStory,
  copy: TenantMessages["dashboard"]["freeProgression"],
): string {
  if (story === "consumed") return copy.consumedTitle;
  if (story === "mixed") return copy.mixedTitle;
  return copy.trainedTitle;
}

function homeBody(
  story: FreeTrainedHomeStory,
  copy: TenantMessages["dashboard"]["freeProgression"],
): string {
  if (story === "consumed") return copy.consumedBody;
  if (story === "mixed") return copy.mixedBody;
  return copy.remainingBody;
}

function resolvePrimaryNext(
  capabilities: Record<FreeTrainedCapabilityId, FreeTrainedCapabilityView>,
  starterKind: FreeStarterHomeKind,
  copy: TenantMessages["dashboard"]["freeProgression"],
): FreeTrainedPrimaryNext | null {
  if (starterKind === "creating" || starterKind === "failed") {
    return {
      id: "social",
      mode: "starter",
      href: capabilities.social.href,
      label: capabilities.social.ctaLabel,
    };
  }

  for (const id of FREE_TRAINED_CAPABILITY_IDS) {
    if (capabilities[id].status !== "available") continue;
    return {
      id,
      mode: id === "social" ? "starter" : "link",
      href: capabilities[id].href,
      label: capabilities[id].ctaLabel,
    };
  }

  void copy;
  return null;
}

function presentVisibilityCapability(
  status: FreeTrainedCapabilityStatus,
  reportId: string | null,
  copy: TenantMessages["dashboard"]["freeProgression"],
): FreeTrainedCapabilityView {
  const href =
    status === "available" ? "/seo/new" : reportId ? `/seo/${reportId}` : "/seo";
  return {
    id: "visibility",
    status,
    href,
    statusLine:
      status === "available"
        ? copy.visibilityAvailable
        : status === "delivered"
          ? copy.visibilityDelivered
          : status === "failed"
            ? copy.visibilityFailed
            : copy.visibilityProcessing,
    ctaLabel:
      status === "available"
        ? copy.visibilityAvailableCta
        : copy.visibilityOpenCta,
  };
}

function presentAudienceCapability(
  status: FreeTrainedCapabilityStatus,
  personaId: string | null,
  copy: TenantMessages["dashboard"]["freeProgression"],
): FreeTrainedCapabilityView {
  const href = personaId ? `/personas/${personaId}` : "/personas";
  return {
    id: "audience",
    status,
    href,
    statusLine:
      status === "available"
        ? copy.audienceAvailable
        : status === "delivered"
          ? copy.audienceDelivered
          : copy.audienceProcessing,
    ctaLabel:
      status === "available" ? copy.audienceAvailableCta : copy.audienceOpenCta,
  };
}

function presentAdvertisingCapability(
  status: FreeTrainedCapabilityStatus,
  campaignId: string | null,
  copy: TenantMessages["dashboard"]["freeProgression"],
): FreeTrainedCapabilityView {
  const href =
    status === "available" ? "/ads/new" : campaignId ? `/ads/${campaignId}` : "/ads";
  return {
    id: "advertising",
    status,
    href,
    statusLine:
      status === "available"
        ? copy.advertisingAvailable
        : status === "delivered"
          ? copy.advertisingDelivered
          : status === "failed"
            ? copy.advertisingFailed
            : copy.advertisingProcessing,
    ctaLabel:
      status === "available"
        ? copy.advertisingAvailableCta
        : copy.advertisingOpenCta,
  };
}

function presentSocialCapability(
  status: FreeTrainedCapabilityStatus,
  starter: Pick<FreeStarterHomeView, "kind" | "calendarId" | "weekHref">,
  copy: TenantMessages["dashboard"]["freeProgression"],
): FreeTrainedCapabilityView {
  const href =
    starter.weekHref ??
    (starter.calendarId ? `/social-planner/${starter.calendarId}` : null);
  return {
    id: "social",
    status,
    href,
    statusLine:
      status === "available"
        ? copy.socialAvailable
        : status === "delivered"
          ? copy.socialDelivered
          : status === "failed"
            ? copy.socialFailed
            : copy.socialProcessing,
    ctaLabel:
      status === "available" ? copy.socialAvailableCta : copy.socialOpenCta,
  };
}

function presentConvertCapability(
  status: FreeTrainedCapabilityStatus,
  presentation: FreeConvertPresentation,
  prospectId: string | null,
  copy: TenantMessages["dashboard"]["freeProgression"],
): FreeTrainedCapabilityView {
  const href =
    status === "available"
      ? "/prospects/find"
      : prospectId
        ? `/prospects/${prospectId}`
        : "/prospects";
  return {
    id: "convert",
    status,
    href,
    statusLine:
      status === "available"
        ? copy.convertAvailable
        : status === "delivered"
          ? copy.convertDelivered
          : status === "failed"
            ? copy.convertFailed
            : presentation === "bound"
              ? copy.convertBound
              : copy.convertProcessing,
    ctaLabel:
      status === "available" ? copy.convertAvailableCta : copy.convertOpenCta,
  };
}
