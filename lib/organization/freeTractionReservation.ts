/**
 * In-process spec of the organization Free Traction reservation machine.
 * Mirrors reserve / bind / consume / release SQL so tests can prove
 * compare-and-swap, crash recovery, historical Ready exhaustion, and
 * plan-change durability without a live DB.
 */

import {
  FREE_TRACTION_RESERVATION_STALE_MS,
  resolveFreeTractionStatus,
  type FreeTractionPersistedStatus,
  type FreeTractionStatus,
} from "@/lib/organization/freeTraction";

export type FreeTractionCampaignSnapshot = {
  id: string;
  organizationId: string;
  status: "Queued" | "Processing" | "Ready" | "Processing Failed";
};

export type FreeTractionJobSnapshot = {
  campaignId: string;
  organizationId: string;
  status: "queued" | "processing" | "retryable" | "completed" | "failed";
};

export type FreeTractionOrganizationState = {
  status: FreeTractionStatus;
  campaignId: string | null;
  reservedAt: number | null;
  reservationToken: string | null;
};

export type FreeTractionWorld = {
  organization: FreeTractionOrganizationState;
  campaigns: Record<string, FreeTractionCampaignSnapshot>;
  jobs: FreeTractionJobSnapshot[];
};

export type ReserveFreeTractionResult =
  | {
      outcome: "reserved";
      recovered: boolean;
      reservationToken: string;
      campaignId: string | null;
    }
  | { outcome: "already_reserved"; campaignId: string | null }
  | { outcome: "already_consumed"; campaignId: string | null };

export type BindFreeTractionResult =
  | { outcome: "bound"; campaignId: string }
  | { outcome: "conflict" };

export type ReleaseFreeTractionResult =
  | { outcome: "released" }
  | { outcome: "ignored" };

export type ConsumeFreeTractionResult =
  | { outcome: "consumed" }
  | { outcome: "already" }
  | { outcome: "ignored" };

export function emptyFreeTractionOrganizationState(): FreeTractionOrganizationState {
  return {
    status: "available",
    campaignId: null,
    reservedAt: null,
    reservationToken: null,
  };
}

function persistedStatus(
  status: FreeTractionStatus,
): FreeTractionPersistedStatus | null {
  return status === "available" ? null : status;
}

function hasActiveJobForOrganization(
  world: FreeTractionWorld,
  organizationId: string,
  campaignId: string | null,
): boolean {
  if (!campaignId) return false;
  return world.jobs.some(
    (job) =>
      job.campaignId === campaignId &&
      job.organizationId === organizationId &&
      (job.status === "queued" ||
        job.status === "processing" ||
        job.status === "retryable"),
  );
}

function campaignFor(
  world: FreeTractionWorld,
  organizationId: string,
  campaignId: string | null,
): FreeTractionCampaignSnapshot | null {
  if (!campaignId) return null;
  const campaign = world.campaigns[campaignId];
  if (!campaign || campaign.organizationId !== organizationId) {
    return null;
  }
  return campaign;
}

function historicalReadyCampaign(
  world: FreeTractionWorld,
  organizationId: string,
): FreeTractionCampaignSnapshot | null {
  return (
    Object.values(world.campaigns).find(
      (campaign) =>
        campaign.organizationId === organizationId && campaign.status === "Ready",
    ) ?? null
  );
}

function hasHistoricalInFlight(
  world: FreeTractionWorld,
  organizationId: string,
): boolean {
  return Object.values(world.campaigns).some(
    (campaign) =>
      campaign.organizationId === organizationId &&
      (campaign.status === "Queued" || campaign.status === "Processing"),
  );
}

function isStale(reservedAt: number | null, nowMs: number): boolean {
  if (reservedAt == null) return true;
  return nowMs - reservedAt >= FREE_TRACTION_RESERVATION_STALE_MS;
}

function markConsumed(
  org: FreeTractionOrganizationState,
  campaignId: string,
): void {
  org.status = "consumed";
  org.reservedAt = null;
  org.reservationToken = null;
  org.campaignId = campaignId;
}

export function applyReserveFreeTraction(input: {
  world: FreeTractionWorld;
  organizationId: string;
  nowMs: number;
  nextToken: string;
}): ReserveFreeTractionResult {
  const org = input.world.organization;
  const status = resolveFreeTractionStatus(org.status);

  if (status === "consumed") {
    return { outcome: "already_consumed", campaignId: org.campaignId };
  }

  if (status === "reserved") {
    const campaign = campaignFor(
      input.world,
      input.organizationId,
      org.campaignId,
    );

    if (campaign?.status === "Ready") {
      markConsumed(org, campaign.id);
      return { outcome: "already_consumed", campaignId: campaign.id };
    }

    if (campaign?.status === "Processing Failed") {
      return { outcome: "already_reserved", campaignId: org.campaignId };
    }

    const activeJob = hasActiveJobForOrganization(
      input.world,
      input.organizationId,
      org.campaignId,
    );

    const canRecoverUnbound =
      org.campaignId == null && isStale(org.reservedAt, input.nowMs);
    const canRecoverUnenqueued =
      org.campaignId != null &&
      !activeJob &&
      isStale(org.reservedAt, input.nowMs);

    if (!canRecoverUnbound && !canRecoverUnenqueued) {
      return { outcome: "already_reserved", campaignId: org.campaignId };
    }

    if (canRecoverUnenqueued && org.campaignId) {
      org.status = "reserved";
      org.reservedAt = input.nowMs;
      org.reservationToken = input.nextToken;
      return {
        outcome: "reserved",
        recovered: true,
        reservationToken: input.nextToken,
        campaignId: org.campaignId,
      };
    }
  }

  const ready = historicalReadyCampaign(input.world, input.organizationId);
  if (ready) {
    markConsumed(org, ready.id);
    return { outcome: "already_consumed", campaignId: ready.id };
  }

  if (hasHistoricalInFlight(input.world, input.organizationId)) {
    return { outcome: "already_reserved", campaignId: org.campaignId };
  }

  const lastCampaign = campaignFor(
    input.world,
    input.organizationId,
    org.campaignId,
  );
  const reuseFailed = lastCampaign?.status === "Processing Failed";

  const recovered = persistedStatus(org.status) === "reserved" || reuseFailed;
  org.status = "reserved";
  org.campaignId = reuseFailed ? org.campaignId : null;
  org.reservedAt = input.nowMs;
  org.reservationToken = input.nextToken;
  return {
    outcome: "reserved",
    recovered,
    reservationToken: input.nextToken,
    campaignId: org.campaignId,
  };
}

export function applyBindFreeTraction(input: {
  world: FreeTractionWorld;
  reservationToken: string;
  campaignId: string;
}): BindFreeTractionResult {
  const org = input.world.organization;
  if (
    org.status !== "reserved" ||
    org.reservationToken !== input.reservationToken ||
    org.campaignId != null
  ) {
    return { outcome: "conflict" };
  }

  org.campaignId = input.campaignId;
  return { outcome: "bound", campaignId: input.campaignId };
}

export function applyReleaseFreeTraction(input: {
  world: FreeTractionWorld;
  campaignId?: string | null;
  reservationToken?: string | null;
}): ReleaseFreeTractionResult {
  const org = input.world.organization;
  if (org.status !== "reserved") {
    return { outcome: "ignored" };
  }

  const campaignMatches =
    input.campaignId != null && org.campaignId === input.campaignId;
  const tokenMatches =
    input.reservationToken != null &&
    org.reservationToken === input.reservationToken;
  const unboundTokenRelease = org.campaignId == null && tokenMatches;

  if (!campaignMatches && !unboundTokenRelease) {
    return { outcome: "ignored" };
  }

  org.status = "available";
  org.reservedAt = null;
  org.reservationToken = null;
  if (campaignMatches) {
    org.campaignId = input.campaignId ?? org.campaignId;
  }
  return { outcome: "released" };
}

export function applyConsumeFreeTraction(input: {
  world: FreeTractionWorld;
  campaignId: string;
}): ConsumeFreeTractionResult {
  const org = input.world.organization;
  if (org.status === "consumed" && org.campaignId === input.campaignId) {
    return { outcome: "already" };
  }
  if (org.status !== "reserved" || org.campaignId !== input.campaignId) {
    return { outcome: "ignored" };
  }

  markConsumed(org, input.campaignId);
  return { outcome: "consumed" };
}

export function applyFreeTractionPlanChange(input: {
  world: FreeTractionWorld;
  nextPlan: "free" | "full";
}): FreeTractionOrganizationState {
  void input.nextPlan;
  return input.world.organization;
}
