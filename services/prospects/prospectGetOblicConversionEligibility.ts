/**
 * Shared GetOblic-derived Prospect → Client conversion eligibility.
 *
 * Manual Prospects are not decided here. An active claim that already
 * belongs to this Own Company and this Prospect stays allowed.
 * Authorized-unclaimed conversion is allowed only when every condition
 * holds. Only an active-claim lookup outcome of `none` proves that no
 * active listing claim exists. `error` is not availability.
 *
 * This module does not claim, release, transfer, or write WordPress.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveGetOblicClaimByWordPressListingId } from "@/services/getoblicDirectory/getoblicDirectoryService";
import { GETOBLIC_LISTING_LINKS_TABLE } from "@/services/getoblicDirectory/getoblicDirectoryTypes";
import {
  isGetOblicDerivedProspect,
  organizationOwnsActiveGetOblicClaimForProspect,
} from "@/services/prospects/prospectGetOblicOwnership";

const UNCLAIMED_GETOBLIC_PROSPECT_SOURCE = "getoblic";
const UNCLAIMED_GETOBLIC_PROSPECT_ORIGIN = "getoblic_directory";
const UNCLAIMED_GETOBLIC_AUTHORIZATION_RPC =
  "licensee_own_company_unclaimed_getoblic_authorized" as const;
const CANONICAL_WORDPRESS_LISTING_ID_RPC =
  "prospect_canonical_wordpress_listing_id" as const;

export type GetOblicProspectConversionEligibilityInput = {
  organizationId: string;
  prospectId: string;
  source: string;
  rawJson: Record<string, unknown> | null;
};

export type GetOblicProspectConversionDenialReason =
  | "invalid_source_origin"
  | "malformed_listing_identity"
  | "unclaimed_permission_unavailable"
  | "released_source"
  | "foreign_active_claim"
  | "same_org_other_prospect"
  | "lookup_error";

export type GetOblicProspectConversionEligibility =
  | {
      decision: "allow";
      basis: "not_getoblic" | "own_active_claim" | "authorized_unclaimed";
    }
  | {
      decision: "deny";
      reason: GetOblicProspectConversionDenialReason;
    };

/**
 * No stored contract permits conversion while another Prospect in the
 * same organization holds the active listing claim. Fail closed.
 */
function sameOrganizationOtherProspectConversionAuthorized(): boolean {
  return false;
}

export async function resolveGetOblicProspectConversionEligibility(
  input: GetOblicProspectConversionEligibilityInput,
): Promise<GetOblicProspectConversionEligibility> {
  if (!isGetOblicDerivedProspect({ raw_json: input.rawJson })) {
    return { decision: "allow", basis: "not_getoblic" };
  }

  if (
    await organizationOwnsActiveGetOblicClaimForProspect(
      input.organizationId,
      input.prospectId,
    )
  ) {
    return { decision: "allow", basis: "own_active_claim" };
  }

  if (!isUnclaimedGetOblicProspectIdentity(input.source, input.rawJson)) {
    return { decision: "deny", reason: "invalid_source_origin" };
  }

  const listingId = await readCanonicalWordpressListingId(input.rawJson);
  if (listingId == null) {
    return { decision: "deny", reason: "malformed_listing_identity" };
  }

  if (!(await readUnclaimedProspectingAuthorization(input.organizationId))) {
    return { decision: "deny", reason: "unclaimed_permission_unavailable" };
  }

  const released = await readReleasedSourceLink(
    input.organizationId,
    input.prospectId,
  );
  if (released === "error") {
    return { decision: "deny", reason: "lookup_error" };
  }
  if (released) {
    return { decision: "deny", reason: "released_source" };
  }

  const activeClaim = await getActiveGetOblicClaimByWordPressListingId(
    listingId,
  );
  if (activeClaim.outcome === "error") {
    return { decision: "deny", reason: "lookup_error" };
  }
  if (activeClaim.outcome === "none") {
    return { decision: "allow", basis: "authorized_unclaimed" };
  }
  if (activeClaim.organization_id !== input.organizationId) {
    return { decision: "deny", reason: "foreign_active_claim" };
  }
  if (activeClaim.prospect_id === input.prospectId) {
    return { decision: "allow", basis: "own_active_claim" };
  }
  if (!sameOrganizationOtherProspectConversionAuthorized()) {
    return { decision: "deny", reason: "same_org_other_prospect" };
  }
  // No allow basis exists for a same-organization claim held by another
  // Prospect. Conflicting ownership stays denied.
  return { decision: "deny", reason: "lookup_error" };
}

function isUnclaimedGetOblicProspectIdentity(
  source: string,
  rawJson: unknown,
): boolean {
  if (source !== UNCLAIMED_GETOBLIC_PROSPECT_SOURCE) return false;
  if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) {
    return false;
  }
  return (
    (rawJson as Record<string, unknown>).origin ===
    UNCLAIMED_GETOBLIC_PROSPECT_ORIGIN
  );
}

async function readUnclaimedProspectingAuthorization(
  organizationId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc(
    UNCLAIMED_GETOBLIC_AUTHORIZATION_RPC,
    { p_organization_id: organizationId },
  );
  if (error) {
    console.error(
      "GetOblic unclaimed conversion authorization lookup failed:",
      error,
    );
    return false;
  }
  return data === true;
}

async function readCanonicalWordpressListingId(
  rawJson: unknown,
): Promise<number | null> {
  const { data, error } = await supabaseAdmin.rpc(
    CANONICAL_WORDPRESS_LISTING_ID_RPC,
    { p_raw: rawJson },
  );
  if (error) {
    console.error(
      "GetOblic canonical WordPress listing id lookup failed:",
      error,
    );
    return null;
  }
  return readExactCanonicalWordpressListingId(data);
}

function readExactCanonicalWordpressListingId(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[1-9][0-9]*$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || String(parsed) !== trimmed) return null;
  return parsed;
}

async function readReleasedSourceLink(
  organizationId: string,
  prospectId: string,
): Promise<boolean | "error"> {
  const { data, error } = await supabaseAdmin
    .from(GETOBLIC_LISTING_LINKS_TABLE)
    .select("id")
    .eq("organization_id", organizationId)
    .eq("prospect_id", prospectId)
    .eq("relationship_status", "released")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("GetOblic released source lookup failed:", error);
    return "error";
  }
  return Boolean(data);
}
