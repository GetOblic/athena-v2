/**
 * CO-5D2 Google selection → Make → verified WordPress listing → canonical
 * Prospect. Make assigns author_id; Athena never POSTs /listings/{id}/author.
 * Conversion never queues generation.
 *
 * Never import this module from client components.
 */

import type { GoogleBusinessPayload } from "@/lib/googlePlaces/googlePlacesTypes";
import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import type { ClaimKnownListingWordpressPort } from "@/services/getoblicDirectory/getoblicDirectoryClaimService";
import {
  convertGetOblicDirectoryListing,
  type GetOblicConvertDependencies,
  type GetOblicConvertObservedSnapshot,
  type GetOblicConvertResult,
} from "@/services/getoblicDirectory/getoblicDirectoryConvertService";
import { getGetOblicDirectorySettings } from "@/services/getoblicDirectory/getoblicDirectoryService";
import { googleBusinessIdsEqual } from "@/services/getoblicDirectory/getoblicGoogleId";
import { getWordpressListingById } from "@/services/getoblicDirectory/getoblicWordpressClient";
import {
  GetOblicWordpressError,
  type GetOblicWordpressListing,
} from "@/services/getoblicDirectory/getoblicWordpressTypes";
import type { Co5GoogleTrace } from "@/services/googleBusiness/googleBusinessConversionTrace";
import {
  addGoogleBusinessListing,
  readPositiveInteger,
  sanitizeGoogleBusinessPayload,
} from "@/services/googleBusiness/googleBusinessMakeService";
import {
  GoogleBusinessMakeError,
  googleBusinessMakeErrorMessage,
  type GoogleBusinessMakeResult,
} from "@/services/googleBusiness/googleBusinessMakeTypes";

export type ConvertGoogleBusinessSelectionInput = {
  organizationId: string;
  payload: unknown;
  actorUserId: string | null;
  actorLicenseeAccountId: string | null;
  now?: Date;
  diagnosticTrace?: Co5GoogleTrace;
};

export type ConvertGoogleBusinessSelectionResult = {
  make: GoogleBusinessMakeResult;
  conversion: GetOblicConvertResult;
};

export type ConvertGoogleBusinessSelectionDeps = {
  addListing?: typeof addGoogleBusinessListing;
  getSettings?: typeof getGetOblicDirectorySettings;
  getListingById?: typeof getWordpressListingById;
  convertListing?: typeof convertGetOblicDirectoryListing;
};

function fail(code: GoogleBusinessMakeError["code"]): never {
  throw new GoogleBusinessMakeError(
    code,
    googleBusinessMakeErrorMessage(code),
  );
}

export function observedSnapshotFromGooglePayload(
  payload: GoogleBusinessPayload,
): GetOblicConvertObservedSnapshot {
  const category = payload.category?.trim() ?? "";
  return {
    title: payload.company_name,
    permalink: null,
    listing_type: null,
    category: category
      ? [{ term_id: null, slug: category, name: category }]
      : [],
    location_display: payload.address?.trim() || null,
    lat: compactFiniteNumber(payload.latitude),
    lng: compactFiniteNumber(payload.longitude),
    google_id: payload.google_id,
    google_place_url: payload.google_url?.trim() || null,
    image: null,
  };
}

export function mergeEmptyListingFromGooglePayload(
  listing: GetOblicWordpressListing,
  payload: GoogleBusinessPayload,
): GetOblicWordpressListing {
  return {
    ...listing,
    website: firstNonEmpty(listing.website, payload.website),
    phone: firstNonEmpty(listing.phone, payload.business_phone),
    address: firstNonEmpty(listing.address, payload.address),
    google_place_url: firstNonEmpty(listing.google_place_url, payload.google_url),
    timezone: firstNonEmpty(listing.timezone, payload.timezone),
    text_hours: firstNonEmpty(listing.text_hours, payload.opening_hours),
  };
}

export async function convertGoogleBusinessSelection(
  input: ConvertGoogleBusinessSelectionInput,
  deps: ConvertGoogleBusinessSelectionDeps = {},
  convertDependencies?: GetOblicConvertDependencies,
  wordpress?: ClaimKnownListingWordpressPort,
): Promise<ConvertGoogleBusinessSelectionResult> {
  const addListing = deps.addListing ?? addGoogleBusinessListing;
  const getSettings = deps.getSettings ?? getGetOblicDirectorySettings;
  const getListingById = deps.getListingById ?? getWordpressListingById;
  const convertListing = deps.convertListing ?? convertGetOblicDirectoryListing;
  const trace = input.diagnosticTrace;

  const payload = sanitizeGoogleBusinessPayload(input.payload);
  trace?.log({
    stage: "author_mapping_lookup_start",
    organization_id: input.organizationId,
  });
  const settingsResult = await getSettings(input.organizationId);
  const mappedAuthorId = settingsResult.configured
    ? readPositiveInteger(settingsResult.settings.wordpress_author_id)
    : null;
  trace?.log({
    stage: "author_mapping_lookup_done",
    organization_id: input.organizationId,
  });
  if (mappedAuthorId == null) {
    fail("GOOGLE_BUSINESS_AUTHOR_MAPPING_MISSING");
  }

  const makeStartedAt = Date.now();
  trace?.log({
    stage: "make_start",
    organization_id: input.organizationId,
  });
  const make = await addListing({
    organizationId: input.organizationId,
    payload,
  });
  trace?.log({
    stage: "make_done",
    organization_id: input.organizationId,
    wordpress_listing_id: make.wordpress_listing_id,
    duration_ms: Date.now() - makeStartedAt,
  });

  if (!googleBusinessIdsEqual(make.google_id, payload.google_id)) {
    fail("GOOGLE_BUSINESS_GOOGLE_ID_MISMATCH");
  }

  const wordpressStartedAt = Date.now();
  trace?.log({
    stage: "wordpress_verify_start",
    organization_id: input.organizationId,
    wordpress_listing_id: make.wordpress_listing_id,
  });
  let listing: GetOblicWordpressListing | null = null;
  try {
    listing = await getListingById(make.wordpress_listing_id);
  } catch (error) {
    if (!isWordpressListingNotFound(error)) {
      if (error instanceof GetOblicDirectoryError) {
        throw error;
      }
      throw mapWordpressLookupError(error);
    }
  }
  trace?.log({
    stage: "wordpress_verify_done",
    organization_id: input.organizationId,
    wordpress_listing_id: make.wordpress_listing_id,
    author_match: listing ? listing.author_id === mappedAuthorId : undefined,
    google_id_match: listing
      ? googleBusinessIdsEqual(listing.google_id, payload.google_id)
      : undefined,
    duration_ms: Date.now() - wordpressStartedAt,
  });

  if (listing) {
    if (!googleBusinessIdsEqual(listing.google_id, payload.google_id)) {
      fail("GOOGLE_BUSINESS_GOOGLE_ID_MISMATCH");
    }
    if (listing.author_id !== mappedAuthorId) {
      fail("GOOGLE_BUSINESS_AUTHOR_MISMATCH");
    }
    listing = mergeEmptyListingFromGooglePayload(listing, payload);
  }

  trace?.log({
    stage: "directory_convert_start",
    organization_id: input.organizationId,
    wordpress_listing_id: make.wordpress_listing_id,
  });
  const conversion = await convertListing(
    {
      organizationId: input.organizationId,
      wordpressListingId: make.wordpress_listing_id,
      observed: observedSnapshotFromGooglePayload(payload),
      actorUserId: input.actorUserId,
      actorLicenseeAccountId: input.actorLicenseeAccountId,
      now: input.now,
      listingAuthorPolicy: "mapped_author",
      expectedGoogleId: payload.google_id,
      expectedWordpressAuthorId: mappedAuthorId,
      preloadedListing: listing,
      diagnosticTrace: trace,
    },
    convertDependencies,
    wordpress,
  );
  trace?.log({
    stage: "directory_convert_done",
    organization_id: input.organizationId,
    wordpress_listing_id: make.wordpress_listing_id,
    prospect_id: conversion.prospect_id,
    outcome: conversion.outcome,
  });
  trace?.log({
    stage: "google_convert_done",
    organization_id: input.organizationId,
    wordpress_listing_id: make.wordpress_listing_id,
    prospect_id: conversion.prospect_id,
    outcome: conversion.outcome,
  });

  return { make, conversion };
}

function isWordpressListingNotFound(error: unknown): boolean {
  return (
    error instanceof GetOblicWordpressError &&
    (error.remoteCode === "LISTING_NOT_FOUND" || error.code === "NOT_FOUND")
  );
}

function mapWordpressLookupError(error: unknown): GetOblicDirectoryError {
  if (error instanceof GetOblicWordpressError) {
    if (
      error.code === "UNAUTHORIZED" ||
      error.code === "CONFIG_MISSING" ||
      error.remoteCode === "MISSING_API_KEY" ||
      error.remoteCode === "INVALID_API_KEY" ||
      error.remoteCode === "AUTH_NOT_CONFIGURED"
    ) {
      return new GetOblicDirectoryError(
        "GETOBLIC_REMOTE_AUTH_FAILED",
        "GetOblic Directory authentication failed.",
        503,
      );
    }
    if (error.code === "TIMEOUT") {
      return new GetOblicDirectoryError(
        "GETOBLIC_REMOTE_TRANSIENT",
        "GetOblic Directory timed out.",
        504,
      );
    }
  }
  return new GetOblicDirectoryError(
    "GETOBLIC_REMOTE_TRANSIENT",
    "GetOblic Directory is temporarily unavailable.",
    502,
  );
}

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) return trimmed;
  }
  return null;
}

function compactFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}
