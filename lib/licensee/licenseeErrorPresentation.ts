import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";

const CODE_TO_ERROR_KEY = {
  UNAUTHORIZED: "unauthorized",
  INVALID_JSON: "validation",
  INVALID_BODY: "validation",
  INVALID_ESTIMATE_REQUEST: "validation",
  VALIDATION_ERROR: "validation",
  NOT_FOUND: "notFound",
  NOT_MASTER: "forbidden",
  MISSING_ORG: "validation",
  UNKNOWN_ACTION: "generic",
  HANDOFF_FAILED: "openAthenaFailed",
  LIST_FAILED: "historyLoadFailed",
  CREATE_FAILED: "createEstimateFailed",
  GET_FAILED: "openEstimateFailed",
  HIDE_FAILED: "hideFailed",
  REGENERATE_FAILED: "regenerateFailed",
  PROSPECT_TARGET_UNAVAILABLE: "prospectUnavailableRegenerate",
  ESTIMATE_INSTRUCTION_NOT_CONFIGURED: "methodologyUnavailable",
  NOT_READY: "estimateNotReady",
  CONVERSATION_FAILED: "conversationFailed",
  TRANSPORT_ERROR: "conversationTransport",
  TIMEOUT: "conversationTransport",
  RATE_LIMITED: "generic",
  INVALID_LANGUAGE: "invalidLanguage",
  INVALID_BUSINESS_NAME: "invalidBusinessName",
  INVALID_EMAIL: "invalidEmail",
  MASTER_EMAIL_REJECTED: "masterEmailRejected",
  EXISTING_ACCOUNT_REQUIRES_CONFIRMATION: "existingRequiresConfirmation",
  SUPER_ADMIN_EMAIL_REJECTED: "superAdminEmailRejected",
  NOTES_TOO_LONG: "noteSaveFailed",
  DISPLAY_NAME_TOO_LONG: "displayNameSaveFailed",
  OWN_COMPANY_ALREADY_DESIGNATED: "setMyCompanyFailed",
  LicenseeAccessError: "forbidden",
  AccountAccessDeniedError: "forbidden",
} as const satisfies Record<string, keyof LicenseeMessages["errors"] | "methodologyUnavailable">;

export function licenseeErrorMessage(
  messages: LicenseeMessages,
  code: string | undefined,
  fallback?: string,
): string {
  if (code === "ESTIMATE_INSTRUCTION_NOT_CONFIGURED") {
    return messages.estimateAskAthena.methodologyUnavailable;
  }
  if (code && code in CODE_TO_ERROR_KEY) {
    const key = CODE_TO_ERROR_KEY[code as keyof typeof CODE_TO_ERROR_KEY];
    if (key === "methodologyUnavailable") {
      return messages.estimateAskAthena.methodologyUnavailable;
    }
    return messages.errors[key];
  }
  return fallback || messages.errors.generic;
}

export function restoreToProspectLocalizedMessage(
  status: number,
  messages: LicenseeMessages,
): string {
  if (status === 401 || status === 403) {
    return messages.errors.restoreForbidden;
  }
  if (status === 409) {
    return messages.errors.restoreConflict;
  }
  return messages.errors.restoreFailed;
}
