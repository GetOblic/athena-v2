/**
 * Narrow Free Social Planner generation / cost policy.
 * Not a generic entitlement layer. Full accounts are unchanged.
 */

import {
  isFreeStarterEligible,
  isFreeTrained,
  resolveFreeStarterStatus,
  type FreeStarterStatus,
} from "@/lib/organization/freeStarter";
import { isFreeUntrained } from "@/lib/organization/freeUntrained";
import type { DefineKind } from "@/lib/home/homeDomainState";
import type { AthenaPlan } from "@/services/athenaPlan";

export const FREE_SOCIAL_PLANNER_GENERATION_CODES = [
  "FREE_UNTRAINED",
  "FREE_STARTER_REQUIRED",
  "FREE_STARTER_RESERVED",
  "FREE_STARTER_CONSUMED",
  "FREE_STARTER_CONFLICT",
  "FREE_STARTER_NOT_APPLICABLE",
] as const;

export type FreeSocialPlannerGenerationCode =
  (typeof FREE_SOCIAL_PLANNER_GENERATION_CODES)[number];

export type FreeSocialPlannerGenerationInput = {
  athenaPlan?: AthenaPlan | null;
  defineKind?: DefineKind | null;
  starterStatus?: FreeStarterStatus | null;
  authorizedStarter?: boolean;
};

export type FreeSocialPlannerGenerationDecision =
  | { allow: true }
  | {
      allow: false;
      code: FreeSocialPlannerGenerationCode;
      httpStatus: 403 | 409;
      message: string;
    };

const MESSAGES: Record<
  FreeSocialPlannerGenerationCode,
  { httpStatus: 403 | 409; message: string }
> = {
  FREE_UNTRAINED: {
    httpStatus: 403,
    message: "Teach Athena about your business before creating content.",
  },
  FREE_STARTER_REQUIRED: {
    httpStatus: 403,
    message: "Free accounts create their first content from Home.",
  },
  FREE_STARTER_RESERVED: {
    httpStatus: 409,
    message: "Athena is already creating your first content.",
  },
  FREE_STARTER_CONSUMED: {
    httpStatus: 409,
    message: "This Free account has already used its starter content.",
  },
  FREE_STARTER_CONFLICT: {
    httpStatus: 409,
    message: "Athena is already creating your first content.",
  },
  FREE_STARTER_NOT_APPLICABLE: {
    httpStatus: 403,
    message: "Starter content is only available on Free accounts.",
  },
};

export class FreeSocialPlannerGenerationError extends Error {
  readonly code: FreeSocialPlannerGenerationCode;
  readonly httpStatus: 403 | 409;

  constructor(code: FreeSocialPlannerGenerationCode) {
    const mapped = MESSAGES[code];
    super(mapped.message);
    this.name = "FreeSocialPlannerGenerationError";
    this.code = code;
    this.httpStatus = mapped.httpStatus;
  }
}

export function evaluateFreeSocialPlannerGeneration(
  input: FreeSocialPlannerGenerationInput,
): FreeSocialPlannerGenerationDecision {
  if (input.athenaPlan !== "free") {
    if (input.authorizedStarter) {
      return deny("FREE_STARTER_NOT_APPLICABLE");
    }
    return { allow: true };
  }

  if (isFreeUntrained(input)) {
    return deny("FREE_UNTRAINED");
  }

  const starterStatus = resolveFreeStarterStatus(input.starterStatus);

  if (starterStatus === "reserved") {
    return deny("FREE_STARTER_RESERVED");
  }

  if (starterStatus === "consumed") {
    return deny("FREE_STARTER_CONSUMED");
  }

  if (input.authorizedStarter && isFreeStarterEligible(input)) {
    return { allow: true };
  }

  if (isFreeTrained(input) && starterStatus === "available") {
    return deny("FREE_STARTER_REQUIRED");
  }

  return deny("FREE_STARTER_REQUIRED");
}

export function assertFreeSocialPlannerGenerationAllowed(
  input: FreeSocialPlannerGenerationInput,
): void {
  const decision = evaluateFreeSocialPlannerGeneration(input);
  if (!decision.allow) {
    throw new FreeSocialPlannerGenerationError(decision.code);
  }
}

function deny(
  code: FreeSocialPlannerGenerationCode,
): FreeSocialPlannerGenerationDecision {
  const mapped = MESSAGES[code];
  return {
    allow: false,
    code,
    httpStatus: mapped.httpStatus,
    message: mapped.message,
  };
}
