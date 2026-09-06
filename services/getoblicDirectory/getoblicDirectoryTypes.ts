/**
 * Athena V2 GetOblic Directory domain contracts (Phase 2A).
 * Persistence / status / quota evaluation only — no claim API, WordPress,
 * search, listing creation, KB push, release, or Super Admin editor.
 */

export const GETOBLIC_DIRECTORY_SETTINGS_TABLE =
  "athena_getoblic_directory_settings" as const;
export const GETOBLIC_LISTING_LINKS_TABLE =
  "athena_getoblic_listing_links" as const;
export const GETOBLIC_LISTING_ALLOCATION_EVENTS_TABLE =
  "athena_getoblic_listing_allocation_events" as const;

export const GETOBLIC_RELATIONSHIP_ORIGINS = [
  "linked_existing",
  "created",
] as const;

export type GetOblicRelationshipOrigin =
  (typeof GETOBLIC_RELATIONSHIP_ORIGINS)[number];

export const GETOBLIC_RELATIONSHIP_STATUSES = [
  "claiming",
  "linked",
  "remote_missing",
  "released",
] as const;

export type GetOblicRelationshipStatus =
  (typeof GETOBLIC_RELATIONSHIP_STATUSES)[number];

export const ACTIVE_GETOBLIC_RELATIONSHIP_STATUSES = [
  "claiming",
  "linked",
  "remote_missing",
] as const;

export type ActiveGetOblicRelationshipStatus =
  (typeof ACTIVE_GETOBLIC_RELATIONSHIP_STATUSES)[number];

export const GETOBLIC_KB_PUSH_STATUSES = ["never", "success", "failed"] as const;

export type GetOblicKbPushStatus = (typeof GETOBLIC_KB_PUSH_STATUSES)[number];

export const GETOBLIC_ALLOCATION_EVENT_KINDS = [
  "allocate_existing",
  "create_listing",
] as const;

export type GetOblicAllocationEventKind =
  (typeof GETOBLIC_ALLOCATION_EVENT_KINDS)[number];

export const GETOBLIC_GOOGLE_ID_KINDS = [
  "legacy_hex",
  "chij",
  "sentinel",
  "numeric",
  "url",
  "unknown",
  "blank",
] as const;

export type GetOblicGoogleIdKind = (typeof GETOBLIC_GOOGLE_ID_KINDS)[number];

export type GetOblicGoogleIdClassification = {
  raw: string | null;
  isMatchable: boolean;
  kind: GetOblicGoogleIdKind;
};

export const GETOBLIC_LISTING_CLAIM_AVAILABILITIES = [
  "available",
  "already_claimed_by_same_prospect",
  "claimed_by_other_prospect_same_org",
  "claimed_by_other_org",
] as const;

export type GetOblicListingClaimAvailability =
  (typeof GETOBLIC_LISTING_CLAIM_AVAILABILITIES)[number];

export type GetOblicListingClaimAvailabilityResult = {
  availability: GetOblicListingClaimAvailability;
};

export const GETOBLIC_DIRECTORY_ERROR_CODES = [
  "GETOBLIC_DIRECTORY_NOT_CONFIGURED",
  "GETOBLIC_LISTING_ACTIVE_CLAIM",
  "GETOBLIC_PROSPECT_NOT_FOUND",
  "GETOBLIC_PROSPECT_ALREADY_LINKED",
  "GETOBLIC_LISTING_CLAIMED_SAME_ORG",
  "GETOBLIC_LISTING_CLAIMED_OTHER_ORG",
  "GETOBLIC_REMOTE_LISTING_MISSING",
  "GETOBLIC_REMOTE_AUTH_FAILED",
  "GETOBLIC_REMOTE_TRANSIENT",
  "GETOBLIC_WORDPRESS_AUTHOR_UNMAPPED",
  "GETOBLIC_WORDPRESS_AUTHOR_FAILED",
  "GETOBLIC_MONTHLY_ALLOWANCE_EXCEEDED",
  "GETOBLIC_CONCURRENCY_CONFLICT",
  "GETOBLIC_INVALID_WORDPRESS_LISTING_ID",
] as const;

export type GetOblicDirectoryErrorCode =
  (typeof GETOBLIC_DIRECTORY_ERROR_CODES)[number];

export type GetOblicDirectorySettings = {
  organization_id: string;
  monthly_allowance: number;
  wordpress_author_id: number | null;
  created_at: string;
  updated_at: string;
  updated_by_user_id: string | null;
};

export type GetOblicDirectorySettingsResult =
  | { configured: true; settings: GetOblicDirectorySettings }
  | {
      configured: false;
      code: "GETOBLIC_DIRECTORY_NOT_CONFIGURED";
    };

export type GetOblicListingLink = {
  id: string;
  organization_id: string;
  prospect_id: string;
  wordpress_listing_id: number;
  google_id_snapshot: string | null;
  google_id_is_matchable: boolean;
  relationship_origin: GetOblicRelationshipOrigin;
  relationship_status: GetOblicRelationshipStatus;
  wordpress_author_id: number | null;
  allocated_at: string | null;
  last_verified_at: string | null;
  last_remote_error: string | null;
  last_remote_error_at: string | null;
  kb_push_status: GetOblicKbPushStatus;
  kb_last_pushed_executive_version_id: string | null;
  kb_last_content_sha256: string | null;
  kb_last_pushed_at: string | null;
  kb_last_push_error: string | null;
  kb_last_push_error_at: string | null;
  created_by_user_id: string | null;
  created_via_licensee_account_id: string | null;
  created_at: string;
  updated_at: string;
  released_at: string | null;
};

/**
 * Internal conflict snapshot for global listing exclusivity.
 * Ordinary / client-facing callers must use claim availability instead.
 * Do not serialize this object to browser-facing APIs.
 */
export type GetOblicActiveListingClaimLookup =
  | { found: false }
  | {
      found: true;
      organization_id: string;
      prospect_id: string;
      relationship_status: ActiveGetOblicRelationshipStatus;
    };

export type GetOblicAllocationUsageResult =
  | {
      configured: true;
      monthly_allowance: number;
      period_start: string;
      used: number;
      remaining: number;
    }
  | {
      configured: false;
      code: "GETOBLIC_DIRECTORY_NOT_CONFIGURED";
    };

export function isGetOblicRelationshipStatus(
  value: string,
): value is GetOblicRelationshipStatus {
  return (GETOBLIC_RELATIONSHIP_STATUSES as readonly string[]).includes(value);
}

export function isActiveGetOblicRelationshipStatus(
  status: string,
): status is ActiveGetOblicRelationshipStatus {
  return (ACTIVE_GETOBLIC_RELATIONSHIP_STATUSES as readonly string[]).includes(
    status,
  );
}

export function classifyGetOblicListingClaimAvailability(
  organizationId: string,
  prospectId: string,
  activeClaim: GetOblicActiveListingClaimLookup,
): GetOblicListingClaimAvailabilityResult {
  if (!activeClaim.found) {
    return { availability: "available" };
  }

  if (activeClaim.organization_id === organizationId) {
    if (activeClaim.prospect_id === prospectId) {
      return { availability: "already_claimed_by_same_prospect" };
    }
    return { availability: "claimed_by_other_prospect_same_org" };
  }

  return { availability: "claimed_by_other_org" };
}

/**
 * First day of the UTC calendar month for `now`.
 * Returns YYYY-MM-01.
 */
export function getCurrentGetOblicAllocationPeriodStart(
  now: Date = new Date(),
): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}
