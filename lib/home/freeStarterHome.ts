/**
 * Trained Free Home presentation. Reads starter authority + associated calendar.
 * Does not create calendars, jobs, or mutate starter state.
 */

import {
  deriveFreeStarterHomeKind,
  shouldShowFreeStarterHome as shouldShowFreeStarterExperience,
  type FreeStarterHomeKind,
  type FreeStarterStatus,
} from "@/lib/organization/freeStarter";
import { serializeSocialCalendarAsset } from "@/components/socialPlanner/socialPlannerAssetCopyText";
import {
  previewSocialCopy,
  socialPlannerWorkspacePath,
} from "@/components/socialPlanner/socialPlannerClient";
import { isSocialCalendarDailyPackage } from "@/services/socialPlanner/generation/socialCalendarPackageUnion";
import type { SocialCalendarAssetV1 } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import type { SocialCalendarStatus } from "@/services/socialPlanner/socialCalendarTypes";

export { shouldShowFreeStarterExperience };

export type FreeStarterAssetPreview = {
  assetType: string;
  platforms: string[];
  socialCopy: string;
  socialCopyPreview: string;
  serializedCopy: string;
};

export type FreeStarterHomeView = {
  kind: FreeStarterHomeKind;
  starterStatus: FreeStarterStatus;
  calendarId: string | null;
  calendarStatus: SocialCalendarStatus | null;
  weekHref: string | null;
  firstAsset: FreeStarterAssetPreview | null;
};

export function firstDailySocialAsset(
  socialPackage: unknown,
): SocialCalendarAssetV1 | null {
  if (!isSocialCalendarDailyPackage(socialPackage)) {
    return null;
  }
  return socialPackage.assets[0] ?? null;
}

export function presentFreeStarterFirstAsset(
  asset: SocialCalendarAssetV1,
): FreeStarterAssetPreview {
  return {
    assetType: asset.assetType,
    platforms: asset.recommendedPlatforms.slice(),
    socialCopy: asset.socialCopy,
    socialCopyPreview: previewSocialCopy(asset.socialCopy),
    serializedCopy: serializeSocialCalendarAsset(asset),
  };
}

export function presentFreeStarterHome(input: {
  starterStatus: FreeStarterStatus;
  calendarId?: string | null;
  calendarStatus?: SocialCalendarStatus | null;
  socialPackage?: unknown;
}): FreeStarterHomeView {
  const calendarId = input.calendarId ?? null;
  const calendarStatus = input.calendarStatus ?? null;
  const kind = deriveFreeStarterHomeKind({
    starterStatus: input.starterStatus,
    calendarStatus,
  });
  const firstAsset =
    kind === "ready"
      ? (() => {
          const asset = firstDailySocialAsset(input.socialPackage);
          return asset ? presentFreeStarterFirstAsset(asset) : null;
        })()
      : null;

  return {
    kind,
    starterStatus: input.starterStatus,
    calendarId,
    calendarStatus,
    weekHref: calendarId ? socialPlannerWorkspacePath(calendarId) : null,
    firstAsset,
  };
}
