/**
 * Narrow Free Audience post-creation intelligence-containment policy.
 * Does not replace FREE-13 creation / persist authority. Full is unchanged.
 *
 * Athena Free receives one generated Audience and its resulting intelligence.
 * Once consumed, further audience-intelligence versions are denied.
 */

import {
  resolveFreeAudienceStatus,
  type FreeAudienceStatus,
} from "@/lib/organization/freeAudience";
import type { AthenaPlan } from "@/services/athenaPlan";

export const FREE_AUDIENCE_INTELLIGENCE_CODES = [
  "FREE_AUDIENCE_REGENERATE_DENIED",
] as const;

export type FreeAudienceIntelligenceCode =
  (typeof FREE_AUDIENCE_INTELLIGENCE_CODES)[number];

export const FREE_AUDIENCE_POST_CREATION_ACTIONS = [
  "refresh",
  "think_differently",
  "deep_scrape",
  "observation",
] as const;

export type FreeAudiencePostCreationAction =
  (typeof FREE_AUDIENCE_POST_CREATION_ACTIONS)[number];

export type FreeAudienceIntelligenceAction =
  | FreeAudiencePostCreationAction
  | "generate";

export type FreeAudienceIntelligenceInput = {
  athenaPlan?: AthenaPlan | null;
  audienceStatus?: FreeAudienceStatus | null;
  action?: FreeAudienceIntelligenceAction;
};

export type FreeAudienceIntelligenceDecision =
  | { allow: true }
  | {
      allow: false;
      code: FreeAudienceIntelligenceCode;
      httpStatus: 403;
      message: string;
    };

const MESSAGES: Record<
  FreeAudienceIntelligenceCode,
  { httpStatus: 403; message: string }
> = {
  FREE_AUDIENCE_REGENERATE_DENIED: {
    httpStatus: 403,
    message:
      "This Free audience already has its intelligence. Athena will not generate another version.",
  },
};

export class FreeAudienceIntelligenceError extends Error {
  readonly code: FreeAudienceIntelligenceCode;
  readonly httpStatus: 403;

  constructor(code: FreeAudienceIntelligenceCode) {
    const mapped = MESSAGES[code];
    super(mapped.message);
    this.name = "FreeAudienceIntelligenceError";
    this.code = code;
    this.httpStatus = mapped.httpStatus;
  }
}

export function isFreeAudiencePostCreationAction(
  action?: FreeAudienceIntelligenceAction | null,
): action is FreeAudiencePostCreationAction {
  return (
    action === "refresh" ||
    action === "think_differently" ||
    action === "deep_scrape" ||
    action === "observation"
  );
}

export function evaluateFreeAudienceIntelligence(
  input: FreeAudienceIntelligenceInput,
): FreeAudienceIntelligenceDecision {
  if (input.athenaPlan !== "free") {
    return { allow: true };
  }

  if (isFreeAudiencePostCreationAction(input.action)) {
    return deny("FREE_AUDIENCE_REGENERATE_DENIED");
  }

  if (resolveFreeAudienceStatus(input.audienceStatus) === "consumed") {
    return deny("FREE_AUDIENCE_REGENERATE_DENIED");
  }

  return { allow: true };
}

export function assertFreeAudienceIntelligenceAllowed(
  input: FreeAudienceIntelligenceInput,
): void {
  const decision = evaluateFreeAudienceIntelligence(input);
  if (!decision.allow) {
    throw new FreeAudienceIntelligenceError(decision.code);
  }
}

function deny(
  code: FreeAudienceIntelligenceCode,
): FreeAudienceIntelligenceDecision {
  const mapped = MESSAGES[code];
  return {
    allow: false,
    code,
    httpStatus: mapped.httpStatus,
    message: mapped.message,
  };
}
