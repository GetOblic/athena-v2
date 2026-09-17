/**
 * In-process spec of the organization Free Identity Ask reservation machine.
 * Mirrors reserve / consume / release SQL so tests can prove serialization,
 * stale recovery, and plan-change durability without a live DB.
 */

import {
  FREE_IDENTITY_ASK_RESERVATION_STALE_MS,
  emptyFreeIdentityAskState,
  normalizeFreeIdentityAskCount,
  type FreeIdentityAskState,
} from "@/lib/organization/freeIdentityAsk";

export type ReserveFreeIdentityAskMachineResult =
  | {
      outcome: "reserved";
      recovered: boolean;
      consumedCount: number;
      reservedCount: number;
    }
  | {
      outcome: "denied";
      reason: "exhausted" | "in_flight";
      recovered: boolean;
      consumedCount: number;
      reservedCount: number;
    };

export type ConsumeFreeIdentityAskMachineResult =
  | {
      outcome: "consumed";
      consumedCount: number;
      reservedCount: number;
    }
  | {
      outcome: "ignored";
      consumedCount: number;
      reservedCount: number;
    };

export type ReleaseFreeIdentityAskMachineResult =
  | {
      outcome: "released";
      consumedCount: number;
      reservedCount: number;
    }
  | {
      outcome: "ignored";
      consumedCount: number;
      reservedCount: number;
    };

function isStale(reservedAt: number | null, nowMs: number): boolean {
  if (reservedAt == null) return true;
  return nowMs - reservedAt >= FREE_IDENTITY_ASK_RESERVATION_STALE_MS;
}

function recoverStaleReservation(
  state: FreeIdentityAskState,
  nowMs: number,
): boolean {
  if (state.reservedCount <= 0) {
    return false;
  }
  if (!isStale(state.reservedAt, nowMs)) {
    return false;
  }
  state.reservedCount = 0;
  state.reservedAt = null;
  return true;
}

export function applyReserveFreeIdentityAsk(input: {
  state: FreeIdentityAskState;
  limit: number;
  nowMs: number;
}): ReserveFreeIdentityAskMachineResult {
  const recovered = recoverStaleReservation(input.state, input.nowMs);
  const consumedCount = normalizeFreeIdentityAskCount(input.state.consumedCount);
  const reservedCount = normalizeFreeIdentityAskCount(input.state.reservedCount);

  if (consumedCount + reservedCount >= input.limit) {
    return {
      outcome: "denied",
      reason: consumedCount >= input.limit ? "exhausted" : "in_flight",
      recovered,
      consumedCount,
      reservedCount,
    };
  }

  input.state.consumedCount = consumedCount;
  input.state.reservedCount = reservedCount + 1;
  input.state.reservedAt = input.nowMs;
  return {
    outcome: "reserved",
    recovered,
    consumedCount,
    reservedCount: input.state.reservedCount,
  };
}

export function applyConsumeFreeIdentityAsk(input: {
  state: FreeIdentityAskState;
}): ConsumeFreeIdentityAskMachineResult {
  const consumedCount = normalizeFreeIdentityAskCount(input.state.consumedCount);
  const reservedCount = normalizeFreeIdentityAskCount(input.state.reservedCount);
  if (reservedCount <= 0) {
    return {
      outcome: "ignored",
      consumedCount,
      reservedCount,
    };
  }

  input.state.reservedCount = reservedCount - 1;
  input.state.consumedCount = consumedCount + 1;
  if (input.state.reservedCount === 0) {
    input.state.reservedAt = null;
  }
  return {
    outcome: "consumed",
    consumedCount: input.state.consumedCount,
    reservedCount: input.state.reservedCount,
  };
}

export function applyReleaseFreeIdentityAsk(input: {
  state: FreeIdentityAskState;
}): ReleaseFreeIdentityAskMachineResult {
  const consumedCount = normalizeFreeIdentityAskCount(input.state.consumedCount);
  const reservedCount = normalizeFreeIdentityAskCount(input.state.reservedCount);
  if (reservedCount <= 0) {
    return {
      outcome: "ignored",
      consumedCount,
      reservedCount,
    };
  }

  input.state.reservedCount = reservedCount - 1;
  if (input.state.reservedCount === 0) {
    input.state.reservedAt = null;
  }
  return {
    outcome: "released",
    consumedCount: input.state.consumedCount,
    reservedCount: input.state.reservedCount,
  };
}

export function applyFreeIdentityAskPlanChange(input: {
  state: FreeIdentityAskState;
  nextPlan: "free" | "full";
}): FreeIdentityAskState {
  void input.nextPlan;
  return input.state;
}

export function snapshotFreeIdentityAskState(
  state: FreeIdentityAskState = emptyFreeIdentityAskState(),
): FreeIdentityAskState {
  return {
    consumedCount: state.consumedCount,
    reservedCount: state.reservedCount,
    reservedAt: state.reservedAt,
  };
}
