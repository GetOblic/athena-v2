/**
 * One-time Free starter Daily Social Planner product state.
 *
 * Organization-scoped. Not an entitlement engine, quota table, or
 * calendar-count heuristic. Consumption is historical and survives plan change.
 */

import { isFreeUntrained } from "@/lib/organization/freeUntrained";
import type { DefineKind } from "@/lib/home/homeDomainState";
import type { AthenaPlan } from "@/services/athenaPlan";
import type { SocialCalendarStatus } from "@/services/socialPlanner/socialCalendarTypes";

export const FREE_STARTER_STATUSES = ["available", "reserved", "consumed"] as const;

export type FreeStarterStatus = (typeof FREE_STARTER_STATUSES)[number];

export const FREE_STARTER_PERSISTED_STATUSES = ["reserved", "consumed"] as const;

export type FreeStarterPersistedStatus =
  (typeof FREE_STARTER_PERSISTED_STATUSES)[number];

export const FREE_STARTER_RESERVATION_STALE_MS = 120_000;

export type FreeStarterEligibilityInput = {
  athenaPlan?: AthenaPlan | null;
  defineKind?: DefineKind | null;
  starterStatus?: FreeStarterStatus | null;
};

export type FreeStarterHomeKind =
  | "available"
  | "creating"
  | "ready"
  | "failed";

export function resolveFreeStarterStatus(value: unknown): FreeStarterStatus {
  if (value === "reserved" || value === "consumed") {
    return value;
  }
  return "available";
}

export function isFreeTrained(input: {
  athenaPlan?: AthenaPlan | null;
  defineKind?: DefineKind | null;
}): boolean {
  return input.athenaPlan === "free" && !isFreeUntrained(input);
}

export function isFreeStarterAvailable(status: FreeStarterStatus): boolean {
  return status === "available";
}

export function isFreeStarterEligible(input: FreeStarterEligibilityInput): boolean {
  return (
    isFreeTrained(input) &&
    resolveFreeStarterStatus(input.starterStatus) === "available"
  );
}

export function freeStarterPeriodStartUtc(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shouldShowFreeStarterHome(input: {
  athenaPlan?: AthenaPlan | null;
  defineKind?: DefineKind | null;
}): boolean {
  return isFreeTrained(input);
}

/**
 * Presentation authority for the consumed Free starter calendar only.
 * Derives from current plan + persisted starter identity. Not a calendar
 * heuristic. Full plan immediately restores normal planner controls.
 */
export function isFreeConsumedStarterCalendarView(input: {
  athenaPlan?: AthenaPlan | null;
  starterStatus?: FreeStarterStatus | null;
  starterCalendarId?: string | null;
  currentCalendarId?: string | null;
}): boolean {
  const starterCalendarId = input.starterCalendarId?.trim() || null;
  const currentCalendarId = input.currentCalendarId?.trim() || null;
  return (
    input.athenaPlan === "free" &&
    resolveFreeStarterStatus(input.starterStatus) === "consumed" &&
    Boolean(starterCalendarId) &&
    Boolean(currentCalendarId) &&
    starterCalendarId === currentCalendarId
  );
}

/**
 * Create-workspace containment for consumed Free only.
 * Available, reserved, and Full continue to render /social-planner.
 * Query, history, and calendar counts are not inputs.
 */
export function resolveConsumedFreeSocialCreateRedirect(input: {
  athenaPlan?: AthenaPlan | null;
  starterStatus?: FreeStarterStatus | null;
  starterCalendarId?: string | null;
}): string | null {
  if (
    input.athenaPlan !== "free" ||
    resolveFreeStarterStatus(input.starterStatus) !== "consumed"
  ) {
    return null;
  }
  const starterCalendarId = input.starterCalendarId?.trim() || null;
  return starterCalendarId ? `/social-planner/${starterCalendarId}` : "/";
}

export function deriveFreeStarterHomeKind(input: {
  starterStatus: FreeStarterStatus;
  calendarStatus?: SocialCalendarStatus | null;
}): FreeStarterHomeKind {
  const calendarStatus = input.calendarStatus ?? null;

  if (input.starterStatus === "consumed") {
    return "ready";
  }

  if (input.starterStatus === "reserved") {
    if (calendarStatus === "Ready") return "ready";
    if (calendarStatus === "Processing Failed") return "failed";
    return "creating";
  }

  if (calendarStatus === "Processing Failed") {
    return "failed";
  }

  return "available";
}
