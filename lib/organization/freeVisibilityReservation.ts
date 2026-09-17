/**
 * In-process spec of the organization Free Visibility reservation machine.
 * Mirrors reserve / bind / consume / release SQL so tests can prove
 * compare-and-swap, crash recovery, historical Ready exhaustion, and
 * plan-change durability without a live DB.
 */

import {
  FREE_VISIBILITY_RESERVATION_STALE_MS,
  resolveFreeVisibilityStatus,
  type FreeVisibilityPersistedStatus,
  type FreeVisibilityStatus,
} from "@/lib/organization/freeVisibility";

export type FreeVisibilityReportSnapshot = {
  id: string;
  organizationId: string;
  status: "Queued" | "Processing" | "Ready" | "Processing Failed";
};

export type FreeVisibilityJobSnapshot = {
  reportId: string;
  organizationId: string;
  status: "queued" | "processing" | "retryable" | "completed" | "failed";
};

export type FreeVisibilityOrganizationState = {
  status: FreeVisibilityStatus;
  reportId: string | null;
  reservedAt: number | null;
  reservationToken: string | null;
};

export type FreeVisibilityWorld = {
  organization: FreeVisibilityOrganizationState;
  reports: Record<string, FreeVisibilityReportSnapshot>;
  jobs: FreeVisibilityJobSnapshot[];
};

export type ReserveFreeVisibilityResult =
  | {
      outcome: "reserved";
      recovered: boolean;
      reservationToken: string;
      reportId: string | null;
    }
  | { outcome: "already_reserved"; reportId: string | null }
  | { outcome: "already_consumed"; reportId: string | null };

export type BindFreeVisibilityResult =
  | { outcome: "bound"; reportId: string }
  | { outcome: "conflict" };

export type ReleaseFreeVisibilityResult =
  | { outcome: "released" }
  | { outcome: "ignored" };

export type ConsumeFreeVisibilityResult =
  | { outcome: "consumed" }
  | { outcome: "already" }
  | { outcome: "ignored" };

export function emptyFreeVisibilityOrganizationState(): FreeVisibilityOrganizationState {
  return {
    status: "available",
    reportId: null,
    reservedAt: null,
    reservationToken: null,
  };
}

function persistedStatus(
  status: FreeVisibilityStatus,
): FreeVisibilityPersistedStatus | null {
  return status === "available" ? null : status;
}

function hasActiveJobForOrganization(
  world: FreeVisibilityWorld,
  organizationId: string,
  reportId: string | null,
): boolean {
  if (!reportId) return false;
  return world.jobs.some(
    (job) =>
      job.reportId === reportId &&
      job.organizationId === organizationId &&
      (job.status === "queued" ||
        job.status === "processing" ||
        job.status === "retryable"),
  );
}

function reportFor(
  world: FreeVisibilityWorld,
  organizationId: string,
  reportId: string | null,
): FreeVisibilityReportSnapshot | null {
  if (!reportId) return null;
  const report = world.reports[reportId];
  if (!report || report.organizationId !== organizationId) {
    return null;
  }
  return report;
}

function historicalReadyReport(
  world: FreeVisibilityWorld,
  organizationId: string,
): FreeVisibilityReportSnapshot | null {
  return (
    Object.values(world.reports).find(
      (report) =>
        report.organizationId === organizationId && report.status === "Ready",
    ) ?? null
  );
}

function hasHistoricalInFlight(
  world: FreeVisibilityWorld,
  organizationId: string,
): boolean {
  return Object.values(world.reports).some(
    (report) =>
      report.organizationId === organizationId &&
      (report.status === "Queued" || report.status === "Processing"),
  );
}

function isStale(reservedAt: number | null, nowMs: number): boolean {
  if (reservedAt == null) return true;
  return nowMs - reservedAt >= FREE_VISIBILITY_RESERVATION_STALE_MS;
}

function markConsumed(
  org: FreeVisibilityOrganizationState,
  reportId: string,
): void {
  org.status = "consumed";
  org.reservedAt = null;
  org.reservationToken = null;
  org.reportId = reportId;
}

export function applyReserveFreeVisibility(input: {
  world: FreeVisibilityWorld;
  organizationId: string;
  nowMs: number;
  nextToken: string;
}): ReserveFreeVisibilityResult {
  const org = input.world.organization;
  const status = resolveFreeVisibilityStatus(org.status);

  if (status === "consumed") {
    return { outcome: "already_consumed", reportId: org.reportId };
  }

  if (status === "reserved") {
    const report = reportFor(
      input.world,
      input.organizationId,
      org.reportId,
    );

    if (report?.status === "Ready") {
      markConsumed(org, report.id);
      return { outcome: "already_consumed", reportId: report.id };
    }

    if (report?.status === "Processing Failed") {
      return { outcome: "already_reserved", reportId: org.reportId };
    }

    const activeJob = hasActiveJobForOrganization(
      input.world,
      input.organizationId,
      org.reportId,
    );

    const canRecoverUnbound =
      org.reportId == null && isStale(org.reservedAt, input.nowMs);
    const canRecoverUnenqueued =
      org.reportId != null &&
      !activeJob &&
      isStale(org.reservedAt, input.nowMs);

    if (!canRecoverUnbound && !canRecoverUnenqueued) {
      return { outcome: "already_reserved", reportId: org.reportId };
    }

    if (canRecoverUnenqueued && org.reportId) {
      org.status = "reserved";
      org.reservedAt = input.nowMs;
      org.reservationToken = input.nextToken;
      return {
        outcome: "reserved",
        recovered: true,
        reservationToken: input.nextToken,
        reportId: org.reportId,
      };
    }
  }

  const ready = historicalReadyReport(input.world, input.organizationId);
  if (ready) {
    markConsumed(org, ready.id);
    return { outcome: "already_consumed", reportId: ready.id };
  }

  if (hasHistoricalInFlight(input.world, input.organizationId)) {
    return { outcome: "already_reserved", reportId: org.reportId };
  }

  const lastReport = reportFor(
    input.world,
    input.organizationId,
    org.reportId,
  );
  const reuseFailed = lastReport?.status === "Processing Failed";

  const recovered = persistedStatus(org.status) === "reserved" || reuseFailed;
  org.status = "reserved";
  org.reportId = reuseFailed ? org.reportId : null;
  org.reservedAt = input.nowMs;
  org.reservationToken = input.nextToken;
  return {
    outcome: "reserved",
    recovered,
    reservationToken: input.nextToken,
    reportId: org.reportId,
  };
}

export function applyBindFreeVisibility(input: {
  world: FreeVisibilityWorld;
  reservationToken: string;
  reportId: string;
}): BindFreeVisibilityResult {
  const org = input.world.organization;
  if (
    org.status !== "reserved" ||
    org.reservationToken !== input.reservationToken ||
    org.reportId != null
  ) {
    return { outcome: "conflict" };
  }

  org.reportId = input.reportId;
  return { outcome: "bound", reportId: input.reportId };
}

export function applyReleaseFreeVisibility(input: {
  world: FreeVisibilityWorld;
  reportId?: string | null;
  reservationToken?: string | null;
}): ReleaseFreeVisibilityResult {
  const org = input.world.organization;
  if (org.status !== "reserved") {
    return { outcome: "ignored" };
  }

  const reportMatches =
    input.reportId != null && org.reportId === input.reportId;
  const tokenMatches =
    input.reservationToken != null &&
    org.reservationToken === input.reservationToken;
  const unboundTokenRelease = org.reportId == null && tokenMatches;

  if (!reportMatches && !unboundTokenRelease) {
    return { outcome: "ignored" };
  }

  org.status = "available";
  org.reservedAt = null;
  org.reservationToken = null;
  if (reportMatches) {
    org.reportId = input.reportId ?? org.reportId;
  }
  return { outcome: "released" };
}

export function applyConsumeFreeVisibility(input: {
  world: FreeVisibilityWorld;
  reportId: string;
}): ConsumeFreeVisibilityResult {
  const org = input.world.organization;
  if (org.status === "consumed" && org.reportId === input.reportId) {
    return { outcome: "already" };
  }
  if (org.status !== "reserved" || org.reportId !== input.reportId) {
    return { outcome: "ignored" };
  }

  markConsumed(org, input.reportId);
  return { outcome: "consumed" };
}

export function applyFreeVisibilityPlanChange(input: {
  world: FreeVisibilityWorld;
  nextPlan: "free" | "full";
}): FreeVisibilityOrganizationState {
  void input.nextPlan;
  return input.world.organization;
}
