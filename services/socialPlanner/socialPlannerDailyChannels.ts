/**
 * Daily Social Media coverage universe vs frozen Evergreen formats.
 * Network destinations stay on SOCIAL_PLANNER_PLATFORMS.
 * Evergreen format identity uses the same canonical keys as Deployment Assets,
 * declared here as literals so the union stays browser-safe and is not widened
 * by DEPLOYMENT_ASSET_TYPE_BY_LABEL (Record<string, string>).
 */

import {
  SOCIAL_PLANNER_DAILY_CHANNELS,
  SOCIAL_PLANNER_DAILY_COMMUNITY_CHANNELS,
  SOCIAL_PLANNER_PLATFORMS,
  type SocialPlannerDailyChannel,
} from "@/services/socialPlanner/generation/socialCalendarPackageTypes";

export {
  SOCIAL_PLANNER_DAILY_CHANNELS,
  SOCIAL_PLANNER_DAILY_COMMUNITY_CHANNELS,
  SOCIAL_PLANNER_PLATFORMS,
  type SocialPlannerDailyChannel,
};

export const SOCIAL_PLANNER_EVERGREEN_FORMATS = [
  "blog_post_idea",
  "newsletter_idea",
  "substack_post",
  "reddit_post",
  "skool_post",
  "skool_course_idea",
] as const;

export type SocialPlannerEvergreenFormat =
  (typeof SOCIAL_PLANNER_EVERGREEN_FORMATS)[number];

export const SOCIAL_PLANNER_DAILY_EXCLUDED_EVERGREEN_FORMATS = [
  "blog_post_idea",
  "newsletter_idea",
  "substack_post",
  "reddit_post",
  "skool_course_idea",
] as const;

export function isSocialPlannerDailyChannel(
  value: unknown,
): value is SocialPlannerDailyChannel {
  return (
    typeof value === "string" &&
    (SOCIAL_PLANNER_DAILY_CHANNELS as readonly string[]).includes(value)
  );
}
