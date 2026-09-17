/**
 * In-process spec of the organization Free starter reservation machine.
 * Mirrors reserve / bind / consume / release SQL so tests can prove
 * compare-and-swap, crash recovery, and plan-change durability without a live DB.
 */

import {
  FREE_STARTER_RESERVATION_STALE_MS,
  resolveFreeStarterStatus,
  type FreeStarterPersistedStatus,
  type FreeStarterStatus,
} from "@/lib/organization/freeStarter";

export type FreeStarterCalendarSnapshot = {
  id: string;
  organizationId: string;
  status: "Queued" | "Processing" | "Ready" | "Processing Failed";
};

export type FreeStarterJobSnapshot = {
  calendarId: string;
  organizationId: string;
  status: "queued" | "processing" | "retryable" | "completed" | "failed";
};

export type FreeStarterOrganizationState = {
  status: FreeStarterStatus;
  calendarId: string | null;
  reservedAt: number | null;
  reservationToken: string | null;
};

export type FreeStarterWorld = {
  organization: FreeStarterOrganizationState;
  calendars: Record<string, FreeStarterCalendarSnapshot>;
  jobs: FreeStarterJobSnapshot[];
};

export type ReserveFreeStarterResult =
  | {
      outcome: "reserved";
      recovered: boolean;
      reservationToken: string;
      calendarId: string | null;
    }
  | { outcome: "already_reserved"; calendarId: string | null }
  | { outcome: "already_consumed"; calendarId: string | null };

export type BindFreeStarterResult =
  | { outcome: "bound"; calendarId: string }
  | { outcome: "conflict" };

export type ReleaseFreeStarterResult =
  | { outcome: "released" }
  | { outcome: "ignored" };

export type ConsumeFreeStarterResult =
  | { outcome: "consumed" }
  | { outcome: "already" }
  | { outcome: "ignored" };

export function emptyFreeStarterOrganizationState(): FreeStarterOrganizationState {
  return {
    status: "available",
    calendarId: null,
    reservedAt: null,
    reservationToken: null,
  };
}

function persistedStatus(
  status: FreeStarterStatus,
): FreeStarterPersistedStatus | null {
  return status === "available" ? null : status;
}

function hasActiveJobForOrganization(
  world: FreeStarterWorld,
  organizationId: string,
  calendarId: string | null,
): boolean {
  if (!calendarId) return false;
  return world.jobs.some(
    (job) =>
      job.calendarId === calendarId &&
      job.organizationId === organizationId &&
      (job.status === "queued" ||
        job.status === "processing" ||
        job.status === "retryable"),
  );
}

function calendarFor(
  world: FreeStarterWorld,
  organizationId: string,
  calendarId: string | null,
): FreeStarterCalendarSnapshot | null {
  if (!calendarId) return null;
  const calendar = world.calendars[calendarId];
  if (!calendar || calendar.organizationId !== organizationId) {
    return null;
  }
  return calendar;
}

function isStale(reservedAt: number | null, nowMs: number): boolean {
  if (reservedAt == null) return true;
  return nowMs - reservedAt >= FREE_STARTER_RESERVATION_STALE_MS;
}

export function applyReserveFreeStarter(input: {
  world: FreeStarterWorld;
  organizationId: string;
  nowMs: number;
  nextToken: string;
}): ReserveFreeStarterResult {
  const org = input.world.organization;
  const status = resolveFreeStarterStatus(org.status);

  if (status === "consumed") {
    return { outcome: "already_consumed", calendarId: org.calendarId };
  }

  if (status === "reserved") {
    const calendar = calendarFor(
      input.world,
      input.organizationId,
      org.calendarId,
    );

    if (calendar?.status === "Ready") {
      org.status = "consumed";
      org.reservedAt = null;
      org.reservationToken = null;
      org.calendarId = calendar.id;
      return { outcome: "already_consumed", calendarId: calendar.id };
    }

    const activeJob = hasActiveJobForOrganization(
      input.world,
      input.organizationId,
      org.calendarId,
    );

    const canRecoverFailed = calendar?.status === "Processing Failed";
    const canRecoverUnbound = org.calendarId == null && isStale(org.reservedAt, input.nowMs);
    const canRecoverUnenqueued =
      !activeJob && isStale(org.reservedAt, input.nowMs);

    if (!canRecoverFailed && !canRecoverUnbound && !canRecoverUnenqueued) {
      return { outcome: "already_reserved", calendarId: org.calendarId };
    }
  }

  const recovered = persistedStatus(org.status) === "reserved";
  org.status = "reserved";
  org.calendarId = null;
  org.reservedAt = input.nowMs;
  org.reservationToken = input.nextToken;
  return {
    outcome: "reserved",
    recovered,
    reservationToken: input.nextToken,
    calendarId: null,
  };
}

export function applyBindFreeStarter(input: {
  world: FreeStarterWorld;
  reservationToken: string;
  calendarId: string;
}): BindFreeStarterResult {
  const org = input.world.organization;
  if (
    org.status !== "reserved" ||
    org.reservationToken !== input.reservationToken ||
    org.calendarId != null
  ) {
    return { outcome: "conflict" };
  }

  org.calendarId = input.calendarId;
  return { outcome: "bound", calendarId: input.calendarId };
}

export function applyReleaseFreeStarter(input: {
  world: FreeStarterWorld;
  calendarId?: string | null;
  reservationToken?: string | null;
}): ReleaseFreeStarterResult {
  const org = input.world.organization;
  if (org.status !== "reserved") {
    return { outcome: "ignored" };
  }

  const calendarMatches =
    input.calendarId != null && org.calendarId === input.calendarId;
  const tokenMatches =
    input.reservationToken != null &&
    org.reservationToken === input.reservationToken;
  const unboundTokenRelease =
    org.calendarId == null && tokenMatches;

  if (!calendarMatches && !unboundTokenRelease) {
    return { outcome: "ignored" };
  }

  org.status = "available";
  org.reservedAt = null;
  org.reservationToken = null;
  if (calendarMatches) {
    org.calendarId = input.calendarId ?? org.calendarId;
  }
  return { outcome: "released" };
}

export function applyConsumeFreeStarter(input: {
  world: FreeStarterWorld;
  calendarId: string;
}): ConsumeFreeStarterResult {
  const org = input.world.organization;
  if (org.status === "consumed" && org.calendarId === input.calendarId) {
    return { outcome: "already" };
  }
  if (org.status !== "reserved" || org.calendarId !== input.calendarId) {
    return { outcome: "ignored" };
  }

  org.status = "consumed";
  org.reservedAt = null;
  org.reservationToken = null;
  org.calendarId = input.calendarId;
  return { outcome: "consumed" };
}

export function applyPlanChange(input: {
  world: FreeStarterWorld;
  nextPlan: "free" | "full";
}): FreeStarterOrganizationState {
  void input.nextPlan;
  return input.world.organization;
}
