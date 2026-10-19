/**
 * Unclaimed GetOblic Directory acquisition.
 *
 * Verifies the WordPress listing, then calls
 * acquire_unclaimed_getoblic_prospect with that function's existing
 * parameters. Same-organization canonical listing Prospects are reused.
 * Empty Facebook, Instagram, LinkedIn, and WhatsApp columns are filled
 * from that listing afterward, each by its own conditional update.
 * This module does not claim, reserve listing
 * capacity, assign a WordPress author, call Make, or queue generation.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import { fillBlankProspectSocialColumns } from "@/services/getoblicDirectory/fillBlankProspectSocialColumns";
import {
  mapGetOblicListingSocial,
  type GetOblicListingSocialFields,
} from "@/services/getoblicDirectory/getoblicListingSocialImport";
import { resolveUnclaimedGetoblicDirectoryMode } from "@/services/getoblicDirectory/unclaimedGetoblicDirectoryMode";
import {
  getWordpressListingById,
  parseGetOblicWordpressListingId,
} from "@/services/getoblicDirectory/getoblicWordpressClient";
import {
  GetOblicWordpressError,
  type GetOblicWordpressListing,
} from "@/services/getoblicDirectory/getoblicWordpressTypes";
import { ProspectCapacityExceededError } from "@/services/prospects/prospectCapacity";
import { normalizeWebsiteUrl } from "@/services/prospects/prospectUtils";

export const ACQUIRE_UNCLAIMED_GETOBLIC_PROSPECT_RPC =
  "acquire_unclaimed_getoblic_prospect" as const;

const PROSPECT_SOURCE = "getoblic";
const PROSPECT_ORIGIN = "getoblic_directory";
const TEXT_MAX = 300;
const URL_MAX = 500;

export type UnclaimedGetoblicDirectoryAcquisition = {
  prospectId: string;
  inserted: boolean;
};

export type AcquireUnclaimedGetoblicProspectRpcArgs = {
  p_organization_id: string;
  p_wordpress_listing_id: number;
  p_business_name: string;
  p_user_id: string | null;
  p_website: string | null;
  p_email: string | null;
  p_phone: string | null;
  p_address: string | null;
  p_city: string | null;
  p_state: string | null;
  p_country: string | null;
  p_category: string | null;
  p_google_business_url: string | null;
};

type SameOrgDirectoryProspect = {
  id: string;
  raw_json: unknown;
};

export type AcquireUnclaimedGetoblicDirectoryDeps = {
  resolveMode: typeof resolveUnclaimedGetoblicDirectoryMode;
  getListingById: typeof getWordpressListingById;
  findSameOrgProspectId: (
    organizationId: string,
    wordpressListingId: number,
  ) => Promise<string | null>;
  acquire: (
    args: AcquireUnclaimedGetoblicProspectRpcArgs,
  ) => Promise<UnclaimedGetoblicDirectoryAcquisition>;
};

const defaultDeps: AcquireUnclaimedGetoblicDirectoryDeps = {
  resolveMode: resolveUnclaimedGetoblicDirectoryMode,
  getListingById: getWordpressListingById,
  findSameOrgProspectId: findSameOrgCanonicalDirectoryProspectId,
  acquire: acquireUnclaimedGetoblicProspectRpc,
};

export async function acquireUnclaimedGetoblicDirectoryProspect(
  input: {
    organizationId: string;
    actorUserId: string | null;
    wordpressListingId: unknown;
  },
  deps: Partial<AcquireUnclaimedGetoblicDirectoryDeps> = {},
): Promise<UnclaimedGetoblicDirectoryAcquisition> {
  const resolved: AcquireUnclaimedGetoblicDirectoryDeps = {
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

  const wordpressListingId = parseListingId(input.wordpressListingId);
  const existingId = await resolved.findSameOrgProspectId(
    organizationId,
    wordpressListingId,
  );
  const listing = await readAuthoritativeListing(
    wordpressListingId,
    resolved.getListingById,
  );
  const social = mapGetOblicListingSocial(listing);

  if (existingId) {
    await fillEmptyUnclaimedListingSocial({
      organizationId,
      prospectId: existingId,
      social,
    });
    return { prospectId: existingId, inserted: false };
  }

  const imported = factualListingImport(listing);
  if (!imported.businessName) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_NEEDS_BUSINESS_NAME",
      "Athena couldn’t add this business because its name is missing.",
      400,
    );
  }

  const acquired = await resolved.acquire({
    p_organization_id: organizationId,
    p_wordpress_listing_id: wordpressListingId,
    p_business_name: imported.businessName,
    p_user_id: compact(input.actorUserId, 80),
    p_website: imported.website,
    p_email: imported.email,
    p_phone: imported.phone,
    p_address: imported.address,
    p_city: imported.city,
    p_state: null,
    p_country: null,
    p_category: imported.category,
    p_google_business_url: imported.googleBusinessUrl,
  });
  await fillEmptyUnclaimedListingSocial({
    organizationId,
    prospectId: acquired.prospectId,
    social,
  });
  return acquired;
}

export async function findSameOrgDirectoryProspectIds(
  organizationId: string,
  wordpressListingIds: number[],
): Promise<Map<number, string>> {
  const ids = [
    ...new Set(
      wordpressListingIds.filter(
        (id) => Number.isSafeInteger(id) && id > 0,
      ),
    ),
  ];
  const matches = new Map<number, string>();
  const scopedOrganizationId = organizationId.trim();
  if (!scopedOrganizationId || ids.length === 0) {
    return matches;
  }

  const { data, error } = await supabaseAdmin
    .from("prospects")
    .select("id, created_at, raw_json")
    .eq("organization_id", scopedOrganizationId)
    .eq("source", PROSPECT_SOURCE)
    .filter("raw_json->>origin", "eq", PROSPECT_ORIGIN)
    .filter(
      "raw_json->>wordpress_listing_id",
      "in",
      `(${ids.join(",")})`,
    )
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(100);

  if (error) {
    console.error("Same-organization GetOblic Prospect lookup failed:", error);
    throw new GetOblicDirectoryError(
      "GETOBLIC_CONCURRENCY_CONFLICT",
      "Athena couldn’t add this business. Try again.",
    );
  }

  for (const row of (data ?? []) as SameOrgDirectoryProspect[]) {
    const listingId = readCanonicalWordpressListingId(row.raw_json);
    if (listingId == null || !ids.includes(listingId) || matches.has(listingId)) {
      continue;
    }
    if (!row.id) continue;
    matches.set(listingId, row.id);
  }

  return matches;
}

export function mapAcquireUnclaimedGetoblicProspectRpcError(error: {
  code?: string;
  message?: string;
  details?: string;
}): never {
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  if (text.includes("unclaimed_getoblic_prospecting_not_authorized")) {
    throw notAuthorizedError();
  }
  if (text.includes("unclaimed_getoblic_listing_id_invalid")) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_INVALID_WORDPRESS_LISTING_ID",
      "wordpress_listing_id must be a positive integer.",
      400,
    );
  }
  if (text.includes("unclaimed_getoblic_business_name_required")) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_NEEDS_BUSINESS_NAME",
      "Athena couldn’t add this business because its name is missing.",
      400,
    );
  }
  if (text.includes("prospect_capacity_exceeded")) {
    throw new ProspectCapacityExceededError();
  }
  if (error.code === "23505" || /duplicate key|unique constraint/i.test(text)) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_NAME_COLLISION",
      "A similar opportunity already exists. Athena didn’t add a second one.",
      409,
    );
  }
  throw new GetOblicDirectoryError(
    "GETOBLIC_CONCURRENCY_CONFLICT",
    "Athena couldn’t add this business. Try again.",
  );
}

async function findSameOrgCanonicalDirectoryProspectId(
  organizationId: string,
  wordpressListingId: number,
): Promise<string | null> {
  const matches = await findSameOrgDirectoryProspectIds(organizationId, [
    wordpressListingId,
  ]);
  return matches.get(wordpressListingId) ?? null;
}

async function acquireUnclaimedGetoblicProspectRpc(
  args: AcquireUnclaimedGetoblicProspectRpcArgs,
): Promise<UnclaimedGetoblicDirectoryAcquisition> {
  const { data, error } = await supabaseAdmin.rpc(
    ACQUIRE_UNCLAIMED_GETOBLIC_PROSPECT_RPC,
    args,
  );

  if (error) {
    mapAcquireUnclaimedGetoblicProspectRpcError(error);
  }

  const row = readAcquireRow(data);
  if (!row) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_CONCURRENCY_CONFLICT",
      "Athena couldn’t add this business. Try again.",
    );
  }
  return row;
}

function readAcquireRow(
  data: unknown,
): UnclaimedGetoblicDirectoryAcquisition | null {
  const record = Array.isArray(data) ? data[0] : data;
  if (!record || typeof record !== "object") return null;
  const row = record as { prospect_id?: unknown; inserted?: unknown };
  if (typeof row.prospect_id !== "string" || !row.prospect_id.trim()) {
    return null;
  }
  if (typeof row.inserted !== "boolean") return null;
  return { prospectId: row.prospect_id, inserted: row.inserted };
}

async function readAuthoritativeListing(
  wordpressListingId: number,
  getListingById: AcquireUnclaimedGetoblicDirectoryDeps["getListingById"],
): Promise<GetOblicWordpressListing> {
  let listing: GetOblicWordpressListing;
  try {
    listing = await getListingById(wordpressListingId);
  } catch (error) {
    throw mapListingReadError(error);
  }
  if (listing.wordpress_listing_id !== wordpressListingId) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_REMOTE_LISTING_MISSING",
      "Athena couldn’t find that business right now.",
      409,
    );
  }
  return listing;
}

const UNCLAIMED_SOCIAL_LOG_LABEL = "Unclaimed GetOblic social import";

async function fillEmptyUnclaimedListingSocial(args: {
  organizationId: string;
  prospectId: string;
  social: GetOblicListingSocialFields;
}): Promise<void> {
  await fillBlankProspectSocialColumns({
    organizationId: args.organizationId,
    prospectId: args.prospectId,
    values: {
      facebook: args.social.facebook,
      instagram: args.social.instagram,
      linkedin: args.social.linkedin,
      whatsapp_number: args.social.whatsapp,
    },
    logLabel: UNCLAIMED_SOCIAL_LOG_LABEL,
  });
}

function factualListingImport(listing: GetOblicWordpressListing): {
  businessName: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  category: string | null;
  googleBusinessUrl: string | null;
} {
  const website = factualWebsite(listing.website);
  return {
    businessName: compact(listing.title, TEXT_MAX),
    website,
    email: factualEmail(listing.email),
    phone: compact(listing.phone, 120),
    address: compact(listing.address, TEXT_MAX),
    city: compact(listing.region?.name, 120),
    category: firstCategoryName(listing.category),
    googleBusinessUrl: compact(listing.google_place_url, URL_MAX),
  };
}

function factualWebsite(value: string | null | undefined): string | null {
  const normalized = compact(value, URL_MAX);
  if (!normalized) return null;
  const website = normalizeWebsiteUrl(normalized);
  if (!website) return null;
  try {
    const parsed = new URL(website);
    const host = parsed.hostname.replace(/^www\./i, "");
    if (host === "getoblic.com" && /\/listing\//i.test(parsed.pathname)) {
      return null;
    }
  } catch {
    return null;
  }
  return website;
}

function factualEmail(value: string | null | undefined): string | null {
  const email = compact(value, 200);
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) return null;
  return email;
}

function firstCategoryName(
  categories: GetOblicWordpressListing["category"] | null | undefined,
): string | null {
  for (const category of categories ?? []) {
    const name = compact(category?.name, 120);
    if (name) return name;
  }
  return null;
}

function compact(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function readCanonicalWordpressListingId(rawJson: unknown): number | null {
  if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) {
    return null;
  }
  const record = rawJson as Record<string, unknown>;
  if (record.origin !== PROSPECT_ORIGIN) return null;
  const direct = readPositiveListingId(record.wordpress_listing_id);
  if (direct != null) return direct;
  const observed = record.observed;
  if (!observed || typeof observed !== "object" || Array.isArray(observed)) {
    return null;
  }
  return readPositiveListingId(
    (observed as Record<string, unknown>).wordpress_listing_id,
  );
}

function readPositiveListingId(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^[1-9][0-9]*$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function parseListingId(value: unknown): number {
  try {
    const listingId = parseGetOblicWordpressListingId(value);
    if (!Number.isSafeInteger(listingId)) {
      throw new GetOblicWordpressError(
        "VALIDATION",
        "wordpress_listing_id must be a positive integer.",
        400,
      );
    }
    return listingId;
  } catch (error) {
    if (error instanceof GetOblicDirectoryError) throw error;
    throw new GetOblicDirectoryError(
      "GETOBLIC_INVALID_WORDPRESS_LISTING_ID",
      "wordpress_listing_id must be a positive integer.",
      400,
    );
  }
}

function mapListingReadError(error: unknown): GetOblicDirectoryError {
  if (error instanceof GetOblicDirectoryError) return error;
  if (error instanceof GetOblicWordpressError && error.code === "NOT_FOUND") {
    return new GetOblicDirectoryError(
      "GETOBLIC_REMOTE_LISTING_MISSING",
      "Athena couldn’t find that business right now.",
      409,
    );
  }
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
    "Athena couldn’t add this business.",
    403,
  );
}
