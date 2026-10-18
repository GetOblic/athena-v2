/**
 * Shared GetOblic artifact persistence foundation.
 * Deterministic repository, backfill, and migration-contract tests.
 * No database execution.
 */

import "../licensee/licenseeAuthTestEnv";

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { ProspectDirectoryArtifactReadout } from "../../components/prospects/ProspectDirectoryArtifactReadout";
import { en } from "../../lib/tenantI18n/messages/en";
import { GETOBLIC_DESCRIPTION_MAX_CHARS } from "../../services/prospects/prospectGeneratedListingDescription";
import {
  PROSPECT_DIRECTORY_ARTIFACTS_TABLE,
  PROSPECT_DIRECTORY_ARTIFACT_INITIAL_REVISION,
  PROSPECT_DIRECTORY_KNOWLEDGE_BASE_MAX_CHARS,
  canonicalizeProspectDirectoryArtifactContent,
  createProspectDirectoryArtifactMemoryStore,
  createSupabaseProspectDirectoryArtifactStore,
  hashProspectDirectoryArtifactContent,
  planDescriptionArtifactBackfill,
  readBackfillableDescription,
  readSavedProspectDirectoryArtifacts,
  saveProspectDirectoryArtifact,
  type ProspectDirectoryArtifactRecord,
  type ProspectDirectoryArtifactStore,
} from "../../services/prospects/prospectDirectoryArtifacts";

const ROOT = process.cwd();
const MIGRATION = "supabase/migrations/20261018000001_create_prospect_directory_artifacts.sql";
const SOURCE = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const PROSPECT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_PROSPECT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const VERSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = "2026-10-18T12:00:00.000Z";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function descriptionProspect(input: {
  id?: string;
  organizationId?: string;
  description: unknown;
  updatedAt?: string | null;
  generatedAt?: string;
}) {
  const generated =
    input.description !== null &&
    typeof input.description === "object" &&
    !Array.isArray(input.description)
      ? input.description
      : input.generatedAt
        ? { description: input.description, generatedAt: input.generatedAt }
        : { description: input.description };
  return {
    id: input.id ?? PROSPECT,
    organizationId: input.organizationId ?? SOURCE,
    generatedListingDescription:
      input.description === null ? null : generated,
    updatedAt: input.updatedAt,
  };
}

function record(
  overrides: Partial<ProspectDirectoryArtifactRecord> = {},
): ProspectDirectoryArtifactRecord {
  const content = overrides.content ?? "Approved description";
  return {
    prospectId: PROSPECT,
    organizationId: SOURCE,
    artifactType: "description",
    revision: 1,
    content,
    contentSha256: hashProspectDirectoryArtifactContent(content),
    origin: "generated",
    sourceExecutiveVersionId: null,
    savedAt: NOW,
    savedByOrganizationId: SOURCE,
    ...overrides,
    contentSha256:
      overrides.contentSha256 ??
      hashProspectDirectoryArtifactContent(overrides.content ?? content),
  };
}

function ownsSource(sourceOrganizationId = SOURCE) {
  return async (input: { prospectId: string; sourceOrganizationId: string }) =>
    input.prospectId === PROSPECT &&
    input.sourceOrganizationId === sourceOrganizationId;
}

type QueryError = { code?: string; message?: string } | null;

function createFakeDb(state: {
  rows: Array<Record<string, unknown>>;
  insertError?: QueryError;
  updateError?: QueryError;
}) {
  const calls: Array<{
    op: "select" | "insert" | "update";
    table: string;
    filters: Array<{ column: string; value: string | number }>;
    payload?: Record<string, unknown>;
  }> = [];
  return {
    calls,
    from(table: string) {
      const filters: Array<{ column: string; value: string | number }> = [];
      let op: "select" | "insert" | "update" = "select";
      let payload: Record<string, unknown> | undefined;
      const builder = {
        select() {
          if (op !== "update") op = "select";
          return builder;
        },
        insert(row: Record<string, unknown>) {
          op = "insert";
          payload = row;
          return builder;
        },
        update(row: Record<string, unknown>) {
          op = "update";
          payload = row;
          return builder;
        },
        eq(column: string, value: string | number) {
          filters.push({ column, value });
          return builder;
        },
        then(
          onFulfilled?: (value: { data: unknown; error: QueryError }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) {
          const snapshot = {
            op,
            table,
            filters: filters.map((filter) => ({ ...filter })),
            payload: payload ? { ...payload } : undefined,
          };
          calls.push(snapshot);
          let result: { data: unknown; error: QueryError };
          if (op === "insert") {
            if (!state.insertError) state.rows.push({ ...(payload ?? {}) });
            result = { data: null, error: state.insertError ?? null };
          } else if (op === "update") {
            if (state.updateError) {
              result = { data: null, error: state.updateError };
            } else {
              const matches = state.rows.filter((row) =>
                filters.every((filter) => row[filter.column] === filter.value),
              );
              if (matches.length === 1 && payload) Object.assign(matches[0], payload);
              result = {
                data: matches.length === 1 ? [{ ...matches[0] }] : [],
                error: null,
              };
            }
          } else {
            result = {
              data: state.rows.filter((row) =>
                filters.every((filter) => row[filter.column] === filter.value),
              ),
              error: null,
            };
          }
          return Promise.resolve(result).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
}

describe("prospect directory artifact backfill", () => {
  it("imports one valid trimmed description for the source organization", () => {
    const prospects = [
      descriptionProspect({
        description: `  ${"H".repeat(20)}  `,
        generatedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-10-02T03:04:05.000Z",
      }),
    ];
    const before = structuredClone(prospects);
    const plan = planDescriptionArtifactBackfill({
      prospects,
      existing: [],
      now: NOW,
    });
    assert.deepEqual(prospects, before);
    assert.equal(plan.inserts.length, 1);
    const inserted = plan.inserts[0];
    assert.equal(inserted?.artifactType, "description");
    assert.equal(inserted?.organizationId, SOURCE);
    assert.equal(inserted?.savedByOrganizationId, SOURCE);
    assert.equal(inserted?.revision, 1);
    assert.equal(inserted?.origin, "generated");
    assert.equal(inserted?.sourceExecutiveVersionId, null);
    assert.equal(inserted?.content, "H".repeat(20));
    assert.equal(
      inserted?.contentSha256,
      hashProspectDirectoryArtifactContent("H".repeat(20)),
    );
    assert.equal(inserted?.savedAt, "2026-10-02T03:04:05.000Z");
    assert.equal(GETOBLIC_DESCRIPTION_MAX_CHARS, 4000);
  });

  it("accepts a 4000-character description without generatedAt", () => {
    const content = "A".repeat(4000);
    const plan = planDescriptionArtifactBackfill({
      prospects: [
        descriptionProspect({
          description: ` ${content} `,
          updatedAt: null,
        }),
      ],
      existing: [],
      now: NOW,
    });
    assert.equal(plan.inserts[0]?.content, content);
    assert.equal(plan.inserts[0]?.savedAt, NOW);
    assert.equal(readBackfillableDescription({ description: content }), content);
  });

  it("excludes malformed, empty, and oversized descriptions", () => {
    const oversized = "B".repeat(GETOBLIC_DESCRIPTION_MAX_CHARS + 1);
    const cases: unknown[] = [
      null,
      "plain text",
      [],
      { description: "" },
      { description: "   " },
      { description: 12 },
      { description: oversized },
      { description: ` ${oversized} ` },
      { knowledgeBase: "Do not import this knowledge base" },
    ];
    for (const generatedListingDescription of cases) {
      const plan = planDescriptionArtifactBackfill({
        prospects: [
          {
            id: PROSPECT,
            organizationId: SOURCE,
            generatedListingDescription,
            updatedAt: NOW,
          },
        ],
        existing: [],
        now: NOW,
      });
      assert.deepEqual(plan.inserts, [], JSON.stringify(generatedListingDescription));
    }
    assert.equal(
      canonicalizeProspectDirectoryArtifactContent("description", oversized),
      null,
    );
  });

  it("does not backfill Knowledge Base and does not cross organizations", () => {
    const plan = planDescriptionArtifactBackfill({
      prospects: [
        {
          id: OTHER_PROSPECT,
          organizationId: OTHER,
          generatedListingDescription: {
            description: "Other organization",
            knowledgeBase: "Executive knowledge must stay out",
          },
          updatedAt: NOW,
        },
        descriptionProspect({
          id: PROSPECT,
          organizationId: SOURCE,
          description: "Source description",
        }),
      ],
      existing: [],
      now: NOW,
    });
    assert.deepEqual(
      plan.inserts.map((row) => [row.prospectId, row.organizationId, row.artifactType]),
      [
        [PROSPECT, SOURCE, "description"],
        [OTHER_PROSPECT, OTHER, "description"],
      ],
    );
    assert.equal(
      plan.inserts.every((row) => row.artifactType === "description"),
      true,
    );
    assert.equal(JSON.stringify(plan.inserts).includes("Executive knowledge"), false);
    assert.equal(
      plan.inserts.find((row) => row.prospectId === PROSPECT)?.savedByOrganizationId,
      SOURCE,
    );
  });

  it("is idempotent and never overwrites an existing artifact", () => {
    const prospects = [
      descriptionProspect({ description: "Fresh legacy text" }),
    ];
    const legacyBefore = structuredClone(prospects);
    const existing = [
      {
        prospectId: PROSPECT,
        artifactType: "description" as const,
        organizationId: OTHER,
        content: "Already saved",
      },
    ];
    const existingBefore = structuredClone(existing);
    const blocked = planDescriptionArtifactBackfill({
      prospects,
      existing,
      now: NOW,
    });
    assert.deepEqual(blocked.inserts, []);
    assert.deepEqual(existing, existingBefore);
    assert.deepEqual(prospects, legacyBefore);

    const first = planDescriptionArtifactBackfill({
      prospects,
      existing: [],
      now: NOW,
    });
    const second = planDescriptionArtifactBackfill({
      prospects,
      existing: first.inserts,
      now: NOW,
    });
    assert.equal(first.inserts.length, 1);
    assert.deepEqual(second.inserts, []);
    assert.equal(first.inserts[0]?.content, "Fresh legacy text");
  });

  it("imports one row when the same Prospect is listed twice", () => {
    const plan = planDescriptionArtifactBackfill({
      prospects: [
        descriptionProspect({ id: "z-prospect", description: "Zed" }),
        descriptionProspect({ id: "a-prospect", description: "Aye" }),
        descriptionProspect({ id: "a-prospect", description: "Aye again" }),
      ],
      existing: [],
      now: NOW,
    });
    assert.deepEqual(
      plan.inserts.map((row) => row.prospectId),
      ["a-prospect", "z-prospect"],
    );
    assert.equal(plan.inserts[0]?.content, "Aye");
  });
});

describe("prospect directory artifact migration contract", () => {
  const sql = read(MIGRATION);
  const backfill = sql.slice(sql.indexOf("insert into prospect_directory_artifacts"));

  it("is an idempotent service-role table with source ownership", () => {
    assert.match(sql, /create table if not exists prospect_directory_artifacts/i);
    assert.match(sql, /create unique index if not exists prospects_id_organization_id_key/i);
    assert.match(
      sql,
      /foreign key \(prospect_id, organization_id\)\s+references prospects \(id, organization_id\)\s+on delete cascade/i,
    );
    assert.match(sql, /organization_id uuid not null/i);
    assert.match(
      sql,
      /source_executive_version_id uuid null\s+references athena_executive_intelligence_versions\(id\) on delete set null/i,
    );
    assert.match(
      sql,
      /saved_by_organization_id uuid null\s+references organizations\(id\) on delete set null/i,
    );
    assert.doesNotMatch(sql, /saved_by_organization_id uuid not null/i);
    assert.doesNotMatch(
      sql,
      /saved_by_organization_id[\s\S]{0,160}on delete cascade/i,
    );
    assert.doesNotMatch(
      sql,
      /foreign key \([^)\n]*saved_by_organization_id[^)\n]*,[^)\n]*\)/i,
    );
    assert.doesNotMatch(
      sql,
      /foreign key \([^)\n]*,[^)\n]*saved_by_organization_id[^)\n]*\)/i,
    );
    assert.doesNotMatch(
      sql,
      /organization_id uuid not null\s+references organizations/i,
    );
    assert.match(sql, /primary key \(prospect_id, artifact_type\)/i);
    assert.match(sql, /artifact_type in \('description', 'knowledge_base'\)/i);
    assert.match(sql, /origin in \('generated', 'edited'\)/i);
    assert.match(sql, /revision >= 1/i);
    assert.match(sql, /char_length\(content\) <= 4000/i);
    assert.match(sql, /char_length\(content\) <= 100000/i);
    assert.match(sql, /alter table prospect_directory_artifacts enable row level security/i);
    assert.match(sql, /revoke all on table prospect_directory_artifacts from public/i);
    assert.match(sql, /revoke all on table prospect_directory_artifacts from anon/i);
    assert.match(sql, /revoke all on table prospect_directory_artifacts from authenticated/i);
    assert.match(sql, /grant all on table prospect_directory_artifacts to service_role/i);
    assert.doesNotMatch(sql, /create policy/i);
    assert.doesNotMatch(sql, /security definer/i);
    assert.doesNotMatch(sql, /\bupdate\s+prospects\b/i);
    assert.doesNotMatch(sql, /\bset\s+generated_listing_description\b/i);
    assert.equal(PROSPECT_DIRECTORY_KNOWLEDGE_BASE_MAX_CHARS, 100000);
  });

  it("backfills only a valid description and does not replace existing rows", () => {
    assert.match(backfill, /'description'/);
    assert.match(backfill, /between 1 and 4000/);
    assert.match(backfill, /jsonb_typeof\(p\.generated_listing_description\) = 'object'/);
    assert.match(
      backfill,
      /jsonb_typeof\(p\.generated_listing_description->'description'\) = 'string'/,
    );
    assert.match(backfill, /on conflict \(prospect_id, artifact_type\) do nothing/i);
    assert.match(backfill, /extensions\.digest/);
    assert.match(backfill, /convert_to\(/);
    assert.match(backfill, /'UTF8'/);
    assert.match(backfill, /'sha256'/);
    assert.match(backfill, /p\.organization_id/);
    assert.doesNotMatch(backfill, /knowledge_base/);
    assert.doesNotMatch(backfill, /athena_executive_intelligence_versions/);
    assert.doesNotMatch(backfill, /\bupdate\b/i);
  });
});

describe("prospect directory artifact concurrency", () => {
  it("lets only one simultaneous first save succeed", async () => {
    const store = createProspectDirectoryArtifactMemoryStore();
    const [left, right] = await Promise.all([
      saveProspectDirectoryArtifact({
        prospectId: PROSPECT,
        sourceOrganizationId: SOURCE,
        artifactType: "description",
        content: "Left body",
        origin: "generated",
        expectedRevision: null,
        now: new Date(NOW),
        store,
        ownsSourceProspect: ownsSource(),
      }),
      saveProspectDirectoryArtifact({
        prospectId: PROSPECT,
        sourceOrganizationId: SOURCE,
        artifactType: "description",
        content: "Right body",
        origin: "generated",
        expectedRevision: null,
        now: new Date(NOW),
        store,
        ownsSourceProspect: ownsSource(),
      }),
    ]);
    const outcomes = [left, right];
    assert.equal(outcomes.filter((result) => result.ok).length, 1);
    assert.equal(
      outcomes.filter((result) => !result.ok && result.reason === "conflict").length,
      1,
    );
    const saved = store.snapshot();
    assert.equal(saved.length, 1);
    assert.equal(saved[0]?.revision, PROSPECT_DIRECTORY_ARTIFACT_INITIAL_REVISION);
    assert.equal(
      saved[0]?.content === "Left body" || saved[0]?.content === "Right body",
      true,
    );
  });

  it("conflicts on a stale revision and increments exactly once", async () => {
    const store = createProspectDirectoryArtifactMemoryStore();
    const created = await saveProspectDirectoryArtifact({
      prospectId: PROSPECT,
      sourceOrganizationId: SOURCE,
      artifactType: "description",
      content: "Original",
      origin: "generated",
      expectedRevision: null,
      now: new Date(NOW),
      store,
      ownsSourceProspect: ownsSource(),
    });
    assert.equal(created.ok && created.artifact.revision, 1);

    const [winner, loser] = await Promise.all([
      saveProspectDirectoryArtifact({
        prospectId: PROSPECT,
        sourceOrganizationId: SOURCE,
        artifactType: "description",
        content: "Winner",
        origin: "edited",
        expectedRevision: 1,
        now: new Date("2026-10-18T12:05:00.000Z"),
        store,
        ownsSourceProspect: ownsSource(),
      }),
      saveProspectDirectoryArtifact({
        prospectId: PROSPECT,
        sourceOrganizationId: SOURCE,
        artifactType: "description",
        content: "Loser",
        origin: "edited",
        expectedRevision: 1,
        now: new Date("2026-10-18T12:05:00.000Z"),
        store,
        ownsSourceProspect: ownsSource(),
      }),
    ]);
    const success = [winner, loser].find((result) => result.ok);
    const conflict = [winner, loser].find((result) => !result.ok);
    assert.equal(success?.ok, true);
    if (!success?.ok) return;
    assert.equal(success.artifact.revision, 2);
    assert.equal(conflict && !conflict.ok && conflict.reason, "conflict");
    const saved = store.snapshot();
    assert.equal(saved.length, 1);
    assert.equal(saved[0]?.revision, 2);
    assert.equal(saved[0]?.content, success.artifact.content);
    assert.notEqual(saved[0]?.content, "Original");

    const stale = await saveProspectDirectoryArtifact({
      prospectId: PROSPECT,
      sourceOrganizationId: SOURCE,
      artifactType: "description",
      content: "Stale",
      origin: "edited",
      expectedRevision: 1,
      now: new Date("2026-10-18T12:06:00.000Z"),
      store,
      ownsSourceProspect: ownsSource(),
    });
    assert.deepEqual(stale, { ok: false, reason: "conflict" });
    assert.equal(store.snapshot()[0]?.content, success.artifact.content);
    assert.equal(store.snapshot()[0]?.revision, 2);
  });

  it("does not turn a missing row or a repeat first save into a last write", async () => {
    const store = createProspectDirectoryArtifactMemoryStore();
    const missing = await saveProspectDirectoryArtifact({
      prospectId: PROSPECT,
      sourceOrganizationId: SOURCE,
      artifactType: "knowledge_base",
      content: "Missing update",
      origin: "generated",
      expectedRevision: 1,
      now: new Date(NOW),
      store,
      ownsSourceProspect: ownsSource(),
    });
    assert.deepEqual(missing, { ok: false, reason: "conflict" });
    assert.deepEqual(store.snapshot(), []);

    await saveProspectDirectoryArtifact({
      prospectId: PROSPECT,
      sourceOrganizationId: SOURCE,
      artifactType: "description",
      content: "Kept",
      origin: "generated",
      expectedRevision: null,
      now: new Date(NOW),
      store,
      ownsSourceProspect: ownsSource(),
    });
    const repeat = await saveProspectDirectoryArtifact({
      prospectId: PROSPECT,
      sourceOrganizationId: SOURCE,
      artifactType: "description",
      content: "Silent overwrite",
      origin: "edited",
      expectedRevision: null,
      now: new Date(NOW),
      store,
      ownsSourceProspect: ownsSource(),
    });
    assert.deepEqual(repeat, { ok: false, reason: "conflict" });
    assert.equal(store.snapshot()[0]?.content, "Kept");
    assert.equal(store.snapshot()[0]?.revision, 1);
  });

  it("refuses a revision jump and a foreign-organization update", async () => {
    const store = createProspectDirectoryArtifactMemoryStore([
      record({ content: "Owned", revision: 1 }),
    ]);
    const jump = await store.replaceIfRevision({
      prospectId: PROSPECT,
      sourceOrganizationId: SOURCE,
      artifactType: "description",
      expectedRevision: 1,
      next: record({ content: "Jumped", revision: 3 }),
    });
    assert.equal(jump, "conflict");
    const foreign = await store.replaceIfRevision({
      prospectId: PROSPECT,
      sourceOrganizationId: OTHER,
      artifactType: "description",
      expectedRevision: 1,
      next: record({
        organizationId: OTHER,
        savedByOrganizationId: OTHER,
        content: "Stolen",
        revision: 2,
      }),
    });
    assert.equal(foreign, "conflict");
    assert.equal(store.snapshot()[0]?.content, "Owned");
    assert.equal(store.snapshot()[0]?.revision, 1);
    assert.equal(store.snapshot()[0]?.organizationId, SOURCE);
  });
});

describe("prospect directory artifact repository", () => {
  it("isolates reads to the verified source organization", async () => {
    const store = createProspectDirectoryArtifactMemoryStore([
      record({ content: "Source description" }),
      record({
        artifactType: "knowledge_base",
        content: "Source knowledge",
        contentSha256: hashProspectDirectoryArtifactContent("Source knowledge"),
      }),
    ]);
    const foreign = await readSavedProspectDirectoryArtifacts({
      prospectId: PROSPECT,
      sourceOrganizationId: OTHER,
      store,
    });
    assert.deepEqual(foreign, {
      ok: true,
      description: null,
      knowledgeBase: null,
    });
    const owned = await readSavedProspectDirectoryArtifacts({
      prospectId: PROSPECT,
      sourceOrganizationId: SOURCE,
      store,
    });
    assert.equal(owned.ok && owned.description?.content, "Source description");
    assert.equal(owned.ok && owned.knowledgeBase?.content, "Source knowledge");

    const mixed: ProspectDirectoryArtifactStore = {
      async listForProspect() {
        return {
          ok: true,
          rows: [
            record({ organizationId: OTHER, content: "Foreign description" }),
            record({ content: "Visible description" }),
            record({ content: "Duplicate description" }),
          ],
        };
      },
      async insert() {
        throw new Error("read must not insert");
      },
      async replaceIfRevision() {
        throw new Error("read must not update");
      },
    };
    const ambiguous = await readSavedProspectDirectoryArtifacts({
      prospectId: PROSPECT,
      sourceOrganizationId: SOURCE,
      store: mixed,
    });
    assert.equal(ambiguous.ok && ambiguous.description, null);
    assert.equal(JSON.stringify(ambiguous).includes("Foreign description"), false);
  });

  it("rejects invalid content and a Prospect the source organization does not own", async () => {
    const store = createProspectDirectoryArtifactMemoryStore();
    let ownershipChecks = 0;
    const ownsSourceProspect = async () => {
      ownershipChecks += 1;
      return false;
    };
    const oversized = await saveProspectDirectoryArtifact({
      prospectId: PROSPECT,
      sourceOrganizationId: SOURCE,
      artifactType: "description",
      content: "C".repeat(4001),
      origin: "generated",
      expectedRevision: null,
      store,
      ownsSourceProspect,
    });
    const blank = await saveProspectDirectoryArtifact({
      prospectId: " ",
      sourceOrganizationId: SOURCE,
      artifactType: "knowledge_base",
      content: "Facts",
      origin: "generated",
      expectedRevision: null,
      store,
      ownsSourceProspect,
    });
    const foreign = await saveProspectDirectoryArtifact({
      prospectId: PROSPECT,
      sourceOrganizationId: OTHER,
      artifactType: "description",
      content: "Foreign save",
      origin: "edited",
      expectedRevision: null,
      store,
      ownsSourceProspect,
    });
    assert.equal(oversized.ok, false);
    assert.equal(blank.ok, false);
    assert.deepEqual(foreign, { ok: false, reason: "not_found" });
    assert.equal(ownershipChecks, 1);
    assert.deepEqual(store.snapshot(), []);
    assert.equal(
      canonicalizeProspectDirectoryArtifactContent(
        "knowledge_base",
        "K".repeat(PROSPECT_DIRECTORY_KNOWLEDGE_BASE_MAX_CHARS + 1),
      ),
      null,
    );
  });

  it("stores approved content without changing Executive Intelligence", async () => {
    const executive = {
      id: VERSION_ID,
      organization_id: SOURCE,
      intelligence: {
        analysis: { summary: "Frozen executive summary" },
        suggested_cta: "KNOWLEDGE_BASE_ENHANCEMENT:\nFrozen knowledge base.\n",
      },
    };
    const before = structuredClone(executive);
    const store = createProspectDirectoryArtifactMemoryStore();
    const saved = await saveProspectDirectoryArtifact({
      prospectId: PROSPECT,
      sourceOrganizationId: SOURCE,
      artifactType: "description",
      content: "  Approved description  ",
      origin: "edited",
      expectedRevision: null,
      sourceExecutiveVersionId: VERSION_ID,
      now: new Date(NOW),
      store,
      ownsSourceProspect: ownsSource(),
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(saved.created, true);
    assert.equal(saved.artifact.content, "Approved description");
    assert.equal(saved.artifact.sourceExecutiveVersionId, VERSION_ID);
    assert.equal(saved.artifact.organizationId, SOURCE);
    assert.equal(saved.artifact.savedByOrganizationId, SOURCE);
    assert.deepEqual(executive, before);
    assert.equal(
      JSON.stringify(store.snapshot()).includes("Frozen executive summary"),
      false,
    );
    assert.equal(
      JSON.stringify(store.snapshot()).includes("Frozen knowledge base"),
      false,
    );

    const service = read("services/prospects/prospectDirectoryArtifacts.ts");
    const clientRead = read(
      "services/clientProspectIntelligence/clientProspectIntelligenceRead.ts",
    );
    assert.doesNotMatch(service, /athena_executive_intelligence_versions|athena_identity|trainAthena|\.upsert\(/);
    assert.doesNotMatch(clientRead, /saveProspectDirectoryArtifact|athena_identity|trainAthena/);
    assert.doesNotMatch(clientRead, /\.(insert|update|delete|upsert|rpc)\(/);
    assert.ok(
      clientRead.indexOf("if (!sourceProspectMatchesConversion") <
        clientRead.indexOf("await readSavedProspectDirectoryArtifacts"),
    );
  });

  it("uses a conditional update and maps a unique first-insert conflict", async () => {
    const state: { rows: Array<Record<string, unknown>>; insertError?: QueryError } = {
      rows: [],
    };
    const db = createFakeDb(state);
    const store = createSupabaseProspectDirectoryArtifactStore(db);
    const created = await saveProspectDirectoryArtifact({
      prospectId: PROSPECT,
      sourceOrganizationId: SOURCE,
      artifactType: "description",
      content: "Database description",
      origin: "generated",
      expectedRevision: null,
      now: new Date(NOW),
      store,
      ownsSourceProspect: ownsSource(),
    });
    assert.equal(created.ok && created.artifact.revision, 1);
    assert.equal(db.calls[0]?.op, "insert");
    assert.equal(db.calls[0]?.table, PROSPECT_DIRECTORY_ARTIFACTS_TABLE);
    assert.equal(db.calls.some((call) => call.op === "update"), false);

    state.insertError = { code: "23505", message: "duplicate key value" };
    const raced = await saveProspectDirectoryArtifact({
      prospectId: PROSPECT,
      sourceOrganizationId: SOURCE,
      artifactType: "description",
      content: "Second first save",
      origin: "generated",
      expectedRevision: null,
      now: new Date(NOW),
      store,
      ownsSourceProspect: ownsSource(),
    });
    assert.deepEqual(raced, { ok: false, reason: "conflict" });
    assert.equal(db.calls.filter((call) => call.op === "update").length, 0);
    assert.equal(state.rows[0]?.content, "Database description");

    state.insertError = null;
    const updated = await saveProspectDirectoryArtifact({
      prospectId: PROSPECT,
      sourceOrganizationId: SOURCE,
      artifactType: "description",
      content: "Revised description",
      origin: "edited",
      expectedRevision: 1,
      now: new Date("2026-10-18T13:00:00.000Z"),
      store,
      ownsSourceProspect: ownsSource(),
    });
    assert.equal(updated.ok && updated.created, false);
    assert.equal(updated.ok && updated.artifact.revision, 2);
    const update = db.calls.find((call) => call.op === "update");
    assert.equal(update?.payload?.revision, 2);
    assert.equal(update?.payload?.organization_id, SOURCE);
    assert.deepEqual(
      update?.filters.map((filter) => [filter.column, filter.value]),
      [
        ["prospect_id", PROSPECT],
        ["organization_id", SOURCE],
        ["artifact_type", "description"],
        ["revision", 1],
      ],
    );

    const stale = await saveProspectDirectoryArtifact({
      prospectId: PROSPECT,
      sourceOrganizationId: SOURCE,
      artifactType: "description",
      content: "Stale database write",
      origin: "edited",
      expectedRevision: 1,
      now: new Date("2026-10-18T13:05:00.000Z"),
      store,
      ownsSourceProspect: ownsSource(),
    });
    assert.deepEqual(stale, { ok: false, reason: "conflict" });
    assert.equal(state.rows[0]?.content, "Revised description");
    assert.equal(state.rows[0]?.revision, 2);

    const listed = await readSavedProspectDirectoryArtifacts({
      prospectId: PROSPECT,
      sourceOrganizationId: SOURCE,
      store,
    });
    assert.equal(listed.ok && listed.description?.content, "Revised description");
    const hidden = await readSavedProspectDirectoryArtifacts({
      prospectId: PROSPECT,
      sourceOrganizationId: OTHER,
      store,
    });
    assert.equal(hidden.ok && hidden.description, null);
    assert.equal(
      db.calls.some(
        (call) =>
          call.op === "select" &&
          call.filters.some(
            (filter) =>
              filter.column === "organization_id" && filter.value === OTHER,
          ),
      ),
      true,
    );
  });
});

describe("prospect directory artifact presentation", () => {
  it("renders saved artifacts without editors or send controls", () => {
    const html = renderToStaticMarkup(
      createElement(ProspectDirectoryArtifactReadout, {
        description: record({ content: "Visible saved description", revision: 4 }),
        knowledgeBase: record({
          artifactType: "knowledge_base",
          content: "Visible saved knowledge",
          revision: 3,
        }),
        copy: en.clientProspectIntelligence,
      }),
    );
    assert.match(html, /Visible saved description/);
    assert.match(html, /Visible saved knowledge/);
    assert.match(html, /data-prospect-directory-artifact="description"/);
    assert.match(html, /data-prospect-directory-artifact="knowledge_base"/);
    assert.match(html, /data-prospect-directory-artifact-revision="4"/);
    assert.doesNotMatch(html, /<button|<form|<textarea/);

    const empty = renderToStaticMarkup(
      createElement(ProspectDirectoryArtifactReadout, {
        description: null,
        knowledgeBase: null,
        copy: en.clientProspectIntelligence,
      }),
    );
    assert.match(empty, /No saved Description is stored for this Prospect/);
    assert.match(empty, /No saved Knowledge Base is stored for this Prospect/);

    const page = read("app/prospects/[id]/page.tsx");
    const readout = read("components/prospects/ProspectDirectoryArtifactReadout.tsx");
    assert.ok(
      page.indexOf("if (!prospect)") <
        page.indexOf("await readSavedProspectDirectoryArtifacts"),
    );
    assert.match(
      page,
      /readSavedProspectDirectoryArtifacts\(\{[\s\S]*?sourceOrganizationId: prospect\.organization_id/,
    );
    assert.match(page, /ProspectGetoblicDescriptionCard/);
    assert.match(page, /ProspectRefreshIntelligenceButton/);
    assert.match(page, /ExecutiveIntelligenceWorkspace/);
    assert.match(page, /ProspectMetadataEditor/);
    assert.match(page, /ProspectConvertToClientAction/);
    assert.doesNotMatch(page, /saveProspectDirectoryArtifact/);
    assert.doesNotMatch(readout, /<button|<form|<textarea|onClick|saveProspectDirectoryArtifact/);
    assert.equal(
      existsSync(join(ROOT, "app/api/prospect-directory-artifacts")),
      false,
    );
  });
});
