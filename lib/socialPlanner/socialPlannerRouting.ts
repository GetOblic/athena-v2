/**
 * Social Content workspace URL contract.
 * The browser URL identifies the active planner. Refresh and copied URLs
 * reopen the same planner. personaId is preserved across tab changes.
 *
 * /social-planner?planner=daily
 * /social-planner?planner=evergreen
 * /social-planner?personaId=<id>           legacy Audience CTA → Daily tab
 * /social-planner?planner=evergreen&personaId=<id>
 */

import { normalizeSocialPlannerPersonaId } from "@/lib/socialPlanner/socialPlannerTargetPresentation";
import {
  SOCIAL_CALENDAR_DEFAULT_PLANNER_KIND,
  SocialCalendarPlannerKindError,
  type SocialCalendarImplementedPlannerKind,
} from "@/services/socialPlanner/socialCalendarPlannerKind";

export const SOCIAL_PLANNER_WORKSPACE_PATH = "/social-planner" as const;

export const SOCIAL_PLANNER_URL_KINDS = ["daily", "evergreen"] as const;

export type SocialPlannerUrlKind = (typeof SOCIAL_PLANNER_URL_KINDS)[number];

export type SocialPlannerUrlParse =
  | { kind: "daily"; plannerKind: "daily_social" }
  | { kind: "evergreen"; plannerKind: "evergreen" }
  | { kind: "invalid" };

export function plannerKindToUrlKind(
  plannerKind: string | null | undefined,
): SocialPlannerUrlKind {
  return plannerKind === "evergreen" ? "evergreen" : "daily";
}

export function urlKindToPlannerKind(
  kind: SocialPlannerUrlKind,
): SocialCalendarImplementedPlannerKind {
  return kind === "evergreen" ? "evergreen" : "daily_social";
}

/**
 * Missing planner is Daily — legacy /social-planner and Audience CTA.
 * An explicit unknown planner value fails closed.
 */
export function parseSocialPlannerUrlKind(value: unknown): SocialPlannerUrlParse {
  if (value == null || value === "") {
    return {
      kind: "daily",
      plannerKind: SOCIAL_CALENDAR_DEFAULT_PLANNER_KIND,
    };
  }
  if (typeof value !== "string") {
    return { kind: "invalid" };
  }
  const trimmed = value.trim();
  if (trimmed === "daily" || trimmed === "daily_social") {
    return { kind: "daily", plannerKind: "daily_social" };
  }
  if (trimmed === "evergreen") {
    return { kind: "evergreen", plannerKind: "evergreen" };
  }
  return { kind: "invalid" };
}

export function requireSocialPlannerUrlKind(
  value: unknown,
): SocialCalendarImplementedPlannerKind {
  const parsed = parseSocialPlannerUrlKind(value);
  if (parsed.kind === "invalid") {
    throw new SocialCalendarPlannerKindError(
      "INVALID_PLANNER_KIND",
      'planner must be "daily" or "evergreen".',
    );
  }
  return parsed.plannerKind;
}

export function socialPlannerWorkspaceHref(input: {
  planner?: SocialPlannerUrlKind | SocialCalendarImplementedPlannerKind | null;
  personaId?: string | null;
} = {}): string {
  const params = new URLSearchParams();
  params.set(
    "planner",
    plannerKindToUrlKind(
      input.planner === "daily" ? "daily_social" : input.planner,
    ),
  );
  const personaId = normalizeSocialPlannerPersonaId(input.personaId);
  if (personaId) {
    params.set("personaId", personaId);
  }
  return `${SOCIAL_PLANNER_WORKSPACE_PATH}?${params.toString()}`;
}
