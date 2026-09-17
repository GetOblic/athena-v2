/**
 * In-process spec of the organization Free Convert reservation machine.
 * Mirrors reserve / bind / consume / release SQL so tests can prove
 * compare-and-swap, crash recovery, historical Ready exhaustion, and
 * plan-change durability without a live DB.
 */

import {
  FREE_CONVERT_RESERVATION_STALE_MS,
  resolveFreeConvertStatus,
  type FreeConvertPersistedStatus,
  type FreeConvertStatus,
} from "@/lib/organization/freeConvert";

export type FreeConvertProspectSnapshot = {
  id: string;
  organizationId: string;
  linkedDiscussionId?: string | null;
  source?: string;
  status:
    | "Saved"
    | "Queued"
    | "Processing"
    | "Learning from Website"
    | "Generating Executive Intelligence"
    | "Ready"
    | "Processing Failed";
};

export type FreeConvertJobSnapshot = {
  prospectId: string;
  organizationId: string;
  discussionId?: string;
  status: "queued" | "processing" | "retryable" | "completed" | "failed";
  attemptCount?: number;
  maxAttempts?: number;
};

export type FreeConvertOrganizationState = {
  status: FreeConvertStatus;
  prospectId: string | null;
  reservedAt: number | null;
  reservationToken: string | null;
};

export type FreeConvertWorld = {
  organization: FreeConvertOrganizationState;
  prospects: Record<string, FreeConvertProspectSnapshot>;
  jobs: FreeConvertJobSnapshot[];
};

export type ReserveFreeConvertResult =
  | {
      outcome: "reserved";
      recovered: boolean;
      reservationToken: string;
      prospectId: string | null;
    }
  | { outcome: "already_reserved"; prospectId: string | null }
  | { outcome: "already_consumed"; prospectId: string | null };

export type BindFreeConvertResult =
  | { outcome: "bound"; prospectId: string }
  | { outcome: "conflict" };

export type ReleaseFreeConvertResult =
  | { outcome: "released" }
  | { outcome: "ignored" };

export type ConsumeFreeConvertResult =
  | { outcome: "consumed" }
  | { outcome: "already" }
  | { outcome: "ignored" };

export function emptyFreeConvertOrganizationState(): FreeConvertOrganizationState {
  return {
    status: "available",
    prospectId: null,
    reservedAt: null,
    reservationToken: null,
  };
}

function persistedStatus(
  status: FreeConvertStatus,
): FreeConvertPersistedStatus | null {
  return status === "available" ? null : status;
}

function hasActiveJobForOrganization(
  world: FreeConvertWorld,
  organizationId: string,
  prospectId: string | null,
): boolean {
  if (!prospectId) return false;
  return world.jobs.some(
    (job) =>
      job.prospectId === prospectId &&
      job.organizationId === organizationId &&
      (job.status === "queued" ||
        job.status === "processing" ||
        job.status === "retryable"),
  );
}

function prospectFor(
  world: FreeConvertWorld,
  organizationId: string,
  prospectId: string | null,
): FreeConvertProspectSnapshot | null {
  if (!prospectId) return null;
  const prospect = world.prospects[prospectId];
  if (!prospect || prospect.organizationId !== organizationId) {
    return null;
  }
  return prospect;
}

function historicalReadyProspect(
  world: FreeConvertWorld,
  organizationId: string,
): FreeConvertProspectSnapshot | null {
  return (
    Object.values(world.prospects).find(
      (prospect) =>
        prospect.organizationId === organizationId && prospect.status === "Ready",
    ) ?? null
  );
}

function isInFlightStatus(
  status: FreeConvertProspectSnapshot["status"],
): boolean {
  return (
    status === "Queued" ||
    status === "Processing" ||
    status === "Learning from Website" ||
    status === "Generating Executive Intelligence"
  );
}

function hasHistoricalInFlight(
  world: FreeConvertWorld,
  organizationId: string,
): boolean {
  return Object.values(world.prospects).some(
    (prospect) =>
      prospect.organizationId === organizationId &&
      isInFlightStatus(prospect.status),
  );
}

function isStale(reservedAt: number | null, nowMs: number): boolean {
  if (reservedAt == null) return true;
  return nowMs - reservedAt >= FREE_CONVERT_RESERVATION_STALE_MS;
}

function markConsumed(
  org: FreeConvertOrganizationState,
  prospectId: string,
): void {
  org.status = "consumed";
  org.reservedAt = null;
  org.reservationToken = null;
  org.prospectId = prospectId;
}

export function applyReserveFreeConvert(input: {
  world: FreeConvertWorld;
  organizationId: string;
  nowMs: number;
  nextToken: string;
}): ReserveFreeConvertResult {
  const org = input.world.organization;
  const status = resolveFreeConvertStatus(org.status);

  if (status === "consumed") {
    return { outcome: "already_consumed", prospectId: org.prospectId };
  }

  if (status === "reserved") {
    const prospect = prospectFor(
      input.world,
      input.organizationId,
      org.prospectId,
    );

    if (prospect?.status === "Ready") {
      markConsumed(org, prospect.id);
      return { outcome: "already_consumed", prospectId: prospect.id };
    }

    if (prospect?.status === "Processing Failed" || prospect?.status === "Saved") {
      return { outcome: "already_reserved", prospectId: org.prospectId };
    }

    const activeJob = hasActiveJobForOrganization(
      input.world,
      input.organizationId,
      org.prospectId,
    );

    const canRecoverUnbound =
      org.prospectId == null && isStale(org.reservedAt, input.nowMs);
    const canRecoverUnenqueued =
      org.prospectId != null &&
      !activeJob &&
      isStale(org.reservedAt, input.nowMs);

    if (!canRecoverUnbound && !canRecoverUnenqueued) {
      return { outcome: "already_reserved", prospectId: org.prospectId };
    }

    if (canRecoverUnenqueued && org.prospectId) {
      org.status = "reserved";
      org.reservedAt = input.nowMs;
      org.reservationToken = input.nextToken;
      return {
        outcome: "reserved",
        recovered: true,
        reservationToken: input.nextToken,
        prospectId: org.prospectId,
      };
    }
  }

  const ready = historicalReadyProspect(input.world, input.organizationId);
  if (ready) {
    markConsumed(org, ready.id);
    return { outcome: "already_consumed", prospectId: ready.id };
  }

  if (hasHistoricalInFlight(input.world, input.organizationId)) {
    return { outcome: "already_reserved", prospectId: org.prospectId };
  }

  const lastProspect = prospectFor(
    input.world,
    input.organizationId,
    org.prospectId,
  );
  const reuseFailed = lastProspect?.status === "Processing Failed";

  const recovered = persistedStatus(org.status) === "reserved" || reuseFailed;
  org.status = "reserved";
  org.prospectId = reuseFailed ? org.prospectId : null;
  org.reservedAt = input.nowMs;
  org.reservationToken = input.nextToken;
  return {
    outcome: "reserved",
    recovered,
    reservationToken: input.nextToken,
    prospectId: org.prospectId,
  };
}

export function applyBindFreeConvert(input: {
  world: FreeConvertWorld;
  reservationToken: string;
  prospectId: string;
}): BindFreeConvertResult {
  const org = input.world.organization;
  if (
    org.status !== "reserved" ||
    org.reservationToken !== input.reservationToken ||
    org.prospectId != null
  ) {
    return { outcome: "conflict" };
  }

  org.prospectId = input.prospectId;
  return { outcome: "bound", prospectId: input.prospectId };
}

export function applyReleaseFreeConvert(input: {
  world: FreeConvertWorld;
  prospectId?: string | null;
  reservationToken?: string | null;
}): ReleaseFreeConvertResult {
  const org = input.world.organization;
  if (org.status !== "reserved") {
    return { outcome: "ignored" };
  }

  const prospectMatches =
    input.prospectId != null && org.prospectId === input.prospectId;
  const tokenMatches =
    input.reservationToken != null &&
    org.reservationToken === input.reservationToken;
  const unboundTokenRelease = org.prospectId == null && tokenMatches;

  if (!prospectMatches && !unboundTokenRelease) {
    return { outcome: "ignored" };
  }

  org.status = "available";
  org.reservedAt = null;
  org.reservationToken = null;
  if (prospectMatches) {
    org.prospectId = input.prospectId ?? org.prospectId;
  }
  return { outcome: "released" };
}

export function applyConsumeFreeConvert(input: {
  world: FreeConvertWorld;
  prospectId: string;
}): ConsumeFreeConvertResult {
  const org = input.world.organization;
  if (org.status === "consumed" && org.prospectId === input.prospectId) {
    return { outcome: "already" };
  }
  if (org.status !== "reserved" || org.prospectId !== input.prospectId) {
    return { outcome: "ignored" };
  }

  markConsumed(org, input.prospectId);
  return { outcome: "consumed" };
}

export function applyFreeConvertPlanChange(input: {
  world: FreeConvertWorld;
  nextPlan: "free" | "full";
}): FreeConvertOrganizationState {
  void input.nextPlan;
  return input.world.organization;
}
