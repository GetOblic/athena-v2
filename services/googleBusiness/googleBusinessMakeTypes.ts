/**
 * Server-only Google business Make contracts.
 * Never import this module from client components.
 * Never log ATHENA_V2_GOOGLE_BUSINESS_MAKE_WEBHOOK_URL or the full query.
 */

import { GOOGLE_BUSINESS_ADD_ACTION } from "@/lib/googlePlaces/googlePlacesTypes";

export { GOOGLE_BUSINESS_ADD_ACTION };

export const GOOGLE_BUSINESS_MAKE_WEBHOOK_ENV =
  "ATHENA_V2_GOOGLE_BUSINESS_MAKE_WEBHOOK_URL" as const;

export const GOOGLE_BUSINESS_MAKE_TIMEOUT_MS = 12_000;

export const GOOGLE_BUSINESS_MAKE_ERROR_CODES = [
  "GOOGLE_BUSINESS_INVALID_PAYLOAD",
  "GOOGLE_BUSINESS_AUTHOR_MAPPING_MISSING",
  "GOOGLE_BUSINESS_WEBHOOK_NOT_CONFIGURED",
  "GOOGLE_BUSINESS_TIMEOUT",
  "GOOGLE_BUSINESS_REMOTE_FAILED",
  "GOOGLE_BUSINESS_INVALID_RESPONSE",
  "GOOGLE_BUSINESS_GOOGLE_ID_MISMATCH",
  "GOOGLE_BUSINESS_AUTHOR_MISMATCH",
] as const;

export type GoogleBusinessMakeErrorCode =
  (typeof GOOGLE_BUSINESS_MAKE_ERROR_CODES)[number];

export type GoogleBusinessMakeResult = {
  wordpress_listing_id: number;
  google_id: string;
};

export class GoogleBusinessMakeError extends Error {
  readonly code: GoogleBusinessMakeErrorCode;
  readonly status: number;

  constructor(
    code: GoogleBusinessMakeErrorCode,
    message: string,
    status = googleBusinessMakeErrorStatus(code),
  ) {
    super(message);
    this.name = "GoogleBusinessMakeError";
    this.code = code;
    this.status = status;
  }
}

export function googleBusinessMakeErrorStatus(
  code: GoogleBusinessMakeErrorCode,
): number {
  switch (code) {
    case "GOOGLE_BUSINESS_INVALID_PAYLOAD":
      return 400;
    case "GOOGLE_BUSINESS_AUTHOR_MAPPING_MISSING":
    case "GOOGLE_BUSINESS_GOOGLE_ID_MISMATCH":
    case "GOOGLE_BUSINESS_AUTHOR_MISMATCH":
      return 409;
    case "GOOGLE_BUSINESS_WEBHOOK_NOT_CONFIGURED":
      return 503;
    case "GOOGLE_BUSINESS_TIMEOUT":
    case "GOOGLE_BUSINESS_REMOTE_FAILED":
    case "GOOGLE_BUSINESS_INVALID_RESPONSE":
      return 502;
    default:
      return 502;
  }
}

export function googleBusinessMakeErrorMessage(
  code: GoogleBusinessMakeErrorCode,
): string {
  switch (code) {
    case "GOOGLE_BUSINESS_INVALID_PAYLOAD":
      return "Athena couldn’t add this Google business because the selection is incomplete.";
    case "GOOGLE_BUSINESS_AUTHOR_MAPPING_MISSING":
      return "This workspace isn’t mapped to a GetOblic account yet.";
    case "GOOGLE_BUSINESS_GOOGLE_ID_MISMATCH":
      return "Athena couldn’t add this Google business because the listing identity didn’t match.";
    case "GOOGLE_BUSINESS_AUTHOR_MISMATCH":
      return "This business is already being pursued.";
    case "GOOGLE_BUSINESS_WEBHOOK_NOT_CONFIGURED":
      return "Athena couldn’t add this Google business because the service isn’t configured.";
    case "GOOGLE_BUSINESS_TIMEOUT":
      return "Athena couldn’t add this Google business in time. Try again.";
    case "GOOGLE_BUSINESS_REMOTE_FAILED":
    case "GOOGLE_BUSINESS_INVALID_RESPONSE":
      return "Athena couldn’t add this Google business. Try again.";
    default:
      return "Athena couldn’t add this Google business. Try again.";
  }
}
