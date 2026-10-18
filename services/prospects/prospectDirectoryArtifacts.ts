/**
 * Shared saved Description and Knowledge Base for the original source Prospect.
 *
 * Reads and saves require the Prospect id and the verified source organization.
 * The composite database key rejects a foreign organization. Compare-and-swap
 * saves use one insert, or one update filtered by the expected revision.
 * Unique (prospect_id, artifact_type) makes one of two first inserts lose.
 * This module does not read or write Executive Intelligence, Client Brain,
 * or the legacy generated_listing_description column.
 */

import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GETOBLIC_DESCRIPTION_MAX_CHARS } from "@/services/prospects/prospectGeneratedListingDescription";
import { getProspectById } from "@/services/prospects/prospectService";

export const PROSPECT_DIRECTORY_ARTIFACTS_TABLE = "prospect_directory_artifacts";
export const PROSPECT_DIRECTORY_KNOWLEDGE_BASE_MAX_CHARS = 100_000;
export const PROSPECT_DIRECTORY_ARTIFACT_INITIAL_REVISION = 1;

const ARTIFACT_COLUMNS =
  "prospect_id, organization_id, artifact_type, revision, content, content_sha256, origin, source_executive_version_id, saved_at, saved_by_organization_id";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PROSPECT_DIRECTORY_ARTIFACT_TYPES = [
  "description",
  "knowledge_base",
] as const;

export const PROSPECT_DIRECTORY_ARTIFACT_ORIGINS = ["generated", "edited"] as const;

export type ProspectDirectoryArtifactType =
  (typeof PROSPECT_DIRECTORY_ARTIFACT_TYPES)[number];

export type ProspectDirectoryArtifactOrigin =
  (typeof PROSPECT_DIRECTORY_ARTIFACT_ORIGINS)[number];

export type ProspectDirectoryArtifactRecord = {
  prospectId: string;
  organizationId: string;
  artifactType: ProspectDirectoryArtifactType;
  revision: number;
  content: string;
  contentSha256: string;
  origin: ProspectDirectoryArtifactOrigin;
  sourceExecutiveVersionId: string | null;
  savedAt: string;
  savedByOrganizationId: string;
};

export type ProspectDirectoryArtifactListResult =
  | { ok: true; rows: ProspectDirectoryArtifactRecord[] }
  | { ok: false; reason: "unavailable" };

export type ProspectDirectoryArtifactInsertResult =
  | "inserted"
  | "conflict"
  | "unavailable";

export type ProspectDirectoryArtifactReplaceResult =
  | ProspectDirectoryArtifactRecord
  | "conflict"
  | "unavailable";

export type ProspectDirectoryArtifactStore = {
  listForProspect(input: {
    prospectId: string;
    sourceOrganizationId: string;
  }): Promise<ProspectDirectoryArtifactListResult>;
  insert(
    record: ProspectDirectoryArtifactRecord,
  ): Promise<ProspectDirectoryArtifactInsertResult>;
  replaceIfRevision(input: {
    prospectId: string;
    sourceOrganizationId: string;
    artifactType: ProspectDirectoryArtifactType;
    expectedRevision: number;
    next: ProspectDirectoryArtifactRecord;
  }): Promise<ProspectDirectoryArtifactReplaceResult>;
};

export type ReadSavedProspectDirectoryArtifactsResult =
  | {
      ok: true;
      description: ProspectDirectoryArtifactRecord | null;
      knowledgeBase: ProspectDirectoryArtifactRecord | null;
    }
  | { ok: false; reason: "unavailable" };

export type SaveProspectDirectoryArtifactReason =
  | "invalid_content"
  | "invalid_revision"
  | "not_found"
  | "conflict"
  | "unavailable";

export type SaveProspectDirectoryArtifactResult =
  | {
      ok: true;
      created: boolean;
      artifact: ProspectDirectoryArtifactRecord;
    }
  | { ok: false; reason: SaveProspectDirectoryArtifactReason };

type ArtifactQueryError = { code?: string; message?: string } | null;

type ArtifactQueryResult = {
  data: unknown;
  error: ArtifactQueryError;
};

type ArtifactFilter = PromiseLike<ArtifactQueryResult> & {
  eq: (column: string, value: string | number) => ArtifactFilter;
  select: (columns: string) => ArtifactFilter;
};

type ProspectDirectoryArtifactDb = {
  from: (table: string) => {
    select: (columns: string) => ArtifactFilter;
    insert: (row: Record<string, unknown>) => ArtifactFilter;
    update: (row: Record<string, unknown>) => ArtifactFilter;
  };
};

export type DescriptionBackfillProspect = {
  id: string;
  organizationId: string;
  generatedListingDescription: unknown;
  updatedAt?: string | null;
};

export type DescriptionBackfillPlan = {
  inserts: ProspectDirectoryArtifactRecord[];
  excludedProspectIds: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isProspectDirectoryArtifactType(
  value: unknown,
): value is ProspectDirectoryArtifactType {
  return (
    value === "description" || value === "knowledge_base"
  );
}

export function isProspectDirectoryArtifactOrigin(
  value: unknown,
): value is ProspectDirectoryArtifactOrigin {
  return value === "generated" || value === "edited";
}

export function hashProspectDirectoryArtifactContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function canonicalizeProspectDirectoryArtifactContent(
  artifactType: ProspectDirectoryArtifactType,
  content: unknown,
): string | null {
  if (typeof content !== "string") return null;
  const canonical = content.trim();
  if (!canonical) return null;
  const max =
    artifactType === "description"
      ? GETOBLIC_DESCRIPTION_MAX_CHARS
      : PROSPECT_DIRECTORY_KNOWLEDGE_BASE_MAX_CHARS;
  if (canonical.length > max) return null;
  return canonical;
}

/**
 * Description text eligible for backfill. generatedAt is not required.
 * Empty, non-string, and over-4000 values are excluded. Knowledge Base
 * payload is ignored because this reads only the description field.
 */
export function readBackfillableDescription(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return null;
  return canonicalizeProspectDirectoryArtifactContent(
    "description",
    record.description,
  );
}

function parseTimestamp(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

export function planDescriptionArtifactBackfill(input: {
  prospects: readonly DescriptionBackfillProspect[];
  existing: readonly Pick<
    ProspectDirectoryArtifactRecord,
    "prospectId" | "artifactType"
  >[];
  now: string;
}): DescriptionBackfillPlan {
  const occupied = new Set(
    input.existing
      .filter((row) => row.artifactType === "description")
      .map((row) => row.prospectId),
  );
  const seen = new Set<string>();
  const inserts: ProspectDirectoryArtifactRecord[] = [];
  const excludedProspectIds: string[] = [];
  const prospects = [...input.prospects].sort((left, right) =>
    left.id.localeCompare(right.id),
  );

  for (const prospect of prospects) {
    const prospectId = prospect.id.trim();
    const organizationId = prospect.organizationId.trim();
    if (!prospectId || !organizationId || seen.has(prospectId)) {
      excludedProspectIds.push(prospect.id);
      continue;
    }
    seen.add(prospectId);
    if (occupied.has(prospectId)) {
      excludedProspectIds.push(prospectId);
      continue;
    }
    const content = readBackfillableDescription(
      prospect.generatedListingDescription,
    );
    if (!content) {
      excludedProspectIds.push(prospectId);
      continue;
    }
    inserts.push({
      prospectId,
      organizationId,
      artifactType: "description",
      revision: PROSPECT_DIRECTORY_ARTIFACT_INITIAL_REVISION,
      content,
      contentSha256: hashProspectDirectoryArtifactContent(content),
      origin: "generated",
      sourceExecutiveVersionId: null,
      savedAt: parseTimestamp(prospect.updatedAt) ?? input.now,
      savedByOrganizationId: organizationId,
    });
  }

  return { inserts, excludedProspectIds };
}

function isUniqueViolation(error: ArtifactQueryError): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(error.message ?? "");
}

function logUnavailable(action: string, error: ArtifactQueryError): void {
  console.error("[PROSPECT_DIRECTORY_ARTIFACT]", action, {
    code: error?.code ?? null,
    message: error?.message ?? "unknown",
  });
}

export function mapProspectDirectoryArtifactRow(
  value: unknown,
): ProspectDirectoryArtifactRecord | null {
  const row = asRecord(value);
  if (!row) return null;
  const prospectId = readId(row.prospect_id);
  const organizationId = readId(row.organization_id);
  const artifactType = row.artifact_type;
  const origin = row.origin;
  const savedByOrganizationId = readId(row.saved_by_organization_id);
  const savedAt = readId(row.saved_at);
  const revision = row.revision;
  if (
    !prospectId ||
    !organizationId ||
    !isProspectDirectoryArtifactType(artifactType) ||
    !isProspectDirectoryArtifactOrigin(origin) ||
    !savedByOrganizationId ||
    !savedAt ||
    typeof revision !== "number" ||
    !Number.isInteger(revision) ||
    revision < 1
  ) {
    return null;
  }
  const content = canonicalizeProspectDirectoryArtifactContent(
    artifactType,
    row.content,
  );
  if (!content || content !== row.content) return null;
  const contentSha256 = readId(row.content_sha256);
  if (
    !contentSha256 ||
    contentSha256 !== hashProspectDirectoryArtifactContent(content)
  ) {
    return null;
  }
  const sourceValue = row.source_executive_version_id;
  let sourceExecutiveVersionId: string | null = null;
  if (sourceValue != null) {
    if (typeof sourceValue !== "string" || !UUID_PATTERN.test(sourceValue)) {
      return null;
    }
    sourceExecutiveVersionId = sourceValue;
  }
  return {
    prospectId,
    organizationId,
    artifactType,
    revision,
    content,
    contentSha256,
    origin,
    sourceExecutiveVersionId,
    savedAt,
    savedByOrganizationId,
  };
}

function toDbRow(record: ProspectDirectoryArtifactRecord): Record<string, unknown> {
  return {
    prospect_id: record.prospectId,
    organization_id: record.organizationId,
    artifact_type: record.artifactType,
    revision: record.revision,
    content: record.content,
    content_sha256: record.contentSha256,
    origin: record.origin,
    source_executive_version_id: record.sourceExecutiveVersionId,
    saved_at: record.savedAt,
    saved_by_organization_id: record.savedByOrganizationId,
  };
}

function singleOwnedArtifact(
  rows: readonly ProspectDirectoryArtifactRecord[],
  input: {
    prospectId: string;
    sourceOrganizationId: string;
    artifactType: ProspectDirectoryArtifactType;
  },
): ProspectDirectoryArtifactRecord | null {
  const matches = rows.filter(
    (row) =>
      row.prospectId === input.prospectId &&
      row.organizationId === input.sourceOrganizationId &&
      row.artifactType === input.artifactType,
  );
  return matches.length === 1 ? matches[0] : null;
}

export function createSupabaseProspectDirectoryArtifactStore(
  db: ProspectDirectoryArtifactDb = supabaseAdmin as unknown as ProspectDirectoryArtifactDb,
): ProspectDirectoryArtifactStore {
  return {
    async listForProspect(input) {
      try {
        const { data, error } = await db
          .from(PROSPECT_DIRECTORY_ARTIFACTS_TABLE)
          .select(ARTIFACT_COLUMNS)
          .eq("prospect_id", input.prospectId)
          .eq("organization_id", input.sourceOrganizationId);
        if (error || !Array.isArray(data)) {
          logUnavailable("read_unavailable", error);
          return { ok: false, reason: "unavailable" };
        }
        return {
          ok: true,
          rows: data.flatMap((row) => {
            const mapped = mapProspectDirectoryArtifactRow(row);
            return mapped ? [mapped] : [];
          }),
        };
      } catch (error) {
        logUnavailable("read_unavailable", {
          message: error instanceof Error ? error.message : "unknown",
        });
        return { ok: false, reason: "unavailable" };
      }
    },

    async insert(record) {
      try {
        const { error } = await db
          .from(PROSPECT_DIRECTORY_ARTIFACTS_TABLE)
          .insert(toDbRow(record));
        if (!error) return "inserted";
        if (isUniqueViolation(error)) return "conflict";
        logUnavailable("insert_unavailable", error);
        return "unavailable";
      } catch (error) {
        logUnavailable("insert_unavailable", {
          message: error instanceof Error ? error.message : "unknown",
        });
        return "unavailable";
      }
    },

    async replaceIfRevision(input) {
      try {
        const { data, error } = await db
          .from(PROSPECT_DIRECTORY_ARTIFACTS_TABLE)
          .update(toDbRow(input.next))
          .eq("prospect_id", input.prospectId)
          .eq("organization_id", input.sourceOrganizationId)
          .eq("artifact_type", input.artifactType)
          .eq("revision", input.expectedRevision)
          .select(ARTIFACT_COLUMNS);
        if (error) {
          logUnavailable("update_unavailable", error);
          return "unavailable";
        }
        if (!Array.isArray(data) || data.length !== 1) return "conflict";
        const mapped = mapProspectDirectoryArtifactRow(data[0]);
        if (
          !mapped ||
          mapped.prospectId !== input.prospectId ||
          mapped.organizationId !== input.sourceOrganizationId ||
          mapped.artifactType !== input.artifactType ||
          mapped.revision !== input.expectedRevision + 1
        ) {
          return "conflict";
        }
        return mapped;
      } catch (error) {
        logUnavailable("update_unavailable", {
          message: error instanceof Error ? error.message : "unknown",
        });
        return "unavailable";
      }
    },
  };
}

export function createProspectDirectoryArtifactMemoryStore(
  seed: readonly ProspectDirectoryArtifactRecord[] = [],
): ProspectDirectoryArtifactStore & {
  snapshot: () => ProspectDirectoryArtifactRecord[];
} {
  const rows = seed.map((row) => ({ ...row }));
  let tail: Promise<void> = Promise.resolve();
  const exclusive = <T>(work: () => T): Promise<T> => {
    const run = tail.then(() => work());
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  return {
    snapshot() {
      return rows.map((row) => ({ ...row }));
    },
    listForProspect(input) {
      return exclusive(() => ({
        ok: true as const,
        rows: rows
          .filter(
            (row) =>
              row.prospectId === input.prospectId &&
              row.organizationId === input.sourceOrganizationId,
          )
          .map((row) => ({ ...row })),
      }));
    },
    insert(record) {
      return exclusive(() => {
        const occupied = rows.some(
          (row) =>
            row.prospectId === record.prospectId &&
            row.artifactType === record.artifactType,
        );
        if (occupied) return "conflict" as const;
        if (record.revision !== PROSPECT_DIRECTORY_ARTIFACT_INITIAL_REVISION) {
          return "conflict" as const;
        }
        rows.push({ ...record });
        return "inserted" as const;
      });
    },
    replaceIfRevision(input) {
      return exclusive(() => {
        const index = rows.findIndex(
          (row) =>
            row.prospectId === input.prospectId &&
            row.artifactType === input.artifactType,
        );
        if (index < 0) return "conflict" as const;
        const current = rows[index];
        if (
          current.organizationId !== input.sourceOrganizationId ||
          current.revision !== input.expectedRevision ||
          input.next.revision !== input.expectedRevision + 1 ||
          input.next.prospectId !== input.prospectId ||
          input.next.organizationId !== input.sourceOrganizationId ||
          input.next.artifactType !== input.artifactType
        ) {
          return "conflict" as const;
        }
        const next = { ...input.next };
        rows[index] = next;
        return { ...next };
      });
    },
  };
}

const defaultStore = createSupabaseProspectDirectoryArtifactStore();

async function defaultOwnsSourceProspect(input: {
  prospectId: string;
  sourceOrganizationId: string;
}): Promise<boolean> {
  const prospect = await getProspectById(
    input.prospectId,
    input.sourceOrganizationId,
  );
  return (
    prospect?.id === input.prospectId &&
    prospect.organization_id === input.sourceOrganizationId
  );
}

function isUuid(value: string | null): boolean {
  return value != null && UUID_PATTERN.test(value);
}

export async function readSavedProspectDirectoryArtifacts(input: {
  prospectId: string;
  sourceOrganizationId: string;
  store?: ProspectDirectoryArtifactStore;
}): Promise<ReadSavedProspectDirectoryArtifactsResult> {
  const prospectId = input.prospectId.trim();
  const sourceOrganizationId = input.sourceOrganizationId.trim();
  if (!prospectId || !sourceOrganizationId) {
    return { ok: true, description: null, knowledgeBase: null };
  }
  const store = input.store ?? defaultStore;
  const listed = await store.listForProspect({
    prospectId,
    sourceOrganizationId,
  });
  if (!listed.ok) return listed;
  const scope = { prospectId, sourceOrganizationId };
  return {
    ok: true,
    description: singleOwnedArtifact(listed.rows, {
      ...scope,
      artifactType: "description",
    }),
    knowledgeBase: singleOwnedArtifact(listed.rows, {
      ...scope,
      artifactType: "knowledge_base",
    }),
  };
}

export async function saveProspectDirectoryArtifact(input: {
  prospectId: string;
  sourceOrganizationId: string;
  artifactType: ProspectDirectoryArtifactType;
  content: string;
  origin: ProspectDirectoryArtifactOrigin;
  expectedRevision: number | null;
  sourceExecutiveVersionId?: string | null;
  now?: Date;
  store?: ProspectDirectoryArtifactStore;
  ownsSourceProspect?: (value: {
    prospectId: string;
    sourceOrganizationId: string;
  }) => Promise<boolean>;
}): Promise<SaveProspectDirectoryArtifactResult> {
  const prospectId = input.prospectId.trim();
  const sourceOrganizationId = input.sourceOrganizationId.trim();
  if (
    !prospectId ||
    !sourceOrganizationId ||
    !isProspectDirectoryArtifactType(input.artifactType) ||
    !isProspectDirectoryArtifactOrigin(input.origin)
  ) {
    return { ok: false, reason: "invalid_content" };
  }
  const expectedRevision = input.expectedRevision;
  const revisionIsInitial = expectedRevision === null;
  const revisionIsUpdate =
    typeof expectedRevision === "number" &&
    Number.isInteger(expectedRevision) &&
    expectedRevision >= 1;
  if (!revisionIsInitial && !revisionIsUpdate) {
    return { ok: false, reason: "invalid_revision" };
  }
  const content = canonicalizeProspectDirectoryArtifactContent(
    input.artifactType,
    input.content,
  );
  if (!content) return { ok: false, reason: "invalid_content" };

  const sourceExecutiveVersionId = input.sourceExecutiveVersionId ?? null;
  if (sourceExecutiveVersionId !== null && !isUuid(sourceExecutiveVersionId)) {
    return { ok: false, reason: "invalid_content" };
  }

  const owns = input.ownsSourceProspect ?? defaultOwnsSourceProspect;
  const owned = await owns({ prospectId, sourceOrganizationId });
  if (!owned) return { ok: false, reason: "not_found" };

  const store = input.store ?? defaultStore;
  const record: ProspectDirectoryArtifactRecord = {
    prospectId,
    organizationId: sourceOrganizationId,
    artifactType: input.artifactType,
    revision: revisionIsInitial
      ? PROSPECT_DIRECTORY_ARTIFACT_INITIAL_REVISION
      : expectedRevision + 1,
    content,
    contentSha256: hashProspectDirectoryArtifactContent(content),
    origin: input.origin,
    sourceExecutiveVersionId,
    savedAt: (input.now ?? new Date()).toISOString(),
    savedByOrganizationId: sourceOrganizationId,
  };

  if (revisionIsInitial) {
    const inserted = await store.insert(record);
    if (inserted === "inserted") {
      return { ok: true, created: true, artifact: record };
    }
    return { ok: false, reason: inserted };
  }

  const replaced = await store.replaceIfRevision({
    prospectId,
    sourceOrganizationId,
    artifactType: input.artifactType,
    expectedRevision,
    next: record,
  });
  if (replaced === "conflict" || replaced === "unavailable") {
    return { ok: false, reason: replaced };
  }
  return { ok: true, created: false, artifact: replaced };
}
