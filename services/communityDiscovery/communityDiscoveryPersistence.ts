import { communityDiscoveryPersistenceFailure } from "@/services/communityDiscovery/communityDiscoveryErrors";
import {
  isReliableFacebookGroupCatalogName,
  sanitizePublicCommunityDisplayName,
} from "@/services/communityDiscovery/publicCommunityName";
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

/** Replace one invalid catalog name. The caller observed currentDisplayName. */
export type PublicCommunityDisplayNameRepair = {
  platform: SocialCommunityPlatform;
  canonicalIdentity: string;
  canonicalUrl: string;
  currentDisplayName: string;
  displayName: string;
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
  removedAt: string | null;
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
  is(column: string, value: null): CommunityDiscoveryQuery;
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

export interface CommunityDiscoveryUpdate {
  eq(column: string, value: string): CommunityDiscoveryUpdate;
  in(column: string, values: readonly string[]): CommunityDiscoveryUpdate;
  is(column: string, value: null): CommunityDiscoveryUpdate;
  not(column: string, operator: "is", value: null): CommunityDiscoveryUpdate;
  select(columns: string): CommunityDiscoveryQuery;
}

export interface CommunityDiscoveryTable {
  select(columns: string): CommunityDiscoveryQuery;
  update(values: Record<string, unknown>): CommunityDiscoveryUpdate;
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
  repairInvalidDisplayNames(
    repairs: readonly PublicCommunityDisplayNameRepair[],
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
  updateActiveSave(input: {
    organizationId: string;
    communityId: string;
    qualification: OrganizationCommunityQualification;
    notes: string | null;
    now: string;
  }): Promise<SavedOrganizationCommunity | null>;
  restoreSave(input: {
    organizationId: string;
    communityId: string;
    now: string;
  }): Promise<SavedOrganizationCommunity | null>;
  maskSave(input: {
    organizationId: string;
    saveId: string;
    now: string;
  }): Promise<boolean>;
  saveMaskState(
    organizationId: string,
    saveId: string,
  ): Promise<"active" | "masked" | "missing">;
  list(
    organizationId: string,
    limit: number,
  ): Promise<SavedOrganizationCommunity[]>;
}

const PUBLIC_COMMUNITY_COLUMNS =
  "id, platform, canonical_identity, canonical_url, display_name, source, sourced_at, suppression_state";

const ORGANIZATION_SAVE_COLUMNS =
  "id, organization_id, community_id, qualification, notes, created_at, updated_at, removed_at";

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

function acceptedDisplayNameRepair(
  repair: PublicCommunityDisplayNameRepair,
): boolean {
  if (repair.platform !== "facebook_groups") return false;
  if (repair.displayName === repair.currentDisplayName) return false;
  if (
    sanitizePublicCommunityDisplayName(repair.currentDisplayName) !==
    repair.currentDisplayName
  ) {
    return false;
  }
  if (
    isReliableFacebookGroupCatalogName(
      repair.currentDisplayName,
      repair.canonicalIdentity,
    )
  ) {
    return false;
  }
  if (
    !isReliableFacebookGroupCatalogName(
      repair.displayName,
      repair.canonicalIdentity,
    )
  ) {
    return false;
  }
  const normalized = normalizeSocialCommunityUrl(repair.canonicalUrl);
  return (
    normalized.ok &&
    normalized.community.platform === repair.platform &&
    normalized.community.canonicalIdentity === repair.canonicalIdentity &&
    normalized.community.canonicalUrl === repair.canonicalUrl
  );
}

/**
 * Set display_name only while the row still holds the invalid name that was read.
 * A concurrent writer that already stored a reliable name does not match.
 * Identity, URL, source, sourced_at, and suppression are not written.
 */
async function repairInvalidPublicCommunityDisplayNames(
  db: CommunityDiscoveryDb,
  repairs: readonly PublicCommunityDisplayNameRepair[],
): Promise<PublicCommunityRecord[]> {
  const accepted = repairs.filter(acceptedDisplayNameRepair);
  if (accepted.length === 0) return [];

  const groups = new Map<string, PublicCommunityDisplayNameRepair[]>();
  for (const repair of accepted) {
    const key = JSON.stringify([
      repair.platform,
      repair.currentDisplayName,
      repair.displayName,
    ]);
    const group = groups.get(key) ?? [];
    group.push(repair);
    groups.set(key, group);
  }

  const updated = await Promise.all(
    [...groups.values()].map(async (group) => {
      const first = group[0];
      if (!first) return [];
      const identities = [
        ...new Set(group.map((repair) => repair.canonicalIdentity)),
      ];
      const { data, error } = await db
        .from("athena_public_communities")
        .update({ display_name: first.displayName })
        .eq("platform", first.platform)
        .eq("display_name", first.currentDisplayName)
        .in("canonical_identity", identities)
        .select(PUBLIC_COMMUNITY_COLUMNS);
      if (error) communityDiscoveryPersistenceFailure();
      return rowsFromResult(data).map(mapPublicCommunityRow);
    }),
  );
  return updated.flat();
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
  const removedAt =
    row.removed_at == null
      ? null
      : text(row.removed_at);

  if (
    !id ||
    !communityId ||
    communityId !== community.id ||
    !qualification ||
    notes === undefined ||
    !createdAt ||
    !updatedAt ||
    (row.removed_at != null &&
      (!removedAt || Number.isNaN(Date.parse(removedAt))))
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
    removedAt,
    createdAt,
    updatedAt,
  };
}

async function selectOrganizationSaves(
  db: CommunityDiscoveryDb,
  organizationId: string,
  communityId?: string,
  limit?: number,
  activeOnly = false,
): Promise<Record<string, unknown>[]> {
  let query = db
    .from("athena_organization_communities")
    .select(ORGANIZATION_SAVE_COLUMNS)
    .eq("organization_id", organizationId);

  if (activeOnly) query = query.is("removed_at", null);

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

async function updatedOrganizationSave(
  db: CommunityDiscoveryDb,
  organizationId: string,
  data: unknown,
): Promise<SavedOrganizationCommunity | null> {
  const rows = rowsFromResult(data);
  if (rows.length === 0) return null;
  if (rows.length > 1) communityDiscoveryPersistenceFailure();
  const row = rows[0];
  if (!row) communityDiscoveryPersistenceFailure();
  assertSaveOrganization(row, organizationId);
  return loadSave(db, organizationId, row);
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
    repairInvalidDisplayNames(repairs) {
      return repairInvalidPublicCommunityDisplayNames(db, repairs);
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
    async updateActiveSave(input) {
      const { data, error } = await db
        .from("athena_organization_communities")
        .update({
          qualification: input.qualification,
          notes: input.notes,
          updated_at: input.now,
        })
        .eq("organization_id", input.organizationId)
        .eq("community_id", input.communityId)
        .is("removed_at", null)
        .select(ORGANIZATION_SAVE_COLUMNS);
      if (error) communityDiscoveryPersistenceFailure();
      const saved = await updatedOrganizationSave(
        db,
        input.organizationId,
        data,
      );
      if (saved?.removedAt) communityDiscoveryPersistenceFailure();
      return saved;
    },
    async restoreSave(input) {
      const { data, error } = await db
        .from("athena_organization_communities")
        .update({
          removed_at: null,
          updated_at: input.now,
        })
        .eq("organization_id", input.organizationId)
        .eq("community_id", input.communityId)
        .not("removed_at", "is", null)
        .select(ORGANIZATION_SAVE_COLUMNS);
      if (error) communityDiscoveryPersistenceFailure();
      const saved = await updatedOrganizationSave(
        db,
        input.organizationId,
        data,
      );
      if (saved?.removedAt) communityDiscoveryPersistenceFailure();
      return saved;
    },
    async maskSave(input) {
      const { data, error } = await db
        .from("athena_organization_communities")
        .update({
          removed_at: input.now,
          updated_at: input.now,
        })
        .eq("organization_id", input.organizationId)
        .eq("id", input.saveId)
        .is("removed_at", null)
        .select("id, organization_id");
      if (error) communityDiscoveryPersistenceFailure();
      const rows = rowsFromResult(data);
      if (rows.length > 1) communityDiscoveryPersistenceFailure();
      for (const row of rows) assertSaveOrganization(row, input.organizationId);
      return rows.length === 1;
    },
    async saveMaskState(organizationId, saveId) {
      const { data, error } = await db
        .from("athena_organization_communities")
        .select("id, organization_id, removed_at")
        .eq("organization_id", organizationId)
        .eq("id", saveId)
        .maybeSingle();
      if (error) communityDiscoveryPersistenceFailure();
      if (!data) return "missing";
      if (typeof data !== "object" || Array.isArray(data)) {
        communityDiscoveryPersistenceFailure();
      }
      const row = data as Record<string, unknown>;
      assertSaveOrganization(row, organizationId);
      if (row.removed_at == null) return "active";
      if (
        typeof row.removed_at !== "string" ||
        Number.isNaN(Date.parse(row.removed_at))
      ) {
        communityDiscoveryPersistenceFailure();
      }
      return "masked";
    },
    async list(organizationId, limit) {
      const rows = await selectOrganizationSaves(
        db,
        organizationId,
        undefined,
        limit,
        true,
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
