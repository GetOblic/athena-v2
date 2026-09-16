/**
 * Server-side day resolution for Social Planner Ask Athena.
 * Date is the package identity. Content is never taken from the client.
 */

import type { SocialCalendarAssetV1 } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import type { SocialCalendarEvergreenDayV1 } from "@/services/socialPlanner/generation/socialCalendarEvergreenPackageTypes";
import {
  isSocialCalendarEvergreenPackage,
  type SocialCalendarGeneratedPackage,
} from "@/services/socialPlanner/generation/socialCalendarPackageUnion";
import {
  SocialPlannerConversationError,
  type SocialPlannerConversationAssetReference,
} from "@/services/socialPlanner/conversation/socialPlannerConversationTypes";

export type SocialPlannerConversationResolvedDay =
  | SocialCalendarAssetV1
  | SocialCalendarEvergreenDayV1;

export function resolveSocialPlannerConversationDailyAsset(input: {
  socialPackage: SocialCalendarGeneratedPackage;
  assetReference: SocialPlannerConversationAssetReference;
}): SocialPlannerConversationResolvedDay {
  const date = input.assetReference.date.trim();
  const items = isSocialCalendarEvergreenPackage(input.socialPackage)
    ? input.socialPackage.days
    : input.socialPackage.assets;
  const matches = items.filter((item) => item.date === date);

  if (matches.length !== 1) {
    throw new SocialPlannerConversationError(
      "ASSET_NOT_FOUND",
      "Daily asset not found for the requested date.",
      404,
    );
  }

  return matches[0];
}
