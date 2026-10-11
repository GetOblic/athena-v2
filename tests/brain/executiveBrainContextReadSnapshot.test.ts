import "../organization/organizationLanguageTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  dedupeBriefingsByOpportunity,
  dedupeOpportunitiesByDiscussion,
} from "../../lib/canonicalRecords";
import { getBriefingListSummary } from "../../lib/briefingDisplay";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { clearGenerationPipelineCache } from "../../services/brain/generationContractService";
import { buildBrainContext } from "../../services/brain/executiveContextBuilder";
import { buildBrainContextForOrganization } from "../../services/brain/brainContextBuilder";
import { buildRelevantMemory } from "../../services/brain/reasoningPipeline/memoryRetrievalBuilder";
import type { OrganizationReadSnapshot } from "../../services/brain/organizationReadSnapshot";
import { getDashboardStats } from "../../services/dashboardService";
import {
  getCanonicalOpportunities,
  getOpportunities,
  getOpportunityById,
  type Opportunity,
} from "../../services/opportunityService";
import { resolveGenerationBundle } from "../../services/brain/generationContractService";
import { getBriefingQueues } from "../../services/queueService";
import {
  getCanonicalReviews,
  getReviews,
  type AthenaReview,
} from "../../services/reviewService";
import { getTodaysIntelligence } from "../../services/todaysIntelligenceService";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DISCUSSION_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OPP_WINNER = "11111111-1111-4111-8111-111111111111";
const OPP_LOSER = "22222222-2222-4222-8222-222222222222";
const OPP_OTHER = "33333333-3333-4333-8333-333333333333";
const REVIEW_APPROVED = "44444444-4444-4444-8444-444444444444";
const REVIEW_DRAFT = "55555555-5555-4555-8555-555555555555";
const REVIEW_NEW = "66666666-6666-4666-8666-666666666666";

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

type Row = Record<string, unknown>;

type QueryCall = {
  table: string;
  select: string;
  head: boolean;
  eqs: Record<string, unknown>;
  orders: string[];
};

type Fixture = {
  tables: Record<string, Row[]>;
  queries: QueryCall[];
  failNextOpportunityLists: number;
};

function opportunity(partial: Partial<Opportunity> & Pick<Opportunity, "id" | "organization_id">): Opportunity {
  return {
    id: partial.id,
    created_at: partial.created_at ?? "2026-01-01T00:00:00.000Z",
    updated_at: partial.updated_at ?? partial.created_at ?? "2026-01-01T00:00:00.000Z",
    organization_id: partial.organization_id,
    discussion_id: partial.discussion_id ?? null,
    community_id: null,
    type: "community_discussion",
    status: partial.status ?? "pending",
    score: partial.score ?? 0,
    urgency: partial.urgency ?? null,
    intent: null,
    risk_level: null,
    title: partial.title ?? partial.id,
    reason: partial.reason ?? null,
    recommended_action: null,
    suggested_cta: null,
    assigned_to: null,
    due_at: null,
    ai_summary: null,
    ai_recommendation: null,
    raw_json: null,
  };
}

function review(partial: Partial<AthenaReview> & Pick<AthenaReview, "id" | "organization_id">): AthenaReview {
  return {
    id: partial.id,
    created_at: partial.created_at ?? "2026-01-01T00:00:00.000Z",
    updated_at: partial.updated_at ?? partial.created_at ?? "2026-01-01T00:00:00.000Z",
    organization_id: partial.organization_id,
    discussion_id: partial.discussion_id ?? null,
    opportunity_id: partial.opportunity_id ?? null,
    status: partial.status ?? "draft",
    summary: partial.summary ?? null,
    pain_points: partial.pain_points ?? null,
    buyer_stage: partial.buyer_stage ?? null,
    recommended_response: null,
    cta: null,
    confidence: partial.confidence ?? 0,
    raw_json: partial.raw_json ?? null,
    model: null,
    prompt_version: null,
    generation_time_ms: null,
    version: 1,
    approved_by: null,
    approved_at: partial.approved_at ?? null,
    notes: null,
  };
}

function canonicalFixture(): Fixture {
  const winner = opportunity({
    id: OPP_WINNER,
    organization_id: ORG_A,
    discussion_id: DISCUSSION_A,
    score: 80,
    updated_at: "2026-03-02T00:00:00.000Z",
    created_at: "2026-03-01T00:00:00.000Z",
    title: "Canonical winner",
  });
  const loser = opportunity({
    id: OPP_LOSER,
    organization_id: ORG_A,
    discussion_id: DISCUSSION_A,
    score: 80,
    updated_at: "2026-03-01T00:00:00.000Z",
    created_at: "2026-03-01T00:00:00.000Z",
    title: "Older duplicate",
  });
  const other = opportunity({
    id: OPP_OTHER,
    organization_id: ORG_A,
    discussion_id: "discussion-other",
    score: 40,
    updated_at: "2026-02-01T00:00:00.000Z",
    title: "Other discussion",
  });
  const foreign = opportunity({
    id: "foreign-opportunity",
    organization_id: ORG_B,
    discussion_id: DISCUSSION_A,
    score: 99,
    title: "Other organization",
  });
  const approved = review({
    id: REVIEW_APPROVED,
    organization_id: ORG_A,
    opportunity_id: OPP_WINNER,
    discussion_id: DISCUSSION_A,
    status: "approved",
    confidence: 90,
    summary: "Approved angle summary",
    pain_points: "slow onboarding",
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    approved_at: "2026-03-01T00:00:00.000Z",
  });
  const draft = review({
    id: REVIEW_DRAFT,
    organization_id: ORG_A,
    opportunity_id: OPP_WINNER,
    discussion_id: DISCUSSION_A,
    status: "draft",
    confidence: 10,
    summary: "Newer draft summary",
    pain_points: "ignored duplicate pain",
    created_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
  });
  const foreignReview = review({
    id: "foreign-review",
    organization_id: ORG_B,
    opportunity_id: OPP_WINNER,
    status: "approved",
    summary: "Foreign summary",
    created_at: "2026-05-01T00:00:00.000Z",
  });

  return {
    queries: [],
    failNextOpportunityLists: 0,
    tables: {
      organizations: [
        { id: ORG_A, name: "Org A", slug: "org-a" },
        { id: ORG_B, name: "Org B", slug: "org-b" },
      ],
      opportunities: [loser, winner, other, foreign],
      athena_reviews: [draft, approved, foreignReview],
      discussions: [
        {
          id: DISCUSSION_A,
          organization_id: ORG_A,
          community_id: null,
          platform: "community",
          title: "Discussion",
          status: "New",
          priority: 1,
          opportunity_score: 80,
          summary: null,
          created_at: "2026-03-01T00:00:00.000Z",
          updated_at: "2026-03-01T00:00:00.000Z",
          last_activity: "2026-03-01T00:00:00.000Z",
        },
      ],
    },
  };
}

function isOpportunityOrganizationList(query: QueryCall): boolean {
  return (
    query.table === "opportunities" &&
    query.select === "*" &&
    !query.head &&
    Object.prototype.hasOwnProperty.call(query.eqs, "organization_id") &&
    !Object.prototype.hasOwnProperty.call(query.eqs, "id") &&
    !Object.prototype.hasOwnProperty.call(query.eqs, "discussion_id") &&
    query.orders.some((order) => order === "score:desc")
  );
}

function isReviewOrganizationList(query: QueryCall): boolean {
  return (
    query.table === "athena_reviews" &&
    query.select === "*" &&
    !query.head &&
    Object.prototype.hasOwnProperty.call(query.eqs, "organization_id") &&
    !Object.prototype.hasOwnProperty.call(query.eqs, "id") &&
    !Object.prototype.hasOwnProperty.call(query.eqs, "opportunity_id") &&
    !Object.prototype.hasOwnProperty.call(query.eqs, "discussion_id") &&
    query.orders.some((order) => order === "created_at:desc")
  );
}

function installFixture(fixture: Fixture) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const call: QueryCall = {
      table,
      select: "*",
      head: false,
      eqs: {},
      orders: [],
    };
    const inequalities: Array<{ column: string; value: unknown }> = [];
    const inclusions: Array<{ column: string; values: unknown[] }> = [];
    let limit: number | null = null;

    const execute = () => {
      fixture.queries.push({
        table: call.table,
        select: call.select,
        head: call.head,
        eqs: { ...call.eqs },
        orders: [...call.orders],
      });

      const recorded = fixture.queries[fixture.queries.length - 1];
      if (
        isOpportunityOrganizationList(recorded) &&
        fixture.failNextOpportunityLists > 0
      ) {
        fixture.failNextOpportunityLists -= 1;
        return {
          rows: [] as Row[],
          error: { message: "forced opportunity list failure" },
          count: 0,
        };
      }

      let rows = (fixture.tables[table] ?? []).filter((row) => {
        for (const [column, value] of Object.entries(call.eqs)) {
          if (row[column] !== value) {
            return false;
          }
        }
        for (const inequality of inequalities) {
          if (row[inequality.column] === inequality.value) {
            return false;
          }
        }
        for (const inclusion of inclusions) {
          if (!inclusion.values.includes(row[inclusion.column])) {
            return false;
          }
        }
        return true;
      });
      rows = rows.map((row) => ({ ...row }));
      for (const column of call.orders) {
        const ascending = column.endsWith(":asc");
        const name = column.replace(/:(asc|desc)$/, "");
        const direction = ascending ? 1 : -1;
        rows.sort((left, right) => {
          const leftValue = left[name];
          const rightValue = right[name];
          if (leftValue === rightValue) {
            return 0;
          }
          if (leftValue == null) {
            return 1;
          }
          if (rightValue == null) {
            return -1;
          }
          return leftValue > rightValue ? direction : -direction;
        });
      }
      if (limit != null) {
        rows = rows.slice(0, limit);
      }
      return { rows, error: null, count: rows.length };
    };

    const builder = {
      select(columns = "*", options?: { head?: boolean }) {
        call.select = columns;
        call.head = Boolean(options?.head);
        return builder;
      },
      eq(column: string, value: unknown) {
        call.eqs[column] = value;
        return builder;
      },
      neq(column: string, value: unknown) {
        inequalities.push({ column, value });
        return builder;
      },
      in(column: string, values: unknown[]) {
        inclusions.push({ column, values });
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        call.orders.push(
          `${column}:${options?.ascending === false ? "desc" : "asc"}`,
        );
        return builder;
      },
      limit(value: number) {
        limit = value;
        return builder;
      },
      maybeSingle: async () => {
        const result = execute();
        return {
          data: result.error ? null : (result.rows[0] ?? null),
          error: result.error,
          count: result.count,
        };
      },
      single: async () => {
        const result = execute();
        return {
          data: result.error ? null : (result.rows[0] ?? null),
          error: result.error,
          count: result.count,
        };
      },
      then(
        onFulfilled?: (value: {
          data: Row[] | null;
          error: { message: string } | null;
          count: number;
        }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        try {
          const result = execute();
          return Promise.resolve({
            data: call.head || result.error ? null : result.rows,
            error: result.error,
            count: result.error ? null : result.count,
          }).then(onFulfilled, onRejected);
        } catch (error) {
          return Promise.reject(error).then(onFulfilled, onRejected);
        }
      },
    };

    return builder;
  };
}

function opportunityListCount(fixture: Fixture): number {
  return fixture.queries.filter(isOpportunityOrganizationList).length;
}

function reviewListCount(fixture: Fixture): number {
  return fixture.queries.filter(isReviewOrganizationList).length;
}

function restoreSupabase() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
  clearGenerationPipelineCache();
}

describe("executive brain context organization read snapshot", () => {
  afterEach(() => {
    restoreSupabase();
  });

  it("loads opportunities and reviews once and preserves canonical counts", async () => {
    const fixture = canonicalFixture();
    installFixture(fixture);
    clearGenerationPipelineCache();

    const context = await buildBrainContext({ organizationId: ORG_A });
    assert.ok(context);
    assert.equal(opportunityListCount(fixture), 1);
    assert.equal(reviewListCount(fixture), 1);
    assert.equal(
      (context as { organizationReadSnapshot?: unknown }).organizationReadSnapshot,
      undefined,
    );

    const orderedOpportunities = [...(fixture.tables.opportunities as Opportunity[])]
      .filter((row) => row.organization_id === ORG_A)
      .sort((left, right) => right.score - left.score);
    const expectedOpportunities = dedupeOpportunitiesByDiscussion(orderedOpportunities);
    assert.deepEqual(
      context.opportunityMemory.recentOpportunities.map((entry) => entry.id),
      expectedOpportunities.map((entry) => entry.id),
    );
    assert.deepEqual(context.opportunityMemory.recentOpportunities.map((entry) => entry.id), [
      OPP_WINNER,
      OPP_OTHER,
    ]);
    assert.equal(context.opportunityMemory.highestScoring?.id, OPP_WINNER);
    assert.equal(context.opportunityMemory.highestScoring?.score, 80);
    assert.equal(context.opportunityMemory.statusDistribution.pending, 2);
    assert.equal(context.operationalMemory.dashboard.opportunities, 2);
    assert.equal(context.operationalMemory.dashboard.approvedBriefings, 1);
    assert.equal(context.operationalMemory.dashboard.draftBriefings, 0);
    assert.equal(
      context.operationalMemory.todaysIntelligence.immediateActionOpportunities,
      1,
    );
    assert.equal(
      context.operationalMemory.todaysIntelligence.briefingsAwaitingApproval,
      0,
    );
    assert.equal(
      context.operationalMemory.todaysIntelligence.highestOpportunity?.id,
      OPP_WINNER,
    );

    const orderedReviews = [...(fixture.tables.athena_reviews as AthenaReview[])]
      .filter((row) => row.organization_id === ORG_A)
      .sort((left, right) => right.created_at.localeCompare(left.created_at));
    const expectedReviews = dedupeBriefingsByOpportunity(orderedReviews);
    assert.deepEqual(
      context.briefingMemory.recentBriefings.map((entry) => entry.id),
      expectedReviews.map((entry) => entry.id),
    );
    assert.deepEqual(context.briefingMemory.recentBriefings.map((entry) => entry.id), [
      REVIEW_APPROVED,
    ]);
    assert.equal(context.briefingMemory.recentBriefings[0]?.summary, "Approved angle summary");
    assert.deepEqual(context.discussionMemory.recurringThemes, ["slow onboarding"]);
    assert.equal(context.executiveLearning.briefingLearning.approved, 1);
    assert.equal(context.executiveLearning.briefingLearning.draft, 1);
    assert.equal(context.executiveLearning.refreshLearning.briefingRefreshes.length, 1);
    assert.equal(context.executiveLearning.refreshLearning.briefingRefreshes[0]?.count, 2);
    assert.equal(
      context.executiveLearning.refreshLearning.briefingRefreshes[0]?.linkedObjectId,
      OPP_WINNER,
    );
    assert.ok(
      !context.opportunityMemory.recentOpportunities.some(
        (entry) => entry.id === "foreign-opportunity",
      ),
    );
    assert.ok(
      !context.briefingMemory.recentBriefings.some((entry) => entry.id === "foreign-review"),
    );

    const promptMemory = buildRelevantMemory(context);
    assert.ok(promptMemory.priorWinningAngles.includes("Approved angle summary"));
    assert.equal(promptMemory.priorWinningAngles.includes("Newer draft summary"), false);
    assert.equal(promptMemory.priorWinningAngles.includes("Foreign summary"), false);
  });

  it("rejects a mismatched snapshot and does not return its records", async () => {
    const fixture = canonicalFixture();
    installFixture(fixture);
    const foreign = opportunity({
      id: "snapshot-foreign",
      organization_id: ORG_B,
      score: 100,
      title: "Leaked",
    });
    const partial = opportunity({
      id: OPP_WINNER,
      organization_id: ORG_A,
      score: 80,
      title: "Partial",
    });

    const opportunities = await getOpportunities(ORG_A, [partial, foreign]);
    assert.equal(opportunityListCount(fixture), 1);
    assert.deepEqual(
      opportunities.map((row) => row.id).sort(),
      [OPP_LOSER, OPP_WINNER, OPP_OTHER].sort(),
    );
    assert.equal(opportunities.some((row) => row.id === "snapshot-foreign"), false);

    fixture.queries.length = 0;
    const reviews = await getReviews(ORG_A, [
      review({
        id: "snapshot-foreign-review",
        organization_id: ORG_B,
        summary: "Leaked review",
      }),
    ]);
    assert.equal(reviewListCount(fixture), 1);
    assert.equal(reviews.some((row) => row.organization_id === ORG_B), false);
    assert.equal(reviews.some((row) => row.id === "snapshot-foreign-review"), false);

    fixture.queries.length = 0;
    const mismatchedSnapshot: OrganizationReadSnapshot = {
      organizationId: ORG_B,
      opportunities: [foreign],
      reviews: [
        review({
          id: "snapshot-foreign-review",
          organization_id: ORG_B,
          status: "draft",
        }),
      ],
    };
    const stats = await getDashboardStats(ORG_A, mismatchedSnapshot);
    assert.equal(opportunityListCount(fixture), 1);
    assert.equal(reviewListCount(fixture), 1);
    assert.equal(stats.opportunities, 2);
    assert.equal(stats.approvedBriefings, 1);
    assert.equal(stats.draftBriefings, 0);
  });

  it("reuses an explicit empty collection without querying", async () => {
    const fixture = canonicalFixture();
    installFixture(fixture);

    assert.deepEqual(await getOpportunities(ORG_A, []), []);
    assert.deepEqual(await getCanonicalOpportunities(ORG_A, []), []);
    assert.deepEqual(await getReviews(ORG_A, []), []);
    assert.deepEqual(await getCanonicalReviews(ORG_A, []), []);
    const stats = await getDashboardStats(ORG_A, {
      organizationId: ORG_A,
      opportunities: [],
      reviews: [],
    });
    assert.equal(stats.opportunities, 0);
    assert.equal(stats.draftBriefings, 0);
    assert.equal(stats.approvedBriefings, 0);
    assert.equal(opportunityListCount(fixture), 0);
    assert.equal(reviewListCount(fixture), 0);
  });

  it("gives each build its own snapshot", async () => {
    const fixture = canonicalFixture();
    installFixture(fixture);
    clearGenerationPipelineCache();

    const first = await buildBrainContext({ organizationId: ORG_A });
    const second = await buildBrainContext({ organizationId: ORG_A });
    assert.ok(first);
    assert.ok(second);
    assert.equal(opportunityListCount(fixture), 2);
    assert.equal(reviewListCount(fixture), 2);
    assert.notEqual(first, second);
  });

  it("sees a review written between generation stages", async () => {
    const fixture = canonicalFixture();
    installFixture(fixture);
    clearGenerationPipelineCache();

    const analysis = await resolveGenerationBundle({
      workflowType: "discussion_analysis",
      organizationId: ORG_A,
      discussionId: DISCUSSION_A,
      bypassCache: true,
    });
    assert.ok(analysis);
    assert.equal(
      analysis.brainContext.briefingMemory.recentBriefings.some(
        (entry) => entry.id === REVIEW_NEW,
      ),
      false,
    );

    fixture.tables.athena_reviews.push(
      review({
        id: REVIEW_NEW,
        organization_id: ORG_A,
        opportunity_id: OPP_OTHER,
        discussion_id: "discussion-other",
        status: "draft",
        summary: "Review written between stages",
        created_at: "2026-05-02T00:00:00.000Z",
        updated_at: "2026-05-02T00:00:00.000Z",
      }),
    );

    const briefing = await resolveGenerationBundle({
      workflowType: "executive_briefing",
      organizationId: ORG_A,
      discussionId: DISCUSSION_A,
      opportunityId: OPP_WINNER,
      bypassCache: true,
    });
    assert.ok(briefing);
    assert.equal(opportunityListCount(fixture), 2);
    assert.equal(reviewListCount(fixture), 2);
    assert.ok(
      briefing.brainContext.briefingMemory.recentBriefings.some(
        (entry) => entry.id === REVIEW_NEW,
      ),
    );
    assert.equal(
      analysis.brainContext.briefingMemory.recentBriefings.some(
        (entry) => entry.id === REVIEW_NEW,
      ),
      false,
    );
  });

  it("keeps independent callers on the database read path", async () => {
    const fixture = canonicalFixture();
    installFixture(fixture);
    clearGenerationPipelineCache();

    await getDashboardStats(ORG_A);
    assert.equal(opportunityListCount(fixture), 1);
    assert.equal(reviewListCount(fixture), 1);

    fixture.queries.length = 0;
    await getTodaysIntelligence(ORG_A);
    assert.equal(opportunityListCount(fixture), 1);
    assert.equal(reviewListCount(fixture), 1);

    fixture.queries.length = 0;
    await getBriefingQueues(ORG_A);
    assert.equal(opportunityListCount(fixture), 0);
    assert.equal(reviewListCount(fixture), 1);

    fixture.queries.length = 0;
    const focused = await getOpportunityById(OPP_WINNER, ORG_A);
    assert.equal(focused?.id, OPP_WINNER);
    assert.equal(opportunityListCount(fixture), 0);
    assert.equal(
      fixture.queries.some(
        (query) => query.table === "opportunities" && query.eqs.id === OPP_WINNER,
      ),
      true,
    );

    fixture.queries.length = 0;
    const independent = await buildBrainContextForOrganization(ORG_A);
    assert.ok(independent);
    assert.equal(opportunityListCount(fixture), 1);
    assert.equal(reviewListCount(fixture), 1);
  });

  it("keeps the briefings summary fallback on raw_json", () => {
    const root = process.cwd();
    const read = (path: string) => readFileSync(join(root, path), "utf8");
    const opportunitySource = read("services/opportunityService.ts");
    const reviewSource = read("services/reviewService.ts");
    const queueSource = read("services/queueService.ts");
    const briefingsPage = read("app/briefings/page.tsx");

    assert.match(
      opportunitySource,
      /\.from\("opportunities"\)\s*\.select\("\*"\)\s*\.eq\("organization_id", organizationId\)\s*\.order\("score", \{ ascending: false \}\)/,
    );
    assert.match(
      reviewSource,
      /\.from\("athena_reviews"\)\s*\.select\("\*"\)\s*\.eq\("organization_id", organizationId\)\s*\.order\("created_at", \{ ascending: false \}\)/,
    );
    assert.match(queueSource, /getCanonicalReviews\(organizationId\)/);
    assert.doesNotMatch(queueSource, /organizationReadSnapshot/);
    assert.match(briefingsPage, /getBriefingQueues\(organizationId\)/);
    assert.doesNotMatch(briefingsPage, /organizationReadSnapshot/);

    const byId = opportunitySource.slice(
      opportunitySource.indexOf("export async function getOpportunityById"),
      opportunitySource.indexOf("export async function getOpportunitiesByDiscussionId"),
    );
    assert.match(byId, /\.select\("\*"\)/);
    assert.doesNotMatch(byId, /records\?:/);

    const stored = review({
      id: REVIEW_APPROVED,
      organization_id: ORG_A,
      summary: "Column summary",
      raw_json: {
        parsed_review: {
          executive_summary: "Parsed executive summary",
          summary: "Parsed summary",
        },
      },
    });
    assert.equal(getBriefingListSummary(stored), "Parsed executive summary");
    assert.equal(
      getBriefingListSummary({
        ...stored,
        raw_json: { parsed_review: { summary: "Parsed summary" } },
      }),
      "Parsed summary",
    );
    assert.equal(
      getBriefingListSummary({ ...stored, raw_json: null }),
      "Column summary",
    );
    assert.equal(
      getBriefingListSummary({ ...stored, raw_json: null, summary: "  " }),
      "Untitled briefing",
    );
  });

  it("does not reuse a failed organization list as an empty snapshot", async () => {
    const fixture = canonicalFixture();
    fixture.failNextOpportunityLists = 1;
    installFixture(fixture);
    clearGenerationPipelineCache();
    const errors: unknown[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args[0]);
    };

    try {
      const context = await buildBrainContext({ organizationId: ORG_A });
      assert.ok(context);
      assert.ok(opportunityListCount(fixture) > 1);
      assert.equal(reviewListCount(fixture), 1);
      assert.equal(context.opportunityMemory.highestScoring?.id, OPP_WINNER);
      assert.equal(errors.length > 0, true);
    } finally {
      console.error = originalError;
    }
  });
});
