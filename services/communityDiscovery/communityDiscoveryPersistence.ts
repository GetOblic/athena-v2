import { communityDiscoveryPersistenceFailure } from "@/services/communityDiscovery/communityDiscoveryErrors";
import { sanitizePublicCommunityDisplayName } from "@/services/communityDiscovery/publicCommunityName";
import { normalizeSocialCommunityUrl } from "@/services/communityDiscovery/socialCommunityRegistry";
import type { SocialCommunityPlatform } from "@/services/communityDiscovery/socialCommunityPlatform";

export const PUBLIC_COMMUNITY_CATALOG_SOURCE = "public_url" as const;

export const ORGANIZATION_COMMUNITY_QUALIFICATIONS = [
  "relevant",
  "not_relevant",
] as const;

export type OrganizationCommunityQualification =
  (typeof ORGANIZATION_COMMUNITY_QUALIFICATIONS)[number];

export type PublicCommunityRecord = {
  id: string;
  platform: SocialCommunityPlatform;
  canonicalIdentity: string;
  canonicalUrl: string;
  displayName: string;
  source: typeof PUBLIC_COMMUNITY_CATALOG_SOURCE;
  sourcedAt: string;
  suppressionState: "active" | "suppressed";
};

export type NewPublicCommunity = {
  platform: SocialCommunityPlatform;
  canonicalIdentity: string;
  canonicalUrl: string;
  displayName: string;
  sourcedAt: string;
};

export type SavedOrganizationCommunity = {
  id: string;
  organizationId: string;
  communityId: string;
  platform: SocialCommunityPlatform;
  canonicalIdentity: string;
  canonicalUrl: string;
  displayName: string;
  source: typeof PUBLIC_COMMUNITY_CATALOG_SOURCE;
  sourcedAt: string;
  suppressionState: "active" | "suppressed";
  qualification: OrganizationCommunityQualification;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CommunityDiscoveryQueryResult = {
  data: unknown;
  error: { message: string } | null;
};

export interface CommunityDiscoveryQuery
  extends PromiseLike<CommunityDiscoveryQueryResult> {
  eq(column: string, value: string): CommunityDiscoveryQuery;
  in(column: string, values: readonly string[]): CommunityDiscoveryQuery;
  order(
    column: string,
    options: { ascending: boolean },
  ): CommunityDiscoveryQuery;
  limit(count: number): CommunityDiscoveryQuery;
  maybeSingle(): PromiseLike<CommunityDiscoveryQueryResult>;
  single(): PromiseLike<CommunityDiscoveryQueryResult>;
}

export interface CommunityDiscoveryWrite {
  select(columns: string): CommunityDiscoveryQuery;
}

export interface CommunityDiscoveryTable {
  select(columns: string): CommunityDiscoveryQuery;
  upsert(
    values: Record<string, unknown> | readonly Record<string, unknown>[],
    options: { onConflict: string; ignoreDuplicates?: boolean },
  ): CommunityDiscoveryWrite & PromiseLike<CommunityDiscoveryQueryResult>;
}

export interface CommunityDiscoveryDb {
  from(table: string): CommunityDiscoveryTable;
}

export interface PublicCommunityCatalog {
  findByIdentities(
    platform: SocialCommunityPlatform,
    identities: readonly string[],
  ): Promise<PublicCommunityRecord[]>;
  insertMissing(
    rows: readonly NewPublicCommunity[],
  ): Promise<PublicCommunityRecord[]>;
}

export interface OrganizationCommunitySaveRepository {
  findPublicByCanonicalUrl(
    canonicalUrl: string,
  ): Promise<PublicCommunityRecord | null>;
  findSave(
    organizationId: string,
    communityId: string,
  ): Promise<SavedOrganizationCommunity | null>;
  writeSave(input: {
    organizationId: string;
    communityId: string;
    qualification: OrganizationCommunityQualification;
    notes: string | null;
    now: string;
  }): Promise<SavedOrganizationCommunity>;
  list(
    organizationId: string,
    limit: number,
  ): Promise<SavedOrganizationCommunity[]>;
}

const PUBLIC_COMMUNITY_COLUMNS =
  "id, platform, canonical_identity, canonical_url, display_name, source, sourced_at, suppression_state";

const ORGANIZATION_SAVE_COLUMNS =
  "id, organization_id, community_id, qualification, notes, created_at, updated_at";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function mapPublicCommunityRow(row: unknown): PublicCommunityRecord {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    communityDiscoveryPersistenceFailure();
  }
  const record = row as Record<string, unknown>;
  const id = text(record.id);
  const canonicalIdentity = text(record.canonical_identity);
  const canonicalUrl = text(record.canonical_url);
  const displayName =
    typeof record.display_name === "string" ? record.display_name : "";
  const sourcedAt = text(record.sourced_at);
  const suppressionState =
    record.suppression_state === "active" ||
    record.suppression_state === "suppressed"
      ? record.suppression_state
      : null;

  if (
    !id ||
    record.platform !== "facebook_groups" ||
    !canonicalIdentity ||
    !canonicalUrl ||
    record.source !== PUBLIC_COMMUNITY_CATALOG_SOURCE ||
    !sourcedAt ||
    Number.isNaN(Date.parse(sourcedAt)) ||
    !suppressionState ||
    sanitizePublicCommunityDisplayName(displayName) !== displayName
  ) {
    communityDiscoveryPersistenceFailure();
  }

  const normalized = normalizeSocialCommunityUrl(canonicalUrl);
  if (
    !normalized.ok ||
    normalized.community.platform !== "facebook_groups" ||
    normalized.community.canonicalIdentity !== canonicalIdentity ||
    normalized.community.canonicalUrl !== canonicalUrl
  ) {
    communityDiscoveryPersistenceFailure();
  }

  return {
    id,
    platform: "facebook_groups",
    canonicalIdentity,
    canonicalUrl,
    displayName,
    source: PUBLIC_COMMUNITY_CATALOG_SOURCE,
    sourcedAt,
    suppressionState,
  };
}

function assertWritableCommunity(row: NewPublicCommunity): void {
  if (Number.isNaN(Date.parse(row.sourcedAt))) {
    communityDiscoveryPersistenceFailure();
  }
  if (sanitizePublicCommunityDisplayName(row.displayName) !== row.displayName) {
    communityDiscoveryPersistenceFailure();
  }
  const normalized = normalizeSocialCommunityUrl(row.canonicalUrl);
  if (
    !normalized.ok ||
    normalized.community.platform !== row.platform ||
    normalized.community.canonicalIdentity !== row.canonicalIdentity ||
    normalized.community.canonicalUrl !== row.canonicalUrl
  ) {
    communityDiscoveryPersistenceFailure();
  }
}

function rowsFromResult(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) communityDiscoveryPersistenceFailure();
  return data.filter(
    (row): row is Record<string, unknown> =>
      Boolean(row) && typeof row === "object",
  );
}

async function findPublicCommunitiesByIdentities(
  db: CommunityDiscoveryDb,
  platform: SocialCommunityPlatform,
  identities: readonly string[],
): Promise<PublicCommunityRecord[]> {
  if (identities.length === 0) return [];
  const { data, error } = await db
    .from("athena_public_communities")
    .select(PUBLIC_COMMUNITY_COLUMNS)
    .eq("platform", platform)
    .in("canonical_identity", identities);
  if (error) communityDiscoveryPersistenceFailure();
  return rowsFromResult(data).map(mapPublicCommunityRow);
}

async function insertPublicCommunitiesIfAbsent(
  db: CommunityDiscoveryDb,
  rows: readonly NewPublicCommunity[],
): Promise<PublicCommunityRecord[]> {
  if (rows.length === 0) return [];
  for (const row of rows) assertWritableCommunity(row);

  const payload = rows.map((row) => ({
    platform: row.platform,
    canonical_identity: row.canonicalIdentity,
    canonical_url: row.canonicalUrl,
    display_name: row.displayName,
    source: PUBLIC_COMMUNITY_CATALOG_SOURCE,
    sourced_at: row.sourcedAt,
  }));

  const { data, error } = await db
    .from("athena_public_communities")
    .upsert(payload, {
      onConflict: "platform,canonical_identity",
      ignoreDuplicates: true,
    })
    .select(PUBLIC_COMMUNITY_COLUMNS);
  if (error) communityDiscoveryPersistenceFailure();
  // ON CONFLICT DO NOTHING returns only inserted rows. A missing representation
  // is not a failed write; the caller reads the unresolved identities once.
  if (!Array.isArray(data)) return [];
  return rowsFromResult(data).map(mapPublicCommunityRow);
}

async function findPublicCommunityByCanonicalUrl(
  db: CommunityDiscoveryDb,
  canonicalUrl: string,
): Promise<PublicCommunityRecord | null> {
  const { data, error } = await db
    .from("athena_public_communities")
    .select(PUBLIC_COMMUNITY_COLUMNS)
    .eq("canonical_url", canonicalUrl)
    .maybeSingle();
  if (error) communityDiscoveryPersistenceFailure();
  if (!data) return null;
  return mapPublicCommunityRow(data);
}

async function findPublicCommunitiesByIds(
  db: CommunityDiscoveryDb,
  ids: readonly string[],
): Promise<Map<string, PublicCommunityRecord>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await db
    .from("athena_public_communities")
    .select(PUBLIC_COMMUNITY_COLUMNS)
    .in("id", ids);
  if (error) communityDiscoveryPersistenceFailure();
  const records = rowsFromResult(data).map(mapPublicCommunityRow);
  return new Map(records.map((record) => [record.id, record]));
}

function assertSaveOrganization(
  row: Record<string, unknown>,
  organizationId: string,
): void {
  if (row.organization_id !== organizationId) {
    communityDiscoveryPersistenceFailure();
  }
}

function composeSave(
  row: Record<string, unknown>,
  organizationId: string,
  community: PublicCommunityRecord,
): SavedOrganizationCommunity {
  assertSaveOrganization(row, organizationId);
  const id = text(row.id);
  const communityId = text(row.community_id);
  const qualification =
    row.qualification === "relevant" || row.qualification === "not_relevant"
      ? row.qualification
      : null;
  const notes =
    row.notes === null
      ? null
      : typeof row.notes === "string" &&
          row.notes.trim() === row.notes &&
          row.notes.length >= 1 &&
          row.notes.length <= 2000 &&
          !/[\u0000-\u001F\u007F]/.test(row.notes)
        ? row.notes
        : undefined;
  const createdAt = text(row.created_at);
  const updatedAt = text(row.updated_at);

  if (
    !id ||
    !communityId ||
    communityId !== community.id ||
    !qualification ||
    notes === undefined ||
    !createdAt ||
    !updatedAt
  ) {
    communityDiscoveryPersistenceFailure();
  }

  return {
    id,
    organizationId,
    communityId,
    platform: community.platform,
    canonicalIdentity: community.canonicalIdentity,
    canonicalUrl: community.canonicalUrl,
    displayName: community.displayName,
    source: community.source,
    sourcedAt: community.sourcedAt,
    suppressionState: community.suppressionState,
    qualification,
    notes,
    createdAt,
    updatedAt,
  };
}

async function selectOrganizationSaves(
  db: CommunityDiscoveryDb,
  organizationId: string,
  communityId?: string,
  limit?: number,
): Promise<Record<string, unknown>[]> {
  let query = db
    .from("athena_organization_communities")
    .select(ORGANIZATION_SAVE_COLUMNS)
    .eq("organization_id", organizationId);

  if (communityId) {
    query = query.eq("community_id", communityId);
  } else {
    query = query.order("updated_at", { ascending: false });
    if (limit !== undefined) query = query.limit(limit);
  }

  const { data, error } = communityId
    ? await query.maybeSingle()
    : await query;
  if (error) communityDiscoveryPersistenceFailure();
  if (communityId) {
    if (data == null) return [];
    if (typeof data !== "object" || Array.isArray(data)) {
      communityDiscoveryPersistenceFailure();
    }
    const row = data as Record<string, unknown>;
    assertSaveOrganization(row, organizationId);
    return [row];
  }
  const rows = rowsFromResult(data);
  for (const row of rows) assertSaveOrganization(row, organizationId);
  return rows;
}

async function loadSave(
  db: CommunityDiscoveryDb,
  organizationId: string,
  row: Record<string, unknown>,
): Promise<SavedOrganizationCommunity> {
  const communityId = text(row.community_id);
  if (!communityId) communityDiscoveryPersistenceFailure();
  const communities = await findPublicCommunitiesByIds(db, [communityId]);
  const community = communities.get(communityId);
  if (!community) communityDiscoveryPersistenceFailure();
  return composeSave(row, organizationId, community);
}

export function createSupabasePublicCommunityCatalog(
  db: CommunityDiscoveryDb,
): PublicCommunityCatalog {
  return {
    findByIdentities(platform, identities) {
      return findPublicCommunitiesByIdentities(db, platform, identities);
    },
    insertMissing(rows) {
      return insertPublicCommunitiesIfAbsent(db, rows);
    },
  };
}

export function createSupabaseOrganizationCommunitySaves(
  db: CommunityDiscoveryDb,
): OrganizationCommunitySaveRepository {
  return {
    findPublicByCanonicalUrl(canonicalUrl) {
      return findPublicCommunityByCanonicalUrl(db, canonicalUrl);
    },
    async findSave(organizationId, communityId) {
      const rows = await selectOrganizationSaves(
        db,
        organizationId,
        communityId,
      );
      const row = rows[0];
      if (!row) return null;
      return loadSave(db, organizationId, row);
    },
    async writeSave(input) {
      const { data, error } = await db
        .from("athena_organization_communities")
        .upsert(
          {
            organization_id: input.organizationId,
            community_id: input.communityId,
            qualification: input.qualification,
            notes: input.notes,
            updated_at: input.now,
          },
          { onConflict: "organization_id,community_id" },
        )
        .select(ORGANIZATION_SAVE_COLUMNS)
        .single();
      if (error || !data || typeof data !== "object" || Array.isArray(data)) {
        communityDiscoveryPersistenceFailure();
      }
      const row = data as Record<string, unknown>;
      assertSaveOrganization(row, input.organizationId);
      return loadSave(db, input.organizationId, row);
    },
    async list(organizationId, limit) {
      const rows = await selectOrganizationSaves(
        db,
        organizationId,
        undefined,
        limit,
      );
      if (rows.length === 0) return [];
      const ids = rows.map((row) => {
        const communityId = text(row.community_id);
        if (!communityId) communityDiscoveryPersistenceFailure();
        return communityId;
      });
      const communities = await findPublicCommunitiesByIds(db, ids);
      return rows.map((row) => {
        const communityId = text(row.community_id);
        const community = communityId
          ? communities.get(communityId)
          : undefined;
        if (!communityId || !community) communityDiscoveryPersistenceFailure();
        return composeSave(row, organizationId, community);
      });
    },
  };
}
