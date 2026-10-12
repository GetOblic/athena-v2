import {
  CommunityDiscoveryRequestError,
  communityDiscoveryPersistenceFailure,
} from "@/services/communityDiscovery/communityDiscoveryErrors";
import {
  ORGANIZATION_COMMUNITY_NOTES_MAX_LENGTH,
  ORGANIZATION_COMMUNITY_SAVES_LIST_LIMIT,
} from "@/services/communityDiscovery/communityDiscoveryLimits";
import type {
  OrganizationCommunityQualification,
  OrganizationCommunitySaveRepository,
  PublicCommunityCatalog,
  PublicCommunityRecord,
  SavedOrganizationCommunity,
} from "@/services/communityDiscovery/communityDiscoveryPersistence";
import { sanitizePublicCommunityDisplayName } from "@/services/communityDiscovery/publicCommunityName";
import { normalizeSocialCommunityUrl } from "@/services/communityDiscovery/socialCommunityRegistry";
import type { SocialCommunityPlatform } from "@/services/communityDiscovery/socialCommunityPlatform";

function assertOrganizationId(organizationId: string): string {
  if (typeof organizationId !== "string" || organizationId.trim() === "") {
    throw new CommunityDiscoveryRequestError(
      "INVALID_REQUEST",
      "Organization context is required.",
      400,
    );
  }
  return organizationId.trim();
}

function parseNotes(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || /[\u0000-\u001F\u007F]/.test(value)) {
    throw new CommunityDiscoveryRequestError(
      "INVALID_NOTES",
      "Notes must be plain text of at most 2000 characters.",
      400,
    );
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > ORGANIZATION_COMMUNITY_NOTES_MAX_LENGTH) {
    throw new CommunityDiscoveryRequestError(
      "INVALID_NOTES",
      "Notes must be plain text of at most 2000 characters.",
      400,
    );
  }
  return trimmed;
}

export function parseOrganizationCommunitySave(body: unknown): {
  platform: SocialCommunityPlatform;
  canonicalIdentity: string;
  canonicalUrl: string;
  qualification: OrganizationCommunityQualification;
  notes: string | null;
  notesProvided: boolean;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new CommunityDiscoveryRequestError(
      "INVALID_SAVE",
      "Save body must be a JSON object.",
      400,
    );
  }
  const record = body as Record<string, unknown>;
  if (typeof record.canonicalUrl !== "string") {
    throw new CommunityDiscoveryRequestError(
      "INVALID_COMMUNITY_URL",
      "Enter a public community URL.",
      400,
    );
  }
  const normalized = normalizeSocialCommunityUrl(record.canonicalUrl);
  if (!normalized.ok) {
    throw new CommunityDiscoveryRequestError(
      "INVALID_COMMUNITY_URL",
      "Enter a public Facebook Group URL.",
      400,
    );
  }
  if (
    record.qualification !== "relevant" &&
    record.qualification !== "not_relevant"
  ) {
    throw new CommunityDiscoveryRequestError(
      "INVALID_QUALIFICATION",
      "Qualification must be relevant or not_relevant.",
      400,
    );
  }

  const notesProvided = Object.prototype.hasOwnProperty.call(record, "notes");
  return {
    platform: normalized.community.platform,
    canonicalIdentity: normalized.community.canonicalIdentity,
    canonicalUrl: normalized.community.canonicalUrl,
    qualification: record.qualification,
    notes: notesProvided ? parseNotes(record.notes) : null,
    notesProvided,
  };
}

/**
 * A pasted URL has no fetched title. The catalog name is the public group key
 * until an earlier catalog row already stored one.
 */
function displayNameFromIdentity(canonicalIdentity: string): string {
  const displayName = sanitizePublicCommunityDisplayName(canonicalIdentity);
  if (!displayName) {
    throw new CommunityDiscoveryRequestError(
      "INVALID_COMMUNITY_URL",
      "Enter a public Facebook Group URL.",
      400,
    );
  }
  return displayName;
}

async function publicCommunityForSave(input: {
  request: ReturnType<typeof parseOrganizationCommunitySave>;
  repository: OrganizationCommunitySaveRepository;
  catalog: PublicCommunityCatalog;
  sourcedAt: string;
}): Promise<PublicCommunityRecord> {
  const existing = await input.repository.findPublicByCanonicalUrl(
    input.request.canonicalUrl,
  );
  if (existing) return existing;

  const inserted = await input.catalog.insertMissing([
    {
      platform: input.request.platform,
      canonicalIdentity: input.request.canonicalIdentity,
      canonicalUrl: input.request.canonicalUrl,
      displayName: displayNameFromIdentity(input.request.canonicalIdentity),
      sourcedAt: input.sourcedAt,
    },
  ]);
  const created = inserted.find(
    (record) =>
      record.platform === input.request.platform &&
      record.canonicalIdentity === input.request.canonicalIdentity,
  );
  if (created) return created;

  const resolved = await input.repository.findPublicByCanonicalUrl(
    input.request.canonicalUrl,
  );
  if (!resolved) communityDiscoveryPersistenceFailure();
  return resolved;
}

export async function saveOrganizationCommunity(input: {
  organizationId: string;
  body: unknown;
  repository: OrganizationCommunitySaveRepository;
  catalog: PublicCommunityCatalog;
  now?: Date;
}): Promise<SavedOrganizationCommunity> {
  const organizationId = assertOrganizationId(input.organizationId);
  const request = parseOrganizationCommunitySave(input.body);
  const now = (input.now ?? new Date()).toISOString();
  const community = await publicCommunityForSave({
    request,
    repository: input.repository,
    catalog: input.catalog,
    sourcedAt: now,
  });
  if (community.suppressionState !== "active") {
    throw new CommunityDiscoveryRequestError(
      "COMMUNITY_SUPPRESSED",
      "That public community is not available.",
      409,
    );
  }

  const existing = await input.repository.findSave(organizationId, community.id);
  const notes = request.notesProvided ? request.notes : (existing?.notes ?? null);
  if (
    existing &&
    existing.qualification === request.qualification &&
    existing.notes === notes
  ) {
    return existing;
  }

  return input.repository.writeSave({
    organizationId,
    communityId: community.id,
    qualification: request.qualification,
    notes,
    now,
  });
}

export async function listSavedOrganizationCommunities(input: {
  organizationId: string;
  repository: OrganizationCommunitySaveRepository;
}): Promise<SavedOrganizationCommunity[]> {
  const organizationId = assertOrganizationId(input.organizationId);
  return input.repository.list(
    organizationId,
    ORGANIZATION_COMMUNITY_SAVES_LIST_LIMIT,
  );
}
