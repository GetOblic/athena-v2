/**
 * Narrow Free Audience generation / persist policy.
 * Not a generic entitlement layer. Full accounts are unchanged.
 */

import {
  isFreeTrained,
  resolveFreeAudienceStatus,
  type FreeAudienceStatus,
} from "@/lib/organization/freeAudience";
import { isFreeUntrained } from "@/lib/organization/freeUntrained";
import type { DefineKind } from "@/lib/home/homeDomainState";
import type { AthenaPlan } from "@/services/athenaPlan";

export const FREE_AUDIENCE_GENERATION_CODES = [
  "FREE_UNTRAINED",
  "FREE_AUDIENCE_RESERVED",
  "FREE_AUDIENCE_CONSUMED",
  "FREE_AUDIENCE_CONFLICT",
  "FREE_AUDIENCE_CSV_DENIED",
] as const;

export type FreeAudienceGenerationCode =
  (typeof FREE_AUDIENCE_GENERATION_CODES)[number];

export type FreeAudienceGenerationAction =
  | "suggest"
  | "persist"
  | "csv"
  | "csv_preview"
  | "prospect";

export type FreeAudienceGenerationInput = {
  athenaPlan?: AthenaPlan | null;
  defineKind?: DefineKind | null;
  audienceStatus?: FreeAudienceStatus | null;
  action?: FreeAudienceGenerationAction;
};

export type FreeAudienceGenerationDecision =
  | { allow: true }
  | {
      allow: false;
      code: FreeAudienceGenerationCode;
      httpStatus: 403 | 409;
      message: string;
    };

const MESSAGES: Record<
  FreeAudienceGenerationCode,
  { httpStatus: 403 | 409; message: string }
> = {
  FREE_UNTRAINED: {
    httpStatus: 403,
    message: "Teach Athena about your business before creating an audience.",
  },
  FREE_AUDIENCE_RESERVED: {
    httpStatus: 409,
    message: "Athena is already preparing your audience.",
  },
  FREE_AUDIENCE_CONSUMED: {
    httpStatus: 409,
    message: "This Free account has already used its audience.",
  },
  FREE_AUDIENCE_CONFLICT: {
    httpStatus: 409,
    message: "Athena is already preparing your audience.",
  },
  FREE_AUDIENCE_CSV_DENIED: {
    httpStatus: 403,
    message: "CSV import is available with Full Athena.",
  },
};

export class FreeAudienceGenerationError extends Error {
  readonly code: FreeAudienceGenerationCode;
  readonly httpStatus: 403 | 409;

  constructor(code: FreeAudienceGenerationCode) {
    const mapped = MESSAGES[code];
    super(mapped.message);
    this.name = "FreeAudienceGenerationError";
    this.code = code;
    this.httpStatus = mapped.httpStatus;
  }
}

export function evaluateFreeAudienceGeneration(
  input: FreeAudienceGenerationInput,
): FreeAudienceGenerationDecision {
  if (input.athenaPlan !== "free") {
    return { allow: true };
  }

  if (input.action === "csv" || input.action === "csv_preview") {
    return deny("FREE_AUDIENCE_CSV_DENIED");
  }

  if (isFreeUntrained(input)) {
    return deny("FREE_UNTRAINED");
  }

  const audienceStatus = resolveFreeAudienceStatus(input.audienceStatus);

  if (input.action === "persist") {
    if (audienceStatus === "consumed") {
      return deny("FREE_AUDIENCE_CONSUMED");
    }
    if (isFreeTrained(input)) {
      return { allow: true };
    }
    return deny("FREE_AUDIENCE_CONSUMED");
  }

  if (audienceStatus === "reserved") {
    return deny("FREE_AUDIENCE_RESERVED");
  }

  if (audienceStatus === "consumed") {
    return deny("FREE_AUDIENCE_CONSUMED");
  }

  if (isFreeTrained(input) && audienceStatus === "available") {
    return { allow: true };
  }

  return deny("FREE_AUDIENCE_CONSUMED");
}

export function assertFreeAudienceGenerationAllowed(
  input: FreeAudienceGenerationInput,
): void {
  const decision = evaluateFreeAudienceGeneration(input);
  if (!decision.allow) {
    throw new FreeAudienceGenerationError(decision.code);
  }
}

function deny(
  code: FreeAudienceGenerationCode,
): FreeAudienceGenerationDecision {
  const mapped = MESSAGES[code];
  return {
    allow: false,
    code,
    httpStatus: mapped.httpStatus,
    message: mapped.message,
  };
}
