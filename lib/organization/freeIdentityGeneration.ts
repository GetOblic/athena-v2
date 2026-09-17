/**
 * Narrow Free Identity generation / cost policy.
 * Not a generic entitlement layer. Full accounts are unchanged.
 *
 * Authority is organizations.athena_plan plus existing Identity / Brain
 * state. First Free Train remains allowed. Starter lifecycle is ignored.
 */

import type { AthenaPlan } from "@/services/athenaPlan";

export const FREE_IDENTITY_GENERATION_CODES = [
  "FREE_IDENTITY_ALREADY_TRAINED",
] as const;

export type FreeIdentityGenerationCode =
  (typeof FREE_IDENTITY_GENERATION_CODES)[number];

export type FreeIdentityGenerationInput = {
  athenaPlan?: AthenaPlan | null;
  trained?: boolean | null;
};

export type FreeIdentityBrainState = {
  brain_status?: string | null;
  master_profile?: unknown;
  brain_last_updated?: string | null;
} | null;

export type FreeIdentityGenerationDecision =
  | { allow: true }
  | {
      allow: false;
      code: FreeIdentityGenerationCode;
      httpStatus: 403;
      message: string;
    };

const MESSAGES: Record<
  FreeIdentityGenerationCode,
  { httpStatus: 403; message: string }
> = {
  FREE_IDENTITY_ALREADY_TRAINED: {
    httpStatus: 403,
    message: "Athena has already learned this business.",
  },
};

export class FreeIdentityGenerationError extends Error {
  readonly code: FreeIdentityGenerationCode;
  readonly httpStatus: 403;

  constructor(code: FreeIdentityGenerationCode) {
    const mapped = MESSAGES[code];
    super(mapped.message);
    this.name = "FreeIdentityGenerationError";
    this.code = code;
    this.httpStatus = mapped.httpStatus;
  }
}

export function isIdentityBrainObtained(
  identity: FreeIdentityBrainState | undefined,
): boolean {
  if (!identity) return false;
  return (
    identity.brain_status === "ready" ||
    Boolean(identity.master_profile) ||
    Boolean(identity.brain_last_updated)
  );
}

export function isFreeIdentityGenerationLocked(
  input: FreeIdentityGenerationInput,
): boolean {
  return !evaluateFreeIdentityGeneration(input).allow;
}

export function evaluateFreeIdentityGeneration(
  input: FreeIdentityGenerationInput,
): FreeIdentityGenerationDecision {
  if (input.athenaPlan !== "free") {
    return { allow: true };
  }

  if (input.trained === true) {
    return deny("FREE_IDENTITY_ALREADY_TRAINED");
  }

  return { allow: true };
}

export function assertFreeIdentityGenerationAllowed(
  input: FreeIdentityGenerationInput,
): void {
  const decision = evaluateFreeIdentityGeneration(input);
  if (!decision.allow) {
    throw new FreeIdentityGenerationError(decision.code);
  }
}

function deny(
  code: FreeIdentityGenerationCode,
): FreeIdentityGenerationDecision {
  const mapped = MESSAGES[code];
  return {
    allow: false,
    code,
    httpStatus: mapped.httpStatus,
    message: mapped.message,
  };
}
