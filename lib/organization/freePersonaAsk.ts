/**
 * Narrow Free Persona / Audience Ask allowance.
 * Not a generic entitlement layer, token meter, or transcript store.
 * Full accounts are unchanged.
 *
 * Authority is organizations.athena_plan plus organization-scoped
 * consumption state. Separate from FREE-8 Identity Ask, FREE-12 Help Ask,
 * and FREE-13 Audience creation/intelligence.
 */

import type { AthenaPlan } from "@/services/athenaPlan";

export const FREE_PERSONA_ASK_LIMIT = 1;

export const FREE_PERSONA_ASK_RESERVATION_STALE_MS = 120_000;

export const FREE_PERSONA_ASK_CODES = ["FREE_PERSONA_ASK_EXHAUSTED"] as const;

export type FreePersonaAskCode = (typeof FREE_PERSONA_ASK_CODES)[number];

export type FreePersonaAskPresentation = "full" | "available" | "exhausted";

export type FreePersonaAskState = {
  consumedCount: number;
  reservedCount: number;
  reservedAt: number | null;
};

export type FreePersonaAskGateInput = {
  athenaPlan?: AthenaPlan | null;
  consumedCount?: number | null;
  reservedCount?: number | null;
};

const MESSAGES: Record<
  FreePersonaAskCode,
  { httpStatus: 403; message: string }
> = {
  FREE_PERSONA_ASK_EXHAUSTED: {
    httpStatus: 403,
    message: "Athena has answered your audience question.",
  },
};

export class FreePersonaAskError extends Error {
  readonly code: FreePersonaAskCode;
  readonly httpStatus: 403;

  constructor(code: FreePersonaAskCode) {
    const mapped = MESSAGES[code];
    super(mapped.message);
    this.name = "FreePersonaAskError";
    this.code = code;
    this.httpStatus = mapped.httpStatus;
  }
}

export function emptyFreePersonaAskState(): FreePersonaAskState {
  return {
    consumedCount: 0,
    reservedCount: 0,
    reservedAt: null,
  };
}

export function normalizeFreePersonaAskCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

export function resolveFreePersonaAskPresentation(
  input: FreePersonaAskGateInput,
): FreePersonaAskPresentation {
  if (input.athenaPlan !== "free") {
    return "full";
  }
  if (
    normalizeFreePersonaAskCount(input.consumedCount) >= FREE_PERSONA_ASK_LIMIT
  ) {
    return "exhausted";
  }
  return "available";
}

export function isFreePersonaAskComposerOpen(
  presentation: FreePersonaAskPresentation,
): boolean {
  return presentation === "full" || presentation === "available";
}

export function isFreePersonaAskMetered(
  athenaPlan?: AthenaPlan | null,
): boolean {
  return athenaPlan === "free";
}
