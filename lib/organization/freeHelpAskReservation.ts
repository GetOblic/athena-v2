/**
 * In-process spec of the organization Free Help Ask reservation machine.
 * Mirrors reserve / consume / release SQL so tests can prove serialization,
 * stale recovery, and plan-change durability without a live DB.
 */

import {
  FREE_HELP_ASK_RESERVATION_STALE_MS,
  emptyFreeHelpAskState,
  normalizeFreeHelpAskCount,
  type FreeHelpAskState,
} from "@/lib/organization/freeHelpAsk";

export type ReserveFreeHelpAskMachineResult =
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

export type ConsumeFreeHelpAskMachineResult =
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

export type ReleaseFreeHelpAskMachineResult =
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
  return nowMs - reservedAt >= FREE_HELP_ASK_RESERVATION_STALE_MS;
}

function recoverStaleReservation(
  state: FreeHelpAskState,
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

export function applyReserveFreeHelpAsk(input: {
  state: FreeHelpAskState;
  limit: number;
  nowMs: number;
}): ReserveFreeHelpAskMachineResult {
  const recovered = recoverStaleReservation(input.state, input.nowMs);
  const consumedCount = normalizeFreeHelpAskCount(input.state.consumedCount);
  const reservedCount = normalizeFreeHelpAskCount(input.state.reservedCount);

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

export function applyConsumeFreeHelpAsk(input: {
  state: FreeHelpAskState;
}): ConsumeFreeHelpAskMachineResult {
  const consumedCount = normalizeFreeHelpAskCount(input.state.consumedCount);
  const reservedCount = normalizeFreeHelpAskCount(input.state.reservedCount);
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

export function applyReleaseFreeHelpAsk(input: {
  state: FreeHelpAskState;
}): ReleaseFreeHelpAskMachineResult {
  const consumedCount = normalizeFreeHelpAskCount(input.state.consumedCount);
  const reservedCount = normalizeFreeHelpAskCount(input.state.reservedCount);
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

export function applyFreeHelpAskPlanChange(input: {
  state: FreeHelpAskState;
  nextPlan: "free" | "full";
}): FreeHelpAskState {
  void input.nextPlan;
  return input.state;
}

export function snapshotFreeHelpAskState(
  state: FreeHelpAskState = emptyFreeHelpAskState(),
): FreeHelpAskState {
  return {
    consumedCount: state.consumedCount,
    reservedCount: state.reservedCount,
    reservedAt: state.reservedAt,
  };
}
