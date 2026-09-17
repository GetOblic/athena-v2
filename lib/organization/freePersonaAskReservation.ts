/**
 * In-process spec of the organization Free Persona Ask reservation machine.
 * Mirrors reserve / consume / release SQL so tests can prove serialization,
 * stale recovery, and plan-change durability without a live DB.
 */

import {
  FREE_PERSONA_ASK_RESERVATION_STALE_MS,
  emptyFreePersonaAskState,
  normalizeFreePersonaAskCount,
  type FreePersonaAskState,
} from "@/lib/organization/freePersonaAsk";

export type ReserveFreePersonaAskMachineResult =
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

export type ConsumeFreePersonaAskMachineResult =
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

export type ReleaseFreePersonaAskMachineResult =
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
  return nowMs - reservedAt >= FREE_PERSONA_ASK_RESERVATION_STALE_MS;
}

function recoverStaleReservation(
  state: FreePersonaAskState,
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

export function applyReserveFreePersonaAsk(input: {
  state: FreePersonaAskState;
  limit: number;
  nowMs: number;
}): ReserveFreePersonaAskMachineResult {
  const recovered = recoverStaleReservation(input.state, input.nowMs);
  const consumedCount = normalizeFreePersonaAskCount(input.state.consumedCount);
  const reservedCount = normalizeFreePersonaAskCount(input.state.reservedCount);

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

export function applyConsumeFreePersonaAsk(input: {
  state: FreePersonaAskState;
}): ConsumeFreePersonaAskMachineResult {
  const consumedCount = normalizeFreePersonaAskCount(input.state.consumedCount);
  const reservedCount = normalizeFreePersonaAskCount(input.state.reservedCount);
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

export function applyReleaseFreePersonaAsk(input: {
  state: FreePersonaAskState;
}): ReleaseFreePersonaAskMachineResult {
  const consumedCount = normalizeFreePersonaAskCount(input.state.consumedCount);
  const reservedCount = normalizeFreePersonaAskCount(input.state.reservedCount);
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

export function applyFreePersonaAskPlanChange(input: {
  state: FreePersonaAskState;
  nextPlan: "free" | "full";
}): FreePersonaAskState {
  void input.nextPlan;
  return input.state;
}

export function snapshotFreePersonaAskState(
  state: FreePersonaAskState = emptyFreePersonaAskState(),
): FreePersonaAskState {
  return {
    consumedCount: state.consumedCount,
    reservedCount: state.reservedCount,
    reservedAt: state.reservedAt,
  };
}
