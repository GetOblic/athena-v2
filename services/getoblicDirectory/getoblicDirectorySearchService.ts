/**
 * Server-only GetOblic Directory search orchestration.
 * Read-only: no Prospect creation, claim, allocation, or Knowledge Base writes.
 */

import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import {
  classifyGetOblicDirectorySearchClaimStatus,
  GETOBLIC_DIRECTORY_SEARCH_DEFAULT_LISTING_TYPE,
  type GetOblicDirectorySearchClaimStatus,
} from "@/services/getoblicDirectory/getoblicDirectoryTypes";
import { getActiveGetOblicClaimOrganizationIdsByWordPressListingIds } from "@/services/getoblicDirectory/getoblicDirectoryService";
import {
  normalizeGetOblicWordpressSearchRequest,
  searchWordpressListings,
} from "@/services/getoblicDirectory/getoblicWordpressClient";
import {
  GetOblicWordpressError,
  type GetOblicWordpressSearchHit,
  type GetOblicWordpressSearchRequest,
  type GetOblicWordpressSearchResponse,
} from "@/services/getoblicDirectory/getoblicWordpressTypes";

export type GetOblicDirectorySearchWordpressPort = {
  searchWordpressListings: typeof searchWordpressListings;
};

const defaultWordpressPort: GetOblicDirectorySearchWordpressPort = {
  searchWordpressListings,
};

export type GetOblicDirectorySearchHit = GetOblicWordpressSearchHit & {
  athena_claim_status: GetOblicDirectorySearchClaimStatus;
};

export type GetOblicDirectorySearchResult = {
  keywords: string;
  listing_type: string;
  page: number;
  per_page: number;
  found_posts: number;
  max_num_pages: number;
  results: GetOblicDirectorySearchHit[];
};

export type SearchGetOblicDirectoryInput = {
  organizationId: string;
  keywords: unknown;
  listing_type?: unknown;
  page?: unknown;
  per_page?: unknown;
};

export function toPublicGetOblicDirectorySearch(
  search: GetOblicDirectorySearchResult,
): GetOblicDirectorySearchResult {
  return {
    keywords: search.keywords,
    listing_type: search.listing_type,
    page: search.page,
    per_page: search.per_page,
    found_posts: search.found_posts,
    max_num_pages: search.max_num_pages,
    results: search.results.map((result) => ({
      wordpress_listing_id: result.wordpress_listing_id,
      title: result.title,
      permalink: result.permalink,
      status: result.status,
      listing_type: result.listing_type,
      category: result.category,
      location_display: result.location_display,
      lat: result.lat,
      lng: result.lng,
      image: result.image,
      google_id: result.google_id,
      athena_claim_status: result.athena_claim_status,
    })),
  };
}

export async function searchGetOblicDirectory(
  input: SearchGetOblicDirectoryInput,
  wordpress: GetOblicDirectorySearchWordpressPort = defaultWordpressPort,
): Promise<GetOblicDirectorySearchResult> {
  const organizationId = input.organizationId.trim();
  if (!organizationId) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_SEARCH_INVALID_REQUEST",
      "Organization context is required.",
      400,
    );
  }

  let request: GetOblicWordpressSearchRequest;
  try {
    request = normalizeGetOblicWordpressSearchRequest({
      keywords: input.keywords,
      listing_type: input.listing_type,
      page: input.page,
      per_page: input.per_page,
    });
  } catch (error) {
    throw mapWordpressSearchError(error);
  }

  let remote: GetOblicWordpressSearchResponse;
  try {
    remote = await wordpress.searchWordpressListings(request);
  } catch (error) {
    throw mapWordpressSearchError(error);
  }

  const listingIds = remote.results.map((hit) => hit.wordpress_listing_id);
  const claims =
    await getActiveGetOblicClaimOrganizationIdsByWordPressListingIds(
      listingIds,
    );

  return {
    keywords: remote.query.keywords || request.keywords,
    listing_type: remote.query.listing_type || request.listing_type,
    page: remote.pagination.page,
    per_page: remote.pagination.per_page,
    found_posts: remote.pagination.found_posts,
    max_num_pages: remote.pagination.max_num_pages,
    results: remote.results.map((hit) => ({
      ...hit,
      athena_claim_status: classifyGetOblicDirectorySearchClaimStatus(
        organizationId,
        claims.get(hit.wordpress_listing_id) ?? null,
      ),
    })),
  };
}

function mapWordpressSearchError(error: unknown): GetOblicDirectoryError {
  if (error instanceof GetOblicDirectoryError) {
    return error;
  }

  if (
    error instanceof GetOblicWordpressError &&
    (error.code === "UNAUTHORIZED" ||
      error.code === "CONFIG_MISSING" ||
      error.remoteCode === "MISSING_API_KEY" ||
      error.remoteCode === "INVALID_API_KEY" ||
      error.remoteCode === "AUTH_NOT_CONFIGURED")
  ) {
    return new GetOblicDirectoryError(
      "GETOBLIC_REMOTE_AUTH_FAILED",
      "GetOblic Directory authentication failed.",
      503,
    );
  }

  if (error instanceof GetOblicWordpressError && error.code === "VALIDATION") {
    return new GetOblicDirectoryError(
      "GETOBLIC_SEARCH_INVALID_REQUEST",
      error.message,
      400,
    );
  }

  if (error instanceof GetOblicWordpressError && error.code === "TIMEOUT") {
    return new GetOblicDirectoryError(
      "GETOBLIC_REMOTE_TRANSIENT",
      "GetOblic Directory search timed out.",
      504,
    );
  }

  const message =
    error instanceof GetOblicWordpressError
      ? error.message
      : "GetOblic Directory search is unavailable.";

  return new GetOblicDirectoryError(
    "GETOBLIC_REMOTE_TRANSIENT",
    sanitizeSearchError(message),
    502,
  );
}

function sanitizeSearchError(value: string): string {
  const key = process.env.ATHENA_V2_DIRECTORY_API_KEY?.trim();
  let sanitized = value;
  if (key) {
    sanitized = sanitized.split(key).join("[redacted]");
  }
  return sanitized.slice(0, 500);
}

export const GETOBLIC_DIRECTORY_SEARCH_ROUTE_DEFAULTS = {
  listing_type: GETOBLIC_DIRECTORY_SEARCH_DEFAULT_LISTING_TYPE,
} as const;
