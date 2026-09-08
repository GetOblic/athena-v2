/**
 * CO-1 GetOblic Directory → canonical Prospect conversion.
 * Server-owned orchestration: preflight, create/reuse one Prospect, claim,
 * then queue generation only when a normalized website already exists.
 *
 * Does not search Google, write Knowledge Base, or invent identity fields.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  GetOblicDirectoryError,
  isPostgresUniqueViolation,
} from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import {
  claimKnownExistingListing,
  type ClaimKnownListingResult,
  type ClaimKnownListingWordpressPort,
} from "@/services/getoblicDirectory/getoblicDirectoryClaimService";
import {
  getActiveGetOblicClaimByWordPressListingId,
  getGetOblicAllocationUsage,
  getGetOblicDirectorySettings,
  hasOrganizationAlreadyConsumedListing,
} from "@/services/getoblicDirectory/getoblicDirectoryService";
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
} from "@/services/getoblicDirectory/getoblicWordpressTypes";
import { ensureProspectGenerationQueued } from "@/services/prospects/prospectImporter";
import {
  createProspect,
  deleteProspect,
  findProspectByNameAndCity,
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
  "allowance_exceeded",
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
  google_id: string | null;
  google_place_url: string | null;
  image: string | null;
};

export type GetOblicConvertInput = {
  organizationId: string;
  wordpressListingId: unknown;
  observed?: unknown;
  actorUserId: string | null;
  actorLicenseeAccountId: string | null;
  now?: Date;
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
  findOriginProspectByListingId: findGetOblicOriginProspectByListingId,
  createProspect,
  updateProspect,
  deleteProspect,
  claimKnownExistingListing,
  ensureProspectGenerationQueued,
};

const TEXT_MAX = 300;
const URL_MAX = 500;

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
    case "allowance_exceeded":
      return "GETOBLIC_MONTHLY_ALLOWANCE_EXCEEDED";
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
    case "allowance_exceeded":
      return "You’ve added the maximum GetOblic businesses for this month.";
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
  if (normalizeWebsiteUrl(input.loser.website)) return false;
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
  return {
    origin: GETOBLIC_PROSPECT_PROVENANCE_ORIGIN,
    wordpress_listing_id: input.wordpressListingId,
    observed: {
      title: input.listing?.title ?? input.observed.title,
      permalink: input.observed.permalink,
      listing_type: input.observed.listing_type,
      category: input.observed.category,
      location_display: input.observed.location_display,
      google_id: input.listing?.google_id ?? input.observed.google_id,
      google_place_url:
        input.listing?.google_place_url ?? input.observed.google_place_url,
      image: input.observed.image,
    },
    attribution: {
      business_name: "getoblic_search",
      category: input.category ? "getoblic_search" : null,
      google_business_url: input.googleBusinessUrl
        ? "getoblic_listing_detail"
        : null,
      website: null,
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

  const activeClaim = await dependencies.getActiveListingClaim(
    wordpressListingId,
  );
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

  const settings = await dependencies.getSettings(organizationId);
  if (!settings.configured) {
    return emptyResult("settings_missing");
  }

  const [usage, alreadyPaid, originProspect] = await Promise.all([
    dependencies.getAllocationUsage(organizationId, input.now),
    dependencies.hasAlreadyConsumedListing(organizationId, wordpressListingId),
    dependencies.findOriginProspectByListingId(
      organizationId,
      wordpressListingId,
    ),
  ]);

  if (
    usage.configured &&
    usage.remaining <= 0 &&
    !alreadyPaid &&
    !originProspect
  ) {
    return emptyResult("allowance_exceeded");
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
  try {
    listing = await dependencies.getListingById(wordpressListingId);
  } catch (error) {
    const mapped = mapConvertWordpressError(error);
    if (mapped.code === "GETOBLIC_REMOTE_LISTING_MISSING") {
      return emptyResult("remote_missing");
    }
    throw mapped;
  }

  if (!isGetOblicInventoryPoolAuthor(listing.author_id)) {
    return emptyResult("unavailable");
  }

  const businessName = resolveGetOblicTrustedBusinessName(
    listing.title,
    observed.title,
  );
  if (!businessName) {
    return emptyResult("needs_business_name");
  }

  const nameMatch = await dependencies.findProspectByNameAndCity(
    organizationId,
    businessName,
    null,
  );
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

  const googleBusinessUrl =
    compactText(listing.google_place_url, URL_MAX) ??
    compactText(observed.google_place_url, URL_MAX);
  const category = firstGetOblicCategoryName(observed.category);
  const provenance = buildGetOblicProspectProvenance({
    wordpressListingId,
    observed,
    listing,
    googleBusinessUrl,
    category,
  });

  let created: Prospect;
  try {
    const persisted = await dependencies.createProspect({
      organization_id: organizationId,
      user_id: input.actorUserId,
      business_name: businessName,
      website: null,
      category,
      source: GETOBLIC_PROSPECT_SOURCE,
      getoblic_type: null,
      google_business_url: googleBusinessUrl,
      status: "Saved",
      raw_json: provenance,
    });
    if (!persisted) {
      throw new GetOblicDirectoryError(
        "GETOBLIC_CONCURRENCY_CONFLICT",
        "Athena couldn’t add this business. Try again.",
      );
    }
    created = persisted;
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
  input: GetOblicConvertInput;
  dependencies: GetOblicConvertDependencies;
  wordpress?: ClaimKnownListingWordpressPort;
}): Promise<GetOblicConvertResult> {
  const [origin, nameMatch, activeClaim] = await Promise.all([
    args.dependencies.findOriginProspectByListingId(
      args.organizationId,
      args.wordpressListingId,
    ),
    args.dependencies.findProspectByNameAndCity(
      args.organizationId,
      args.businessName,
      null,
    ),
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

  const candidate = origin ?? nameMatch;
  if (candidate && isSameGetOblicListingIdentity(candidate, args.wordpressListingId)) {
    return finishExistingProspect({
      organizationId: args.organizationId,
      wordpressListingId: args.wordpressListingId,
      prospect: candidate,
      listing: args.listing,
      observed: args.observed,
      created: false,
      input: args.input,
      dependencies: args.dependencies,
      wordpress: args.wordpress,
    });
  }

  if (candidate) {
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
        error.code === "GETOBLIC_MONTHLY_ALLOWANCE_EXCEEDED")
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
      return {
        ...presentProspect({
          prospect,
          outcome: "allowance_exceeded",
          generationQueued: false,
          allocated: false,
        }),
        prospect_id: args.created ? prospect.id : null,
      };
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
}): Promise<GetOblicConvertResult> {
  let prospect = args.prospect;

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
        : args.claim.outcome === "allowance_exceeded"
          ? "allowance_exceeded"
          : "claim_incomplete",
      generationQueued: false,
      allocated: args.claim.allocated,
    });
  }

  const googleBusinessUrl =
    compactText(args.listing?.google_place_url, URL_MAX) ??
    compactText(args.observed.google_place_url, URL_MAX);
  if (googleBusinessUrl && !prospect.google_business_url) {
    const updated = await args.dependencies.updateProspect(
      prospect.id,
      args.organizationId,
      {
        google_business_url: googleBusinessUrl,
        raw_json: mergeGoogleBusinessUrlAttribution(
          prospect.raw_json,
          args.wordpressListingId,
        ),
      },
    );
    if (updated) {
      prospect = updated;
    }
  }

  const website = normalizeWebsiteUrl(prospect.website);
  if (!website) {
    prospect = await persistDeferredSaved(
      prospect,
      args.organizationId,
      args.dependencies,
    );
    return presentProspect({
      prospect,
      outcome: args.created ? "created" : "reused",
      generationQueued: false,
      allocated: args.claim.allocated,
    });
  }

  const shouldQueue = args.created || prospect.status === "Saved";
  let generationQueued = false;
  if (shouldQueue) {
    const queued = await args.dependencies.ensureProspectGenerationQueued(
      prospect,
      { requestedBy: args.requestedBy },
    );
    generationQueued = queued.queued;
    prospect = queued.prospect;
  }

  return presentProspect({
    prospect,
    outcome: args.created ? "created" : "reused",
    generationQueued,
    allocated: args.claim.allocated,
  });
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

function mergeGoogleBusinessUrlAttribution(
  rawJson: Record<string, unknown> | null | undefined,
  wordpressListingId: number,
): Record<string, unknown> {
  const existing = rawJson && typeof rawJson === "object" ? { ...rawJson } : {};
  const attribution = asRecord(existing.attribution) ?? {};
  existing.origin = existing.origin ?? GETOBLIC_PROSPECT_PROVENANCE_ORIGIN;
  existing.wordpress_listing_id =
    existing.wordpress_listing_id ?? wordpressListingId;
  existing.attribution = {
    ...attribution,
    google_business_url: "getoblic_listing_detail",
  };
  return existing;
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
