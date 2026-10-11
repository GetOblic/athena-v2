/**
 * Unclaimed Find One Specific Business.
 *
 * Looks up existing GetOblic listings by Google Place ID, keeps an exact
 * canonical match, then calls acquireUnclaimedGetoblicDirectoryProspect.
 * Does not call Make, claim, assign a WordPress author, reserve listing
 * capacity, or queue generation.
 */

import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import { googleBusinessIdsEqual } from "@/services/getoblicDirectory/getoblicGoogleId";
import { getWordpressListingsByGoogleId } from "@/services/getoblicDirectory/getoblicWordpressClient";
import {
  GetOblicWordpressError,
  type GetOblicWordpressListing,
} from "@/services/getoblicDirectory/getoblicWordpressTypes";
import {
  acquireUnclaimedGetoblicDirectoryProspect,
  type UnclaimedGetoblicDirectoryAcquisition,
} from "@/services/getoblicDirectory/unclaimedGetoblicDirectoryAcquisition";
import {
  resolveUnclaimedGetoblicDirectoryMode,
  type UnclaimedGetoblicDirectoryMode,
} from "@/services/getoblicDirectory/unclaimedGetoblicDirectoryMode";

export type AcquireUnclaimedGetoblicProspectByGooglePlaceIdDeps = {
  resolveMode: (
    organizationId: string,
  ) => Promise<UnclaimedGetoblicDirectoryMode>;
  getListingsByGoogleId: (
    googleId: string,
  ) => Promise<GetOblicWordpressListing[]>;
  acquireListing: typeof acquireUnclaimedGetoblicDirectoryProspect;
};

const defaultDeps: AcquireUnclaimedGetoblicProspectByGooglePlaceIdDeps = {
  resolveMode: resolveUnclaimedGetoblicDirectoryMode,
  getListingsByGoogleId: getWordpressListingsByGoogleId,
  acquireListing: acquireUnclaimedGetoblicDirectoryProspect,
};

export async function acquireUnclaimedGetoblicProspectByGooglePlaceId(
  input: {
    organizationId: string;
    actorUserId: string | null;
    googleId: string;
  },
  deps: Partial<AcquireUnclaimedGetoblicProspectByGooglePlaceIdDeps> = {},
): Promise<UnclaimedGetoblicDirectoryAcquisition> {
  const resolved: AcquireUnclaimedGetoblicProspectByGooglePlaceIdDeps = {
    ...defaultDeps,
    ...deps,
  };
  const organizationId = input.organizationId.trim();
  if (!organizationId) {
    throw notAuthorizedError();
  }

  const mode = await resolved.resolveMode(organizationId);
  if (mode !== "unclaimed") {
    throw notAuthorizedError();
  }

  const googleId = input.googleId.trim();
  if (!googleId) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_SEARCH_INVALID_REQUEST",
      "google_id is required.",
      400,
    );
  }

  let listings: GetOblicWordpressListing[];
  try {
    listings = await resolved.getListingsByGoogleId(googleId);
  } catch (error) {
    throw mapGoogleIdLookupError(error);
  }

  const listingIds = exactCanonicalListingIds(listings, googleId);
  if (listingIds.length === 0) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_GOOGLE_PLACE_NOT_LISTED",
      "This business isn’t listed in GetOblic, so Athena didn’t add it.",
      404,
    );
  }
  if (listingIds.length > 1) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_GOOGLE_PLACE_AMBIGUOUS",
      "Athena found more than one GetOblic listing for this business and didn’t add one.",
      409,
    );
  }

  return resolved.acquireListing({
    organizationId,
    actorUserId: input.actorUserId,
    wordpressListingId: listingIds[0],
  });
}

function exactCanonicalListingIds(
  listings: readonly GetOblicWordpressListing[],
  googleId: string,
): number[] {
  const ids: number[] = [];
  for (const listing of listings) {
    if (!googleBusinessIdsEqual(listing.google_id, googleId)) {
      continue;
    }
    const listingId = listing.wordpress_listing_id;
    if (!Number.isSafeInteger(listingId) || listingId <= 0) {
      throw new GetOblicDirectoryError(
        "GETOBLIC_REMOTE_TRANSIENT",
        "GetOblic Directory is temporarily unavailable.",
        502,
      );
    }
    if (!ids.includes(listingId)) {
      ids.push(listingId);
    }
  }
  return ids;
}

function mapGoogleIdLookupError(error: unknown): GetOblicDirectoryError {
  if (error instanceof GetOblicDirectoryError) return error;
  if (
    error instanceof GetOblicWordpressError &&
    (error.code === "UNAUTHORIZED" || error.code === "CONFIG_MISSING")
  ) {
    return new GetOblicDirectoryError(
      "GETOBLIC_REMOTE_AUTH_FAILED",
      "GetOblic Directory authentication failed.",
      503,
    );
  }
  return new GetOblicDirectoryError(
    "GETOBLIC_REMOTE_TRANSIENT",
    "GetOblic Directory is temporarily unavailable.",
    502,
  );
}

function notAuthorizedError(): GetOblicDirectoryError {
  return new GetOblicDirectoryError(
    "GETOBLIC_UNCLAIMED_PROSPECTING_NOT_AUTHORIZED",
    "Athena couldn’t add this Google business.",
    403,
  );
}
