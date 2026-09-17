import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  FREE_VISIBILITY_RESERVATION_STALE_MS,
  isFreeTrained,
  isFreeVisibilityEligible,
  resolveFreeVisibilityStatus,
} from "../../lib/organization/freeVisibility";
import {
  evaluateFreeVisibilityGeneration,
} from "../../lib/organization/freeVisibilityGeneration";
import {
  applyBindFreeVisibility,
  applyConsumeFreeVisibility,
  applyFreeVisibilityPlanChange,
  applyReleaseFreeVisibility,
  applyReserveFreeVisibility,
  emptyFreeVisibilityOrganizationState,
  type FreeVisibilityWorld,
} from "../../lib/organization/freeVisibilityReservation";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20260917000003_add_organization_free_visibility.sql";
const ORG = "11111111-1111-4111-8111-111111111111";
const REPORT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REPORT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function world(
  overrides: Partial<FreeVisibilityWorld["organization"]> = {},
): FreeVisibilityWorld {
  return {
    organization: {
      ...emptyFreeVisibilityOrganizationState(),
      ...overrides,
    },
    reports: {},
    jobs: [],
  };
}

describe("FREE-9 Visibility authority — eligibility", () => {
  it("Full bypasses and only trained Free can reserve", () => {
    assert.equal(resolveFreeVisibilityStatus(null), "available");
    assert.equal(isFreeTrained({ athenaPlan: "free", defineKind: "ready" }), true);
    assert.equal(
      isFreeTrained({ athenaPlan: "free", defineKind: "needs_setup" }),
      false,
    );
    assert.deepEqual(
      evaluateFreeVisibilityGeneration({
        athenaPlan: "full",
        defineKind: "ready",
        generationType: "technical",
        action: "create",
      }),
      { allow: true },
    );
    assert.equal(
      evaluateFreeVisibilityGeneration({
        athenaPlan: "free",
        defineKind: "needs_setup",
        generationType: "intelligence",
        action: "create",
      }).allow,
      false,
    );
    assert.equal(
      isFreeVisibilityEligible({
        athenaPlan: "free",
        defineKind: "ready",
        visibilityStatus: "available",
      }),
      true,
    );
  });

  it("denies technical and consumed / reserved create", () => {
    assert.equal(
      evaluateFreeVisibilityGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        generationType: "technical",
        action: "create",
      }).allow,
      false,
    );
    assert.equal(
      evaluateFreeVisibilityGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        visibilityStatus: "consumed",
        generationType: "intelligence",
        action: "create",
      }).allow,
      false,
    );
    assert.equal(
      evaluateFreeVisibilityGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        visibilityStatus: "reserved",
        generationType: "intelligence",
        action: "create",
      }).allow,
      false,
    );
  });
});

describe("FREE-9 Visibility authority — reservation machine", () => {
  it("first intelligence reservation succeeds and binds the exact report", () => {
    const current = world();
    const reserved = applyReserveFreeVisibility({
      world: current,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "token-1",
    });
    assert.equal(reserved.outcome, "reserved");
    if (reserved.outcome !== "reserved") return;
    assert.equal(reserved.recovered, false);
    assert.equal(current.organization.reportId, null);

    assert.deepEqual(
      applyBindFreeVisibility({
        world: current,
        reservationToken: "token-1",
        reportId: REPORT_A,
      }),
      { outcome: "bound", reportId: REPORT_A },
    );
    assert.equal(current.organization.reportId, REPORT_A);
  });

  it("second concurrent reserve is denied without a second bind", () => {
    const current = world();
    const first = applyReserveFreeVisibility({
      world: current,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "token-1",
    });
    const second = applyReserveFreeVisibility({
      world: current,
      organizationId: ORG,
      nowMs: 1_100,
      nextToken: "token-2",
    });
    assert.equal(first.outcome, "reserved");
    assert.equal(second.outcome, "already_reserved");
    assert.deepEqual(
      applyBindFreeVisibility({
        world: current,
        reservationToken: "token-2",
        reportId: REPORT_B,
      }),
      { outcome: "conflict" },
    );
  });

  it("historical Ready lazily consumes and failed historical alone does not", () => {
    const ready = world();
    ready.reports[REPORT_B] = {
      id: REPORT_B,
      organizationId: ORG,
      status: "Ready",
    };
    assert.equal(
      applyReserveFreeVisibility({
        world: ready,
        organizationId: ORG,
        nowMs: 1_000,
        nextToken: "token-1",
      }).outcome,
      "already_consumed",
    );
    assert.equal(ready.organization.status, "consumed");
    assert.equal(ready.organization.reportId, REPORT_B);

    const failedOnly = world();
    failedOnly.reports[REPORT_A] = {
      id: REPORT_A,
      organizationId: ORG,
      status: "Processing Failed",
    };
    const reserved = applyReserveFreeVisibility({
      world: failedOnly,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "token-1",
    });
    assert.equal(reserved.outcome, "reserved");
    assert.equal(failedOnly.organization.status, "reserved");
  });

  it("stale unbound reservation recovers and leftover Ready consumes", () => {
    const unbound = world({
      status: "reserved",
      reportId: null,
      reservedAt: 1_000,
      reservationToken: "old-token",
    });
    assert.equal(
      applyReserveFreeVisibility({
        world: unbound,
        organizationId: ORG,
        nowMs: 1_000 + FREE_VISIBILITY_RESERVATION_STALE_MS - 1,
        nextToken: "fresh",
      }).outcome,
      "already_reserved",
    );
    const recovered = applyReserveFreeVisibility({
      world: unbound,
      organizationId: ORG,
      nowMs: 1_000 + FREE_VISIBILITY_RESERVATION_STALE_MS,
      nextToken: "fresh",
    });
    assert.equal(recovered.outcome, "reserved");
    if (recovered.outcome !== "reserved") return;
    assert.equal(recovered.recovered, true);

    const leftoverReady = world({
      status: "reserved",
      reportId: REPORT_A,
      reservedAt: 1_000,
      reservationToken: "token-1",
    });
    leftoverReady.reports[REPORT_A] = {
      id: REPORT_A,
      organizationId: ORG,
      status: "Ready",
    };
    assert.equal(
      applyReserveFreeVisibility({
        world: leftoverReady,
        organizationId: ORG,
        nowMs: 1_000 + FREE_VISIBILITY_RESERVATION_STALE_MS,
        nextToken: "too-late",
      }).outcome,
      "already_consumed",
    );
  });

  it("retryable failure stays reserved and terminal failure releases only that report", () => {
    const current = world({
      status: "reserved",
      reportId: REPORT_A,
      reservedAt: 1_000,
      reservationToken: "token-1",
    });
    current.jobs.push({
      reportId: REPORT_A,
      organizationId: ORG,
      status: "retryable",
    });
    current.reports[REPORT_A] = {
      id: REPORT_A,
      organizationId: ORG,
      status: "Processing",
    };

    assert.equal(
      applyReserveFreeVisibility({
        world: current,
        organizationId: ORG,
        nowMs: 1_000 + FREE_VISIBILITY_RESERVATION_STALE_MS + 1,
        nextToken: "token-2",
      }).outcome,
      "already_reserved",
    );

    current.jobs[0].status = "failed";
    current.reports[REPORT_A].status = "Processing Failed";
    assert.deepEqual(
      applyReleaseFreeVisibility({
        world: current,
        reportId: REPORT_B,
      }),
      { outcome: "ignored" },
    );
    assert.deepEqual(
      applyReleaseFreeVisibility({
        world: current,
        reportId: REPORT_A,
      }),
      { outcome: "released" },
    );
    assert.equal(current.organization.status, "available");
    assert.equal(current.organization.reportId, REPORT_A);
  });

  it("Ready consumes only the bound report and delete cannot reopen it", () => {
    const current = world({
      status: "reserved",
      reportId: REPORT_A,
      reservedAt: 1_000,
      reservationToken: "token-1",
    });
    assert.deepEqual(
      applyConsumeFreeVisibility({ world: current, reportId: REPORT_B }),
      { outcome: "ignored" },
    );
    assert.deepEqual(
      applyConsumeFreeVisibility({ world: current, reportId: REPORT_A }),
      { outcome: "consumed" },
    );
    delete current.reports[REPORT_A];
    assert.equal(
      applyReserveFreeVisibility({
        world: current,
        organizationId: ORG,
        nowMs: 9_000_000,
        nextToken: "after-delete",
      }).outcome,
      "already_consumed",
    );
  });
});

describe("FREE-9 Visibility authority — SQL contract", () => {
  it("adds the smallest organization reservation columns and service-role RPCs", () => {
    assert.equal(existsSync(join(ROOT, MIGRATION)), true);
    const sql = read(MIGRATION);
    assert.match(sql, /add column if not exists free_visibility_status text/);
    assert.match(sql, /add column if not exists free_visibility_report_id uuid/);
    assert.match(sql, /add column if not exists free_visibility_reserved_at timestamptz/);
    assert.match(
      sql,
      /add column if not exists free_visibility_reservation_token uuid/,
    );
    assert.match(sql, /for update/);
    assert.match(sql, /interval '2 minutes'/);
    assert.match(sql, /create or replace function reserve_athena_free_visibility/);
    assert.match(sql, /create or replace function bind_athena_free_visibility_report/);
    assert.match(sql, /create or replace function consume_athena_free_visibility/);
    assert.match(sql, /create or replace function release_athena_free_visibility/);
    assert.match(sql, /grant execute on function reserve_athena_free_visibility\(uuid\) to service_role/);
    assert.match(sql, /revoke all on function reserve_athena_free_visibility\(uuid\) from authenticated/);
    assert.doesNotMatch(sql, /create table .*quota/i);
    assert.doesNotMatch(sql, /athena_plan\s*=/);
    assert.match(
      sql,
      /perform consume_athena_free_visibility\(v_job\.organization_id, v_job\.report_id\)/,
    );
    const failFn = sql.slice(
      sql.lastIndexOf("create or replace function fail_athena_seo_generation_job"),
    );
    const failedBranchStart = failFn.indexOf("if v_status = 'failed' then");
    const retryableBranch = failFn.slice(failFn.indexOf("else", failedBranchStart));
    assert.match(
      failFn.slice(failedBranchStart, failFn.indexOf("else", failedBranchStart)),
      /perform release_athena_free_visibility/,
    );
    assert.doesNotMatch(retryableBranch, /perform release_athena_free_visibility/);
    assert.doesNotMatch(sql, /update seo_reports[\s\S]{0,80}free_visibility/);
    assert.match(sql, /from seo_reports r/);
  });

  it("does not execute the migration from application code", () => {
    const service = read("services/organization/freeVisibilityAuthority.ts");
    const orchestration = read("services/seo/freeVisibilityOrchestration.ts");
    const page = read("app/seo/page.tsx");
    for (const source of [service, orchestration, page]) {
      assert.doesNotMatch(source, /supabase migration|db push|exec\(sql/i);
    }
  });
});

describe("FREE-9 Visibility authority — plan continuity", () => {
  it("does not clear consumed when plan changes free → full → free", () => {
    const current = world({
      status: "consumed",
      reportId: REPORT_A,
      reservedAt: null,
      reservationToken: null,
    });
    applyFreeVisibilityPlanChange({ world: current, nextPlan: "full" });
    applyFreeVisibilityPlanChange({ world: current, nextPlan: "free" });
    assert.equal(current.organization.status, "consumed");
    assert.equal(
      applyReserveFreeVisibility({
        world: current,
        organizationId: ORG,
        nowMs: Date.now(),
        nextToken: "again",
      }).outcome,
      "already_consumed",
    );
  });
});
