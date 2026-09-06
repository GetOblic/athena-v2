import type { GetOblicDirectoryErrorCode } from "@/services/getoblicDirectory/getoblicDirectoryTypes";

export class GetOblicDirectoryError extends Error {
  readonly code: GetOblicDirectoryErrorCode;

  constructor(code: GetOblicDirectoryErrorCode, message: string) {
    super(message);
    this.name = "GetOblicDirectoryError";
    this.code = code;
  }
}

export function getOblicListingActiveClaimError(): GetOblicDirectoryError {
  return new GetOblicDirectoryError(
    "GETOBLIC_LISTING_ACTIVE_CLAIM",
    "This Prospect has an active GetOblic Directory claim and cannot be deleted.",
  );
}
