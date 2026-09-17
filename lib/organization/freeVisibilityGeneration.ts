/**
 * Narrow Free Visibility generation / cost policy.
 * Not a generic entitlement layer. Full accounts are unchanged.
 */

import {
  isFreeTrained,
  resolveFreeVisibilityStatus,
  type FreeVisibilityStatus,
} from "@/lib/organization/freeVisibility";
import { isFreeUntrained } from "@/lib/organization/freeUntrained";
import type { DefineKind } from "@/lib/home/homeDomainState";
import type { AthenaPlan } from "@/services/athenaPlan";
import type { SeoGenerationType } from "@/services/seo/seoGenerationType";

export const FREE_VISIBILITY_GENERATION_CODES = [
  "FREE_UNTRAINED",
  "FREE_VISIBILITY_TECHNICAL",
  "FREE_VISIBILITY_RESERVED",
  "FREE_VISIBILITY_CONSUMED",
  "FREE_VISIBILITY_CONFLICT",
  "FREE_VISIBILITY_RETRY_ONLY",
  "FREE_VISIBILITY_REGENERATE_DENIED",
] as const;

export type FreeVisibilityGenerationCode =
  (typeof FREE_VISIBILITY_GENERATION_CODES)[number];

export type FreeVisibilityGenerationInput = {
  athenaPlan?: AthenaPlan | null;
  defineKind?: DefineKind | null;
  visibilityStatus?: FreeVisibilityStatus | null;
  generationType?: SeoGenerationType | null;
  action?: "create" | "generate" | "regenerate";
  reportId?: string | null;
  boundReportId?: string | null;
};

export type FreeVisibilityGenerationDecision =
  | { allow: true }
  | {
      allow: false;
      code: FreeVisibilityGenerationCode;
      httpStatus: 403 | 409;
      message: string;
    };

const MESSAGES: Record<
  FreeVisibilityGenerationCode,
  { httpStatus: 403 | 409; message: string }
> = {
  FREE_UNTRAINED: {
    httpStatus: 403,
    message: "Teach Athena about your business before creating a Visibility Strategy.",
  },
  FREE_VISIBILITY_TECHNICAL: {
    httpStatus: 403,
    message: "Free accounts can create a Visibility Strategy analysis only.",
  },
  FREE_VISIBILITY_RESERVED: {
    httpStatus: 409,
    message: "Athena is already creating your Visibility Strategy.",
  },
  FREE_VISIBILITY_CONSUMED: {
    httpStatus: 409,
    message: "This Free account has already used its Visibility Strategy analysis.",
  },
  FREE_VISIBILITY_CONFLICT: {
    httpStatus: 409,
    message: "Athena is already creating your Visibility Strategy.",
  },
  FREE_VISIBILITY_RETRY_ONLY: {
    httpStatus: 403,
    message: "Retry the same Visibility Strategy analysis.",
  },
  FREE_VISIBILITY_REGENERATE_DENIED: {
    httpStatus: 403,
    message: "Free accounts cannot create another Visibility Strategy analysis.",
  },
};

export class FreeVisibilityGenerationError extends Error {
  readonly code: FreeVisibilityGenerationCode;
  readonly httpStatus: 403 | 409;

  constructor(code: FreeVisibilityGenerationCode) {
    const mapped = MESSAGES[code];
    super(mapped.message);
    this.name = "FreeVisibilityGenerationError";
    this.code = code;
    this.httpStatus = mapped.httpStatus;
  }
}

export function evaluateFreeVisibilityGeneration(
  input: FreeVisibilityGenerationInput,
): FreeVisibilityGenerationDecision {
  if (input.athenaPlan !== "free") {
    return { allow: true };
  }

  if (isFreeUntrained(input)) {
    return deny("FREE_UNTRAINED");
  }

  if (input.action === "regenerate") {
    return deny("FREE_VISIBILITY_REGENERATE_DENIED");
  }

  if (input.generationType === "technical") {
    return deny("FREE_VISIBILITY_TECHNICAL");
  }

  const visibilityStatus = resolveFreeVisibilityStatus(input.visibilityStatus);
  const boundReportId = input.boundReportId?.trim() || null;
  const reportId = input.reportId?.trim() || null;

  if (input.action === "generate") {
    if (!reportId || !boundReportId || reportId !== boundReportId) {
      return deny("FREE_VISIBILITY_RETRY_ONLY");
    }
    if (visibilityStatus === "consumed") {
      return deny("FREE_VISIBILITY_CONSUMED");
    }
    return { allow: true };
  }

  if (visibilityStatus === "reserved") {
    return deny("FREE_VISIBILITY_RESERVED");
  }

  if (visibilityStatus === "consumed") {
    return deny("FREE_VISIBILITY_CONSUMED");
  }

  if (isFreeTrained(input) && visibilityStatus === "available") {
    return { allow: true };
  }

  return deny("FREE_VISIBILITY_CONSUMED");
}

export function assertFreeVisibilityGenerationAllowed(
  input: FreeVisibilityGenerationInput,
): void {
  const decision = evaluateFreeVisibilityGeneration(input);
  if (!decision.allow) {
    throw new FreeVisibilityGenerationError(decision.code);
  }
}

function deny(
  code: FreeVisibilityGenerationCode,
): FreeVisibilityGenerationDecision {
  const mapped = MESSAGES[code];
  return {
    allow: false,
    code,
    httpStatus: mapped.httpStatus,
    message: mapped.message,
  };
}
