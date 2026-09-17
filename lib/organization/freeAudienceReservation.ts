/**
 * In-process spec of the organization Free Audience reservation machine.
 * Mirrors reserve / bind / consume / release SQL so tests can prove
 * compare-and-swap, crash recovery, historical persona exhaustion, and
 * plan-change durability without a live DB.
 */

import {
  FREE_AUDIENCE_RESERVATION_STALE_MS,
  resolveFreeAudienceStatus,
  type FreeAudiencePersistedStatus,
  type FreeAudienceStatus,
} from "@/lib/organization/freeAudience";

export type FreeAudiencePersonaSnapshot = {
  id: string;
  organizationId: string;
};

export type FreeAudienceOrganizationState = {
  status: FreeAudienceStatus;
  personaId: string | null;
  reservedAt: number | null;
  reservationToken: string | null;
};

export type FreeAudienceWorld = {
  organization: FreeAudienceOrganizationState;
  personas: Record<string, FreeAudiencePersonaSnapshot>;
};

export type ReserveFreeAudienceResult =
  | {
      outcome: "reserved";
      recovered: boolean;
      reservationToken: string;
      personaId: string | null;
    }
  | { outcome: "already_reserved"; personaId: string | null }
  | { outcome: "already_consumed"; personaId: string | null };

export type BindFreeAudienceResult =
  | { outcome: "bound"; personaId: string }
  | { outcome: "conflict" };

export type ReleaseFreeAudienceResult =
  | { outcome: "released" }
  | { outcome: "ignored" };

export type ConsumeFreeAudienceResult =
  | { outcome: "consumed" }
  | { outcome: "already" }
  | { outcome: "ignored" };

export function emptyFreeAudienceOrganizationState(): FreeAudienceOrganizationState {
  return {
    status: "available",
    personaId: null,
    reservedAt: null,
    reservationToken: null,
  };
}

function persistedStatus(
  status: FreeAudienceStatus,
): FreeAudiencePersistedStatus | null {
  return status === "available" ? null : status;
}

function personaFor(
  world: FreeAudienceWorld,
  organizationId: string,
  personaId: string | null,
): FreeAudiencePersonaSnapshot | null {
  if (!personaId) return null;
  const persona = world.personas[personaId];
  if (!persona || persona.organizationId !== organizationId) {
    return null;
  }
  return persona;
}

function historicalPersona(
  world: FreeAudienceWorld,
  organizationId: string,
): FreeAudiencePersonaSnapshot | null {
  return (
    Object.values(world.personas).find(
      (persona) => persona.organizationId === organizationId,
    ) ?? null
  );
}

function isStale(reservedAt: number | null, nowMs: number): boolean {
  if (reservedAt == null) return true;
  return nowMs - reservedAt >= FREE_AUDIENCE_RESERVATION_STALE_MS;
}

function markConsumed(
  org: FreeAudienceOrganizationState,
  personaId: string,
): void {
  org.status = "consumed";
  org.reservedAt = null;
  org.reservationToken = null;
  org.personaId = personaId;
}

export function applyReserveFreeAudience(input: {
  world: FreeAudienceWorld;
  organizationId: string;
  nowMs: number;
  nextToken: string;
}): ReserveFreeAudienceResult {
  const org = input.world.organization;
  const status = resolveFreeAudienceStatus(org.status);

  if (status === "consumed") {
    return { outcome: "already_consumed", personaId: org.personaId };
  }

  if (status === "reserved") {
    const persona = personaFor(
      input.world,
      input.organizationId,
      org.personaId,
    );

    if (persona) {
      markConsumed(org, persona.id);
      return { outcome: "already_consumed", personaId: persona.id };
    }

    if (org.personaId != null) {
      markConsumed(org, org.personaId);
      return { outcome: "already_consumed", personaId: org.personaId };
    }

    const canRecoverUnbound =
      org.personaId == null && isStale(org.reservedAt, input.nowMs);

    if (!canRecoverUnbound) {
      return { outcome: "already_reserved", personaId: org.personaId };
    }
  }

  const existing = historicalPersona(input.world, input.organizationId);
  if (existing) {
    markConsumed(org, existing.id);
    return { outcome: "already_consumed", personaId: existing.id };
  }

  const recovered = persistedStatus(org.status) === "reserved";
  org.status = "reserved";
  org.personaId = null;
  org.reservedAt = input.nowMs;
  org.reservationToken = input.nextToken;
  return {
    outcome: "reserved",
    recovered,
    reservationToken: input.nextToken,
    personaId: null,
  };
}

export function applyBindFreeAudience(input: {
  world: FreeAudienceWorld;
  reservationToken: string;
  personaId: string;
}): BindFreeAudienceResult {
  const org = input.world.organization;
  if (
    org.status !== "reserved" ||
    org.reservationToken !== input.reservationToken ||
    org.personaId != null
  ) {
    return { outcome: "conflict" };
  }

  org.personaId = input.personaId;
  return { outcome: "bound", personaId: input.personaId };
}

export function applyReleaseFreeAudience(input: {
  world: FreeAudienceWorld;
  personaId?: string | null;
  reservationToken?: string | null;
}): ReleaseFreeAudienceResult {
  const org = input.world.organization;
  if (org.status !== "reserved") {
    return { outcome: "ignored" };
  }

  const personaMatches =
    input.personaId != null && org.personaId === input.personaId;
  const tokenMatches =
    input.reservationToken != null &&
    org.reservationToken === input.reservationToken;
  const unboundTokenRelease = org.personaId == null && tokenMatches;

  if (!personaMatches && !unboundTokenRelease) {
    return { outcome: "ignored" };
  }

  org.status = "available";
  org.reservedAt = null;
  org.reservationToken = null;
  if (personaMatches) {
    org.personaId = input.personaId ?? org.personaId;
  } else {
    org.personaId = null;
  }
  return { outcome: "released" };
}

export function applyConsumeFreeAudience(input: {
  world: FreeAudienceWorld;
  personaId: string;
}): ConsumeFreeAudienceResult {
  const org = input.world.organization;
  if (org.status === "consumed" && org.personaId === input.personaId) {
    return { outcome: "already" };
  }
  if (org.status !== "reserved" || org.personaId !== input.personaId) {
    return { outcome: "ignored" };
  }

  markConsumed(org, input.personaId);
  return { outcome: "consumed" };
}

export function applyFreeAudiencePlanChange(input: {
  world: FreeAudienceWorld;
  nextPlan: "free" | "full";
}): FreeAudienceOrganizationState {
  void input.nextPlan;
  return input.world.organization;
}
