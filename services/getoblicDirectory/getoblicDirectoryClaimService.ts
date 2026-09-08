/**
 * Athena V2 GetOblic Directory claim orchestration for a known existing
 * WordPress listing. Concurrent listing capacity is reserved in
 * reserve_getoblic_listing_capacity before any WordPress author assignment.
 *
 * Phase 2C does not search, create listings, push Knowledge Base content,
 * refund, or assign packages. Release lives in getoblicDirectoryReleaseService.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  GetOblicDirectoryError,
  getOblicListingNotClaimableError,
} from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import {
  classifyGetOblicListingClaimAvailability,
  GETOBLIC_DIRECTORY_SETTINGS_TABLE,
  GETOBLIC_LISTING_LINKS_TABLE,
  getCurrentGetOblicAllocationPeriodStart,
  isActiveGetOblicRelationshipStatus,
  isGetOblicInventoryPoolAuthor,
  type GetOblicDirectorySettings,
  type GetOblicListingLink,
} from "@/services/getoblicDirectory/getoblicDirectoryTypes";
import {
  getActiveGetOblicLinkForProspect,
  getActiveGetOblicListingLinkByWordPressListingId,
  getGetOblicDirectorySettings,
  mapListingLinkRow,
} from "@/services/getoblicDirectory/getoblicDirectoryService";
import {
  assignWordpressListingAuthor,
  getWordpressListingById,
  parseGetOblicWordpressListingId,
  resolveOrCreateWordpressUser,
} from "@/services/getoblicDirectory/getoblicWordpressClient";
import {
  GetOblicWordpressError,
  type GetOblicWordpressListing,
} from "@/services/getoblicDirectory/getoblicWordpressTypes";
import { getProspectById } from "@/services/prospects/prospectService";

const REMOTE_ERROR_MAX_LENGTH = 500;
const ACTIVE_STATUS_LIST = ["claiming", "linked", "remote_missing"] as const;

export const CONSUME_GETOBLIC_LISTING_ALLOCATION_RPC =
  "consume_getoblic_listing_allocation" as const;

export const RESERVE_GETOBLIC_LISTING_CAPACITY_RPC =
  "reserve_getoblic_listing_capacity" as const;

export type ConsumeGetOblicListingAllocationInput = {
  organizationId: string;
  prospectId: string;
  listingLinkId: string;
  wordpressListingId: number;
  periodStart: string;
  idempotencyKey: string;
  actorUserId: string | null;
  actorLicenseeAccountId: string | null;
};

export type ReserveGetOblicListingCapacityInput = {
  organizationId: string;
  prospectId: string;
  wordpressListingId: number;
  periodStart: string;
  idempotencyKey: string;
  actorUserId: string | null;
  actorLicenseeAccountId: string | null;
};

export type ReserveGetOblicListingCapacityDecision =
  | {
      kind: "reserved";
      listingLinkId: string;
      allocationEventId: string | null;
      eventRecorded: boolean;
    }
  | {
      kind: "resumed";
      listingLinkId: string;
      allocationEventId: string | null;
      eventRecorded: boolean;
    }
  | {
      kind: "exceeded";
    }
  | {
      kind: "not_configured";
    }
  | {
      kind: "conflicted";
    };

export type ConsumeGetOblicListingAllocationDecision =
  | {
      kind: "consumed";
      allocationEventId: string | null;
      periodStart: string | null;
    }
  | {
      kind: "already";
      allocationEventId: string | null;
      periodStart: string | null;
    }
  | {
      kind: "exceeded";
      allocationEventId: string | null;
      periodStart: string | null;
    }
  | {
      kind: "not_configured";
    };

export type ClaimKnownListingOutcome =
  | "linked"
  | "remote_missing"
  | "claiming"
  | "capacity_exceeded";

export type ClaimKnownListingResult = {
  outcome: ClaimKnownListingOutcome;
  link: GetOblicListingLink;
  allocated: boolean;
};

export type ClaimKnownListingInput = {
  organizationId: string;
  prospectId: string;
  wordpressListingId: unknown;
  actorUserId: string | null;
  actorLicenseeAccountId: string | null;
  now?: Date;
};

export type ClaimKnownListingWordpressPort = {
  getListingById: typeof getWordpressListingById;
  assignListingAuthor: typeof assignWordpressListingAuthor;
  resolveOrCreateUser?: typeof resolveOrCreateWordpressUser;
};

const defaultWordpressPort: ClaimKnownListingWordpressPort = {
  getListingById: getWordpressListingById,
  assignListingAuthor: assignWordpressListingAuthor,
  resolveOrCreateUser: resolveOrCreateWordpressUser,
};

export function buildGetOblicAllocateExistingIdempotencyKey(
  organizationId: string,
  wordpressListingId: number,
): string {
  return `getoblic-directory:allocate_existing:${organizationId}:${wordpressListingId}`;
}

export function toPublicGetOblicClaim(result: ClaimKnownListingResult): {
  outcome: ClaimKnownListingOutcome;
  relationship_status: GetOblicListingLink["relationship_status"];
  listing_link_id: string;
  wordpress_listing_id: number;
  wordpress_author_id: number | null;
  allocated: boolean;
  allocated_at: string | null;
  last_verified_at: string | null;
} {
  return {
    outcome: result.outcome,
    relationship_status: result.link.relationship_status,
    listing_link_id: result.link.id,
    wordpress_listing_id: result.link.wordpress_listing_id,
    wordpress_author_id: result.link.wordpress_author_id,
    allocated: result.allocated,
    allocated_at: result.link.allocated_at,
    last_verified_at: result.link.last_verified_at,
  };
}

/**
 * Legacy allocation-event wrapper. Concurrent capacity reservation lives in
 * reserve_getoblic_listing_capacity (settings-row FOR UPDATE + active-link
 * count + claiming insert). Do not use this wrapper to decide capacity.
 */
export async function consumeGetOblicListingAllocation(
  input: ConsumeGetOblicListingAllocationInput,
): Promise<ConsumeGetOblicListingAllocationDecision> {
  const { data, error } = await supabaseAdmin.rpc(
    CONSUME_GETOBLIC_LISTING_ALLOCATION_RPC,
    {
      p_organization_id: input.organizationId,
      p_prospect_id: input.prospectId,
      p_listing_link_id: input.listingLinkId,
      p_wordpress_listing_id: input.wordpressListingId,
      p_period_start: input.periodStart,
      p_idempotency_key: input.idempotencyKey,
      p_actor_user_id: input.actorUserId,
      p_actor_licensee_account_id: input.actorLicenseeAccountId,
    },
  );

  if (error) {
    console.error("Error consuming GetOblic listing allocation:", error);
    throw allocationConcurrencyError();
  }

  const decision = mapConsumeAllocationRpcData(data);
  if (!decision) {
    throw allocationConcurrencyError();
  }
  return decision;
}

function mapConsumeAllocationRpcData(
  data: unknown,
): ConsumeGetOblicListingAllocationDecision | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return null;
  }

  const record = row as Record<string, unknown>;
  const consumed = record.consumed === true;
  const already = record.already === true;
  const exceeded = record.exceeded === true;
  const notConfigured = record.not_configured === true;
  const flags = [consumed, already, exceeded, notConfigured].filter(Boolean);
  if (flags.length !== 1) {
    return null;
  }

  if (notConfigured) {
    return { kind: "not_configured" };
  }

  const allocationEventId = readOptionalId(record.allocation_event_id);
  const periodStart = readOptionalId(record.period_start);

  if (exceeded) {
    return { kind: "exceeded", allocationEventId, periodStart };
  }
  if (already) {
    return { kind: "already", allocationEventId, periodStart };
  }
  return { kind: "consumed", allocationEventId, periodStart };
}

function readOptionalId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function reserveGetOblicListingCapacity(
  input: ReserveGetOblicListingCapacityInput,
): Promise<ReserveGetOblicListingCapacityDecision> {
  const { data, error } = await supabaseAdmin.rpc(
    RESERVE_GETOBLIC_LISTING_CAPACITY_RPC,
    {
      p_organization_id: input.organizationId,
      p_prospect_id: input.prospectId,
      p_wordpress_listing_id: input.wordpressListingId,
      p_period_start: input.periodStart,
      p_idempotency_key: input.idempotencyKey,
      p_actor_user_id: input.actorUserId,
      p_actor_licensee_account_id: input.actorLicenseeAccountId,
    },
  );

  if (error) {
    console.error("Error reserving GetOblic listing capacity:", error);
    throw allocationConcurrencyError();
  }

  const decision = mapReserveCapacityRpcData(data);
  if (!decision) {
    throw allocationConcurrencyError();
  }
  return decision;
}

function mapReserveCapacityRpcData(
  data: unknown,
): ReserveGetOblicListingCapacityDecision | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return null;
  }

  const record = row as Record<string, unknown>;
  const reserved = record.reserved === true;
  const resumed = record.resumed === true;
  const exceeded = record.exceeded === true;
  const notConfigured = record.not_configured === true;
  const conflicted = record.conflicted === true;
  const flags = [reserved, resumed, exceeded, notConfigured, conflicted].filter(
    Boolean,
  );
  if (flags.length !== 1) {
    return null;
  }

  if (notConfigured) {
    return { kind: "not_configured" };
  }
  if (exceeded) {
    return { kind: "exceeded" };
  }
  if (conflicted) {
    return { kind: "conflicted" };
  }

  const listingLinkId = readOptionalId(record.listing_link_id);
  if (!listingLinkId) {
    return null;
  }

  return {
    kind: reserved ? "reserved" : "resumed",
    listingLinkId,
    allocationEventId: readOptionalId(record.allocation_event_id),
    eventRecorded: record.event_recorded === true,
  };
}

function allocationConcurrencyError(): GetOblicDirectoryError {
  return new GetOblicDirectoryError(
    "GETOBLIC_CONCURRENCY_CONFLICT",
    "GetOblic Directory could not complete this claim safely.",
    503,
  );
}

function listingCapacityExceededError(): GetOblicDirectoryError {
  return new GetOblicDirectoryError(
    "GETOBLIC_LISTING_CAPACITY_EXCEEDED",
    "This account has reached its GetOblic listing capacity. Release an existing GetOblic listing before adding another.",
  );
}

export async function claimKnownExistingListing(
  input: ClaimKnownListingInput,
  wordpress: ClaimKnownListingWordpressPort = defaultWordpressPort,
): Promise<ClaimKnownListingResult> {
  const wordpressListingId = parseWordpressListingId(input.wordpressListingId);
  const now = input.now ?? new Date();

  const settings = await requireDirectorySettings(input.organizationId);
  await requireProspectInOrganization(input.prospectId, input.organizationId);

  const reserved = await reserveOrResumeClaim(
    {
      organizationId: input.organizationId,
      prospectId: input.prospectId,
      wordpressListingId,
      actorUserId: input.actorUserId,
      actorLicenseeAccountId: input.actorLicenseeAccountId,
      now,
    },
    wordpress,
  );

  if (reserved.link.wordpress_listing_id !== wordpressListingId) {
    resolveExistingActiveClaim(
      {
        organizationId: input.organizationId,
        prospectId: input.prospectId,
        wordpressListingId,
      },
      reserved.link,
    );
    throw prospectAlreadyLinkedError();
  }

  if (reserved.link.relationship_status === "linked") {
    return {
      outcome: "linked",
      link: reserved.link,
      allocated: reserved.allocated,
    };
  }

  if (
    reserved.link.relationship_status !== "claiming" &&
    reserved.link.relationship_status !== "remote_missing"
  ) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_CONCURRENCY_CONFLICT",
      "This listing cannot be claimed in its current state.",
    );
  }

  return acquireReservedClaim({
    input,
    settings,
    reserved: reserved.link,
    allocated: reserved.allocated,
    wordpress,
    now,
    wordpressListingId,
  });
}

function parseWordpressListingId(value: unknown): number {
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

async function reserveOrResumeClaim(
  input: {
    organizationId: string;
    prospectId: string;
    wordpressListingId: number;
    actorUserId: string | null;
    actorLicenseeAccountId: string | null;
    now: Date;
  },
  wordpress: ClaimKnownListingWordpressPort,
): Promise<{ link: GetOblicListingLink; allocated: boolean }> {
  const prospectLink = await getActiveGetOblicLinkForProspect(
    input.organizationId,
    input.prospectId,
  );
  if (prospectLink) {
    if (prospectLink.wordpress_listing_id !== input.wordpressListingId) {
      throw prospectAlreadyLinkedError();
    }
    if (prospectLink.relationship_status === "linked") {
      return { link: prospectLink, allocated: false };
    }
  }

  const globalLink = await getActiveGetOblicListingLinkByWordPressListingId(
    input.wordpressListingId,
  );
  if (globalLink) {
    const classified = resolveExistingActiveClaim(input, globalLink);
    if (classified.relationship_status === "linked") {
      return { link: classified, allocated: false };
    }
  }

  const resumingSameActiveRelationship = Boolean(
    prospectLink &&
      prospectLink.wordpress_listing_id === input.wordpressListingId,
  );
  if (!resumingSameActiveRelationship) {
    await assertNewClaimListingEligible(wordpress, input.wordpressListingId);
  }

  const decision = await reserveGetOblicListingCapacity({
    organizationId: input.organizationId,
    prospectId: input.prospectId,
    wordpressListingId: input.wordpressListingId,
    periodStart: getCurrentGetOblicAllocationPeriodStart(input.now),
    idempotencyKey: buildGetOblicAllocateExistingIdempotencyKey(
      input.organizationId,
      input.wordpressListingId,
    ),
    actorUserId: input.actorUserId,
    actorLicenseeAccountId: input.actorLicenseeAccountId,
  });

  if (decision.kind === "not_configured") {
    throw new GetOblicDirectoryError(
      "GETOBLIC_DIRECTORY_NOT_CONFIGURED",
      "GetOblic Directory is not configured for this organization.",
    );
  }
  if (decision.kind === "exceeded") {
    throw listingCapacityExceededError();
  }
  if (decision.kind === "conflicted") {
    const racedProspect = await getActiveGetOblicLinkForProspect(
      input.organizationId,
      input.prospectId,
    );
    if (racedProspect) {
      if (racedProspect.wordpress_listing_id !== input.wordpressListingId) {
        throw prospectAlreadyLinkedError();
      }
      return { link: racedProspect, allocated: false };
    }
    const racedGlobal = await getActiveGetOblicListingLinkByWordPressListingId(
      input.wordpressListingId,
    );
    if (racedGlobal) {
      return {
        link: resolveExistingActiveClaim(input, racedGlobal),
        allocated: false,
      };
    }
    throw new GetOblicDirectoryError(
      "GETOBLIC_CONCURRENCY_CONFLICT",
      "This listing could not be reserved safely. Try again.",
    );
  }

  const reserved = await loadListingLinkById(
    decision.listingLinkId,
    input.organizationId,
  );
  if (!reserved) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_CONCURRENCY_CONFLICT",
      "This listing could not be reserved safely. Try again.",
    );
  }
  return { link: reserved, allocated: decision.eventRecorded };
}

function resolveExistingActiveClaim(
  input: {
    organizationId: string;
    prospectId: string;
    wordpressListingId: number;
  },
  existing: GetOblicListingLink,
): GetOblicListingLink {
  if (!isActiveGetOblicRelationshipStatus(existing.relationship_status)) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_CONCURRENCY_CONFLICT",
      "This listing could not be reserved safely. Try again.",
    );
  }

  const availability = classifyGetOblicListingClaimAvailability(
    input.organizationId,
    input.prospectId,
    {
      found: true,
      organization_id: existing.organization_id,
      prospect_id: existing.prospect_id,
      relationship_status: existing.relationship_status,
    },
  );

  if (availability.availability === "already_claimed_by_same_prospect") {
    if (existing.wordpress_listing_id !== input.wordpressListingId) {
      throw prospectAlreadyLinkedError();
    }
    return existing;
  }
  if (availability.availability === "claimed_by_other_prospect_same_org") {
    throw new GetOblicDirectoryError(
      "GETOBLIC_LISTING_CLAIMED_SAME_ORG",
      "This listing is already claimed by another Prospect in this organization.",
    );
  }
  throw new GetOblicDirectoryError(
    "GETOBLIC_LISTING_CLAIMED_OTHER_ORG",
    "This listing is already claimed.",
  );
}

function prospectAlreadyLinkedError(): GetOblicDirectoryError {
  return new GetOblicDirectoryError(
    "GETOBLIC_PROSPECT_ALREADY_LINKED",
    "This Prospect already has an active GetOblic listing.",
  );
}

async function loadListingLinkById(
  listingLinkId: string,
  organizationId: string,
): Promise<GetOblicListingLink | null> {
  const { data, error } = await supabaseAdmin
    .from(GETOBLIC_LISTING_LINKS_TABLE)
    .select("*")
    .eq("id", listingLinkId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("Error loading reserved GetOblic listing link:", error);
    return null;
  }
  return data ? mapListingLinkRow(data as Record<string, unknown>) : null;
}

async function acquireReservedClaim(args: {
  input: ClaimKnownListingInput;
  settings: GetOblicDirectorySettings;
  reserved: GetOblicListingLink;
  allocated: boolean;
  wordpress: ClaimKnownListingWordpressPort;
  now: Date;
  wordpressListingId: number;
}): Promise<ClaimKnownListingResult> {
  const listingLookup = await lookupRemoteListing(
    args.reserved,
    args.wordpress,
    args.now,
  );
  if (listingLookup.outcome !== "found") {
    return listingLookup.result;
  }

  if (!isGetOblicInventoryPoolAuthor(listingLookup.listing.author_id)) {
    throw getOblicListingNotClaimableError(args.reserved);
  }

  const wordpressAuthorId = await resolveWordpressAuthorIdOrStamp({
    reserved: args.reserved,
    settings: args.settings,
    organizationId: args.input.organizationId,
    actorUserId: args.input.actorUserId,
    wordpress: args.wordpress,
    now: args.now,
  });

  const authorResult = await assignAuthor(
    args.reserved,
    args.wordpress,
    wordpressAuthorId,
    args.now,
  );
  if (authorResult.outcome !== "assigned") {
    return authorResult.result;
  }

  const allocatedAt =
    args.reserved.allocated_at ?? args.now.toISOString();

  const linked = await persistClaimRow(args.reserved, {
    relationship_status: "linked",
    wordpress_author_id: wordpressAuthorId,
    allocated_at: allocatedAt,
    last_verified_at: args.now.toISOString(),
    last_remote_error: null,
    last_remote_error_at: null,
    updated_at: args.now.toISOString(),
  });

  return {
    outcome: "linked",
    link: linked,
    allocated: args.allocated,
  };
}

async function resolveWordpressAuthorIdOrStamp(input: {
  reserved: GetOblicListingLink;
  settings: GetOblicDirectorySettings;
  organizationId: string;
  actorUserId: string | null;
  wordpress: ClaimKnownListingWordpressPort;
  now: Date;
}): Promise<number> {
  try {
    return await resolveWordpressAuthorId(input);
  } catch (error) {
    if (
      error instanceof GetOblicDirectoryError &&
      (error.code === "GETOBLIC_WORDPRESS_AUTHOR_UNMAPPED" ||
        error.code === "GETOBLIC_WORDPRESS_AUTHOR_FAILED")
    ) {
      const link = await persistClaimRow(input.reserved, {
        last_remote_error: boundRemoteError(error.code, error.message),
        last_remote_error_at: input.now.toISOString(),
        updated_at: input.now.toISOString(),
      });
      throw new GetOblicDirectoryError(
        error.code,
        error.message,
        error.status,
        link,
      );
    }
    throw error;
  }
}

async function resolveWordpressAuthorId(input: {
  settings: GetOblicDirectorySettings;
  organizationId: string;
  actorUserId: string | null;
  wordpress: ClaimKnownListingWordpressPort;
  now: Date;
}): Promise<number> {
  if (input.settings.wordpress_author_id != null) {
    return input.settings.wordpress_author_id;
  }

  const ownerEmail = await resolveOrganizationOwnerEmail(input.organizationId);
  if (!ownerEmail) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_WORDPRESS_AUTHOR_UNMAPPED",
      "This organization has no mapped WordPress author.",
    );
  }

  let resolved;
  try {
    const resolveUser =
      input.wordpress.resolveOrCreateUser ?? resolveOrCreateWordpressUser;
    resolved = await resolveUser(ownerEmail);
  } catch (error) {
    if (error instanceof GetOblicDirectoryError) {
      throw error;
    }
    throw new GetOblicDirectoryError(
      "GETOBLIC_WORDPRESS_AUTHOR_FAILED",
      "WordPress author resolution failed.",
      502,
    );
  }

  return persistOrganizationWordpressAuthorId({
    organizationId: input.organizationId,
    wordpressAuthorId: resolved.wordpress_user_id,
    actorUserId: input.actorUserId,
    now: input.now,
  });
}

/**
 * Proven Athena account-owner email: organization_members role=owner →
 * auth.users.email. Same chain as licensee handoff / Super Admin account
 * listing. Never uses prospect email or the current actor email.
 */
async function resolveOrganizationOwnerEmail(
  organizationId: string,
): Promise<string | null> {
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .maybeSingle();

  if (membershipError || !membership?.user_id) {
    return null;
  }

  const { data: ownerUser, error: ownerError } =
    await supabaseAdmin.auth.admin.getUserById(String(membership.user_id));

  const email = ownerUser?.user?.email?.trim();
  if (ownerError || !email) {
    return null;
  }

  return email;
}

async function persistOrganizationWordpressAuthorId(input: {
  organizationId: string;
  wordpressAuthorId: number;
  actorUserId: string | null;
  now: Date;
}): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from(GETOBLIC_DIRECTORY_SETTINGS_TABLE)
    .update({
      wordpress_author_id: input.wordpressAuthorId,
      updated_at: input.now.toISOString(),
      updated_by_user_id: input.actorUserId,
    })
    .eq("organization_id", input.organizationId)
    .is("wordpress_author_id", null)
    .select("wordpress_author_id")
    .maybeSingle();

  if (error) {
    console.error("Error persisting GetOblic WordPress author mapping:", error);
    throw new GetOblicDirectoryError(
      "GETOBLIC_CONCURRENCY_CONFLICT",
      "GetOblic Directory could not complete this claim safely.",
      503,
    );
  }

  const written = readPersistedWordpressAuthorId(data);
  if (written != null) {
    return written;
  }

  const reread = await getGetOblicDirectorySettings(input.organizationId);
  if (reread.configured && reread.settings.wordpress_author_id != null) {
    return reread.settings.wordpress_author_id;
  }

  throw new GetOblicDirectoryError(
    "GETOBLIC_CONCURRENCY_CONFLICT",
    "GetOblic Directory could not complete this claim safely.",
    503,
  );
}

function readPersistedWordpressAuthorId(data: unknown): number | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const value = (data as { wordpress_author_id?: unknown }).wordpress_author_id;
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

async function assertNewClaimListingEligible(
  wordpress: ClaimKnownListingWordpressPort,
  wordpressListingId: number,
): Promise<void> {
  let listing: GetOblicWordpressListing;
  try {
    listing = await wordpress.getListingById(wordpressListingId);
  } catch {
    return;
  }
  if (!isGetOblicInventoryPoolAuthor(listing.author_id)) {
    throw getOblicListingNotClaimableError();
  }
}

async function lookupRemoteListing(
  reserved: GetOblicListingLink,
  wordpress: ClaimKnownListingWordpressPort,
  now: Date,
): Promise<
  | { outcome: "found"; listing: GetOblicWordpressListing }
  | { outcome: "halt"; result: ClaimKnownListingResult }
> {
  try {
    const listing = await wordpress.getListingById(reserved.wordpress_listing_id);
    return { outcome: "found", listing };
  } catch (error) {
    if (isWordpressListingNotFound(error)) {
      const link = await persistClaimRow(reserved, {
        relationship_status: "remote_missing",
        last_verified_at: now.toISOString(),
        last_remote_error: boundRemoteError(
          "LISTING_NOT_FOUND",
          error instanceof Error ? error.message : "Listing not found.",
        ),
        last_remote_error_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
      return {
        outcome: "halt",
        result: { outcome: "remote_missing", link, allocated: false },
      };
    }

    if (isWordpressAuthFailure(error)) {
      const link = await persistRemoteFailure(reserved, now, error);
      throw new GetOblicDirectoryError(
        "GETOBLIC_REMOTE_AUTH_FAILED",
        "GetOblic Directory authentication failed.",
        503,
        link,
      );
    }

    const link = await persistRemoteFailure(reserved, now, error);
    throw new GetOblicDirectoryError(
      "GETOBLIC_REMOTE_TRANSIENT",
      "GetOblic Directory is temporarily unavailable.",
      502,
      link,
    );
  }
}

async function assignAuthor(
  reserved: GetOblicListingLink,
  wordpress: ClaimKnownListingWordpressPort,
  wordpressAuthorId: number,
  now: Date,
): Promise<
  | { outcome: "assigned" }
  | { outcome: "halt"; result: ClaimKnownListingResult }
> {
  try {
    await wordpress.assignListingAuthor(
      reserved.wordpress_listing_id,
      wordpressAuthorId,
    );
    return { outcome: "assigned" };
  } catch (error) {
    if (isWordpressListingNotFound(error)) {
      const link = await persistClaimRow(reserved, {
        relationship_status: "remote_missing",
        last_verified_at: now.toISOString(),
        last_remote_error: boundRemoteError(
          "LISTING_NOT_FOUND",
          error instanceof Error ? error.message : "Listing not found.",
        ),
        last_remote_error_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
      return {
        outcome: "halt",
        result: { outcome: "remote_missing", link, allocated: false },
      };
    }

    if (isWordpressAuthFailure(error)) {
      const link = await persistRemoteFailure(reserved, now, error);
      throw new GetOblicDirectoryError(
        "GETOBLIC_REMOTE_AUTH_FAILED",
        "GetOblic Directory authentication failed.",
        503,
        link,
      );
    }

    const link = await persistRemoteFailure(reserved, now, error);
    throw new GetOblicDirectoryError(
      "GETOBLIC_WORDPRESS_AUTHOR_FAILED",
      "WordPress author assignment failed.",
      502,
      link,
    );
  }
}

async function persistRemoteFailure(
  reserved: GetOblicListingLink,
  now: Date,
  error: unknown,
): Promise<GetOblicListingLink> {
  return persistClaimRow(reserved, {
    last_remote_error: boundRemoteErrorFromUnknown(error),
    last_remote_error_at: now.toISOString(),
    updated_at: now.toISOString(),
  });
}

async function persistClaimRow(
  reserved: GetOblicListingLink,
  patch: Record<string, unknown>,
): Promise<GetOblicListingLink> {
  const { data, error } = await supabaseAdmin
    .from(GETOBLIC_LISTING_LINKS_TABLE)
    .update(patch)
    .eq("id", reserved.id)
    .eq("organization_id", reserved.organization_id)
    .eq("prospect_id", reserved.prospect_id)
    .in("relationship_status", [...ACTIVE_STATUS_LIST])
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("Error updating GetOblic listing claim:", error);
    throw new GetOblicDirectoryError(
      "GETOBLIC_CONCURRENCY_CONFLICT",
      "GetOblic Directory could not complete this claim safely.",
      503,
    );
  }

  const mapped = data
    ? mapListingLinkRow(data as Record<string, unknown>)
    : null;
  if (!mapped) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_CONCURRENCY_CONFLICT",
      "GetOblic Directory could not complete this claim safely.",
      503,
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
