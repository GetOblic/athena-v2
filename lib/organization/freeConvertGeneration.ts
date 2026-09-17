/**
 * Narrow Free Convert Opportunities generation / cost policy.
 * Not a generic entitlement layer. Full accounts are unchanged.
 */

import {
  isFreeTrained,
  resolveFreeConvertStatus,
  type FreeConvertStatus,
} from "@/lib/organization/freeConvert";
import { isFreeUntrained } from "@/lib/organization/freeUntrained";
import type { DefineKind } from "@/lib/home/homeDomainState";
import type { AthenaPlan } from "@/services/athenaPlan";

export const FREE_CONVERT_GENERATION_CODES = [
  "FREE_UNTRAINED",
  "FREE_CONVERT_RESERVED",
  "FREE_CONVERT_CONSUMED",
  "FREE_CONVERT_CONFLICT",
  "FREE_CONVERT_RETRY_ONLY",
  "FREE_CONVERT_REGENERATE_DENIED",
  "FREE_CONVERT_WEBSITE_REQUIRED",
  "FREE_CONVERT_IMPORT_DENIED",
  "FREE_CONVERT_SYNC_DENIED",
  "FREE_CONVERT_GETOBLIC_DENIED",
] as const;

export type FreeConvertGenerationCode =
  (typeof FREE_CONVERT_GENERATION_CODES)[number];

export type FreeConvertGenerationAction =
  | "create"
  | "import"
  | "generate"
  | "regenerate"
  | "sync_ai"
  | "deep_scrape"
  | "convert_client"
  | "from_getoblic";

export type FreeConvertGenerationInput = {
  athenaPlan?: AthenaPlan | null;
  defineKind?: DefineKind | null;
  convertStatus?: FreeConvertStatus | null;
  action?: FreeConvertGenerationAction;
  prospectId?: string | null;
  boundProspectId?: string | null;
  hasWebsite?: boolean | null;
};

export type FreeConvertGenerationDecision =
  | { allow: true }
  | {
      allow: false;
      code: FreeConvertGenerationCode;
      httpStatus: 403 | 409;
      message: string;
    };

const MESSAGES: Record<
  FreeConvertGenerationCode,
  { httpStatus: 403 | 409; message: string }
> = {
  FREE_UNTRAINED: {
    httpStatus: 403,
    message: "Teach Athena about your business before researching an opportunity.",
  },
  FREE_CONVERT_RESERVED: {
    httpStatus: 409,
    message: "Athena is already researching your Convert Opportunities starter.",
  },
  FREE_CONVERT_CONSUMED: {
    httpStatus: 409,
    message: "This Free account has already used its researched opportunity.",
  },
  FREE_CONVERT_CONFLICT: {
    httpStatus: 409,
    message: "Athena is already researching your Convert Opportunities starter.",
  },
  FREE_CONVERT_RETRY_ONLY: {
    httpStatus: 403,
    message: "Retry the same Convert Opportunities prospect.",
  },
  FREE_CONVERT_REGENERATE_DENIED: {
    httpStatus: 403,
    message: "Free accounts cannot research another Convert Opportunities prospect.",
  },
  FREE_CONVERT_WEBSITE_REQUIRED: {
    httpStatus: 403,
    message: "Add a website before Athena researches this opportunity.",
  },
  FREE_CONVERT_IMPORT_DENIED: {
    httpStatus: 403,
    message: "CSV import is not part of the Free Convert Opportunities starter.",
  },
  FREE_CONVERT_SYNC_DENIED: {
    httpStatus: 403,
    message: "This Free researched opportunity is read-only for additional Athena work.",
  },
  FREE_CONVERT_GETOBLIC_DENIED: {
    httpStatus: 403,
    message: "GetOblic Directory is available with Full Athena.",
  },
};

export class FreeConvertGenerationError extends Error {
  readonly code: FreeConvertGenerationCode;
  readonly httpStatus: 403 | 409;

  constructor(code: FreeConvertGenerationCode) {
    const mapped = MESSAGES[code];
    super(mapped.message);
    this.name = "FreeConvertGenerationError";
    this.code = code;
    this.httpStatus = mapped.httpStatus;
  }
}

export function evaluateFreeConvertGeneration(
  input: FreeConvertGenerationInput,
): FreeConvertGenerationDecision {
  if (input.athenaPlan !== "free") {
    return { allow: true };
  }

  if (input.action === "from_getoblic") {
    return deny("FREE_CONVERT_GETOBLIC_DENIED");
  }

  if (isFreeUntrained(input)) {
    return deny("FREE_UNTRAINED");
  }

  if (input.action === "import") {
    return deny("FREE_CONVERT_IMPORT_DENIED");
  }

  if (input.action === "regenerate" || input.action === "convert_client") {
    return deny("FREE_CONVERT_REGENERATE_DENIED");
  }

  const convertStatus = resolveFreeConvertStatus(input.convertStatus);
  const boundProspectId = input.boundProspectId?.trim() || null;
  const prospectId = input.prospectId?.trim() || null;

  if (input.action === "deep_scrape") {
    if (convertStatus === "consumed") {
      return deny("FREE_CONVERT_REGENERATE_DENIED");
    }
    return deny("FREE_CONVERT_REGENERATE_DENIED");
  }

  if (input.action === "sync_ai") {
    if (convertStatus === "consumed") {
      return deny("FREE_CONVERT_SYNC_DENIED");
    }
    return { allow: true };
  }

  if (input.action === "generate") {
    if (!prospectId || !boundProspectId || prospectId !== boundProspectId) {
      return deny("FREE_CONVERT_RETRY_ONLY");
    }
    if (convertStatus === "consumed") {
      return deny("FREE_CONVERT_CONSUMED");
    }
    if (input.hasWebsite === false) {
      return deny("FREE_CONVERT_WEBSITE_REQUIRED");
    }
    return { allow: true };
  }

  if (convertStatus === "reserved") {
    return deny("FREE_CONVERT_RESERVED");
  }

  if (convertStatus === "consumed") {
    return deny("FREE_CONVERT_CONSUMED");
  }

  if (boundProspectId) {
    return deny("FREE_CONVERT_RETRY_ONLY");
  }

  if (isFreeTrained(input) && convertStatus === "available") {
    return { allow: true };
  }

  return deny("FREE_CONVERT_CONSUMED");
}

export function assertFreeConvertGenerationAllowed(
  input: FreeConvertGenerationInput,
): void {
  const decision = evaluateFreeConvertGeneration(input);
  if (!decision.allow) {
    throw new FreeConvertGenerationError(decision.code);
  }
}

function deny(
  code: FreeConvertGenerationCode,
): FreeConvertGenerationDecision {
  const mapped = MESSAGES[code];
  return {
    allow: false,
    code,
    httpStatus: mapped.httpStatus,
    message: mapped.message,
  };
}
