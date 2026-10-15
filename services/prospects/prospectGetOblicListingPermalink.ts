/**
 * Server-only Prospect permalink read.
 * Listing identity comes from resolveGetOblicOutboundContentTarget.
 * Browser listing ids, tenant ids, and URLs are not accepted.
 * The permalink is not stored on the Prospect or in a new table.
 *
 * Unclaimed authorization reads WordPress only after a separate confirmed-empty
 * active listing-link query. Errors, multiple rows, and unreadable rows stop
 * the read.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { readPublicHttpsListingPermalink } from "@/lib/prospects/getOblicListingPermalinkDisplay";
import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import { resolveGetOblicOutboundContentTarget } from "@/services/getoblicDirectory/getoblicOutboundContentAuthorization";
import {
  ACTIVE_GETOBLIC_RELATIONSHIP_STATUSES,
  GETOBLIC_LISTING_LINKS_TABLE,
  isActiveGetOblicRelationshipStatus,
} from "@/services/getoblicDirectory/getoblicDirectoryTypes";
import { getWordpressListingPermalink } from "@/services/getoblicDirectory/getoblicWordpressClient";
import {
  GetOblicWordpressError,
  type GetOblicWordpressListingPermalink,
} from "@/services/getoblicDirectory/getoblicWordpressTypes";

const STRICT_ACTIVE_LINK_COLUMNS =
  "id, organization_id, prospect_id, relationship_status" as const;
const STRICT_ACTIVE_LINK_ROW_LIMIT = 2;

type StrictActiveLinkOutcome =
  | "confirmed_empty"
  | "query_error"
  | "ambiguous"
  | "malformed"
  | "nonempty";

export type GetOblicListingPermalinkReader = (
  wordpressListingId: number,
) => Promise<GetOblicWordpressListingPermalink>;

function permalinkUnavailable(status = 503): GetOblicDirectoryError {
  return new GetOblicDirectoryError(
    "GETOBLIC_LISTING_PERMALINK_UNAVAILABLE",
    "This GetOblic listing permalink is unavailable.",
    status,
  );
}

function permalinkFailure(error: GetOblicWordpressError): GetOblicDirectoryError {
  console.error("[GETOBLIC_LISTING_PERMALINK] remote_failed", {
    code: error.code,
  });
  if (error.code === "NOT_FOUND") {
    return permalinkUnavailable(404);
  }
  return permalinkUnavailable(503);
}

function denyActiveLinkCheck(
  outcome: Exclude<StrictActiveLinkOutcome, "confirmed_empty">,
): never {
  console.error("[GETOBLIC_LISTING_PERMALINK] active_link_check_failed", {
    code: outcome,
  });
  throw permalinkUnavailable(503);
}

/**
 * Independent of the shared active-link reader.
 * Only a confirmed empty active-status result may continue.
 */
async function assertUnclaimedPermalinkHasNoActiveLink(
  organizationId: string,
  prospectId: string,
): Promise<void> {
  const outcome = await readStrictActiveLinkOutcome(
    organizationId,
    prospectId,
  ).catch(() => "query_error" as const);
  if (outcome === "confirmed_empty") return;
  denyActiveLinkCheck(outcome);
}

async function readStrictActiveLinkOutcome(
  organizationId: string,
  prospectId: string,
): Promise<StrictActiveLinkOutcome> {
  if (
    !isTrustedIdentifier(organizationId) ||
    !isTrustedIdentifier(prospectId)
  ) {
    return "malformed";
  }

  const { data, error } = await supabaseAdmin
    .from(GETOBLIC_LISTING_LINKS_TABLE)
    .select(STRICT_ACTIVE_LINK_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("prospect_id", prospectId)
    .in("relationship_status", [...ACTIVE_GETOBLIC_RELATIONSHIP_STATUSES])
    .limit(STRICT_ACTIVE_LINK_ROW_LIMIT);

  if (error) return "query_error";
  if (!Array.isArray(data)) return "malformed";
  if (data.length === 0) return "confirmed_empty";
  if (data.length !== 1) return "ambiguous";
  return isStrictActiveRelationshipRow(data[0], organizationId, prospectId)
    ? "nonempty"
    : "malformed";
}

function isTrustedIdentifier(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isStrictActiveRelationshipRow(
  row: unknown,
  organizationId: string,
  prospectId: string,
): boolean {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const record = row as Record<string, unknown>;
  if (record.organization_id !== organizationId) return false;
  if (record.prospect_id !== prospectId) return false;
  if (typeof record.id !== "string" || record.id.trim().length === 0) {
    return false;
  }
  return (
    typeof record.relationship_status === "string" &&
    isActiveGetOblicRelationshipStatus(record.relationship_status)
  );
}

export async function resolveProspectGetOblicListingPermalink(
  input: {
    organizationId: string;
    prospectId: string;
  },
  readPermalink: GetOblicListingPermalinkReader = getWordpressListingPermalink,
): Promise<{ permalink: string }> {
  const target = await resolveGetOblicOutboundContentTarget({
    organizationId: input.organizationId,
    prospectId: input.prospectId,
  });
  if (target.mode !== "linked_owner" && target.mode !== "unclaimed_authorized") {
    throw new GetOblicDirectoryError(
      "GETOBLIC_RELATIONSHIP_NOT_LINKED",
      "This Prospect is not linked to a GetOblic listing.",
    );
  }

  if (target.mode === "unclaimed_authorized") {
    await assertUnclaimedPermalinkHasNoActiveLink(
      input.organizationId,
      input.prospectId,
    );
  }

  let remote: GetOblicWordpressListingPermalink;
  try {
    remote = await readPermalink(target.wordpressListingId);
  } catch (error) {
    if (error instanceof GetOblicDirectoryError) throw error;
    if (error instanceof GetOblicWordpressError) {
      throw permalinkFailure(error);
    }
    console.error("[GETOBLIC_LISTING_PERMALINK] remote_failed", {
      code: "REQUEST",
    });
    throw permalinkUnavailable();
  }

  const permalink = readPublicHttpsListingPermalink(remote?.permalink);
  if (
    !remote ||
    remote.wordpress_listing_id !== target.wordpressListingId ||
    !permalink
  ) {
    throw permalinkUnavailable();
  }

  return { permalink };
}
