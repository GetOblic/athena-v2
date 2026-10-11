import "../personas/personaTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS } from "../../lib/prospectDeploymentAssetContract";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  GENERATION_JOB_STATE_PAGE_SIZE,
  getGenerationJobStateForDiscussions,
} from "../../services/generationJobs/generationJobService";
import {
  buildProspectLibraryCompleteness,
  enrichProspectsForLibrary,
  PROSPECT_LIBRARY_VERSION_CHUNK,
  PROSPECT_LIBRARY_VERSION_COLUMNS,
} from "../../services/prospects/prospectLibraryEnrichment";
import type { Prospect } from "../../services/prospects/prospectService";

const ROOT = process.cwd();
const ORG = "org-a";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function labeledBlock(
  keys: readonly string[] = REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
): string {
  return keys.map((key) => `${key}:\nBody`).join("\n\n");
}

function stubProspect(
  partial: Partial<Prospect> & { id: string },
): Prospect {
  return {
    id: partial.id,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-02T00:00:00.000Z",
    organization_id: ORG,
    user_id: null,
    community_id: null,
    linked_discussion_id: partial.linked_discussion_id ?? null,
    business_name: partial.business_name ?? "Harbor",
    website: partial.website ?? null,
    linkedin: null,
    facebook: null,
    instagram: null,
    industry: partial.industry ?? null,
    category: partial.category ?? null,
    country: null,
    state: null,
    city: partial.city ?? null,
    address: null,
    company_size: null,
    revenue: null,
    employee_count: null,
    technologies: null,
    pain_points: null,
    decision_maker: null,
    first_name: null,
    last_name: null,
    external_contact_id: null,
    timezone: null,
    job_title: null,
    email: partial.email ?? null,
    phone: null,
    whatsapp_number: null,
    getoblic_type: null,
    google_business_url: null,
    notes: null,
    additional_context: null,
    source: "manual",
    status: partial.status ?? "Queued",
    lifecycle_status: "New",
    ads_content: null,
    opportunity_score: partial.opportunity_score ?? null,
    priority: 1,
    website_intelligence: null,
    raw_json: null,
    generated_listing_description: null,
    last_activity: null,
    import_batch_id: null,
  };
}

type VersionFixture = {
  discussion_id: string;
  is_current?: boolean;
  blueprint_id?: string | null;
  generated_at?: unknown;
  suggested_cta?: unknown;
  intelligence_blueprint_id?: unknown;
  intelligence?: unknown;
};

type QueryCall = {
  table: string;
  select: string | null;
  eqs: Array<{ column: string; value: unknown }>;
  ins: Array<{ column: string; values: readonly unknown[] }>;
  orders: Array<{ column: string; ascending: boolean }>;
  range: { start: number; end: number } | null;
};

type JobFixture = {
  discussion_id: string;
  status: string;
  current_stage?: string | null;
  created_at?: string;
};

type VersionQueryScript =
  | { data: unknown; error: { message: string } | null }
  | { throw: Error };

type Fixture = {
  versions?: VersionFixture[];
  opportunities?: Array<{ discussion_id: string; score: unknown }>;
  jobs?: JobFixture[];
  /** Per generation-job query outcomes, in call order. Unscripted calls use `jobs`. */
  jobScripts?: VersionQueryScript[];
  versionData?: unknown[] | null;
  opportunityData?: unknown[] | null;
  /** Per version-query outcomes, in call order. Unscripted calls use `versions`. */
  versionScripts?: VersionQueryScript[];
};

type QueryOutcome =
  | { data: unknown; error: { message: string } | null }
  | { throw: Error };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const originalFrom = (supabaseAdmin as any).from.bind(supabaseAdmin);

function installFixture(fixture: Fixture): QueryCall[] {
  const calls: QueryCall[] = [];
  let versionQueryOrdinal = 0;
  let jobQueryOrdinal = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const call: QueryCall = {
      table,
      select: null,
      eqs: [],
      ins: [],
      orders: [],
      range: null,
    };
    calls.push(call);
    const settle = () => {
      const versionOrdinal =
        call.table === "athena_executive_intelligence_versions"
          ? versionQueryOrdinal++
          : -1;
      const jobOrdinal =
        call.table === "athena_generation_jobs" ? jobQueryOrdinal++ : -1;
      const outcome = resultFor(call, fixture, versionOrdinal, jobOrdinal);
      if ("throw" in outcome) return Promise.reject(outcome.throw);
      return Promise.resolve(outcome);
    };
    const builder = {
      select(columns: string) {
        call.select = columns;
        return builder;
      },
      eq(column: string, value: unknown) {
        call.eqs.push({ column, value });
        return builder;
      },
      in(column: string, values: readonly unknown[]) {
        call.ins.push({ column, values });
        return builder;
      },
      order(column?: string, options?: { ascending?: boolean }) {
        call.orders.push({
          column: column ?? "",
          ascending: options?.ascending !== false,
        });
        return builder;
      },
      range(start: number, end: number) {
        call.range = { start, end };
        return builder;
      },
      limit() {
        return builder;
      },
      maybeSingle() {
        return settle();
      },
      then(
        resolve?: (value: {
          data: unknown;
          error: { message: string } | null;
        }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) {
        return settle().then(resolve, reject);
      },
    };
    return builder;
  };

  return calls;
}

function jobCreatedAt(job: JobFixture): string {
  return job.created_at ?? "2026-09-01T00:00:00.000Z";
}

function resultFor(
  call: QueryCall,
  fixture: Fixture,
  versionOrdinal: number,
  jobOrdinal: number,
): QueryOutcome {
  if (call.table === "athena_executive_intelligence_versions") {
    const script = fixture.versionScripts?.[versionOrdinal];
    if (script) return script;
    if (fixture.versionData === null) return { data: null, error: null };
    const requested = new Set(
      (call.ins.find((entry) => entry.column === "discussion_id")?.values ??
        []) as string[],
    );
    const rows = (fixture.versions ?? []).filter((row) =>
      requested.has(row.discussion_id),
    );
    return { data: rows, error: null };
  }

  if (call.table === "opportunities") {
    if (fixture.opportunityData === null) return { data: null, error: null };
    const requested = new Set(
      (call.ins.find((entry) => entry.column === "discussion_id")?.values ??
        []) as string[],
    );
    const rows = (fixture.opportunities ?? []).filter((row) =>
      requested.has(row.discussion_id),
    );
    return { data: rows, error: null };
  }

  if (call.table === "athena_generation_jobs") {
    const script = fixture.jobScripts?.[jobOrdinal];
    if (script) return script;
    const requested = new Set(
      (call.ins.find((entry) => entry.column === "discussion_id")?.values ??
        []) as string[],
    );
    const singleId = call.eqs.find(
      (entry) => entry.column === "discussion_id",
    )?.value;
    const statusFilter = call.ins.find((entry) => entry.column === "status");
    const rows = (fixture.jobs ?? [])
      .filter((job) => {
        if (requested.size > 0 && !requested.has(job.discussion_id)) {
          return false;
        }
        if (typeof singleId === "string" && job.discussion_id !== singleId) {
          return false;
        }
        if (statusFilter && !statusFilter.values.includes(job.status)) {
          return false;
        }
        return true;
      })
      .sort((left, right) =>
        jobCreatedAt(right).localeCompare(jobCreatedAt(left)),
      );
    const page = call.range
      ? rows.slice(call.range.start, call.range.end + 1)
      : rows;
    return {
      data: page.map((job) => ({
        discussion_id: job.discussion_id,
        status: job.status,
        current_stage: job.current_stage ?? null,
        created_at: jobCreatedAt(job),
      })),
      error: null,
    };
  }

  return { data: null, error: null };
}

function restoreSupabaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
}

afterEach(() => {
  restoreSupabaseAdmin();
});

function versionCalls(calls: QueryCall[]): QueryCall[] {
  return calls.filter(
    (call) => call.table === "athena_executive_intelligence_versions",
  );
}

function jobCalls(calls: QueryCall[]): QueryCall[] {
  return calls.filter((call) => call.table === "athena_generation_jobs");
}

function assertOrderedJobPage(
  call: QueryCall,
  start: number,
  organizationId = ORG,
): void {
  assert.equal(
    call.select,
    "discussion_id, status, current_stage, created_at",
  );
  assert.equal(
    call.eqs.find((entry) => entry.column === "organization_id")?.value,
    organizationId,
  );
  assert.equal(
    call.ins.some((entry) => entry.column === "status"),
    false,
  );
  assert.deepEqual(call.orders, [{ column: "created_at", ascending: false }]);
  assert.deepEqual(call.range, {
    start,
    end: start + GENERATION_JOB_STATE_PAGE_SIZE - 1,
  });
}

function discussionIn(call: QueryCall): readonly unknown[] {
  return (
    call.ins.find((entry) => entry.column === "discussion_id")?.values ?? []
  );
}

function completeVersion(
  discussionId: string,
  generatedAt = "2026-09-01T00:00:00.000Z",
): VersionFixture {
  return {
    discussion_id: discussionId,
    is_current: true,
    blueprint_id: `bp-${discussionId}`,
    suggested_cta: labeledBlock(),
    generated_at: generatedAt,
  };
}

function queuedProspects(count: number): Prospect[] {
  return Array.from({ length: count }, (_, index) =>
    stubProspect({
      id: `p-${index}`,
      linked_discussion_id: `d-${index}`,
      status: "Queued",
      opportunity_score: 15,
    }),
  );
}

describe("prospect library current-version query", () => {
  it("projects scalar JSON paths and preserves readiness, order, and scores", async () => {
    const complete = labeledBlock();
    const calls = installFixture({
      versions: [
        {
          discussion_id: "d-scalar",
          is_current: true,
          blueprint_id: null,
          generated_at: "2026-09-10T12:00:00.000Z",
          suggested_cta: complete,
          intelligence_blueprint_id: "bp-json",
          intelligence: complete,
        },
        {
          discussion_id: "d-nested",
          is_current: true,
          blueprint_id: null,
          generated_at: "2026-08-01T00:00:00.000Z",
          intelligence: {
            analysis: { suggested_cta: complete },
            blueprint: { id: "bp-nested" },
          },
        },
        {
          discussion_id: "d-partial",
          is_current: true,
          blueprint_id: "bp-column",
          generated_at: "2026-09-12T00:00:00.000Z",
          suggested_cta: "PERSONALIZED_OUTREACH_EMAIL:\nOnly one",
          intelligence: {
            analysis: { suggested_cta: complete },
            blueprint: { id: "bp-nested" },
          },
        },
        {
          discussion_id: "d-empty-bp",
          is_current: true,
          blueprint_id: "",
          suggested_cta: complete,
          intelligence_blueprint_id: "bp-should-not-use",
        },
        {
          discussion_id: "d-old",
          is_current: false,
          blueprint_id: "bp-old",
          suggested_cta: complete,
          generated_at: "2026-01-01T00:00:00.000Z",
        },
        {
          discussion_id: "d-bad-date",
          is_current: true,
          blueprint_id: "bp-date",
          suggested_cta: complete,
          generated_at: "not-a-date",
        },
        {
          discussion_id: "d-complete-failed",
          is_current: true,
          blueprint_id: "bp-failed",
          suggested_cta: complete,
          generated_at: "2026-09-15T00:00:00.000Z",
        },
      ],
      opportunities: [
        { discussion_id: "d-scalar", score: 0 },
        { discussion_id: "d-scalar", score: 40 },
        { discussion_id: "d-scalar", score: 70 },
      ],
      jobs: [
        { discussion_id: "d-failed", status: "failed" },
        { discussion_id: "d-complete-failed", status: "failed" },
      ],
    });

    const scalarProspect = stubProspect({
      id: "p-scalar",
      linked_discussion_id: "d-scalar",
      status: "Queued",
      opportunity_score: 90,
      business_name: "Harbor Dental",
      category: "Dental",
      city: "Miami",
    });
    const prospects = [
      scalarProspect,
      stubProspect({
        id: "p-nested",
        linked_discussion_id: "d-nested",
        status: "Queued",
      }),
      stubProspect({
        id: "p-partial",
        linked_discussion_id: "d-partial",
        status: "Ready",
      }),
      stubProspect({
        id: "p-empty-bp",
        linked_discussion_id: "d-empty-bp",
        status: "Ready",
      }),
      stubProspect({
        id: "p-old",
        linked_discussion_id: "d-old",
        status: "Queued",
      }),
      stubProspect({
        id: "p-bad-date",
        linked_discussion_id: "d-bad-date",
        status: "Queued",
      }),
      stubProspect({
        id: "p-missing",
        linked_discussion_id: "d-missing",
        status: "Queued",
        business_name: "Harbor Dental",
        category: "Dental",
        city: "Miami",
      }),
      stubProspect({
        id: "p-failed",
        linked_discussion_id: "d-failed",
        status: "Queued",
      }),
      stubProspect({
        id: "p-complete-failed",
        linked_discussion_id: "d-complete-failed",
        status: "Queued",
      }),
      stubProspect({
        id: "p-scalar-again",
        linked_discussion_id: "d-scalar",
        status: "Queued",
      }),
      stubProspect({ id: "p-unlinked", linked_discussion_id: null }),
    ];

    const rows = await enrichProspectsForLibrary(prospects, ORG);
    const versions = versionCalls(calls);
    const opportunities = calls.filter((call) => call.table === "opportunities");
    const jobs = calls.filter((call) => call.table === "athena_generation_jobs");

    assert.equal(versions.length, 1);
    assert.equal(versions[0]?.select, PROSPECT_LIBRARY_VERSION_COLUMNS);
    assert.doesNotMatch(
      versions[0]?.select ?? "",
      /(^|,\s*)intelligence(\s*,|\s*$)/,
    );
    assert.match(
      versions[0]?.select ?? "",
      /suggested_cta:intelligence->analysis->suggested_cta/,
    );
    assert.match(
      versions[0]?.select ?? "",
      /intelligence_blueprint_id:intelligence->blueprint->id/,
    );
    assert.deepEqual(discussionIn(versions[0]!), [
      "d-scalar",
      "d-nested",
      "d-partial",
      "d-empty-bp",
      "d-old",
      "d-bad-date",
      "d-missing",
      "d-failed",
      "d-complete-failed",
    ]);
    assert.deepEqual(
      versions[0]?.eqs.find((entry) => entry.column === "organization_id")
        ?.value,
      ORG,
    );
    assert.equal(
      versions[0]?.eqs.find((entry) => entry.column === "is_current")?.value,
      true,
    );
    assert.equal(opportunities.length, 1);
    assert.equal(opportunities[0]?.select, "discussion_id, score");
    assert.equal(jobs.length, 1);
    assertOrderedJobPage(jobs[0]!, 0);
    assert.deepEqual(discussionIn(jobs[0]!), [
      "d-scalar",
      "d-nested",
      "d-partial",
      "d-empty-bp",
      "d-old",
      "d-bad-date",
      "d-missing",
      "d-failed",
      "d-complete-failed",
    ]);

    assert.deepEqual(
      rows.map((row) => row.id),
      prospects.map((prospect) => prospect.id),
    );
    assert.equal(rows[0]?.display_status, "Ready");
    assert.equal(
      rows[0]?.display_intelligence_generated_at,
      "2026-09-10T12:00:00.000Z",
    );
    assert.equal(rows[0]?.display_opportunity_score, 70);
    assert.equal(rows[0]?.display_opportunity_score_label, "70");
    assert.equal(
      rows[0]?.display_completeness_score,
      buildProspectLibraryCompleteness({
        prospect: scalarProspect,
        hasCurrentVersion: true,
        getoblicRelationshipStatus: null,
      }),
    );
    assert.equal(rows[1]?.display_status, "Ready");
    assert.equal(rows[2]?.display_status, "Generating Executive Intelligence");
    assert.equal(rows[3]?.display_status, "Generating Executive Intelligence");
    assert.equal(rows[4]?.display_status, "Queued");
    assert.equal(rows[4]?.display_intelligence_generated_at, null);
    assert.equal(rows[5]?.display_status, "Ready");
    assert.equal(rows[5]?.display_intelligence_generated_at, null);
    assert.equal(rows[6]?.display_status, "Queued");
    assert.equal(rows[6]?.display_intelligence_generated_at, null);
    assert.equal(
      rows[6]?.display_completeness_score,
      buildProspectLibraryCompleteness({
        prospect: prospects[6]!,
        hasCurrentVersion: false,
        getoblicRelationshipStatus: null,
      }),
    );
    assert.ok(
      (rows[0]?.display_completeness_score ?? 0) >
        (rows[6]?.display_completeness_score ?? 0),
    );
    assert.equal(rows[7]?.display_status, "Processing Failed");
    assert.equal(rows[8]?.display_status, "Ready");
    assert.equal(rows[9]?.display_status, "Ready");
    assert.equal(rows[9]?.display_intelligence_generated_at, rows[0]?.display_intelligence_generated_at);
    assert.equal(rows[10]?.display_status, "Queued");
    assert.equal(rows[10]?.display_intelligence_generated_at, null);
    assert.equal(rows[0]?.display_lifecycle_status, "New");
  });

  it("batches current-version and generation-job reads at 100 discussion ids", async () => {
    assert.equal(PROSPECT_LIBRARY_VERSION_CHUNK, 100);
    const ids = Array.from({ length: 101 }, (_, index) => `d-${index}`);
    const calls = installFixture({
      versions: [
        {
          discussion_id: "d-0",
          is_current: true,
          blueprint_id: "bp-0",
          suggested_cta: labeledBlock(),
          generated_at: "2026-09-01T00:00:00.000Z",
        },
        {
          discussion_id: "d-100",
          is_current: true,
          blueprint_id: "bp-100",
          suggested_cta: labeledBlock(),
          generated_at: "2026-09-02T00:00:00.000Z",
        },
      ],
    });
    const prospects = ids.map((id, index) =>
      stubProspect({
        id: `p-${index}`,
        linked_discussion_id: id,
        status: "Queued",
      }),
    );
    prospects.push(
      stubProspect({
        id: "p-dup",
        linked_discussion_id: "d-0",
        status: "Queued",
      }),
    );

    const rows = await enrichProspectsForLibrary(prospects, ORG);
    const versions = versionCalls(calls);
    const opportunities = calls.filter((call) => call.table === "opportunities");

    assert.equal(versions.length, 2);
    assert.deepEqual(discussionIn(versions[0]!), ids.slice(0, 100));
    assert.deepEqual(discussionIn(versions[1]!), ["d-100"]);
    for (const call of versions) {
      assert.equal(call.select, PROSPECT_LIBRARY_VERSION_COLUMNS);
      assert.ok(discussionIn(call).length <= 100);
      assert.equal(
        call.eqs.find((entry) => entry.column === "organization_id")?.value,
        ORG,
      );
      assert.equal(
        call.eqs.find((entry) => entry.column === "is_current")?.value,
        true,
      );
    }
    assert.equal(opportunities.length, 1);
    assert.equal(discussionIn(opportunities[0]!).length, 101);
    const jobs = jobCalls(calls);
    assert.equal(jobs.length, 2);
    assert.deepEqual(discussionIn(jobs[0]!), ids.slice(0, 100));
    assert.deepEqual(discussionIn(jobs[1]!), ["d-100"]);
    for (const call of jobs) {
      assertOrderedJobPage(call, 0);
      assert.ok(discussionIn(call).length <= 100);
    }
    assert.equal(rows[0]?.display_status, "Ready");
    assert.equal(rows[100]?.display_status, "Ready");
    assert.equal(rows[50]?.display_status, "Queued");
    assert.equal(rows[50]?.display_intelligence_generated_at, null);
    assert.equal(rows[101]?.display_status, "Ready");
    assert.deepEqual(
      rows.map((row) => row.id),
      prospects.map((prospect) => prospect.id),
    );
  });

  it("issues no version query without discussion ids and treats a failed read as missing", async () => {
    const idle = installFixture({});
    assert.deepEqual(await enrichProspectsForLibrary([], ORG), []);
    assert.equal(idle.length, 0);

    const failed = installFixture({
      versionData: null,
      opportunityData: null,
    });
    const rows = await enrichProspectsForLibrary(
      [
        stubProspect({
          id: "p-error",
          linked_discussion_id: "d-error",
          status: "Queued",
          opportunity_score: 42,
        }),
      ],
      ORG,
    );
    assert.equal(versionCalls(failed).length, 1);
    assert.equal(rows[0]?.display_status, "Queued");
    assert.equal(rows[0]?.display_intelligence_generated_at, null);
    assert.equal(rows[0]?.display_opportunity_score, 42);
    assert.equal(rows[0]?.display_opportunity_score_label, "42");

    const unlinked = installFixture({});
    const unlinkedRows = await enrichProspectsForLibrary(
      [stubProspect({ id: "p-unlinked", linked_discussion_id: null })],
      ORG,
    );
    assert.equal(unlinked.length, 0);
    assert.equal(unlinkedRows[0]?.display_status, "Queued");
    assert.equal(unlinkedRows[0]?.display_intelligence_generated_at, null);
  });

  it("keeps the version projection out of the full intelligence column", () => {
    const source = read("services/prospects/prospectLibraryEnrichment.ts");
    assert.match(source, /PROSPECT_LIBRARY_VERSION_COLUMNS/);
    assert.match(source, /PROSPECT_LIBRARY_VERSION_CHUNK = 100/);
    assert.doesNotMatch(source, /blueprint_id, intelligence, generated_at/);
    assert.equal(
      source.split("getGenerationJobStateForDiscussions(").length - 1,
      1,
    );
    assert.match(
      source,
      /getGenerationJobStateForDiscussions\(\s*organizationId,\s*uniqueDiscussionIds,\s*\)/,
    );
    assert.doesNotMatch(source, /getActiveGenerationJobForDiscussion/);
    assert.doesNotMatch(source, /getLatestGenerationJobForDiscussion/);
    assert.doesNotMatch(source, /services\/home\/homeReadService/);
    assert.match(
      read("app/api/prospects/[id]/status/route.ts"),
      /getLatestGenerationJobForDiscussion/,
    );
    assert.doesNotMatch(
      read("app/api/prospects/[id]/status/route.ts"),
      /getGenerationJobStateForDiscussions/,
    );
    assert.match(
      read("app/prospects/[id]/page.tsx"),
      /getActiveGenerationJobForDiscussion/,
    );
  });

  it("discards the first batch when that read returns a Supabase error", async () => {
    const prospects = queuedProspects(201);
    const calls = installFixture({
      versionScripts: [
        {
          data: [completeVersion("d-0", "2026-09-01T00:00:00.000Z")],
          error: { message: "version batch failed" },
        },
        { data: [completeVersion("d-200", "2026-09-02T00:00:00.000Z")], error: null },
      ],
      opportunities: [{ discussion_id: "d-0", score: 88 }],
      jobs: [{ discussion_id: "d-1", status: "failed" }],
    });

    const rows = await enrichProspectsForLibrary(prospects, ORG);
    const versions = versionCalls(calls);

    assert.equal(versions.length, 1);
    assert.deepEqual(discussionIn(versions[0]!), prospects
      .slice(0, 100)
      .map((prospect) => prospect.linked_discussion_id));
    assert.equal(rows[0]?.display_status, "Queued");
    assert.equal(rows[0]?.display_intelligence_generated_at, null);
    assert.equal(rows[0]?.display_opportunity_score, 88);
    assert.equal(rows[1]?.display_status, "Processing Failed");
    assert.equal(rows[1]?.display_intelligence_generated_at, null);
    assert.equal(rows[200]?.display_status, "Queued");
    assert.equal(rows[200]?.display_intelligence_generated_at, null);
  });

  it("discards earlier rows when a middle batch returns null data", async () => {
    const prospects = queuedProspects(250);
    const calls = installFixture({
      versionScripts: [
        { data: [completeVersion("d-0", "2026-09-01T00:00:00.000Z")], error: null },
        { data: null, error: null },
        { data: [completeVersion("d-200", "2026-09-03T00:00:00.000Z")], error: null },
      ],
      opportunities: [{ discussion_id: "d-0", score: 64 }],
    });

    const rows = await enrichProspectsForLibrary(prospects, ORG);
    const versions = versionCalls(calls);

    assert.equal(versions.length, 2);
    assert.equal(discussionIn(versions[0]!).length, 100);
    assert.equal(discussionIn(versions[1]!).length, 100);
    assert.equal(discussionIn(versions[0]!)[0], "d-0");
    assert.equal(discussionIn(versions[1]!)[0], "d-100");
    assert.equal(rows[0]?.display_status, "Queued");
    assert.equal(rows[0]?.display_intelligence_generated_at, null);
    assert.equal(rows[0]?.display_opportunity_score, 64);
    assert.equal(rows[100]?.display_status, "Queued");
    assert.equal(rows[100]?.display_intelligence_generated_at, null);
    assert.equal(rows[200]?.display_status, "Queued");
    assert.equal(rows[200]?.display_intelligence_generated_at, null);
  });

  it("discards earlier rows when the last batch returns undefined data", async () => {
    const prospects = queuedProspects(201);
    const calls = installFixture({
      versionScripts: [
        { data: [completeVersion("d-0", "2026-09-01T00:00:00.000Z")], error: null },
        { data: [completeVersion("d-100", "2026-09-02T00:00:00.000Z")], error: null },
        { data: undefined, error: null },
      ],
    });

    const rows = await enrichProspectsForLibrary(prospects, ORG);
    const versions = versionCalls(calls);

    assert.equal(versions.length, 3);
    assert.equal(discussionIn(versions[2]!).length, 1);
    assert.equal(discussionIn(versions[2]!)[0], "d-200");
    for (const index of [0, 100, 200]) {
      assert.equal(rows[index]?.display_status, "Queued");
      assert.equal(rows[index]?.display_intelligence_generated_at, null);
    }
  });

  it("keeps surrounding rows when a middle batch is an empty array", async () => {
    const prospects = queuedProspects(250);
    const calls = installFixture({
      versionScripts: [
        { data: [completeVersion("d-0", "2026-09-01T00:00:00.000Z")], error: null },
        { data: [], error: null },
        { data: [completeVersion("d-200", "2026-09-03T00:00:00.000Z")], error: null },
      ],
    });

    const rows = await enrichProspectsForLibrary(prospects, ORG);
    const versions = versionCalls(calls);

    assert.equal(versions.length, 3);
    for (const call of versions) {
      assert.equal(call.select, PROSPECT_LIBRARY_VERSION_COLUMNS);
      assert.equal(
        call.eqs.find((entry) => entry.column === "organization_id")?.value,
        ORG,
      );
      assert.equal(
        call.eqs.find((entry) => entry.column === "is_current")?.value,
        true,
      );
    }
    assert.equal(rows[0]?.display_status, "Ready");
    assert.equal(
      rows[0]?.display_intelligence_generated_at,
      "2026-09-01T00:00:00.000Z",
    );
    assert.equal(rows[100]?.display_status, "Queued");
    assert.equal(rows[100]?.display_intelligence_generated_at, null);
    assert.equal(rows[200]?.display_status, "Ready");
    assert.equal(
      rows[200]?.display_intelligence_generated_at,
      "2026-09-03T00:00:00.000Z",
    );
  });

  it("rejects when a later version batch throws and does not query the rest", async () => {
    const prospects = queuedProspects(250);
    const calls = installFixture({
      versionScripts: [
        { data: [completeVersion("d-0")], error: null },
        { throw: new Error("version client failed") },
        { data: [completeVersion("d-200")], error: null },
      ],
    });

    await assert.rejects(
      () => enrichProspectsForLibrary(prospects, ORG),
      { message: "version client failed" },
    );
    const versions = versionCalls(calls);
    assert.equal(versions.length, 2);
    assert.equal(discussionIn(versions[1]!)[0], "d-100");
    assert.equal(
      calls.filter((call) => call.table === "athena_generation_jobs").length,
      0,
    );
  });

  it("preserves Ready and Processing Failed across successful version batches", async () => {
    const prospects = queuedProspects(101);
    const calls = installFixture({
      versions: [
        completeVersion("d-0", "2026-09-04T00:00:00.000Z"),
        {
          discussion_id: "d-1",
          is_current: true,
          blueprint_id: "bp-partial",
          suggested_cta: "PERSONALIZED_OUTREACH_EMAIL:\nOnly one",
          generated_at: "2026-09-05T00:00:00.000Z",
        },
        completeVersion("d-100", "2026-09-06T00:00:00.000Z"),
      ],
      jobs: [
        { discussion_id: "d-2", status: "failed" },
        { discussion_id: "d-100", status: "failed" },
      ],
    });

    const rows = await enrichProspectsForLibrary(prospects, ORG);
    const versions = versionCalls(calls);

    assert.equal(versions.length, 2);
    assert.equal(discussionIn(versions[0]!).length, 100);
    assert.deepEqual(discussionIn(versions[1]!), ["d-100"]);
    assert.equal(rows[0]?.display_status, "Ready");
    assert.equal(
      rows[0]?.display_intelligence_generated_at,
      "2026-09-04T00:00:00.000Z",
    );
    assert.equal(
      rows[0]?.display_completeness_score,
      buildProspectLibraryCompleteness({
        prospect: prospects[0]!,
        hasCurrentVersion: true,
        getoblicRelationshipStatus: null,
      }),
    );
    assert.equal(rows[1]?.display_status, "Generating Executive Intelligence");
    assert.equal(
      rows[1]?.display_intelligence_generated_at,
      "2026-09-05T00:00:00.000Z",
    );
    assert.equal(rows[2]?.display_status, "Processing Failed");
    assert.equal(rows[2]?.display_intelligence_generated_at, null);
    assert.equal(
      rows[2]?.display_completeness_score,
      buildProspectLibraryCompleteness({
        prospect: prospects[2]!,
        hasCurrentVersion: false,
        getoblicRelationshipStatus: null,
      }),
    );
    assert.equal(rows[100]?.display_status, "Ready");
    assert.equal(
      rows[100]?.display_intelligence_generated_at,
      "2026-09-06T00:00:00.000Z",
    );
    assert.equal(rows[50]?.display_status, "Queued");
  });

  it("resolves active, failed, and newer completed jobs from one batch", async () => {
    const calls = installFixture({
      versions: [completeVersion("d-failed-complete", "2026-09-20T00:00:00.000Z")],
      opportunities: [{ discussion_id: "d-queued", score: 55 }],
      jobs: [
        {
          discussion_id: "d-queued",
          status: "failed",
          created_at: "2026-09-01T00:00:00.000Z",
        },
        {
          discussion_id: "d-queued",
          status: "queued",
          current_stage: "queued",
          created_at: "2026-09-02T00:00:00.000Z",
        },
        {
          discussion_id: "d-retryable",
          status: "retryable",
          created_at: "2026-09-02T00:00:00.000Z",
        },
        {
          discussion_id: "d-website",
          status: "processing",
          current_stage: "website_learning",
          created_at: "2026-09-03T00:00:00.000Z",
        },
        {
          discussion_id: "d-website",
          status: "failed",
          created_at: "2026-08-01T00:00:00.000Z",
        },
        {
          discussion_id: "d-prep",
          status: "processing",
          current_stage: "preparing_context",
          created_at: "2026-09-03T00:00:00.000Z",
        },
        {
          discussion_id: "d-exec",
          status: "processing",
          current_stage: "executive_intelligence",
          created_at: "2026-09-04T00:00:00.000Z",
        },
        {
          discussion_id: "d-exec",
          status: "completed",
          created_at: "2026-08-01T00:00:00.000Z",
        },
        {
          discussion_id: "d-failed-open",
          status: "failed",
          created_at: "2026-09-05T00:00:00.000Z",
        },
        {
          discussion_id: "d-failed-complete",
          status: "failed",
          created_at: "2026-09-05T00:00:00.000Z",
        },
        {
          discussion_id: "d-completed-newer",
          status: "failed",
          created_at: "2026-09-01T00:00:00.000Z",
        },
        {
          discussion_id: "d-completed-newer",
          status: "completed",
          created_at: "2026-09-06T00:00:00.000Z",
        },
      ],
    });
    const queuedProspect = stubProspect({
      id: "p-queued",
      linked_discussion_id: "d-queued",
      status: "Saved",
      opportunity_score: 12,
    });
    const prospects = [
      queuedProspect,
      stubProspect({
        id: "p-queued-dup",
        linked_discussion_id: "d-queued",
        status: "Saved",
      }),
      stubProspect({
        id: "p-retryable",
        linked_discussion_id: "d-retryable",
        status: "Saved",
      }),
      stubProspect({
        id: "p-website",
        linked_discussion_id: "d-website",
        status: "Saved",
      }),
      stubProspect({
        id: "p-prep",
        linked_discussion_id: "d-prep",
        status: "Saved",
      }),
      stubProspect({
        id: "p-exec",
        linked_discussion_id: "d-exec",
        status: "Saved",
      }),
      stubProspect({
        id: "p-failed-open",
        linked_discussion_id: "d-failed-open",
        status: "Saved",
      }),
      stubProspect({
        id: "p-failed-complete",
        linked_discussion_id: "d-failed-complete",
        status: "Saved",
      }),
      stubProspect({
        id: "p-completed-newer",
        linked_discussion_id: "d-completed-newer",
        status: "Saved",
      }),
      stubProspect({ id: "p-unlinked", linked_discussion_id: null, status: "Saved" }),
    ];

    const rows = await enrichProspectsForLibrary(prospects, ORG);
    const jobs = jobCalls(calls);

    assert.equal(jobs.length, 1);
    assertOrderedJobPage(jobs[0]!, 0);
    assert.deepEqual(discussionIn(jobs[0]!), [
      "d-queued",
      "d-retryable",
      "d-website",
      "d-prep",
      "d-exec",
      "d-failed-open",
      "d-failed-complete",
      "d-completed-newer",
    ]);
    assert.equal(rows[0]?.display_status, "Queued");
    assert.equal(rows[0]?.display_opportunity_score, 55);
    assert.equal(rows[1]?.display_status, "Queued");
    assert.equal(rows[2]?.display_status, "Processing");
    assert.equal(rows[3]?.display_status, "Learning from Website");
    assert.equal(rows[4]?.display_status, "Processing");
    assert.equal(rows[5]?.display_status, "Generating Executive Intelligence");
    assert.equal(rows[6]?.display_status, "Processing Failed");
    assert.equal(rows[6]?.display_intelligence_generated_at, null);
    assert.equal(rows[7]?.display_status, "Ready");
    assert.equal(
      rows[7]?.display_intelligence_generated_at,
      "2026-09-20T00:00:00.000Z",
    );
    assert.equal(
      rows[7]?.display_completeness_score,
      buildProspectLibraryCompleteness({
        prospect: prospects[7]!,
        hasCurrentVersion: true,
        getoblicRelationshipStatus: null,
      }),
    );
    assert.equal(rows[8]?.display_status, "Saved");
    assert.equal(rows[9]?.display_status, "Saved");
    assert.equal(rows[9]?.display_intelligence_generated_at, null);
    assert.equal(
      rows[0]?.display_completeness_score,
      buildProspectLibraryCompleteness({
        prospect: queuedProspect,
        hasCurrentVersion: false,
        getoblicRelationshipStatus: null,
      }),
    );
    assert.deepEqual(
      rows.map((row) => row.id),
      prospects.map((prospect) => prospect.id),
    );
  });

  it("keeps an older active job when newer terminal history fills a page", async () => {
    const jobs: JobFixture[] = Array.from(
      { length: GENERATION_JOB_STATE_PAGE_SIZE },
      (_, index) => ({
        discussion_id: "d-page",
        status: index === 0 ? "completed" : "failed",
        created_at: new Date(
          Date.UTC(2026, 8, 8, 0, 0, GENERATION_JOB_STATE_PAGE_SIZE - index),
        ).toISOString(),
      }),
    );
    jobs.push({
      discussion_id: "d-page",
      status: "processing",
      current_stage: "website_learning",
      created_at: "2020-01-01T00:00:00.000Z",
    });
    const calls = installFixture({ jobs });
    const prospects = [
      stubProspect({
        id: "p-page",
        linked_discussion_id: "d-page",
        status: "Saved",
      }),
    ];

    const rows = await enrichProspectsForLibrary(prospects, ORG);
    const queried = jobCalls(calls);

    assert.equal(queried.length, 2);
    assertOrderedJobPage(queried[0]!, 0);
    assertOrderedJobPage(
      queried[1]!,
      GENERATION_JOB_STATE_PAGE_SIZE,
    );
    assert.deepEqual(discussionIn(queried[0]!), ["d-page"]);
    assert.deepEqual(discussionIn(queried[1]!), ["d-page"]);
    assert.equal(rows[0]?.display_status, "Learning from Website");
    assert.equal(rows[0]?.display_intelligence_generated_at, null);
  });

  it("discards a chunk when a later job-history page fails", async () => {
    const page = Array.from({ length: GENERATION_JOB_STATE_PAGE_SIZE }, () => ({
      discussion_id: "d-partial",
      status: "processing",
      current_stage: "website_learning",
      created_at: "2026-09-01T00:00:00.000Z",
    }));
    const calls = installFixture({
      jobScripts: [
        { data: page, error: null },
        {
          data: [
            {
              discussion_id: "d-partial",
              status: "queued",
              current_stage: "queued",
              created_at: "2026-08-01T00:00:00.000Z",
            },
          ],
          error: { message: "job page failed" },
        },
      ],
    });

    const rows = await enrichProspectsForLibrary(
      [
        stubProspect({
          id: "p-partial",
          linked_discussion_id: "d-partial",
          status: "Ready",
        }),
      ],
      ORG,
    );
    const jobs = jobCalls(calls);

    assert.equal(jobs.length, 2);
    assertOrderedJobPage(jobs[0]!, 0);
    assertOrderedJobPage(jobs[1]!, GENERATION_JOB_STATE_PAGE_SIZE);
    assert.equal(rows[0]?.display_status, "Ready");
    assert.equal(rows[0]?.display_intelligence_generated_at, null);
  });

  it("keeps a successful job chunk when a later chunk fails", async () => {
    const prospects = queuedProspects(101);
    prospects[100] = stubProspect({
      id: "p-100",
      linked_discussion_id: "d-100",
      status: "Ready",
    });
    const calls = installFixture({
      jobScripts: [
        {
          data: [
            {
              discussion_id: "d-0",
              status: "processing",
              current_stage: "website_learning",
              created_at: "2026-09-01T00:00:00.000Z",
            },
          ],
          error: null,
        },
        {
          data: [
            {
              discussion_id: "d-100",
              status: "failed",
              current_stage: null,
              created_at: "2026-09-02T00:00:00.000Z",
            },
          ],
          error: { message: "second chunk failed" },
        },
      ],
    });

    const rows = await enrichProspectsForLibrary(prospects, ORG);
    const jobs = jobCalls(calls);

    assert.equal(jobs.length, 2);
    assert.equal(discussionIn(jobs[0]!).length, 100);
    assert.deepEqual(discussionIn(jobs[1]!), ["d-100"]);
    assert.equal(rows[0]?.display_status, "Learning from Website");
    assert.equal(rows[100]?.display_status, "Ready");
    assert.equal(rows[50]?.display_status, "Queued");
  });

  it("keeps a later job chunk when an earlier chunk fails", async () => {
    const prospects = queuedProspects(101);
    const calls = installFixture({
      jobScripts: [
        {
          data: [
            {
              discussion_id: "d-0",
              status: "processing",
              current_stage: "website_learning",
              created_at: "2026-09-01T00:00:00.000Z",
            },
          ],
          error: { message: "first chunk failed" },
        },
        {
          data: [
            {
              discussion_id: "d-100",
              status: "failed",
              current_stage: null,
              created_at: "2026-09-02T00:00:00.000Z",
            },
          ],
          error: null,
        },
      ],
    });

    const rows = await enrichProspectsForLibrary(prospects, ORG);
    const jobs = jobCalls(calls);

    assert.equal(jobs.length, 2);
    assert.equal(rows[0]?.display_status, "Queued");
    assert.equal(rows[0]?.display_intelligence_generated_at, null);
    assert.equal(rows[100]?.display_status, "Processing Failed");
    assert.equal(rows[100]?.display_intelligence_generated_at, null);
  });

  it("preserves Home dedupe, organization scope, and empty discussion input", async () => {
    const idle = installFixture({});
    const empty = await getGenerationJobStateForDiscussions(ORG, ["", ""]);
    assert.equal(idle.length, 0);
    assert.equal(empty.size, 0);

    const calls = installFixture({
      jobs: [
        {
          discussion_id: "d-home",
          status: "failed",
          created_at: "2026-09-01T00:00:00.000Z",
        },
        {
          discussion_id: "d-home",
          status: "completed",
          created_at: "2026-09-04T00:00:00.000Z",
        },
        {
          discussion_id: "d-other",
          status: "queued",
          created_at: "2026-09-05T00:00:00.000Z",
        },
      ],
    });
    const state = await getGenerationJobStateForDiscussions("org-home", [
      "d-home",
      "",
      "d-home",
      "d-other",
    ]);
    const jobs = jobCalls(calls);

    assert.equal(jobs.length, 1);
    assertOrderedJobPage(jobs[0]!, 0, "org-home");
    assert.deepEqual(discussionIn(jobs[0]!), ["d-home", "d-other"]);
    assert.equal(state.get("d-home")?.latest?.status, "completed");
    assert.equal(state.get("d-home")?.active, null);
    assert.equal(state.get("d-other")?.active?.status, "queued");
    assert.equal(state.get("d-other")?.latest?.status, "queued");
  });
});
