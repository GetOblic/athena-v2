/**
 * Ready Social Calendar authorization for durable asset interactions.
 * Explicit social_calendar path — never Prospect or Discussion fallback.
 */

import {
  parseSocialCalendarAssetInteractionType,
  LIVE_EXECUTIVE_VERSION_SENTINEL,
} from "@/services/assetInteractions/assetInteractionKeys";
import type { SocialCalendarPackageV1 } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import { parsePersistedSocialCalendarPackage } from "@/services/socialPlanner/socialCalendarPersistedPackage";
import { getSocialCalendarById } from "@/services/socialPlanner/socialCalendarService";
import type { SocialCalendar } from "@/services/socialPlanner/socialCalendarTypes";

export type SocialCalendarInteractionDenial = {
  ok: false;
  status: 400 | 404;
  code: "NOT_FOUND" | "VALIDATION_ERROR";
  message: string;
};

export type SocialCalendarInteractionSourceGrant = {
  ok: true;
  calendar: SocialCalendar;
  socialPackage: SocialCalendarPackageV1;
};

export type SocialCalendarInteractionAssetGrant = {
  ok: true;
  date: string;
};

export function isAllowedSocialCalendarExecutiveVersionId(
  executiveVersionId: string | null | undefined,
): boolean {
  const versionId = String(executiveVersionId ?? "").trim();
  return !versionId || versionId === LIVE_EXECUTIVE_VERSION_SENTINEL;
}

/**
 * Exactly one frozen daily asset for a validated calendar date.
 * Same fail-closed rule as Social Planner conversation resolution.
 */
export function resolveExactlyOneSocialCalendarDailyAsset(
  socialPackage: SocialCalendarPackageV1,
  date: string,
) {
  const matches = socialPackage.assets.filter((asset) => asset.date === date);
  return matches.length === 1 ? matches[0] : null;
}

export async function authorizeSocialCalendarInteractionSource(input: {
  organizationId: string;
  sourceId: string;
  getCalendar?: typeof getSocialCalendarById;
}): Promise<
  SocialCalendarInteractionSourceGrant | SocialCalendarInteractionDenial
> {
  const getCalendar = input.getCalendar ?? getSocialCalendarById;
  const calendar = await getCalendar(input.sourceId, input.organizationId);
  if (!calendar) {
    return {
      ok: false,
      status: 404,
      code: "NOT_FOUND",
      message: "Source not found.",
    };
  }
  if (calendar.status !== "Ready") {
    return {
      ok: false,
      status: 404,
      code: "NOT_FOUND",
      message: "Source not found.",
    };
  }

  try {
    const socialPackage = parsePersistedSocialCalendarPackage(
      calendar.package_json,
    );
    return { ok: true, calendar, socialPackage };
  } catch {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Stored Social Calendar package is malformed.",
    };
  }
}

export function authorizeSocialCalendarInteractionAsset(input: {
  socialPackage: SocialCalendarPackageV1;
  assetType: string;
}): SocialCalendarInteractionAssetGrant | SocialCalendarInteractionDenial {
  const date = parseSocialCalendarAssetInteractionType(input.assetType);
  if (!date) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Unsupported asset type.",
    };
  }

  const asset = resolveExactlyOneSocialCalendarDailyAsset(
    input.socialPackage,
    date,
  );
  if (!asset) {
    return {
      ok: false,
      status: 404,
      code: "NOT_FOUND",
      message: "Daily asset not found for the requested date.",
    };
  }

  return { ok: true, date };
}
