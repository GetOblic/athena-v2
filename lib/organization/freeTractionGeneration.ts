/**
 * Narrow Free Traction generation / cost policy.
 * Not a generic entitlement layer. Full accounts are unchanged.
 */

import {
  isFreeTrained,
  resolveFreeTractionStatus,
  type FreeTractionStatus,
} from "@/lib/organization/freeTraction";
import { isFreeUntrained } from "@/lib/organization/freeUntrained";
import type { DefineKind } from "@/lib/home/homeDomainState";
import type { AthenaPlan } from "@/services/athenaPlan";

export const FREE_TRACTION_GENERATION_CODES = [
  "FREE_UNTRAINED",
  "FREE_TRACTION_RESERVED",
  "FREE_TRACTION_CONSUMED",
  "FREE_TRACTION_CONFLICT",
  "FREE_TRACTION_RETRY_ONLY",
  "FREE_TRACTION_REGENERATE_DENIED",
] as const;

export type FreeTractionGenerationCode =
  (typeof FREE_TRACTION_GENERATION_CODES)[number];

export type FreeTractionGenerationInput = {
  athenaPlan?: AthenaPlan | null;
  defineKind?: DefineKind | null;
  tractionStatus?: FreeTractionStatus | null;
  action?: "create" | "generate" | "regenerate";
  campaignId?: string | null;
  boundCampaignId?: string | null;
};

export type FreeTractionGenerationDecision =
  | { allow: true }
  | {
      allow: false;
      code: FreeTractionGenerationCode;
      httpStatus: 403 | 409;
      message: string;
    };

const MESSAGES: Record<
  FreeTractionGenerationCode,
  { httpStatus: 403 | 409; message: string }
> = {
  FREE_UNTRAINED: {
    httpStatus: 403,
    message: "Teach Athena about your business before creating an advertising campaign.",
  },
  FREE_TRACTION_RESERVED: {
    httpStatus: 409,
    message: "Athena is already creating your advertising campaign.",
  },
  FREE_TRACTION_CONSUMED: {
    httpStatus: 409,
    message: "This Free account has already used its advertising campaign.",
  },
  FREE_TRACTION_CONFLICT: {
    httpStatus: 409,
    message: "Athena is already creating your advertising campaign.",
  },
  FREE_TRACTION_RETRY_ONLY: {
    httpStatus: 403,
    message: "Retry the same advertising campaign.",
  },
  FREE_TRACTION_REGENERATE_DENIED: {
    httpStatus: 403,
    message: "Free accounts cannot create another advertising campaign.",
  },
};

export class FreeTractionGenerationError extends Error {
  readonly code: FreeTractionGenerationCode;
  readonly httpStatus: 403 | 409;

  constructor(code: FreeTractionGenerationCode) {
    const mapped = MESSAGES[code];
    super(mapped.message);
    this.name = "FreeTractionGenerationError";
    this.code = code;
    this.httpStatus = mapped.httpStatus;
  }
}

export function evaluateFreeTractionGeneration(
  input: FreeTractionGenerationInput,
): FreeTractionGenerationDecision {
  if (input.athenaPlan !== "free") {
    return { allow: true };
  }

  if (isFreeUntrained(input)) {
    return deny("FREE_UNTRAINED");
  }

  if (input.action === "regenerate") {
    return deny("FREE_TRACTION_REGENERATE_DENIED");
  }

  const tractionStatus = resolveFreeTractionStatus(input.tractionStatus);
  const boundCampaignId = input.boundCampaignId?.trim() || null;
  const campaignId = input.campaignId?.trim() || null;

  if (input.action === "generate") {
    if (!campaignId || !boundCampaignId || campaignId !== boundCampaignId) {
      return deny("FREE_TRACTION_RETRY_ONLY");
    }
    if (tractionStatus === "consumed") {
      return deny("FREE_TRACTION_CONSUMED");
    }
    return { allow: true };
  }

  if (tractionStatus === "reserved") {
    return deny("FREE_TRACTION_RESERVED");
  }

  if (tractionStatus === "consumed") {
    return deny("FREE_TRACTION_CONSUMED");
  }

  if (isFreeTrained(input) && tractionStatus === "available") {
    return { allow: true };
  }

  return deny("FREE_TRACTION_CONSUMED");
}

export function assertFreeTractionGenerationAllowed(
  input: FreeTractionGenerationInput,
): void {
  const decision = evaluateFreeTractionGeneration(input);
  if (!decision.allow) {
    throw new FreeTractionGenerationError(decision.code);
  }
}

function deny(
  code: FreeTractionGenerationCode,
): FreeTractionGenerationDecision {
  const mapped = MESSAGES[code];
  return {
    allow: false,
    code,
    httpStatus: mapped.httpStatus,
    message: mapped.message,
  };
}
