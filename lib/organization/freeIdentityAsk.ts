/**
 * Narrow Free Identity Ask allowance.
 * Not a generic entitlement layer, token meter, or transcript store.
 * Full accounts are unchanged.
 *
 * Authority is organizations.athena_plan plus existing Identity Brain
 * readiness from FREE-7, plus organization-scoped consumption state.
 */

import { isIdentityBrainObtained } from "@/lib/organization/freeIdentityGeneration";
import type { AthenaPlan } from "@/services/athenaPlan";

export const FREE_IDENTITY_ASK_LIMIT = 3;

export const FREE_IDENTITY_ASK_RESERVATION_STALE_MS = 120_000;

export const FREE_IDENTITY_ASK_CODES = [
  "FREE_IDENTITY_ASK_UNTRAINED",
  "FREE_IDENTITY_ASK_EXHAUSTED",
] as const;

export type FreeIdentityAskCode = (typeof FREE_IDENTITY_ASK_CODES)[number];

export type FreeIdentityAskPresentation =
  | "full"
  | "untrained"
  | "available"
  | "exhausted";

export type FreeIdentityAskState = {
  consumedCount: number;
  reservedCount: number;
  reservedAt: number | null;
};

export type FreeIdentityAskGateInput = {
  athenaPlan?: AthenaPlan | null;
  trained?: boolean | null;
  consumedCount?: number | null;
  reservedCount?: number | null;
};

const MESSAGES: Record<
  FreeIdentityAskCode,
  { httpStatus: 403; message: string }
> = {
  FREE_IDENTITY_ASK_UNTRAINED: {
    httpStatus: 403,
    message: "Teach Athena about your business first.",
  },
  FREE_IDENTITY_ASK_EXHAUSTED: {
    httpStatus: 403,
    message: "Athena has shown you what it understands.",
  },
};

export class FreeIdentityAskError extends Error {
  readonly code: FreeIdentityAskCode;
  readonly httpStatus: 403;

  constructor(code: FreeIdentityAskCode) {
    const mapped = MESSAGES[code];
    super(mapped.message);
    this.name = "FreeIdentityAskError";
    this.code = code;
    this.httpStatus = mapped.httpStatus;
  }
}

export function emptyFreeIdentityAskState(): FreeIdentityAskState {
  return {
    consumedCount: 0,
    reservedCount: 0,
    reservedAt: null,
  };
}

export function normalizeFreeIdentityAskCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

export function isFreeIdentityAskTrained(input: {
  trained?: boolean | null;
  identity?: Parameters<typeof isIdentityBrainObtained>[0];
}): boolean {
  if (input.trained === true) {
    return true;
  }
  if (input.trained === false) {
    return false;
  }
  return isIdentityBrainObtained(input.identity);
}

export function resolveFreeIdentityAskPresentation(
  input: FreeIdentityAskGateInput,
): FreeIdentityAskPresentation {
  if (input.athenaPlan !== "free") {
    return "full";
  }
  if (!isFreeIdentityAskTrained({ trained: input.trained })) {
    return "untrained";
  }
  if (
    normalizeFreeIdentityAskCount(input.consumedCount) >= FREE_IDENTITY_ASK_LIMIT
  ) {
    return "exhausted";
  }
  return "available";
}

export function isFreeIdentityAskComposerOpen(
  presentation: FreeIdentityAskPresentation,
): boolean {
  return presentation === "full" || presentation === "available";
}

export function isFreeIdentityAskMetered(
  athenaPlan?: AthenaPlan | null,
): boolean {
  return athenaPlan === "free";
}
