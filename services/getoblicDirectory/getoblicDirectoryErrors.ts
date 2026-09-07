import type {
  GetOblicDirectoryErrorCode,
  GetOblicListingLink,
} from "@/services/getoblicDirectory/getoblicDirectoryTypes";

export function directoryErrorStatus(code: GetOblicDirectoryErrorCode): number {
  switch (code) {
    case "GETOBLIC_PROSPECT_NOT_FOUND":
    case "GETOBLIC_LINK_NOT_FOUND":
      return 404;
    case "GETOBLIC_INVALID_WORDPRESS_LISTING_ID":
    case "GETOBLIC_SEARCH_INVALID_REQUEST":
      return 400;
    case "GETOBLIC_REMOTE_AUTH_FAILED":
      return 503;
    case "GETOBLIC_REMOTE_TRANSIENT":
    case "GETOBLIC_WORDPRESS_AUTHOR_FAILED":
    case "GETOBLIC_WORDPRESS_KB_WRITE_FAILED":
      return 502;
    case "GETOBLIC_KB_SYNC_PERSISTENCE_FAILED":
      return 500;
    case "GETOBLIC_CONCURRENCY_CONFLICT":
      return 409;
    default:
      return 409;
  }
}

export class GetOblicDirectoryError extends Error {
  readonly code: GetOblicDirectoryErrorCode;
  readonly status: number;
  readonly link: GetOblicListingLink | null;

  constructor(
    code: GetOblicDirectoryErrorCode,
    message: string,
    status = directoryErrorStatus(code),
    link: GetOblicListingLink | null = null,
  ) {
    super(message);
    this.name = "GetOblicDirectoryError";
    this.code = code;
    this.status = status;
    this.link = link;
  }
}

export function getOblicListingActiveClaimError(): GetOblicDirectoryError {
  return new GetOblicDirectoryError(
    "GETOBLIC_LISTING_ACTIVE_CLAIM",
    "This Prospect has an active GetOblic Directory claim and cannot be deleted.",
  );
}

export function isPostgresUniqueViolation(error: {
  code?: string;
  message?: string;
} | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(error.message ?? "");
}
