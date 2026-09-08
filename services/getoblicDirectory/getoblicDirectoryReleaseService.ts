/**
 * Athena V2 GetOblic listing release.
 * Returns a live WordPress listing to the shared inventory pool and marks
 * the Athena relationship released. Does not delete the Prospect, refund
 * allocation events, or invoke generation.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import {
  GETOBLIC_INVENTORY_POOL_AUTHOR_ID,
  GETOBLIC_LISTING_LINKS_TABLE,
  isGetOblicInventoryPoolAuthor,
  type GetOblicDirectorySettings,
  type GetOblicListingLink,
} from "@/services/getoblicDirectory/getoblicDirectoryTypes";
import {
  getActiveGetOblicLinkForProspect,
  getGetOblicDirectorySettings,
  mapListingLinkRow,
} from "@/services/getoblicDirectory/getoblicDirectoryService";
import {
  assignWordpressListingAuthor,
  getWordpressListingById,
} from "@/services/getoblicDirectory/getoblicWordpressClient";
import {
  GetOblicWordpressError,
  type GetOblicWordpressListing,
} from "@/services/getoblicDirectory/getoblicWordpressTypes";
import { getProspectById } from "@/services/prospects/prospectService";

const REMOTE_ERROR_MAX_LENGTH = 500;
const RELEASABLE_STATUS_LIST = ["claiming", "linked"] as const;

export type ReleaseGetOblicListingOutcome = "released";

export type ReleaseGetOblicListingResult = {
  outcome: ReleaseGetOblicListingOutcome;
  link: GetOblicListingLink;
};

export type ReleaseGetOblicListingInput = {
  organizationId: string;
  prospectId: string;
  actorUserId: string | null;
  now?: Date;
};

export type ReleaseGetOblicListingWordpressPort = {
  getListingById: typeof getWordpressListingById;
  assignListingAuthor: typeof assignWordpressListingAuthor;
};

const defaultWordpressPort: ReleaseGetOblicListingWordpressPort = {
  getListingById: getWordpressListingById,
  assignListingAuthor: assignWordpressListingAuthor,
};

export function toPublicGetOblicRelease(result: ReleaseGetOblicListingResult): {
  outcome: ReleaseGetOblicListingOutcome;
  relationship_status: "released";
  listing_link_id: string;
  wordpress_listing_id: number;
  released_at: string | null;
} {
  return {
    outcome: result.outcome,
    relationship_status: "released",
    listing_link_id: result.link.id,
    wordpress_listing_id: result.link.wordpress_listing_id,
    released_at: result.link.released_at,
  };
}

export async function releaseGetOblicListing(
  input: ReleaseGetOblicListingInput,
  wordpress: ReleaseGetOblicListingWordpressPort = defaultWordpressPort,
): Promise<ReleaseGetOblicListingResult> {
  const now = input.now ?? new Date();
  await requireProspectInOrganization(input.prospectId, input.organizationId);

  const active = await getActiveGetOblicLinkForProspect(
    input.organizationId,
    input.prospectId,
  );
  if (!active) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_RELEASE_NOT_ACTIVE",
      "This Prospect does not have an active GetOblic listing to release.",
      409,
    );
  }

  if (active.relationship_status === "remote_missing") {
    throw new GetOblicDirectoryError(
      "GETOBLIC_RELEASE_REMOTE_MISSING",
      "This GetOblic listing cannot be released because it cannot be verified.",
      409,
      active,
    );
  }

  if (
    active.relationship_status !== "linked" &&
    active.relationship_status !== "claiming"
  ) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_RELEASE_NOT_ACTIVE",
      "This Prospect does not have an active GetOblic listing to release.",
      409,
      active,
    );
  }

  const settings = await requireDirectorySettings(input.organizationId);
  const listing = await loadLiveListingOrStamp(active, wordpress, now);

  if (isGetOblicInventoryPoolAuthor(listing.author_id)) {
    return finalizeReleased(active, now);
  }

  if (
    settings.wordpress_author_id != null &&
    listing.author_id === settings.wordpress_author_id
  ) {
    await assignToPoolOrStamp(active, wordpress, now);
    await confirmPoolOwnership(active, wordpress, now);
    return finalizeReleased(active, now);
  }

  const stamped = await persistReleaseFailure(
    active,
    now,
    "GETOBLIC_RELEASE_THIRD_PARTY_OWNER",
    "This GetOblic listing is owned by another account and cannot be released.",
  );
  throw new GetOblicDirectoryError(
    "GETOBLIC_RELEASE_THIRD_PARTY_OWNER",
    "This GetOblic listing is owned by another account and cannot be released.",
    409,
    stamped,
  );
}

async function requireProspectInOrganization(
  prospectId: string,
  organizationId: string,
): Promise<void> {
  const prospect = await getProspectById(prospectId, organizationId);
  if (!prospect) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_PROSPECT_NOT_FOUND",
      "Prospect not found.",
      404,
    );
  }
}

async function requireDirectorySettings(
  organizationId: string,
): Promise<GetOblicDirectorySettings> {
  const result = await getGetOblicDirectorySettings(organizationId);
  if (!result.configured) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_DIRECTORY_NOT_CONFIGURED",
      "GetOblic Directory is not configured for this organization.",
    );
  }
  return result.settings;
}

async function loadLiveListingOrStamp(
  active: GetOblicListingLink,
  wordpress: ReleaseGetOblicListingWordpressPort,
  now: Date,
): Promise<GetOblicWordpressListing> {
  try {
    return await wordpress.getListingById(active.wordpress_listing_id);
  } catch (error) {
    const stamped = await persistReleaseFailureFromUnknown(active, now, error);
    if (isWordpressListingNotFound(error)) {
      throw new GetOblicDirectoryError(
        "GETOBLIC_REMOTE_LISTING_MISSING",
        "The WordPress listing was not found.",
        409,
        stamped,
      );
    }
    if (isWordpressAuthFailure(error)) {
      throw new GetOblicDirectoryError(
        "GETOBLIC_REMOTE_AUTH_FAILED",
        "GetOblic Directory authentication failed.",
        503,
        stamped,
      );
    }
    throw new GetOblicDirectoryError(
      "GETOBLIC_REMOTE_TRANSIENT",
      "GetOblic Directory is temporarily unavailable.",
      502,
      stamped,
    );
  }
}

async function assignToPoolOrStamp(
  active: GetOblicListingLink,
  wordpress: ReleaseGetOblicListingWordpressPort,
  now: Date,
): Promise<void> {
  try {
    await wordpress.assignListingAuthor(
      active.wordpress_listing_id,
      GETOBLIC_INVENTORY_POOL_AUTHOR_ID,
    );
  } catch (error) {
    const stamped = await persistReleaseFailureFromUnknown(active, now, error);
    if (isWordpressListingNotFound(error)) {
      throw new GetOblicDirectoryError(
        "GETOBLIC_REMOTE_LISTING_MISSING",
        "The WordPress listing was not found.",
        409,
        stamped,
      );
    }
    if (isWordpressAuthFailure(error)) {
      throw new GetOblicDirectoryError(
        "GETOBLIC_REMOTE_AUTH_FAILED",
        "GetOblic Directory authentication failed.",
        503,
        stamped,
      );
    }
    throw new GetOblicDirectoryError(
      "GETOBLIC_WORDPRESS_AUTHOR_FAILED",
      "WordPress author assignment failed.",
      502,
      stamped,
    );
  }
}

async function confirmPoolOwnership(
  active: GetOblicListingLink,
  wordpress: ReleaseGetOblicListingWordpressPort,
  now: Date,
): Promise<void> {
  const verified = await loadLiveListingOrStamp(active, wordpress, now);
  if (isGetOblicInventoryPoolAuthor(verified.author_id)) {
    return;
  }
  const stamped = await persistReleaseFailure(
    active,
    now,
    "GETOBLIC_WORDPRESS_AUTHOR_FAILED",
    "WordPress listing was not returned to the shared GetOblic inventory.",
  );
  throw new GetOblicDirectoryError(
    "GETOBLIC_WORDPRESS_AUTHOR_FAILED",
    "WordPress listing was not returned to the shared GetOblic inventory.",
    502,
    stamped,
  );
}

async function finalizeReleased(
  active: GetOblicListingLink,
  now: Date,
): Promise<ReleaseGetOblicListingResult> {
  const releasedAt = now.toISOString();
  const { data, error } = await supabaseAdmin
    .from(GETOBLIC_LISTING_LINKS_TABLE)
    .update({
      relationship_status: "released",
      released_at: releasedAt,
      last_verified_at: releasedAt,
      last_remote_error: null,
      last_remote_error_at: null,
      updated_at: releasedAt,
    })
    .eq("id", active.id)
    .eq("organization_id", active.organization_id)
    .in("relationship_status", [...RELEASABLE_STATUS_LIST])
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("Error releasing GetOblic listing relationship:", error);
    throw new GetOblicDirectoryError(
      "GETOBLIC_CONCURRENCY_CONFLICT",
      "GetOblic Directory could not complete this release safely.",
      503,
    );
  }

  const mapped = data
    ? mapListingLinkRow(data as Record<string, unknown>)
    : null;
  if (!mapped) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_CONCURRENCY_CONFLICT",
      "GetOblic Directory could not complete this release safely.",
      409,
    );
  }

  return { outcome: "released", link: mapped };
}

async function persistReleaseFailure(
  active: GetOblicListingLink,
  now: Date,
  code: string,
  message: string,
): Promise<GetOblicListingLink> {
  return persistActiveReleaseRow(active, {
    last_remote_error: boundRemoteError(code, message),
    last_remote_error_at: now.toISOString(),
    last_verified_at: now.toISOString(),
    updated_at: now.toISOString(),
  });
}

async function persistReleaseFailureFromUnknown(
  active: GetOblicListingLink,
  now: Date,
  error: unknown,
): Promise<GetOblicListingLink> {
  return persistActiveReleaseRow(active, {
    last_remote_error: boundRemoteErrorFromUnknown(error),
    last_remote_error_at: now.toISOString(),
    last_verified_at: now.toISOString(),
    updated_at: now.toISOString(),
  });
}

async function persistActiveReleaseRow(
  active: GetOblicListingLink,
  patch: Record<string, unknown>,
): Promise<GetOblicListingLink> {
  const { data, error } = await supabaseAdmin
    .from(GETOBLIC_LISTING_LINKS_TABLE)
    .update(patch)
    .eq("id", active.id)
    .eq("organization_id", active.organization_id)
    .in("relationship_status", ["claiming", "linked", "remote_missing"])
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("Error stamping GetOblic release failure:", error);
    throw new GetOblicDirectoryError(
      "GETOBLIC_CONCURRENCY_CONFLICT",
      "GetOblic Directory could not complete this release safely.",
      503,
    );
  }

  const mapped = data
    ? mapListingLinkRow(data as Record<string, unknown>)
    : null;
  if (!mapped) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_CONCURRENCY_CONFLICT",
      "GetOblic Directory could not complete this release safely.",
      409,
    );
  }
  return mapped;
}

function isWordpressListingNotFound(error: unknown): boolean {
  return (
    error instanceof GetOblicWordpressError &&
    (error.remoteCode === "LISTING_NOT_FOUND" || error.code === "NOT_FOUND")
  );
}

function isWordpressAuthFailure(error: unknown): boolean {
  return (
    error instanceof GetOblicWordpressError &&
    (error.code === "UNAUTHORIZED" ||
      error.code === "CONFIG_MISSING" ||
      error.remoteCode === "MISSING_API_KEY" ||
      error.remoteCode === "INVALID_API_KEY" ||
      error.remoteCode === "AUTH_NOT_CONFIGURED")
  );
}

function boundRemoteError(code: string, message: string): string {
  return sanitizeRemoteErrorText(`${code}: ${message}`);
}

function boundRemoteErrorFromUnknown(error: unknown): string {
  if (error instanceof GetOblicWordpressError) {
    return boundRemoteError(error.remoteCode ?? error.code, error.message);
  }
  if (error instanceof Error) {
    return boundRemoteError("REMOTE_ERROR", error.message);
  }
  return boundRemoteError("REMOTE_ERROR", "GetOblic Directory request failed.");
}

function sanitizeRemoteErrorText(value: string): string {
  const key = process.env.ATHENA_V2_DIRECTORY_API_KEY?.trim();
  let sanitized = value;
  if (key) {
    sanitized = sanitized.split(key).join("[redacted]");
  }
  return sanitized.slice(0, REMOTE_ERROR_MAX_LENGTH);
}
