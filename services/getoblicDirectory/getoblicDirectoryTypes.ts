/**
 * Athena V2 GetOblic Directory domain contracts (Phase 2A).
 * Persistence / status / capacity evaluation only — no claim API, WordPress,
 * search, listing creation, KB push, or Super Admin editor.
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
  "GETOBLIC_LISTING_NOT_CLAIMABLE",
  "GETOBLIC_REMOTE_LISTING_MISSING",
  "GETOBLIC_REMOTE_AUTH_FAILED",
  "GETOBLIC_REMOTE_TRANSIENT",
  "GETOBLIC_WORDPRESS_AUTHOR_UNMAPPED",
  "GETOBLIC_WORDPRESS_AUTHOR_FAILED",
  "GETOBLIC_LISTING_CAPACITY_EXCEEDED",
  "GETOBLIC_RELEASE_REMOTE_MISSING",
  "GETOBLIC_RELEASE_THIRD_PARTY_OWNER",
  "GETOBLIC_RELEASE_NOT_ACTIVE",
  "GETOBLIC_CONCURRENCY_CONFLICT",
  "GETOBLIC_INVALID_WORDPRESS_LISTING_ID",
  "GETOBLIC_LINK_NOT_FOUND",
  "GETOBLIC_RELATIONSHIP_NOT_LINKED",
  "GETOBLIC_CURRENT_EXECUTIVE_VERSION_MISSING",
  "GETOBLIC_KNOWLEDGE_BASE_ASSET_MISSING",
  "GETOBLIC_WORDPRESS_KB_WRITE_FAILED",
  "GETOBLIC_KB_SYNC_PERSISTENCE_FAILED",
  "GETOBLIC_GENERATED_DESCRIPTION_MISSING",
  "GETOBLIC_GENERATED_DESCRIPTION_INVALID",
  "GETOBLIC_WORDPRESS_DESCRIPTION_WRITE_FAILED",
  "GETOBLIC_SEARCH_INVALID_REQUEST",
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

/**
 * Product-facing concurrent listing capacity.
 * monthly_allowance remains the physical settings column only.
 */
export type GetOblicListingCapacityResult =
  | {
      configured: true;
      listingCapacity: number;
      currentlyHeld: number;
      available: number;
    }
  | {
      configured: false;
      code: "GETOBLIC_DIRECTORY_NOT_CONFIGURED";
    };

/** @deprecated Internal compatibility alias. Use GetOblicListingCapacityResult. */
export type GetOblicAllocationUsageResult = GetOblicListingCapacityResult;

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

export const GETOBLIC_INVENTORY_POOL_AUTHOR_ID = 271519816 as const;

export function isGetOblicInventoryPoolAuthor(
  authorId: number | null,
): boolean {
  return authorId === GETOBLIC_INVENTORY_POOL_AUTHOR_ID;
}

export const GETOBLIC_DIRECTORY_SEARCH_CLAIM_STATUSES = [
  "AVAILABLE",
  "OWNED_BY_THIS_ORG",
  "INCOMPLETE_FOR_THIS_ORG",
  "UNAVAILABLE",
] as const;

export type GetOblicDirectorySearchClaimStatus =
  (typeof GETOBLIC_DIRECTORY_SEARCH_CLAIM_STATUSES)[number];

export type GetOblicDirectorySearchClaimOverlay = {
  organization_id: string;
  relationship_status: ActiveGetOblicRelationshipStatus;
};

export const GETOBLIC_DIRECTORY_SEARCH_DEFAULT_LISTING_TYPE =
  "getoblic_global_search_engine" as const;
export const GETOBLIC_DIRECTORY_SEARCH_KEYWORDS_MAX = 200;
export const GETOBLIC_DIRECTORY_SEARCH_DEFAULT_PAGE = 0;
export const GETOBLIC_DIRECTORY_SEARCH_DEFAULT_PER_PAGE = 6;
export const GETOBLIC_DIRECTORY_SEARCH_MIN_PER_PAGE = 1;
export const GETOBLIC_DIRECTORY_SEARCH_MAX_PER_PAGE = 20;

/**
 * Generic directory search has no Prospect authority.
 * Do not emit OWNED_BY_THIS_PROSPECT from this classifier.
 * OWNED_BY_THIS_ORG is completed (linked) only.
 * Same-org claiming / remote_missing stay INCOMPLETE_FOR_THIS_ORG
 * only while the live WordPress owner is still the inventory pool.
 */
export function classifyGetOblicDirectorySearchClaimStatus(
  organizationId: string,
  claim: GetOblicDirectorySearchClaimOverlay | null,
  currentAuthorId: number | null,
): GetOblicDirectorySearchClaimStatus {
  if (
    claim &&
    claim.organization_id === organizationId &&
    claim.relationship_status === "linked"
  ) {
    return "OWNED_BY_THIS_ORG";
  }
  if (claim && claim.organization_id !== organizationId) {
    return "UNAVAILABLE";
  }
  if (!isGetOblicInventoryPoolAuthor(currentAuthorId)) {
    return "UNAVAILABLE";
  }
  if (claim && claim.organization_id === organizationId) {
    return "INCOMPLETE_FOR_THIS_ORG";
  }
  return "AVAILABLE";
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
