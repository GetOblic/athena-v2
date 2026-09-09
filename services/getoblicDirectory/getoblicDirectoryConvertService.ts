/**
 * CO-1 / CO-4 GetOblic Directory → canonical Prospect conversion.
 * Server-owned orchestration: preflight, create/reuse one Prospect, claim,
 * and import proven factual listing metadata. Conversion never queues
 * generation — claiming remains an ownership / data-import operation only.
 *
 * Does not search Google, write Knowledge Base, or invent identity fields.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Co5GoogleTrace } from "@/services/googleBusiness/googleBusinessConversionTrace";
import {
  GetOblicDirectoryError,
  isPostgresUniqueViolation,
} from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import {
  claimKnownExistingListing,
  type ClaimKnownListingResult,
  type ClaimKnownListingWordpressPort,
  type ClaimListingVerification,
} from "@/services/getoblicDirectory/getoblicDirectoryClaimService";
import {
  getActiveGetOblicClaimByWordPressListingId,
  getGetOblicAllocationUsage,
  getGetOblicDirectorySettings,
  hasOrganizationAlreadyConsumedListing,
} from "@/services/getoblicDirectory/getoblicDirectoryService";
import { googleBusinessIdsEqual } from "@/services/getoblicDirectory/getoblicGoogleId";
import {
  isGetOblicInventoryPoolAuthor,
  type ActiveGetOblicRelationshipStatus,
} from "@/services/getoblicDirectory/getoblicDirectoryTypes";
import {
  getWordpressListingById,
  parseGetOblicWordpressListingId,
} from "@/services/getoblicDirectory/getoblicWordpressClient";
import {
  GetOblicWordpressError,
  type GetOblicWordpressListing,
  type GetOblicWordpressSocialLink,
  type GetOblicWordpressTaxonomyTerm,
  type GetOblicWordpressWorkHours,
} from "@/services/getoblicDirectory/getoblicWordpressTypes";
import { ensureProspectGenerationQueued } from "@/services/prospects/prospectImporter";
import {
  createProspect,
  deleteProspect,
  findProspectByNameAndCity,
  findProspectByWebsite,
  getProspectById,
  updateProspect,
  type Prospect,
} from "@/services/prospects/prospectService";
import { normalizeWebsiteUrl } from "@/services/prospects/prospectUtils";

export const GETOBLIC_PROSPECT_SOURCE = "getoblic" as const;
export const GETOBLIC_PROSPECT_PROVENANCE_ORIGIN = "getoblic_directory" as const;

export const GETOBLIC_CONVERT_OUTCOMES = [
  "created",
  "reused",
  "already_owned",
  "needs_business_name",
  "name_collision",
  "settings_missing",
  "capacity_exceeded",
  "unavailable",
  "remote_missing",
  "claim_incomplete",
] as const;

export type GetOblicConvertOutcome = (typeof GETOBLIC_CONVERT_OUTCOMES)[number];

export type GetOblicConvertObservedCategory = {
  term_id: number | null;
  slug: string | null;
  name: string | null;
};

export type GetOblicConvertObservedSnapshot = {
  title: string | null;
  permalink: string | null;
  listing_type: string | null;
  category: GetOblicConvertObservedCategory[];
  location_display: string | null;
  lat: number | null;
  lng: number | null;
  google_id: string | null;
  google_place_url: string | null;
  image: string | null;
};

export type GetOblicListingAuthorPolicy = "inventory_pool" | "mapped_author";

export type GetOblicConvertInput = {
  organizationId: string;
  wordpressListingId: unknown;
  observed?: unknown;
  actorUserId: string | null;
  actorLicenseeAccountId: string | null;
  now?: Date;
  listingAuthorPolicy?: GetOblicListingAuthorPolicy;
  expectedGoogleId?: string;
  expectedWordpressAuthorId?: number;
  preloadedListing?: GetOblicWordpressListing | null;
  diagnosticTrace?: Co5GoogleTrace;
};

export type GetOblicConvertResult = {
  outcome: GetOblicConvertOutcome;
  prospect_id: string | null;
  website_ready: boolean;
  status: string | null;
  generation_queued: boolean;
  allocated: boolean;
};

export type GetOblicConvertDependencies = {
  getSettings: typeof getGetOblicDirectorySettings;
  getAllocationUsage: typeof getGetOblicAllocationUsage;
  hasAlreadyConsumedListing: typeof hasOrganizationAlreadyConsumedListing;
  getActiveListingClaim: typeof getActiveGetOblicClaimByWordPressListingId;
  getListingById: typeof getWordpressListingById;
  getProspectById: typeof getProspectById;
  findProspectByNameAndCity: typeof findProspectByNameAndCity;
  findProspectByWebsite: typeof findProspectByWebsite;
  findOriginProspectByListingId: (
    organizationId: string,
    wordpressListingId: number,
  ) => Promise<Prospect | null>;
  createProspect: typeof createProspect;
  updateProspect: typeof updateProspect;
  deleteProspect: typeof deleteProspect;
  claimKnownExistingListing: typeof claimKnownExistingListing;
  ensureProspectGenerationQueued: typeof ensureProspectGenerationQueued;
};

const defaultDependencies: GetOblicConvertDependencies = {
  getSettings: getGetOblicDirectorySettings,
  getAllocationUsage: getGetOblicAllocationUsage,
  hasAlreadyConsumedListing: hasOrganizationAlreadyConsumedListing,
  getActiveListingClaim: getActiveGetOblicClaimByWordPressListingId,
  getListingById: getWordpressListingById,
  getProspectById,
  findProspectByNameAndCity,
  findProspectByWebsite,
  findOriginProspectByListingId: findGetOblicOriginProspectByListingId,
  createProspect,
  updateProspect,
  deleteProspect,
  claimKnownExistingListing,
  ensureProspectGenerationQueued,
};

const TEXT_MAX = 300;
const URL_MAX = 500;
const DESCRIPTION_MAX = 4000;
const GALLERY_MAX = 24;
const TAGS_MAX = 24;

export function toPublicGetOblicConversion(result: GetOblicConvertResult): {
  outcome: GetOblicConvertOutcome;
  prospect_id: string | null;
  website_ready: boolean;
  status: string | null;
  generation_queued: boolean;
} {
  return {
    outcome: result.outcome,
    prospect_id: result.prospect_id,
    website_ready: result.website_ready,
    status: result.status,
    generation_queued: result.generation_queued,
  };
}

export function convertOutcomeHttpStatus(outcome: GetOblicConvertOutcome): number {
  switch (outcome) {
    case "created":
    case "reused":
    case "already_owned":
      return 200;
    case "needs_business_name":
      return 400;
    case "claim_incomplete":
      return 409;
    default:
      return 409;
  }
}

export function convertOutcomeErrorCode(
  outcome: GetOblicConvertOutcome,
): string {
  switch (outcome) {
    case "needs_business_name":
      return "GETOBLIC_NEEDS_BUSINESS_NAME";
    case "name_collision":
      return "GETOBLIC_NAME_COLLISION";
    case "settings_missing":
      return "GETOBLIC_DIRECTORY_NOT_CONFIGURED";
    case "capacity_exceeded":
      return "GETOBLIC_LISTING_CAPACITY_EXCEEDED";
    case "unavailable":
      return "GETOBLIC_LISTING_CLAIMED_OTHER_ORG";
    case "remote_missing":
      return "GETOBLIC_REMOTE_LISTING_MISSING";
    case "claim_incomplete":
      return "GETOBLIC_CONVERT_INCOMPLETE";
    default:
      return "GETOBLIC_CONCURRENCY_CONFLICT";
  }
}

export function convertOutcomeErrorMessage(
  outcome: GetOblicConvertOutcome,
): string {
  switch (outcome) {
    case "needs_business_name":
      return "Athena couldn’t add this business because its name is missing.";
    case "name_collision":
      return "A similar opportunity already exists. Athena didn’t add a second one.";
    case "settings_missing":
      return "This workspace isn’t set up to add GetOblic businesses yet.";
    case "capacity_exceeded":
      return "You’ve reached listing capacity and must release an existing GetOblic listing before adding another.";
    case "unavailable":
      return "This business is already being pursued.";
    case "remote_missing":
      return "Athena couldn’t find that business right now.";
    case "claim_incomplete":
      return "Athena couldn’t add this business. Try again.";
    default:
      return "Athena couldn’t add this business. Try again.";
  }
}

export function sanitizeGetOblicConvertObserved(
  value: unknown,
): GetOblicConvertObservedSnapshot {
  const record = asRecord(value);
  const categories = Array.isArray(record?.category) ? record.category : [];
  return {
    title: compactText(record?.title),
    permalink: compactText(record?.permalink, URL_MAX),
    listing_type: compactText(record?.listing_type, 120),
    category: categories
      .map((item) => sanitizeObservedCategory(item))
      .filter((item): item is GetOblicConvertObservedCategory => item != null)
      .slice(0, 8),
    location_display: compactText(record?.location_display),
    lat: compactFiniteNumber(record?.lat),
    lng: compactFiniteNumber(record?.lng),
    google_id: compactText(record?.google_id, 200),
    google_place_url: compactText(record?.google_place_url, URL_MAX),
    image: compactText(record?.image, URL_MAX),
  };
}

export function resolveGetOblicTrustedBusinessName(
  listingTitle: string | null | undefined,
  observedTitle?: string | null,
): string | null {
  return compactText(listingTitle) ?? compactText(observedTitle);
}

export function firstGetOblicCategoryName(
  categories: GetOblicConvertObservedCategory[] | null | undefined,
): string | null {
  for (const category of categories ?? []) {
    const name = compactText(category?.name, 120);
    if (name) return name;
  }
  return null;
}

export function readGetOblicListingIdentity(
  rawJson: Record<string, unknown> | null | undefined,
): number | null {
  if (!rawJson) return null;
  const direct = readPositiveInteger(rawJson.wordpress_listing_id);
  if (direct != null) return direct;
  const nested = asRecord(rawJson.observed);
  return readPositiveInteger(nested?.wordpress_listing_id);
}

export function isSameGetOblicListingIdentity(
  prospect: Pick<Prospect, "raw_json">,
  wordpressListingId: number,
): boolean {
  return readGetOblicListingIdentity(prospect.raw_json) === wordpressListingId;
}

/**
 * Ownership evidence for discarding a concurrent-conversion loser.
 * Only a thin record created by THIS request may be removed.
 * An active GetOblic claim is never disposable — that row is canonical
 * or otherwise protected by deleteProspect().
 */
export function isDisposableLosingConversionProspect(input: {
  createdByThisRequest: boolean;
  loser: Pick<
    Prospect,
    | "id"
    | "source"
    | "status"
    | "website"
    | "linked_discussion_id"
    | "website_intelligence"
    | "raw_json"
  >;
  winnerId: string | null;
  wordpressListingId: number;
  hasActiveGetOblicClaim: boolean;
}): boolean {
  if (!input.createdByThisRequest) return false;
  if (input.winnerId && input.loser.id === input.winnerId) return false;
  if (input.hasActiveGetOblicClaim) return false;
  if (input.loser.source !== GETOBLIC_PROSPECT_SOURCE) return false;
  if (input.loser.status !== "Saved") return false;
  if (input.loser.linked_discussion_id) return false;
  if (input.loser.website_intelligence) return false;
  return isSameGetOblicListingIdentity(input.loser, input.wordpressListingId);
}

export function buildGetOblicProspectProvenance(input: {
  wordpressListingId: number;
  observed: GetOblicConvertObservedSnapshot;
  listing: GetOblicWordpressListing | null;
  googleBusinessUrl: string | null;
  category: string | null;
}): Record<string, unknown> {
  const listing = input.listing;
  const listingCategories = sanitizeListingCategories(listing?.category);
  const imported = resolveGetOblicListingImport(listing, input.observed);
  return {
    origin: GETOBLIC_PROSPECT_PROVENANCE_ORIGIN,
    wordpress_listing_id: input.wordpressListingId,
    observed: {
      wordpress_listing_id: input.wordpressListingId,
      title: compactText(listing?.title) ?? input.observed.title,
      permalink: input.observed.permalink,
      listing_type:
        compactText(listing?.listing_type, 120) ?? input.observed.listing_type,
      category: listingCategories.length > 0 ? listingCategories : input.observed.category,
      region: sanitizeListingRegion(listing?.region),
      address: imported.address,
      phone: imported.phone,
      whatsapp: imported.whatsapp,
      website: imported.website,
      email: imported.email,
      facebook: imported.facebook,
      instagram: imported.instagram,
      linkedin: imported.linkedin,
      social: sanitizeListingSocial(listing?.social),
      location_display: input.observed.location_display,
      lat: listing?.lat ?? input.observed.lat,
      lng: listing?.lng ?? input.observed.lng,
      google_id: compactText(listing?.google_id, 200) ?? input.observed.google_id,
      google_place_url:
        compactText(listing?.google_place_url, URL_MAX) ??
        input.observed.google_place_url,
      image: compactText(listing?.image, URL_MAX) ?? input.observed.image,
      cover: compactText(listing?.cover, URL_MAX),
      gallery: sanitizeListingGallery(listing?.gallery),
      tagline: compactText(listing?.tagline),
      description: compactText(listing?.description, DESCRIPTION_MAX),
      timezone: compactText(listing?.timezone, 120),
      work_hours: sanitizeWorkHours(listing?.work_hours),
      text_hours: compactText(listing?.text_hours, 500),
      tags: sanitizeListingTags(listing?.tags),
    },
    attribution: {
      business_name: compactText(listing?.title)
        ? "getoblic_listing_detail"
        : "getoblic_search",
      phone: imported.phone ? "getoblic_listing_detail" : null,
      address: imported.address ? "getoblic_listing_detail" : null,
      category: listingCategories.length > 0
        ? "getoblic_listing_detail"
        : input.category
          ? "getoblic_search"
          : null,
      google_business_url: input.googleBusinessUrl
        ? "getoblic_listing_detail"
        : null,
      website: imported.website ? "getoblic_listing_detail" : null,
      email: imported.email ? "getoblic_listing_detail" : null,
      facebook: imported.facebook ? "getoblic_listing_detail" : null,
      instagram: imported.instagram ? "getoblic_listing_detail" : null,
      linkedin: imported.linkedin ? "getoblic_listing_detail" : null,
      whatsapp: imported.whatsapp ? "getoblic_listing_detail" : null,
      timezone: imported.timezone ? "getoblic_listing_detail" : null,
    },
  };
}

export function mergeGetOblicWebsiteAttribution(
  rawJson: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const existing = rawJson && typeof rawJson === "object" ? { ...rawJson } : {};
  const attribution = asRecord(existing.attribution) ?? {};
  existing.attribution = {
    ...attribution,
    website: "user",
  };
  return existing;
}

export async function findGetOblicOriginProspectByListingId(
  organizationId: string,
  wordpressListingId: number,
): Promise<Prospect | null> {
  const { data, error } = await supabaseAdmin
    .from("prospects")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("source", GETOBLIC_PROSPECT_SOURCE)
    .filter("raw_json->>wordpress_listing_id", "eq", String(wordpressListingId))
    .limit(5);

  if (error) {
    console.error("Error finding GetOblic-origin Prospect by listing:", error);
    return null;
  }

  const rows = (data as Prospect[] | null) ?? [];
  const match = rows.find((row) =>
    isSameGetOblicListingIdentity(row, wordpressListingId),
  );
  return match ?? null;
}

export async function convertGetOblicDirectoryListing(
  input: GetOblicConvertInput,
  dependencies: GetOblicConvertDependencies = defaultDependencies,
  wordpress?: ClaimKnownListingWordpressPort,
): Promise<GetOblicConvertResult> {
  const organizationId = input.organizationId.trim();
  if (!organizationId) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_SEARCH_INVALID_REQUEST",
      "Organization context is required.",
      400,
    );
  }

  const wordpressListingId = parseConvertWordpressListingId(
    input.wordpressListingId,
  );
  const observed = sanitizeGetOblicConvertObserved(input.observed);
  const trace = input.diagnosticTrace;

  trace?.log({
    stage: "active_claim_lookup_start",
    organization_id: organizationId,
    wordpress_listing_id: wordpressListingId,
  });
  const activeClaim = await dependencies.getActiveListingClaim(
    wordpressListingId,
  );
  trace?.log({
    stage: "active_claim_lookup_done",
    organization_id: organizationId,
    wordpress_listing_id: wordpressListingId,
    relationship_status: activeClaim.found
      ? activeClaim.relationship_status
      : undefined,
  });
  if (activeClaim.found && activeClaim.organization_id !== organizationId) {
    return emptyResult("unavailable");
  }

  if (activeClaim.found && activeClaim.organization_id === organizationId) {
    return resumeOwnedListing({
      organizationId,
      wordpressListingId,
      prospectId: activeClaim.prospect_id,
      relationshipStatus: activeClaim.relationship_status,
      observed,
      input,
      dependencies,
      wordpress,
    });
  }

  trace?.log({
    stage: "settings_lookup_start",
    organization_id: organizationId,
    wordpress_listing_id: wordpressListingId,
  });
  const settings = await dependencies.getSettings(organizationId);
  trace?.log({
    stage: "settings_lookup_done",
    organization_id: organizationId,
    wordpress_listing_id: wordpressListingId,
  });
  if (!settings.configured) {
    return emptyResult("settings_missing");
  }

  trace?.log({
    stage: "capacity_preflight_start",
    organization_id: organizationId,
    wordpress_listing_id: wordpressListingId,
  });
  trace?.log({
    stage: "origin_lookup_start",
    organization_id: organizationId,
    wordpress_listing_id: wordpressListingId,
  });
  const [usage, originProspect] = await Promise.all([
    dependencies.getAllocationUsage(organizationId, input.now),
    dependencies.findOriginProspectByListingId(
      organizationId,
      wordpressListingId,
    ),
  ]);
  trace?.log({
    stage: "capacity_preflight_done",
    organization_id: organizationId,
    wordpress_listing_id: wordpressListingId,
  });
  trace?.log({
    stage: "origin_lookup_done",
    organization_id: organizationId,
    wordpress_listing_id: wordpressListingId,
    prospect_id: originProspect?.id ?? undefined,
  });

  if (usage.configured && usage.available <= 0) {
    return emptyResult("capacity_exceeded");
  }

  if (originProspect) {
    return finishExistingProspect({
      organizationId,
      wordpressListingId,
      prospect: originProspect,
      listing: null,
      observed,
      created: false,
      input,
      dependencies,
      wordpress,
    });
  }

  let listing: GetOblicWordpressListing;
  if (input.preloadedListing) {
    listing = input.preloadedListing;
  } else {
    try {
      listing = await dependencies.getListingById(wordpressListingId);
    } catch (error) {
      const mapped = mapConvertWordpressError(error);
      if (mapped.code === "GETOBLIC_REMOTE_LISTING_MISSING") {
        return emptyResult("remote_missing");
      }
      throw mapped;
    }
  }

  if (
    !isListingAuthorEligible(
      listing,
      input.listingAuthorPolicy ?? "inventory_pool",
      settings.settings.wordpress_author_id,
    )
  ) {
    return emptyResult("unavailable");
  }

  if (
    input.expectedGoogleId &&
    !googleBusinessIdsEqual(listing.google_id, input.expectedGoogleId)
  ) {
    return emptyResult("unavailable");
  }

  const businessName = resolveGetOblicTrustedBusinessName(
    listing.title,
    observed.title,
  );
  if (!businessName) {
    return emptyResult("needs_business_name");
  }

  trace?.log({
    stage: "name_collision_lookup_start",
    organization_id: organizationId,
    wordpress_listing_id: wordpressListingId,
  });
  const nameMatch = await dependencies.findProspectByNameAndCity(
    organizationId,
    businessName,
    null,
  );
  trace?.log({
    stage: "name_collision_lookup_done",
    organization_id: organizationId,
    wordpress_listing_id: wordpressListingId,
  });
  if (nameMatch) {
    if (isSameGetOblicListingIdentity(nameMatch, wordpressListingId)) {
      return finishExistingProspect({
        organizationId,
        wordpressListingId,
        prospect: nameMatch,
        listing,
        observed,
        created: false,
        input,
        dependencies,
        wordpress,
      });
    }
    return emptyResult("name_collision");
  }

  const imported = resolveGetOblicListingImport(listing, observed);
  const provenance = buildGetOblicProspectProvenance({
    wordpressListingId,
    observed,
    listing,
    googleBusinessUrl: imported.googleBusinessUrl,
    category: imported.category,
  });

  let created: Prospect;
  try {
    trace?.log({
      stage: "prospect_create_start",
      organization_id: organizationId,
      wordpress_listing_id: wordpressListingId,
    });
    created = await persistConvertedProspect({
      organizationId,
      actorUserId: input.actorUserId,
      businessName,
      imported,
      provenance,
      persistWebsite: true,
      dependencies,
    });
    trace?.log({
      stage: "prospect_create_done",
      organization_id: organizationId,
      wordpress_listing_id: wordpressListingId,
      prospect_id: created.id,
    });
  } catch (error) {
    if (error instanceof GetOblicDirectoryError) {
      throw error;
    }
    if (isPostgresUniqueViolation(error as { code?: string; message?: string })) {
      return resolveCreateRace({
        organizationId,
        wordpressListingId,
        businessName,
        listing,
        observed,
        imported,
        persistWebsite: true,
        input,
        dependencies,
        wordpress,
      });
    }
    throw error;
  }

  return finishExistingProspect({
    organizationId,
    wordpressListingId,
    prospect: created,
    listing,
    observed,
    created: true,
    input,
    dependencies,
    wordpress,
  });
}

async function resumeOwnedListing(args: {
  organizationId: string;
  wordpressListingId: number;
  prospectId: string;
  relationshipStatus: ActiveGetOblicRelationshipStatus;
  observed: GetOblicConvertObservedSnapshot;
  input: GetOblicConvertInput;
  dependencies: GetOblicConvertDependencies;
  wordpress?: ClaimKnownListingWordpressPort;
}): Promise<GetOblicConvertResult> {
  const prospect = await args.dependencies.getProspectById(
    args.prospectId,
    args.organizationId,
  );
  if (!prospect) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_PROSPECT_NOT_FOUND",
      "The linked opportunity could not be found.",
      404,
    );
  }

  if (args.relationshipStatus === "linked") {
    return presentProspect({
      prospect,
      outcome: "already_owned",
      generationQueued: false,
      allocated: false,
    });
  }

  const settings = await args.dependencies.getSettings(args.organizationId);
  if (!settings.configured) {
    return {
      ...presentProspect({
        prospect,
        outcome: "claim_incomplete",
        generationQueued: false,
        allocated: false,
      }),
    };
  }

  return finishExistingProspect({
    organizationId: args.organizationId,
    wordpressListingId: args.wordpressListingId,
    prospect,
    listing: null,
    observed: args.observed,
    created: false,
    input: args.input,
    dependencies: args.dependencies,
    wordpress: args.wordpress,
  });
}

async function resolveCreateRace(args: {
  organizationId: string;
  wordpressListingId: number;
  businessName: string;
  listing: GetOblicWordpressListing;
  observed: GetOblicConvertObservedSnapshot;
  imported: GetOblicListingImportFields;
  persistWebsite: boolean;
  input: GetOblicConvertInput;
  dependencies: GetOblicConvertDependencies;
  wordpress?: ClaimKnownListingWordpressPort;
}): Promise<GetOblicConvertResult> {
  const [origin, nameMatch, websiteMatch, activeClaim] = await Promise.all([
    args.dependencies.findOriginProspectByListingId(
      args.organizationId,
      args.wordpressListingId,
    ),
    args.dependencies.findProspectByNameAndCity(
      args.organizationId,
      args.businessName,
      null,
    ),
    args.imported.website
      ? args.dependencies.findProspectByWebsite(
          args.organizationId,
          args.imported.website,
        )
      : Promise.resolve(null),
    args.dependencies.getActiveListingClaim(args.wordpressListingId),
  ]);

  if (activeClaim.found && activeClaim.organization_id === args.organizationId) {
    const winner = await args.dependencies.getProspectById(
      activeClaim.prospect_id,
      args.organizationId,
    );
    if (winner) {
      return presentProspect({
        prospect: winner,
        outcome: "reused",
        generationQueued: false,
        allocated: false,
      });
    }
  }

  const sameListingCandidate = [origin, nameMatch, websiteMatch].find(
    (row): row is Prospect =>
      row != null && isSameGetOblicListingIdentity(row, args.wordpressListingId),
  );
  if (sameListingCandidate) {
    return finishExistingProspect({
      organizationId: args.organizationId,
      wordpressListingId: args.wordpressListingId,
      prospect: sameListingCandidate,
      listing: args.listing,
      observed: args.observed,
      created: false,
      input: args.input,
      dependencies: args.dependencies,
      wordpress: args.wordpress,
    });
  }

  if (
    args.persistWebsite &&
    args.imported.website &&
    websiteMatch &&
    !isSameGetOblicListingIdentity(websiteMatch, args.wordpressListingId)
  ) {
    try {
      const created = await persistConvertedProspect({
        organizationId: args.organizationId,
        actorUserId: args.input.actorUserId,
        businessName: args.businessName,
        imported: args.imported,
        provenance: buildGetOblicProspectProvenance({
          wordpressListingId: args.wordpressListingId,
          observed: args.observed,
          listing: args.listing,
          googleBusinessUrl: args.imported.googleBusinessUrl,
          category: args.imported.category,
        }),
        persistWebsite: false,
        dependencies: args.dependencies,
      });
      return finishExistingProspect({
        organizationId: args.organizationId,
        wordpressListingId: args.wordpressListingId,
        prospect: created,
        listing: args.listing,
        observed: args.observed,
        created: true,
        input: args.input,
        dependencies: args.dependencies,
        wordpress: args.wordpress,
      });
    } catch (error) {
      if (error instanceof GetOblicDirectoryError) {
        throw error;
      }
      if (isPostgresUniqueViolation(error as { code?: string; message?: string })) {
        return resolveCreateRace({
          ...args,
          persistWebsite: false,
        });
      }
      throw error;
    }
  }

  if (nameMatch) {
    return emptyResult("name_collision");
  }

  throw new GetOblicDirectoryError(
    "GETOBLIC_CONCURRENCY_CONFLICT",
    "Athena couldn’t add this business. Try again.",
  );
}

async function finishExistingProspect(args: {
  organizationId: string;
  wordpressListingId: number;
  prospect: Prospect;
  listing: GetOblicWordpressListing | null;
  observed: GetOblicConvertObservedSnapshot;
  created: boolean;
  input: GetOblicConvertInput;
  dependencies: GetOblicConvertDependencies;
  wordpress?: ClaimKnownListingWordpressPort;
}): Promise<GetOblicConvertResult> {
  const prospect = args.prospect;

  try {
    const claim = await args.dependencies.claimKnownExistingListing(
      {
        organizationId: args.organizationId,
        prospectId: prospect.id,
        wordpressListingId: args.wordpressListingId,
        actorUserId: args.input.actorUserId,
        actorLicenseeAccountId: args.input.actorLicenseeAccountId,
        now: args.input.now,
        verification: makeAssignedVerification(args.input),
        diagnosticTrace: args.input.diagnosticTrace,
      },
      args.wordpress,
    );
    return finalizeAfterClaim({
      prospect,
      claim,
      created: args.created,
      listing: args.listing,
      observed: args.observed,
      wordpressListingId: args.wordpressListingId,
      organizationId: args.organizationId,
      dependencies: args.dependencies,
      requestedBy: args.input.actorUserId,
      diagnosticTrace: args.input.diagnosticTrace,
    });
  } catch (error) {
    if (
      error instanceof GetOblicDirectoryError &&
      error.code === "GETOBLIC_LISTING_CLAIMED_SAME_ORG"
    ) {
      const winner = await resolveSameOrgCanonicalProspect(
        args.organizationId,
        args.wordpressListingId,
        args.dependencies,
      );
      if (winner) {
        const discard = await discardLosingConversionProspect({
          created: args.created,
          loser: prospect,
          winnerId: winner.id,
          requireResolvedWinner: true,
          organizationId: args.organizationId,
          wordpressListingId: args.wordpressListingId,
          dependencies: args.dependencies,
        });
        return presentAfterLoserDiscard({
          discard,
          fallbackWinner: winner,
          organizationId: args.organizationId,
          wordpressListingId: args.wordpressListingId,
          dependencies: args.dependencies,
        });
      }
    }

    if (
      error instanceof GetOblicDirectoryError &&
      error.code === "GETOBLIC_LISTING_NOT_CLAIMABLE"
    ) {
      return emptyResult("unavailable");
    }

    if (
      error instanceof GetOblicDirectoryError &&
      (error.code === "GETOBLIC_LISTING_CLAIMED_OTHER_ORG" ||
        error.code === "GETOBLIC_DIRECTORY_NOT_CONFIGURED" ||
        error.code === "GETOBLIC_LISTING_CAPACITY_EXCEEDED")
    ) {
      if (error.code === "GETOBLIC_LISTING_CLAIMED_OTHER_ORG") {
        const discard = await discardLosingConversionProspect({
          created: args.created,
          loser: prospect,
          winnerId: null,
          requireResolvedWinner: false,
          organizationId: args.organizationId,
          wordpressListingId: args.wordpressListingId,
          dependencies: args.dependencies,
        });
        if (discard === "delete_failed" || discard === "not_disposable") {
          throw cleanupIntegrityError();
        }
        if (discard === "protected_claim") {
          const current = await resolveSameOrgCanonicalProspect(
            args.organizationId,
            args.wordpressListingId,
            args.dependencies,
          );
          if (current) {
            return presentProspect({
              prospect: current,
              outcome: "reused",
              generationQueued: false,
              allocated: false,
            });
          }
          throw cleanupIntegrityError();
        }
        return emptyResult("unavailable");
      }
      if (error.code === "GETOBLIC_DIRECTORY_NOT_CONFIGURED") {
        return {
          ...presentProspect({
            prospect,
            outcome: "settings_missing",
            generationQueued: false,
            allocated: false,
          }),
          prospect_id: args.created ? prospect.id : null,
        };
      }

      const discard = await discardLosingConversionProspect({
        created: args.created,
        loser: prospect,
        winnerId: null,
        requireResolvedWinner: false,
        organizationId: args.organizationId,
        wordpressListingId: args.wordpressListingId,
        dependencies: args.dependencies,
      });
      if (discard === "delete_failed" || discard === "not_disposable") {
        throw cleanupIntegrityError();
      }
      if (discard === "protected_claim") {
        const current = await resolveSameOrgCanonicalProspect(
          args.organizationId,
          args.wordpressListingId,
          args.dependencies,
        );
        if (current) {
          return presentProspect({
            prospect: current,
            outcome: "reused",
            generationQueued: false,
            allocated: false,
          });
        }
        throw cleanupIntegrityError();
      }
      return emptyResult("capacity_exceeded");
    }

    if (
      error instanceof GetOblicDirectoryError &&
      (error.code === "GETOBLIC_WORDPRESS_AUTHOR_UNMAPPED" ||
        error.code === "GETOBLIC_WORDPRESS_AUTHOR_FAILED" ||
        error.link)
    ) {
      return presentProspect({
        prospect,
        outcome: "claim_incomplete",
        generationQueued: false,
        allocated: false,
      });
    }

    throw error;
  }
}

async function finalizeAfterClaim(args: {
  prospect: Prospect;
  claim: ClaimKnownListingResult;
  created: boolean;
  listing: GetOblicWordpressListing | null;
  observed: GetOblicConvertObservedSnapshot;
  wordpressListingId: number;
  organizationId: string;
  dependencies: GetOblicConvertDependencies;
  requestedBy: string | null;
  diagnosticTrace?: Co5GoogleTrace;
}): Promise<GetOblicConvertResult> {
  let prospect = args.prospect;
  const trace = args.diagnosticTrace;

  if (args.claim.outcome !== "linked") {
    prospect = await persistDeferredSaved(
      prospect,
      args.organizationId,
      args.dependencies,
    );
    return presentProspect({
      prospect,
      outcome: args.claim.outcome === "remote_missing"
        ? "remote_missing"
        : args.claim.outcome === "capacity_exceeded"
          ? "capacity_exceeded"
          : "claim_incomplete",
      generationQueued: false,
      allocated: args.claim.allocated,
    });
  }

  trace?.log({
    stage: "factual_import_start",
    organization_id: args.organizationId,
    wordpress_listing_id: args.wordpressListingId,
    prospect_id: prospect.id,
  });
  const listing = await resolveListingForImport(
    args.listing,
    args.wordpressListingId,
    args.dependencies,
  );
  const imported = resolveGetOblicListingImport(listing, args.observed);
  const fillEmpty = await omitCollidingImportedWebsite({
    organizationId: args.organizationId,
    prospectId: prospect.id,
    fillEmpty: buildReuseFillEmptyPatch(prospect, imported),
    dependencies: args.dependencies,
  });
  const provenance = mergeGetOblicListingProvenance(
    prospect.raw_json,
    buildGetOblicProspectProvenance({
      wordpressListingId: args.wordpressListingId,
      observed: args.observed,
      listing,
      googleBusinessUrl: imported.googleBusinessUrl,
      category: imported.category,
    }),
  );

  const updated = await persistImportedProspectFields({
    prospectId: prospect.id,
    organizationId: args.organizationId,
    fillEmpty,
    provenance,
    dependencies: args.dependencies,
  });
  if (updated) {
    prospect = updated;
  }

  prospect = await persistDeferredSaved(
    prospect,
    args.organizationId,
    args.dependencies,
  );
  const result = presentProspect({
    prospect,
    outcome: args.created ? "created" : "reused",
    generationQueued: false,
    allocated: args.claim.allocated,
  });
  trace?.log({
    stage: "factual_import_done",
    organization_id: args.organizationId,
    wordpress_listing_id: args.wordpressListingId,
    prospect_id: result.prospect_id,
    outcome: result.outcome,
  });
  return result;
}

async function persistDeferredSaved(
  prospect: Prospect,
  organizationId: string,
  dependencies: GetOblicConvertDependencies,
): Promise<Prospect> {
  if (prospect.status === "Saved" || normalizeWebsiteUrl(prospect.website)) {
    return prospect;
  }
  if (
    prospect.status === "Ready" ||
    prospect.status === "Processing Failed" ||
    prospect.status === "Processing" ||
    prospect.status === "Learning from Website" ||
    prospect.status === "Generating Executive Intelligence"
  ) {
    return prospect;
  }
  const updated = await dependencies.updateProspect(prospect.id, organizationId, {
    status: "Saved",
  });
  return updated ?? prospect;
}

async function resolveSameOrgCanonicalProspect(
  organizationId: string,
  wordpressListingId: number,
  dependencies: GetOblicConvertDependencies,
): Promise<Prospect | null> {
  const claim = await dependencies.getActiveListingClaim(wordpressListingId);
  if (!claim.found || claim.organization_id !== organizationId) {
    return null;
  }
  return dependencies.getProspectById(claim.prospect_id, organizationId);
}

type LosingDiscardResult =
  | "discarded"
  | "already_absent"
  | "protected_claim"
  | "skipped"
  | "not_disposable"
  | "delete_failed";

function cleanupIntegrityError(): GetOblicDirectoryError {
  return new GetOblicDirectoryError(
    "GETOBLIC_CONCURRENCY_CONFLICT",
    "Athena couldn’t add this business. Try again.",
  );
}

async function presentAfterLoserDiscard(args: {
  discard: LosingDiscardResult;
  fallbackWinner: Prospect;
  organizationId: string;
  wordpressListingId: number;
  dependencies: GetOblicConvertDependencies;
}): Promise<GetOblicConvertResult> {
  if (args.discard === "delete_failed" || args.discard === "not_disposable") {
    throw cleanupIntegrityError();
  }

  if (args.discard === "protected_claim") {
    const current = await resolveSameOrgCanonicalProspect(
      args.organizationId,
      args.wordpressListingId,
      args.dependencies,
    );
    if (!current) {
      throw cleanupIntegrityError();
    }
    return presentProspect({
      prospect: current,
      outcome: "reused",
      generationQueued: false,
      allocated: false,
    });
  }

  return presentProspect({
    prospect: args.fallbackWinner,
    outcome: "reused",
    generationQueued: false,
    allocated: false,
  });
}

async function discardLosingConversionProspect(args: {
  created: boolean;
  loser: Prospect;
  winnerId: string | null;
  requireResolvedWinner: boolean;
  organizationId: string;
  wordpressListingId: number;
  dependencies: GetOblicConvertDependencies;
}): Promise<LosingDiscardResult> {
  if (args.requireResolvedWinner && !args.winnerId) {
    return "skipped";
  }
  if (!args.created) {
    return "skipped";
  }
  if (args.winnerId && args.loser.id === args.winnerId) {
    return "protected_claim";
  }

  const fresh = await args.dependencies.getProspectById(
    args.loser.id,
    args.organizationId,
  );
  if (fresh) {
    const listingClaim = await args.dependencies.getActiveListingClaim(
      args.wordpressListingId,
    );
    const hasActiveGetOblicClaim =
      listingClaim.found && listingClaim.prospect_id === fresh.id;
    if (
      !isDisposableLosingConversionProspect({
        createdByThisRequest: true,
        loser: fresh,
        winnerId: args.winnerId,
        wordpressListingId: args.wordpressListingId,
        hasActiveGetOblicClaim,
      })
    ) {
      return hasActiveGetOblicClaim ? "protected_claim" : "not_disposable";
    }
  }

  return attemptDiscardDelete(args, true);
}

async function attemptDiscardDelete(
  args: {
    created: boolean;
    loser: Prospect;
    winnerId: string | null;
    organizationId: string;
    wordpressListingId: number;
    dependencies: GetOblicConvertDependencies;
  },
  allowRetry: boolean,
): Promise<LosingDiscardResult> {
  try {
    const deleted = await args.dependencies.deleteProspect(
      args.loser.id,
      args.organizationId,
    );
    if (deleted) {
      return "discarded";
    }
  } catch (error) {
    if (
      error instanceof GetOblicDirectoryError &&
      error.code === "GETOBLIC_LISTING_ACTIVE_CLAIM"
    ) {
      return "protected_claim";
    }
    console.error(
      "GetOblic conversion could not discard a losing thin Prospect:",
      error,
    );
    return "delete_failed";
  }

  const remaining = await args.dependencies.getProspectById(
    args.loser.id,
    args.organizationId,
  );
  if (!remaining) {
    return "already_absent";
  }

  const listingClaim = await args.dependencies.getActiveListingClaim(
    args.wordpressListingId,
  );
  const hasActiveGetOblicClaim =
    listingClaim.found && listingClaim.prospect_id === remaining.id;
  if (
    !isDisposableLosingConversionProspect({
      createdByThisRequest: true,
      loser: remaining,
      winnerId: args.winnerId,
      wordpressListingId: args.wordpressListingId,
      hasActiveGetOblicClaim,
    })
  ) {
    return hasActiveGetOblicClaim ? "protected_claim" : "not_disposable";
  }

  if (allowRetry) {
    return attemptDiscardDelete(args, false);
  }

  return "delete_failed";
}

function presentProspect(input: {
  prospect: Prospect;
  outcome: GetOblicConvertOutcome;
  generationQueued: boolean;
  allocated: boolean;
}): GetOblicConvertResult {
  return {
    outcome: input.outcome,
    prospect_id: input.prospect.id,
    website_ready: Boolean(normalizeWebsiteUrl(input.prospect.website)),
    status: input.prospect.status,
    generation_queued: input.generationQueued,
    allocated: input.allocated,
  };
}

function emptyResult(outcome: GetOblicConvertOutcome): GetOblicConvertResult {
  return {
    outcome,
    prospect_id: null,
    website_ready: false,
    status: null,
    generation_queued: false,
    allocated: false,
  };
}

function makeAssignedVerification(
  input: GetOblicConvertInput,
): ClaimListingVerification | undefined {
  if (input.listingAuthorPolicy !== "mapped_author") {
    return undefined;
  }
  const expectedGoogleId = input.expectedGoogleId?.trim() ?? "";
  const expectedWordpressAuthorId = input.expectedWordpressAuthorId;
  if (
    !expectedGoogleId ||
    expectedWordpressAuthorId == null ||
    expectedWordpressAuthorId <= 0
  ) {
    return undefined;
  }
  return {
    mode: "make_assigned",
    expectedGoogleId,
    expectedWordpressAuthorId,
  };
}

function isListingAuthorEligible(
  listing: GetOblicWordpressListing,
  policy: GetOblicListingAuthorPolicy,
  mappedAuthorId: number | null,
): boolean {
  if (policy === "mapped_author") {
    return (
      mappedAuthorId != null &&
      mappedAuthorId > 0 &&
      listing.author_id === mappedAuthorId
    );
  }
  return isGetOblicInventoryPoolAuthor(listing.author_id);
}

function parseConvertWordpressListingId(value: unknown): number {
  try {
    return parseGetOblicWordpressListingId(value);
  } catch {
    throw new GetOblicDirectoryError(
      "GETOBLIC_INVALID_WORDPRESS_LISTING_ID",
      "wordpress_listing_id must be a positive integer.",
      400,
    );
  }
}

function mapConvertWordpressError(error: unknown): GetOblicDirectoryError {
  if (error instanceof GetOblicDirectoryError) {
    return error;
  }
  if (error instanceof GetOblicWordpressError && error.code === "NOT_FOUND") {
    return new GetOblicDirectoryError(
      "GETOBLIC_REMOTE_LISTING_MISSING",
      "Athena couldn’t find that business right now.",
      409,
    );
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
  if (error instanceof GetOblicWordpressError && error.code === "TIMEOUT") {
    return new GetOblicDirectoryError(
      "GETOBLIC_REMOTE_TRANSIENT",
      "GetOblic Directory timed out.",
      504,
    );
  }
  return new GetOblicDirectoryError(
    "GETOBLIC_REMOTE_TRANSIENT",
    "GetOblic Directory is temporarily unavailable.",
    502,
  );
}

type GetOblicListingImportFields = {
  phone: string | null;
  address: string | null;
  category: string | null;
  googleBusinessUrl: string | null;
  website: string | null;
  observedWebsite: string | null;
  email: string | null;
  facebook: string | null;
  instagram: string | null;
  linkedin: string | null;
  whatsapp: string | null;
  timezone: string | null;
};

function resolveGetOblicListingImport(
  listing: GetOblicWordpressListing | null,
  observed: GetOblicConvertObservedSnapshot,
): GetOblicListingImportFields {
  const listingCategories = sanitizeListingCategories(listing?.category);
  const observedWebsite = compactText(listing?.website, URL_MAX);
  return {
    phone: compactText(listing?.phone, 120),
    address: compactText(listing?.address),
    category:
      firstGetOblicCategoryName(listingCategories) ??
      firstGetOblicCategoryName(observed.category),
    googleBusinessUrl:
      compactText(listing?.google_place_url, URL_MAX) ??
      compactText(observed.google_place_url, URL_MAX),
    website: resolveImportedWebsite(observedWebsite, listing, observed),
    observedWebsite,
    email: compactEmail(listing?.email),
    facebook: compactText(listing?.facebook, URL_MAX),
    instagram: compactText(listing?.instagram, URL_MAX),
    linkedin: compactText(listing?.linkedin, URL_MAX),
    whatsapp: compactText(listing?.whatsapp, 120),
    timezone: compactText(listing?.timezone, 120),
  };
}

function resolveImportedWebsite(
  observedWebsite: string | null,
  listing: GetOblicWordpressListing | null,
  observed: GetOblicConvertObservedSnapshot,
): string | null {
  const normalized = observedWebsite
    ? normalizeWebsiteUrl(observedWebsite)
    : null;
  if (!normalized) {
    return null;
  }
  const permalink = compactText(observed.permalink, URL_MAX);
  if (permalink && normalizeWebsiteUrl(permalink) === normalized) {
    return null;
  }
  const googleUrl =
    compactText(listing?.google_place_url, URL_MAX) ??
    compactText(observed.google_place_url, URL_MAX);
  if (googleUrl && normalizeWebsiteUrl(googleUrl) === normalized) {
    return null;
  }
  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.replace(/^www\./i, "");
    if (host === "getoblic.com" && /\/listing\//i.test(parsed.pathname)) {
      return null;
    }
  } catch {
    return null;
  }
  return normalized;
}

type GetOblicReuseFillEmptyPatch = {
  website?: string;
  email?: string;
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  whatsapp_number?: string;
  timezone?: string;
  phone?: string;
  address?: string;
  category?: string;
  google_business_url?: string;
};

function buildReuseFillEmptyPatch(
  prospect: Pick<
    Prospect,
    | "website"
    | "email"
    | "facebook"
    | "instagram"
    | "linkedin"
    | "whatsapp_number"
    | "timezone"
    | "phone"
    | "address"
    | "category"
    | "google_business_url"
  >,
  imported: GetOblicListingImportFields,
): GetOblicReuseFillEmptyPatch {
  const patch: GetOblicReuseFillEmptyPatch = {};
  if (isBlankProspectText(prospect.website) && imported.website) {
    patch.website = imported.website;
  }
  if (isBlankProspectText(prospect.email) && imported.email) {
    patch.email = imported.email;
  }
  if (isBlankProspectText(prospect.facebook) && imported.facebook) {
    patch.facebook = imported.facebook;
  }
  if (isBlankProspectText(prospect.instagram) && imported.instagram) {
    patch.instagram = imported.instagram;
  }
  if (isBlankProspectText(prospect.linkedin) && imported.linkedin) {
    patch.linkedin = imported.linkedin;
  }
  if (isBlankProspectText(prospect.whatsapp_number) && imported.whatsapp) {
    patch.whatsapp_number = imported.whatsapp;
  }
  if (isBlankProspectText(prospect.timezone) && imported.timezone) {
    patch.timezone = imported.timezone;
  }
  if (isBlankProspectText(prospect.phone) && imported.phone) {
    patch.phone = imported.phone;
  }
  if (isBlankProspectText(prospect.address) && imported.address) {
    patch.address = imported.address;
  }
  if (isBlankProspectText(prospect.category) && imported.category) {
    patch.category = imported.category;
  }
  if (
    isBlankProspectText(prospect.google_business_url) &&
    imported.googleBusinessUrl
  ) {
    patch.google_business_url = imported.googleBusinessUrl;
  }
  return patch;
}

async function omitCollidingImportedWebsite(args: {
  organizationId: string;
  prospectId: string;
  fillEmpty: GetOblicReuseFillEmptyPatch;
  dependencies: GetOblicConvertDependencies;
}): Promise<GetOblicReuseFillEmptyPatch> {
  if (!args.fillEmpty.website) {
    return args.fillEmpty;
  }
  const owner = await args.dependencies.findProspectByWebsite(
    args.organizationId,
    args.fillEmpty.website,
  );
  if (!owner || owner.id === args.prospectId) {
    return args.fillEmpty;
  }
  const withoutWebsite = { ...args.fillEmpty };
  delete withoutWebsite.website;
  return withoutWebsite;
}

async function persistConvertedProspect(args: {
  organizationId: string;
  actorUserId: string | null;
  businessName: string;
  imported: GetOblicListingImportFields;
  provenance: Record<string, unknown>;
  persistWebsite: boolean;
  dependencies: GetOblicConvertDependencies;
}): Promise<Prospect> {
  const persisted = await args.dependencies.createProspect({
    organization_id: args.organizationId,
    user_id: args.actorUserId,
    business_name: args.businessName,
    website: args.persistWebsite ? args.imported.website : null,
    email: args.imported.email,
    facebook: args.imported.facebook,
    instagram: args.imported.instagram,
    linkedin: args.imported.linkedin,
    whatsapp_number: args.imported.whatsapp,
    timezone: args.imported.timezone,
    category: args.imported.category,
    phone: args.imported.phone,
    address: args.imported.address,
    source: GETOBLIC_PROSPECT_SOURCE,
    getoblic_type: null,
    google_business_url: args.imported.googleBusinessUrl,
    status: "Saved",
    raw_json: args.provenance,
  });
  if (!persisted) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_CONCURRENCY_CONFLICT",
      "Athena couldn’t add this business. Try again.",
    );
  }
  return persisted;
}

async function persistImportedProspectFields(args: {
  prospectId: string;
  organizationId: string;
  fillEmpty: GetOblicReuseFillEmptyPatch;
  provenance: Record<string, unknown>;
  dependencies: GetOblicConvertDependencies;
}): Promise<Prospect | null> {
  try {
    return await args.dependencies.updateProspect(
      args.prospectId,
      args.organizationId,
      {
        ...args.fillEmpty,
        raw_json: args.provenance,
      },
    );
  } catch (error) {
    if (
      !args.fillEmpty.website ||
      !isPostgresUniqueViolation(error as { code?: string; message?: string })
    ) {
      throw error;
    }
    const withoutWebsite = { ...args.fillEmpty };
    delete withoutWebsite.website;
    return args.dependencies.updateProspect(
      args.prospectId,
      args.organizationId,
      {
        ...withoutWebsite,
        raw_json: args.provenance,
      },
    );
  }
}

function mergeGetOblicListingProvenance(
  rawJson: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const existing = rawJson && typeof rawJson === "object" ? { ...rawJson } : {};
  delete existing.knowledge_base;
  existing.origin = existing.origin ?? incoming.origin;
  existing.wordpress_listing_id =
    existing.wordpress_listing_id ?? incoming.wordpress_listing_id;

  const existingObserved = asRecord(existing.observed);
  if (existingObserved) {
    delete existingObserved.knowledge_base;
  }
  existing.observed = mergeObservedRecords(
    existingObserved,
    asRecord(incoming.observed),
  );
  existing.attribution = mergeAttributionRecords(
    asRecord(existing.attribution),
    asRecord(incoming.attribution),
  );
  return existing;
}

function mergeObservedRecords(
  existing: Record<string, unknown> | null,
  incoming: Record<string, unknown> | null,
): Record<string, unknown> {
  const result = existing ? { ...existing } : {};
  delete result.knowledge_base;
  if (!incoming) {
    return result;
  }
  for (const [key, value] of Object.entries(incoming)) {
    if (key === "knowledge_base" || isEmptyObservedValue(value)) {
      continue;
    }
    if (isEmptyObservedValue(result[key])) {
      result[key] = value;
    }
  }
  return result;
}

function mergeAttributionRecords(
  existing: Record<string, unknown> | null,
  incoming: Record<string, unknown> | null,
): Record<string, unknown> {
  const result = existing ? { ...existing } : {};
  if (!incoming) {
    return result;
  }
  for (const [key, value] of Object.entries(incoming)) {
    if (value == null || value === "") {
      continue;
    }
    if (result[key] == null || result[key] === "") {
      result[key] = value;
    }
  }
  return result;
}

function isEmptyObservedValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string" && !value.trim()) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function isBlankProspectText(value: unknown): boolean {
  return compactText(value) == null;
}

async function resolveListingForImport(
  listing: GetOblicWordpressListing | null,
  wordpressListingId: number,
  dependencies: Pick<GetOblicConvertDependencies, "getListingById">,
): Promise<GetOblicWordpressListing | null> {
  if (listing) {
    return listing;
  }
  try {
    return await dependencies.getListingById(wordpressListingId);
  } catch {
    return null;
  }
}

function sanitizeListingCategories(
  value: GetOblicWordpressListing["category"] | null | undefined,
): GetOblicConvertObservedCategory[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => sanitizeObservedCategory(item))
    .filter((item): item is GetOblicConvertObservedCategory => item != null)
    .slice(0, 8);
}

function sanitizeListingRegion(
  value: GetOblicWordpressTaxonomyTerm | null | undefined,
): GetOblicWordpressTaxonomyTerm | null {
  if (!value) {
    return null;
  }
  const name = compactText(value.name, 120);
  const slug = compactText(value.slug, 120);
  const termId = readPositiveInteger(value.term_id);
  if (!name && !slug && termId == null) {
    return null;
  }
  return { term_id: termId, slug, name };
}

function sanitizeListingGallery(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const urls: string[] = [];
  for (const item of value) {
    const url = compactText(item, URL_MAX);
    if (!url) continue;
    urls.push(url);
    if (urls.length >= GALLERY_MAX) break;
  }
  return urls;
}

function sanitizeListingSocial(
  value: GetOblicWordpressSocialLink[] | null | undefined,
): GetOblicWordpressSocialLink[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const links: GetOblicWordpressSocialLink[] = [];
  for (const item of value) {
    const network = compactText(item?.network, 80);
    const url = compactText(item?.url, URL_MAX);
    if (!network || !url) {
      continue;
    }
    links.push({ network, url });
    if (links.length >= 24) {
      break;
    }
  }
  return links;
}

function sanitizeListingTags(
  value: GetOblicWordpressTaxonomyTerm[] | null | undefined,
): GetOblicWordpressTaxonomyTerm[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const tags: GetOblicWordpressTaxonomyTerm[] = [];
  for (const item of value) {
    const parsed = sanitizeListingRegion(item);
    if (!parsed) continue;
    tags.push(parsed);
    if (tags.length >= TAGS_MAX) break;
  }
  return tags;
}

function sanitizeWorkHours(
  value: GetOblicWordpressWorkHours | undefined,
): GetOblicWordpressWorkHours {
  if (value == null) {
    return null;
  }
  if (Array.isArray(value) || (typeof value === "object" && !Array.isArray(value))) {
    try {
      return JSON.parse(JSON.stringify(value)) as
        | Record<string, unknown>
        | unknown[];
    } catch {
      return null;
    }
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

function sanitizeObservedCategory(
  value: unknown,
): GetOblicConvertObservedCategory | null {
  const record = asRecord(value);
  if (!record) return null;
  const name = compactText(record.name, 120);
  const slug = compactText(record.slug, 120);
  const termId = readPositiveInteger(record.term_id);
  if (!name && !slug && termId == null) {
    return null;
  }
  return {
    term_id: termId,
    slug,
    name,
  };
}

function compactEmail(value: unknown): string | null {
  const text = compactText(value, 300);
  if (!text || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    return null;
  }
  return text;
}

function compactText(value: unknown, max = TEXT_MAX): string | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function readPositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^[1-9][0-9]*$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
