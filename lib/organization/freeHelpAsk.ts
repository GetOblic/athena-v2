/**
 * Narrow Free Help / Chat with Athena allowance.
 * Not a generic entitlement layer, token meter, or transcript store.
 * Full accounts are unchanged.
 *
 * Authority is organizations.athena_plan plus organization-scoped
 * consumption state. Separate from FREE-8 Identity Ask.
 */

import type { AthenaPlan } from "@/services/athenaPlan";

export const FREE_HELP_ASK_LIMIT = 1;

export const FREE_HELP_ASK_RESERVATION_STALE_MS = 120_000;

export const FREE_HELP_ASK_CODES = ["FREE_HELP_ASK_EXHAUSTED"] as const;

export type FreeHelpAskCode = (typeof FREE_HELP_ASK_CODES)[number];

export type FreeHelpAskPresentation = "full" | "available" | "exhausted";

export type FreeHelpAskState = {
  consumedCount: number;
  reservedCount: number;
  reservedAt: number | null;
};

export type FreeHelpAskGateInput = {
  athenaPlan?: AthenaPlan | null;
  consumedCount?: number | null;
  reservedCount?: number | null;
};

const MESSAGES: Record<
  FreeHelpAskCode,
  { httpStatus: 403; message: string }
> = {
  FREE_HELP_ASK_EXHAUSTED: {
    httpStatus: 403,
    message: "Athena has answered your question.",
  },
};

export class FreeHelpAskError extends Error {
  readonly code: FreeHelpAskCode;
  readonly httpStatus: 403;

  constructor(code: FreeHelpAskCode) {
    const mapped = MESSAGES[code];
    super(mapped.message);
    this.name = "FreeHelpAskError";
    this.code = code;
    this.httpStatus = mapped.httpStatus;
  }
}

export function emptyFreeHelpAskState(): FreeHelpAskState {
  return {
    consumedCount: 0,
    reservedCount: 0,
    reservedAt: null,
  };
}

export function normalizeFreeHelpAskCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

export function resolveFreeHelpAskPresentation(
  input: FreeHelpAskGateInput,
): FreeHelpAskPresentation {
  if (input.athenaPlan !== "free") {
    return "full";
  }
  if (normalizeFreeHelpAskCount(input.consumedCount) >= FREE_HELP_ASK_LIMIT) {
    return "exhausted";
  }
  return "available";
}

export function isFreeHelpAskComposerOpen(
  presentation: FreeHelpAskPresentation,
): boolean {
  return presentation === "full" || presentation === "available";
}

export function isFreeHelpAskMetered(
  athenaPlan?: AthenaPlan | null,
): boolean {
  return athenaPlan === "free";
}
