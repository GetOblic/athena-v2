/**
 * Shared authorization for GetOblic Description and Knowledge Base pushes.
 *
 * Linked owners keep the organization-scoped Prospect lookup and the active
 * linked row. Authorized unclaimed GetOblic Prospects are allowed only when
 * no active or released link exists for this Prospect, and only after:
 *   licensee_own_company_unclaimed_getoblic_authorized(uuid)
 *   prospect_canonical_wordpress_listing_id(jsonb)
 *   getActiveGetOblicClaimByWordPressListingId → outcome none
 *
 * Only outcome none permits an unclaimed send. Outcome found, including a
 * foreign organization, and outcome error deny the send. Listing identity
 * and permission come from those SQL functions and the Gate 2H-C lookup.
 * This module does not claim, release, reserve capacity, or write listing links.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import {
  getActiveGetOblicClaimByWordPressListingId,
  getActiveGetOblicLinkForProspect,
} from "@/services/getoblicDirectory/getoblicDirectoryService";
import {
  GETOBLIC_LISTING_LINKS_TABLE,
  type GetOblicActiveListingClaimLookup,
  type GetOblicListingLink,
} from "@/services/getoblicDirectory/getoblicDirectoryTypes";
import {
  getProspectById,
  type Prospect,
} from "@/services/prospects/prospectService";

const UNCLAIMED_GETOBLIC_PROSPECT_SOURCE = "getoblic";
const UNCLAIMED_GETOBLIC_PROSPECT_ORIGIN = "getoblic_directory";

const UNCLAIMED_GETOBLIC_AUTHORIZATION_RPC =
  "licensee_own_company_unclaimed_getoblic_authorized" as const;
const CANONICAL_WORDPRESS_LISTING_ID_RPC =
  "prospect_canonical_wordpress_listing_id" as const;

export type GetOblicOutboundContentTarget =
  | {
      mode: "linked_owner";
      prospect: Prospect;
      link: GetOblicListingLink;
      wordpressListingId: number;
    }
  | {
      mode: "unclaimed_authorized";
      prospect: Prospect;
      wordpressListingId: number;
    };

export type ResolveGetOblicOutboundContentTargetInput = {
  organizationId: string;
  prospectId: string;
};

export async function resolveGetOblicOutboundContentTarget(
  input: ResolveGetOblicOutboundContentTargetInput,
): Promise<GetOblicOutboundContentTarget> {
  const prospect = await requireProspectInOrganization(
    input.prospectId,
    input.organizationId,
  );
  const active = await getActiveGetOblicLinkForProspect(
    input.organizationId,
    input.prospectId,
  );

  if (active) {
    if (active.relationship_status === "linked") {
      return {
        mode: "linked_owner",
        prospect,
        link: active,
        wordpressListingId: active.wordpress_listing_id,
      };
    }
    throw relationshipNotLinkedError();
  }

  if (await hasReleasedLinkForProspect(input.organizationId, input.prospectId)) {
    throw relationshipNotLinkedError();
  }

  if (!isUnclaimedGetOblicProspectIdentity(prospect.source, prospect.raw_json)) {
    throw linkNotFoundError();
  }

  await assertUnclaimedGetOblicAuthorization(input.organizationId);
  const wordpressListingId = await resolveCanonicalWordpressListingId(
    prospect.raw_json,
  );
  await assertUnclaimedListingClaimPermitsOutbound({
    organizationId: input.organizationId,
    prospectId: input.prospectId,
    wordpressListingId,
  });

  return {
    mode: "unclaimed_authorized",
    prospect,
    wordpressListingId,
  };
}

export function sameGetOblicOutboundContentTarget(
  left: GetOblicOutboundContentTarget,
  right: GetOblicOutboundContentTarget,
): boolean {
  if (left.mode !== right.mode) return false;
  if (left.wordpressListingId !== right.wordpressListingId) return false;
  if (left.mode === "linked_owner" && right.mode === "linked_owner") {
    return (
      left.link.id === right.link.id &&
      left.link.organization_id === right.link.organization_id &&
      left.link.prospect_id === right.link.prospect_id &&
      left.link.relationship_status === "linked" &&
      right.link.relationship_status === "linked"
    );
  }
  return left.mode === "unclaimed_authorized" && right.mode === "unclaimed_authorized";
}

/**
 * Second authorization read immediately before a remote write.
 * A release, reversal of unclaimed permission, or listing-id change denies
 * the send. This does not lock the remote WordPress PUT that follows.
 */
export async function recheckGetOblicOutboundContentTarget(input: {
  organizationId: string;
  prospectId: string;
  expected: GetOblicOutboundContentTarget;
}): Promise<GetOblicOutboundContentTarget> {
  const current = await resolveGetOblicOutboundContentTarget({
    organizationId: input.organizationId,
    prospectId: input.prospectId,
  });
  if (!sameGetOblicOutboundContentTarget(input.expected, current)) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_CONCURRENCY_CONFLICT",
      "GetOblic listing authorization changed before the content could be sent.",
      409,
    );
  }
  return current;
}

/**
 * Prospect-detail visibility for Case B.
 * Linked owners are decided by the caller from the already loaded active link.
 * An active claiming or remote_missing link never falls through.
 */
export async function isAuthorizedUnclaimedGetOblicOutboundTarget(input: {
  organizationId: string;
  prospectId: string;
  source: string;
  rawJson: Record<string, unknown> | null;
  hasActiveLink: boolean;
}): Promise<boolean> {
  if (input.hasActiveLink) return false;
  if (!isUnclaimedGetOblicProspectIdentity(input.source, input.rawJson)) {
    return false;
  }

  try {
    const target = await resolveGetOblicOutboundContentTarget({
      organizationId: input.organizationId,
      prospectId: input.prospectId,
    });
    return (
      target.mode === "unclaimed_authorized" || target.mode === "linked_owner"
    );
  } catch (error) {
    if (!(error instanceof GetOblicDirectoryError)) {
      console.error(
        "GetOblic unclaimed outbound visibility failed closed:",
        error,
      );
    }
    return false;
  }
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

async function assertUnclaimedListingClaimPermitsOutbound(input: {
  organizationId: string;
  prospectId: string;
  wordpressListingId: number;
}): Promise<void> {
  const activeClaim = await getActiveGetOblicClaimByWordPressListingId(
    input.wordpressListingId,
  );
  if (activeClaim.outcome === "none") return;
  if (activeClaim.outcome === "error") {
    throw new GetOblicDirectoryError(
      "GETOBLIC_CONCURRENCY_CONFLICT",
      "GetOblic listing claim state could not be verified.",
      409,
    );
  }
  denyFoundUnclaimedListingClaim(input.organizationId, input.prospectId, activeClaim);
}

function denyFoundUnclaimedListingClaim(
  organizationId: string,
  prospectId: string,
  activeClaim: Extract<GetOblicActiveListingClaimLookup, { outcome: "found" }>,
): never {
  if (activeClaim.organization_id !== organizationId) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_LISTING_CLAIMED_OTHER_ORG",
      "This listing is already claimed.",
    );
  }
  if (activeClaim.prospect_id !== prospectId) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_LISTING_CLAIMED_SAME_ORG",
      "This listing is already claimed by another Prospect in this organization.",
    );
  }
  throw new GetOblicDirectoryError(
    "GETOBLIC_CONCURRENCY_CONFLICT",
    "GetOblic listing claim state could not be verified.",
    409,
  );
}

async function assertUnclaimedGetOblicAuthorization(
  organizationId: string,
): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc(
    UNCLAIMED_GETOBLIC_AUTHORIZATION_RPC,
    { p_organization_id: organizationId },
  );

  if (error) {
    console.error(
      "GetOblic unclaimed outbound authorization lookup failed:",
      error,
    );
    throw unclaimedOutboundNotAuthorizedError();
  }

  if (data !== true) {
    throw unclaimedOutboundNotAuthorizedError();
  }
}

async function resolveCanonicalWordpressListingId(
  rawJson: unknown,
): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc(
    CANONICAL_WORDPRESS_LISTING_ID_RPC,
    { p_raw: rawJson },
  );

  if (error) {
    console.error("GetOblic canonical WordPress listing id lookup failed:", error);
    throw invalidWordpressListingIdError();
  }

  const listingId = readExactCanonicalWordpressListingId(data);
  if (listingId == null) {
    throw invalidWordpressListingIdError();
  }
  return listingId;
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

async function requireProspectInOrganization(
  prospectId: string,
  organizationId: string,
) {
  const prospect = await getProspectById(prospectId, organizationId);
  if (!prospect) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_PROSPECT_NOT_FOUND",
      "Prospect not found.",
      404,
    );
  }
  return prospect;
}

async function hasReleasedLinkForProspect(
  organizationId: string,
  prospectId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from(GETOBLIC_LISTING_LINKS_TABLE)
    .select("id")
    .eq("organization_id", organizationId)
    .eq("prospect_id", prospectId)
    .eq("relationship_status", "released")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error looking up released GetOblic listing link:", error);
    throw new GetOblicDirectoryError(
      "GETOBLIC_LINK_NOT_FOUND",
      "This Prospect has no GetOblic Directory listing.",
      404,
    );
  }

  return Boolean(data);
}

function linkNotFoundError(): GetOblicDirectoryError {
  return new GetOblicDirectoryError(
    "GETOBLIC_LINK_NOT_FOUND",
    "This Prospect has no GetOblic Directory listing.",
  );
}

function relationshipNotLinkedError(): GetOblicDirectoryError {
  return new GetOblicDirectoryError(
    "GETOBLIC_RELATIONSHIP_NOT_LINKED",
    "This Prospect is not linked to a GetOblic listing.",
  );
}

function unclaimedOutboundNotAuthorizedError(): GetOblicDirectoryError {
  return new GetOblicDirectoryError(
    "GETOBLIC_UNCLAIMED_OUTBOUND_NOT_AUTHORIZED",
    "This organization is not authorized to send unclaimed GetOblic content.",
    403,
  );
}

function invalidWordpressListingIdError(): GetOblicDirectoryError {
  return new GetOblicDirectoryError(
    "GETOBLIC_INVALID_WORDPRESS_LISTING_ID",
    "This GetOblic listing is missing a WordPress listing id.",
    409,
  );
}
