/**
 * Server-side daily-asset resolution for Social Planner Ask Athena.
 * Date is the V29 package identity. Content is never taken from the client.
 */

import type { SocialCalendarAssetV1 } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import type { SocialCalendarPackageV1 } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  SocialPlannerConversationError,
  type SocialPlannerConversationAssetReference,
} from "@/services/socialPlanner/conversation/socialPlannerConversationTypes";

export function resolveSocialPlannerConversationDailyAsset(input: {
  socialPackage: SocialCalendarPackageV1;
  assetReference: SocialPlannerConversationAssetReference;
}): SocialCalendarAssetV1 {
  const date = input.assetReference.date.trim();
  const matches = input.socialPackage.assets.filter((asset) => asset.date === date);

  if (matches.length !== 1) {
    throw new SocialPlannerConversationError(
      "ASSET_NOT_FOUND",
      "Daily asset not found for the requested date.",
      404,
    );
  }

  return matches[0];
}
