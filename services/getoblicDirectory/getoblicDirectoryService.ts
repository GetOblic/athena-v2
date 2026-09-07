/**
 * Athena V2 GetOblic Directory server-side read / evaluation foundation.
 *
 * Phase 2A does not reserve claims, call WordPress, write ledger events,
 * push Knowledge Base content, or transition relationship_status to released.
 * Phase 2C claim writers live in getoblicDirectoryClaimService.
 *
 * Future Phase 2C transaction boundaries (do not invent a single atomic
 * reservation+remote+ledger transaction in this phase):
 *
 * 1. Read entitlement + quota + historical consumption.
 * 2. INSERT relationship_status='claiming' and COMMIT.
 *    The global active wordpress_listing_id unique index is the arbiter.
 *    The loser must not perform remote side effects.
 * 3. Perform the remote WordPress operation after reservation is durable.
 *    Failure / timeout: claiming remains; no ledger; no automatic release.
 *    Remote 404: transition to remote_missing; no ledger.
 * 4. On remote success only: INSERT the first-consumption ledger event,
 *    then transition to linked. Ledger uniqueness prevents a second charge.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import {
  ACTIVE_GETOBLIC_RELATIONSHIP_STATUSES,
  classifyGetOblicListingClaimAvailability,
  GETOBLIC_DIRECTORY_SETTINGS_TABLE,
  GETOBLIC_LISTING_ALLOCATION_EVENTS_TABLE,
  GETOBLIC_LISTING_LINKS_TABLE,
  getCurrentGetOblicAllocationPeriodStart,
  isActiveGetOblicRelationshipStatus,
  type GetOblicActiveListingClaimLookup,
  type GetOblicAllocationUsageResult,
  type GetOblicDirectorySettings,
  type GetOblicDirectorySettingsResult,
  type GetOblicKbPushStatus,
  type GetOblicListingClaimAvailabilityResult,
  type GetOblicListingLink,
  type GetOblicRelationshipOrigin,
  type GetOblicRelationshipStatus,
} from "@/services/getoblicDirectory/getoblicDirectoryTypes";

export {
  classifyGetOblicListingClaimAvailability,
  getCurrentGetOblicAllocationPeriodStart,
  isActiveGetOblicRelationshipStatus,
};

const ACTIVE_STATUS_LIST = [...ACTIVE_GETOBLIC_RELATIONSHIP_STATUSES];

const LINK_CONFLICT_COLUMNS =
  "organization_id, prospect_id, relationship_status" as const;

export async function getGetOblicDirectorySettings(
  organizationId: string,
): Promise<GetOblicDirectorySettingsResult> {
  const { data, error } = await supabaseAdmin
    .from(GETOBLIC_DIRECTORY_SETTINGS_TABLE)
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching GetOblic Directory settings:", error);
    return { configured: false, code: "GETOBLIC_DIRECTORY_NOT_CONFIGURED" };
  }

  if (!data) {
    return { configured: false, code: "GETOBLIC_DIRECTORY_NOT_CONFIGURED" };
  }

  const settings = mapDirectorySettingsRow(data as Record<string, unknown>);
  if (!settings) {
    return { configured: false, code: "GETOBLIC_DIRECTORY_NOT_CONFIGURED" };
  }

  return { configured: true, settings };
}

export async function getActiveGetOblicLinkForProspect(
  organizationId: string,
  prospectId: string,
): Promise<GetOblicListingLink | null> {
  const { data, error } = await supabaseAdmin
    .from(GETOBLIC_LISTING_LINKS_TABLE)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("prospect_id", prospectId)
    .in("relationship_status", ACTIVE_STATUS_LIST)
    .maybeSingle();

  if (error) {
    console.error("Error fetching active GetOblic listing link:", error);
    return null;
  }

  return data ? mapListingLinkRow(data as Record<string, unknown>) : null;
}

/**
 * Internal global active listing row lookup.
 * Intentionally not organization-scoped: exclusivity is global.
 * Do not return this object from browser-facing APIs.
 */
export async function getActiveGetOblicListingLinkByWordPressListingId(
  wordpressListingId: number,
): Promise<GetOblicListingLink | null> {
  const { data, error } = await supabaseAdmin
    .from(GETOBLIC_LISTING_LINKS_TABLE)
    .select("*")
    .eq("wordpress_listing_id", wordpressListingId)
    .in("relationship_status", ACTIVE_STATUS_LIST)
    .maybeSingle();

  if (error) {
    console.error("Error fetching active GetOblic listing link by listing:", error);
    throw new GetOblicDirectoryError(
      "GETOBLIC_CONCURRENCY_CONFLICT",
      "GetOblic Directory could not complete this claim safely.",
      503,
    );
  }

  return data ? mapListingLinkRow(data as Record<string, unknown>) : null;
}

/**
 * Internal global active-claim lookup.
 * Intentionally not organization-scoped: exclusivity is global.
 * Returns only the columns required for conflict classification.
 * Do not return this object from browser-facing APIs.
 */
export async function getActiveGetOblicClaimByWordPressListingId(
  wordpressListingId: number,
): Promise<GetOblicActiveListingClaimLookup> {
  const { data, error } = await supabaseAdmin
    .from(GETOBLIC_LISTING_LINKS_TABLE)
    .select(LINK_CONFLICT_COLUMNS)
    .eq("wordpress_listing_id", wordpressListingId)
    .in("relationship_status", ACTIVE_STATUS_LIST)
    .maybeSingle();

  if (error) {
    console.error("Error looking up active GetOblic listing claim:", error);
    return { found: false };
  }

  if (!data) {
    return { found: false };
  }

  const row = data as Record<string, unknown>;
  const organizationId = readString(row.organization_id);
  const prospectId = readString(row.prospect_id);
  const status = readString(row.relationship_status);
  if (
    !organizationId ||
    !prospectId ||
    !status ||
    !isActiveGetOblicRelationshipStatus(status)
  ) {
    return { found: false };
  }

  return {
    found: true,
    organization_id: organizationId,
    prospect_id: prospectId,
    relationship_status: status,
  };
}

export async function determineGetOblicListingClaimAvailability(
  organizationId: string,
  prospectId: string,
  wordpressListingId: number,
): Promise<GetOblicListingClaimAvailabilityResult> {
  const activeClaim =
    await getActiveGetOblicClaimByWordPressListingId(wordpressListingId);
  return classifyGetOblicListingClaimAvailability(
    organizationId,
    prospectId,
    activeClaim,
  );
}

/**
 * Internal batch active-claim lookup for search overlay.
 * Intentionally not organization-scoped: exclusivity is global.
 * Returns only listing ID → organization_id. Do not serialize this map.
 */
export async function getActiveGetOblicClaimOrganizationIdsByWordPressListingIds(
  wordpressListingIds: number[],
): Promise<Map<number, string>> {
  const uniqueIds = [
    ...new Set(
      wordpressListingIds.filter(
        (id) => Number.isInteger(id) && id > 0,
      ),
    ),
  ];
  const claims = new Map<number, string>();
  if (uniqueIds.length === 0) {
    return claims;
  }

  const { data, error } = await supabaseAdmin
    .from(GETOBLIC_LISTING_LINKS_TABLE)
    .select("wordpress_listing_id, organization_id")
    .in("wordpress_listing_id", uniqueIds)
    .in("relationship_status", ACTIVE_STATUS_LIST);

  if (error) {
    console.error("Error batch-looking up GetOblic listing claims:", error);
    throw new GetOblicDirectoryError(
      "GETOBLIC_CONCURRENCY_CONFLICT",
      "GetOblic Directory could not complete this search safely.",
      503,
    );
  }

  for (const row of data ?? []) {
    const record = row as Record<string, unknown>;
    const listingId = readInteger(record.wordpress_listing_id);
    const organizationId = readString(record.organization_id);
    if (listingId == null || listingId <= 0 || !organizationId) {
      continue;
    }
    claims.set(listingId, organizationId);
  }

  return claims;
}

export async function getGetOblicAllocationUsage(
  organizationId: string,
  now: Date = new Date(),
): Promise<GetOblicAllocationUsageResult> {
  const settingsResult = await getGetOblicDirectorySettings(organizationId);
  if (!settingsResult.configured) {
    return {
      configured: false,
      code: "GETOBLIC_DIRECTORY_NOT_CONFIGURED",
    };
  }

  const periodStart = getCurrentGetOblicAllocationPeriodStart(now);
  const { count, error } = await supabaseAdmin
    .from(GETOBLIC_LISTING_ALLOCATION_EVENTS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("period_start", periodStart);

  if (error) {
    console.error("Error counting GetOblic allocation usage:", error);
    return {
      configured: false,
      code: "GETOBLIC_DIRECTORY_NOT_CONFIGURED",
    };
  }

  const used = count ?? 0;
  const monthlyAllowance = settingsResult.settings.monthly_allowance;

  return {
    configured: true,
    monthly_allowance: monthlyAllowance,
    period_start: periodStart,
    used,
    remaining: Math.max(monthlyAllowance - used, 0),
  };
}

export async function hasOrganizationAlreadyConsumedListing(
  organizationId: string,
  wordpressListingId: number,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from(GETOBLIC_LISTING_ALLOCATION_EVENTS_TABLE)
    .select("id")
    .eq("organization_id", organizationId)
    .eq("wordpress_listing_id", wordpressListingId)
    .maybeSingle();

  if (error) {
    console.error("Error checking GetOblic listing consumption:", error);
    return false;
  }

  return Boolean(data);
}

function mapDirectorySettingsRow(
  row: Record<string, unknown>,
): GetOblicDirectorySettings | null {
  const organizationId = readString(row.organization_id);
  const monthlyAllowance = readInteger(row.monthly_allowance);
  const createdAt = readString(row.created_at);
  const updatedAt = readString(row.updated_at);

  if (
    !organizationId ||
    monthlyAllowance == null ||
    monthlyAllowance < 0 ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  return {
    organization_id: organizationId,
    monthly_allowance: monthlyAllowance,
    wordpress_author_id: readNullableInteger(row.wordpress_author_id),
    created_at: createdAt,
    updated_at: updatedAt,
    updated_by_user_id: readNullableString(row.updated_by_user_id),
  };
}

export function mapListingLinkRow(row: Record<string, unknown>): GetOblicListingLink | null {
  const id = readString(row.id);
  const organizationId = readString(row.organization_id);
  const prospectId = readString(row.prospect_id);
  const wordpressListingId = readInteger(row.wordpress_listing_id);
  const origin = readString(row.relationship_origin);
  const status = readString(row.relationship_status);
  const kbPushStatus = readString(row.kb_push_status);
  const createdAt = readString(row.created_at);
  const updatedAt = readString(row.updated_at);

  if (
    !id ||
    !organizationId ||
    !prospectId ||
    wordpressListingId == null ||
    !isRelationshipOrigin(origin) ||
    !isRelationshipStatus(status) ||
    !isKbPushStatus(kbPushStatus) ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  return {
    id,
    organization_id: organizationId,
    prospect_id: prospectId,
    wordpress_listing_id: wordpressListingId,
    google_id_snapshot: readNullableString(row.google_id_snapshot),
    google_id_is_matchable: Boolean(row.google_id_is_matchable),
    relationship_origin: origin,
    relationship_status: status,
    wordpress_author_id: readNullableInteger(row.wordpress_author_id),
    allocated_at: readNullableString(row.allocated_at),
    last_verified_at: readNullableString(row.last_verified_at),
    last_remote_error: readNullableString(row.last_remote_error),
    last_remote_error_at: readNullableString(row.last_remote_error_at),
    kb_push_status: kbPushStatus,
    kb_last_pushed_executive_version_id: readNullableString(
      row.kb_last_pushed_executive_version_id,
    ),
    kb_last_content_sha256: readNullableString(row.kb_last_content_sha256),
    kb_last_pushed_at: readNullableString(row.kb_last_pushed_at),
    kb_last_push_error: readNullableString(row.kb_last_push_error),
    kb_last_push_error_at: readNullableString(row.kb_last_push_error_at),
    created_by_user_id: readNullableString(row.created_by_user_id),
    created_via_licensee_account_id: readNullableString(
      row.created_via_licensee_account_id,
    ),
    created_at: createdAt,
    updated_at: updatedAt,
    released_at: readNullableString(row.released_at),
  };
}

function isRelationshipOrigin(
  value: string | null,
): value is GetOblicRelationshipOrigin {
  return value === "linked_existing" || value === "created";
}

function isRelationshipStatus(
  value: string | null,
): value is GetOblicRelationshipStatus {
  return (
    value === "claiming" ||
    value === "linked" ||
    value === "remote_missing" ||
    value === "released"
  );
}

function isKbPushStatus(value: string | null): value is GetOblicKbPushStatus {
  return value === "never" || value === "success" || value === "failed";
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return Number(value);
  }
  return null;
}

function readNullableInteger(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  return readInteger(value);
}
