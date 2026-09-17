import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  FREE_CONVERT_RESERVATION_STALE_MS,
  isFreeTrained,
  isFreeConvertEligible,
  resolveFreeConvertStatus,
} from "../../lib/organization/freeConvert";
import { evaluateFreeConvertGeneration } from "../../lib/organization/freeConvertGeneration";
import {
  applyBindFreeConvert,
  applyConsumeFreeConvert,
  applyFreeConvertPlanChange,
  applyReleaseFreeConvert,
  applyReserveFreeConvert,
  emptyFreeConvertOrganizationState,
  type FreeConvertWorld,
} from "../../lib/organization/freeConvertReservation";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20260917000005_add_organization_free_convert.sql";
const FOLLOW_UP_MIGRATION =
  "supabase/migrations/20260917000006_patch_athena_generation_job_free_convert.sql";
const ORG = "11111111-1111-4111-8111-111111111111";
const PROSPECT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROSPECT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function world(
  overrides: Partial<FreeConvertWorld["organization"]> = {},
): FreeConvertWorld {
  return {
    organization: {
      ...emptyFreeConvertOrganizationState(),
      ...overrides,
    },
    prospects: {},
    jobs: [],
  };
}

describe("FREE-11 Convert authority — eligibility", () => {
  it("Full bypasses and only trained Free can reserve", () => {
    assert.equal(resolveFreeConvertStatus(null), "available");
    assert.equal(isFreeTrained({ athenaPlan: "free", defineKind: "ready" }), true);
    assert.equal(
      isFreeTrained({ athenaPlan: "free", defineKind: "needs_setup" }),
      false,
    );
    assert.deepEqual(
      evaluateFreeConvertGeneration({
        athenaPlan: "full",
        defineKind: "ready",
        action: "create",
      }),
      { allow: true },
    );
    assert.equal(
      evaluateFreeConvertGeneration({
        athenaPlan: "free",
        defineKind: "needs_setup",
        action: "create",
      }).allow,
      false,
    );
    assert.equal(
      isFreeConvertEligible({
        athenaPlan: "free",
        defineKind: "ready",
        convertStatus: "available",
      }),
      true,
    );
  });

  it("denies consumed / reserved create and leftover failed bind", () => {
    assert.equal(
      evaluateFreeConvertGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        convertStatus: "consumed",
        action: "create",
      }).allow,
      false,
    );
    assert.equal(
      evaluateFreeConvertGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        convertStatus: "reserved",
        action: "create",
      }).allow,
      false,
    );
    assert.equal(
      evaluateFreeConvertGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        convertStatus: "available",
        boundProspectId: PROSPECT_A,
        action: "create",
      }).allow,
      false,
    );
  });
});

describe("FREE-11 Convert authority — reservation machine", () => {
  it("first reservation succeeds and binds the exact prospect", () => {
    const current = world();
    const reserved = applyReserveFreeConvert({
      world: current,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "token-1",
    });
    assert.equal(reserved.outcome, "reserved");
    if (reserved.outcome !== "reserved") return;
    assert.equal(reserved.recovered, false);
    assert.equal(current.organization.prospectId, null);

    assert.deepEqual(
      applyBindFreeConvert({
        world: current,
        reservationToken: "token-1",
        prospectId: PROSPECT_A,
      }),
      { outcome: "bound", prospectId: PROSPECT_A },
    );
    assert.equal(current.organization.prospectId, PROSPECT_A);
  });

  it("second concurrent reserve is denied without a second bind", () => {
    const current = world();
    const first = applyReserveFreeConvert({
      world: current,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "token-1",
    });
    const second = applyReserveFreeConvert({
      world: current,
      organizationId: ORG,
      nowMs: 1_100,
      nextToken: "token-2",
    });
    assert.equal(first.outcome, "reserved");
    assert.equal(second.outcome, "already_reserved");
    assert.deepEqual(
      applyBindFreeConvert({
        world: current,
        reservationToken: "token-2",
        prospectId: PROSPECT_B,
      }),
      { outcome: "conflict" },
    );
  });

  it("wrong token cannot bind and a different prospect cannot replace bind", () => {
    const current = world();
    applyReserveFreeConvert({
      world: current,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "token-1",
    });
    assert.deepEqual(
      applyBindFreeConvert({
        world: current,
        reservationToken: "wrong",
        prospectId: PROSPECT_A,
      }),
      { outcome: "conflict" },
    );
    assert.deepEqual(
      applyBindFreeConvert({
        world: current,
        reservationToken: "token-1",
        prospectId: PROSPECT_A,
      }),
      { outcome: "bound", prospectId: PROSPECT_A },
    );
    assert.deepEqual(
      applyBindFreeConvert({
        world: current,
        reservationToken: "token-1",
        prospectId: PROSPECT_B,
      }),
      { outcome: "conflict" },
    );
    assert.equal(current.organization.prospectId, PROSPECT_A);
  });

  it("historical Ready lazily consumes and failed historical alone does not", () => {
    const ready = world();
    ready.prospects[PROSPECT_B] = {
      id: PROSPECT_B,
      organizationId: ORG,
      status: "Ready",
    };
    assert.equal(
      applyReserveFreeConvert({
        world: ready,
        organizationId: ORG,
        nowMs: 1_000,
        nextToken: "token-1",
      }).outcome,
      "already_consumed",
    );
    assert.equal(ready.organization.status, "consumed");
    assert.equal(ready.organization.prospectId, PROSPECT_B);

    const failedOnly = world();
    failedOnly.prospects[PROSPECT_A] = {
      id: PROSPECT_A,
      organizationId: ORG,
      status: "Processing Failed",
    };
    const reserved = applyReserveFreeConvert({
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
      prospectId: null,
      reservedAt: 1_000,
      reservationToken: "old-token",
    });
    assert.equal(
      applyReserveFreeConvert({
        world: unbound,
        organizationId: ORG,
        nowMs: 1_000 + FREE_CONVERT_RESERVATION_STALE_MS - 1,
        nextToken: "fresh",
      }).outcome,
      "already_reserved",
    );
    const recovered = applyReserveFreeConvert({
      world: unbound,
      organizationId: ORG,
      nowMs: 1_000 + FREE_CONVERT_RESERVATION_STALE_MS,
      nextToken: "fresh",
    });
    assert.equal(recovered.outcome, "reserved");
    if (recovered.outcome !== "reserved") return;
    assert.equal(recovered.recovered, true);

    const leftoverReady = world({
      status: "reserved",
      prospectId: PROSPECT_A,
      reservedAt: 1_000,
      reservationToken: "token-1",
    });
    leftoverReady.prospects[PROSPECT_A] = {
      id: PROSPECT_A,
      organizationId: ORG,
      status: "Ready",
    };
    assert.equal(
      applyReserveFreeConvert({
        world: leftoverReady,
        organizationId: ORG,
        nowMs: 1_000 + FREE_CONVERT_RESERVATION_STALE_MS,
        nextToken: "too-late",
      }).outcome,
      "already_consumed",
    );
  });

  it("bound Saved Find add is never recovered into a second prospect", () => {
    const current = world({
      status: "reserved",
      prospectId: PROSPECT_A,
      reservedAt: 1_000,
      reservationToken: "token-1",
    });
    current.prospects[PROSPECT_A] = {
      id: PROSPECT_A,
      organizationId: ORG,
      status: "Saved",
    };
    assert.equal(
      applyReserveFreeConvert({
        world: current,
        organizationId: ORG,
        nowMs: 1_000 + FREE_CONVERT_RESERVATION_STALE_MS + 1,
        nextToken: "token-2",
      }).outcome,
      "already_reserved",
    );
    assert.equal(current.organization.prospectId, PROSPECT_A);
  });

  it("bound retryable prospect does not create a second prospect", () => {
    const current = world({
      status: "reserved",
      prospectId: PROSPECT_A,
      reservedAt: 1_000,
      reservationToken: "token-1",
    });
    current.prospects[PROSPECT_A] = {
      id: PROSPECT_A,
      organizationId: ORG,
      status: "Queued",
    };
    current.jobs.push({
      prospectId: PROSPECT_A,
      organizationId: ORG,
      status: "queued",
    });
    assert.equal(
      applyReserveFreeConvert({
        world: current,
        organizationId: ORG,
        nowMs: 1_000 + FREE_CONVERT_RESERVATION_STALE_MS + 1,
        nextToken: "token-2",
      }).outcome,
      "already_reserved",
    );
    assert.equal(current.organization.prospectId, PROSPECT_A);
  });

  it("retryable failure stays reserved and terminal failure releases only that prospect", () => {
    const current = world({
      status: "reserved",
      prospectId: PROSPECT_A,
      reservedAt: 1_000,
      reservationToken: "token-1",
    });
    current.jobs.push({
      prospectId: PROSPECT_A,
      organizationId: ORG,
      status: "retryable",
    });
    current.prospects[PROSPECT_A] = {
      id: PROSPECT_A,
      organizationId: ORG,
      status: "Processing",
    };

    assert.equal(
      applyReserveFreeConvert({
        world: current,
        organizationId: ORG,
        nowMs: 1_000 + FREE_CONVERT_RESERVATION_STALE_MS + 1,
        nextToken: "token-2",
      }).outcome,
      "already_reserved",
    );

    current.jobs[0].status = "failed";
    current.prospects[PROSPECT_A].status = "Processing Failed";
    assert.deepEqual(
      applyReleaseFreeConvert({
        world: current,
        prospectId: PROSPECT_B,
      }),
      { outcome: "ignored" },
    );
    assert.deepEqual(
      applyReleaseFreeConvert({
        world: current,
        prospectId: PROSPECT_A,
      }),
      { outcome: "released" },
    );
    assert.equal(current.organization.status, "available");
    assert.equal(current.organization.prospectId, PROSPECT_A);
  });

  it("Ready consumes only the bound prospect and delete cannot reopen it", () => {
    const current = world({
      status: "reserved",
      prospectId: PROSPECT_A,
      reservedAt: 1_000,
      reservationToken: "token-1",
    });
    assert.deepEqual(
      applyConsumeFreeConvert({ world: current, prospectId: PROSPECT_B }),
      { outcome: "ignored" },
    );
    assert.deepEqual(
      applyConsumeFreeConvert({ world: current, prospectId: PROSPECT_A }),
      { outcome: "consumed" },
    );
    assert.equal(current.organization.prospectId, PROSPECT_A);
    assert.equal(current.organization.reservedAt, null);
    assert.equal(current.organization.reservationToken, null);
    delete current.prospects[PROSPECT_A];
    assert.equal(
      applyReserveFreeConvert({
        world: current,
        organizationId: ORG,
        nowMs: 9_000_000,
        nextToken: "after-delete",
      }).outcome,
      "already_consumed",
    );
  });
});

describe("FREE-11 Convert authority — SQL contract", () => {
  it("adds the smallest organization reservation columns and service-role RPCs", () => {
    assert.equal(existsSync(join(ROOT, MIGRATION)), true);
    const sql = read(MIGRATION);
    assert.match(sql, /add column if not exists free_convert_status text/);
    assert.match(sql, /add column if not exists free_convert_prospect_id uuid/);
    assert.match(sql, /add column if not exists free_convert_reserved_at timestamptz/);
    assert.match(
      sql,
      /add column if not exists free_convert_reservation_token uuid/,
    );
    assert.match(sql, /for update/);
    assert.match(sql, /interval '2 minutes'/);
    assert.match(sql, /create or replace function reserve_athena_free_convert/);
    assert.match(sql, /create or replace function bind_athena_free_convert_prospect/);
    assert.match(sql, /create or replace function consume_athena_free_convert/);
    assert.match(sql, /create or replace function release_athena_free_convert/);
    assert.match(sql, /grant execute on function reserve_athena_free_convert\(uuid\) to service_role/);
    assert.match(sql, /revoke all on function reserve_athena_free_convert\(uuid\) from authenticated/);
    assert.doesNotMatch(sql, /create table .*quota/i);
    assert.doesNotMatch(sql, /athena_plan\s*=/);
    assert.doesNotMatch(sql, /free_starter_|free_visibility_|free_traction_|social_calendars/);
    assert.match(sql, /from prospects p/);
    assert.match(sql, /from athena_generation_jobs j/);
    assert.match(sql, /v_prospect_status in \('Saved', 'Processing Failed'\)/);
  });

  it("does not execute the migration from application code", () => {
    const service = read("services/organization/freeConvertAuthority.ts");
    const orchestration = read("services/prospects/freeConvertOrchestration.ts");
    const page = read("app/prospects/page.tsx");
    for (const source of [service, orchestration, page]) {
      assert.doesNotMatch(source, /supabase migration|db push|exec\(sql/i);
    }
  });

  it("follow-up migration patches complete/fail and keeps service-role only", () => {
    assert.equal(existsSync(join(ROOT, FOLLOW_UP_MIGRATION)), true);
    const sql = read(FOLLOW_UP_MIGRATION);
    assert.match(sql, /create or replace function complete_athena_generation_job/);
    assert.match(sql, /create or replace function fail_athena_generation_job/);
    assert.match(
      sql,
      /perform consume_athena_free_convert\(v_job\.organization_id, v_prospect_id\)/,
    );
    const failFn = sql.slice(
      sql.lastIndexOf("create or replace function fail_athena_generation_job"),
    );
    const failedBranchStart = failFn.indexOf("if v_status = 'failed' then");
    const retryableBranch = failFn.slice(
      0,
      failedBranchStart >= 0 ? failedBranchStart : failFn.length,
    );
    assert.match(
      failFn.slice(failedBranchStart),
      /perform release_athena_free_convert/,
    );
    assert.doesNotMatch(retryableBranch, /perform release_athena_free_convert/);
    assert.match(
      sql,
      /grant execute on function complete_athena_generation_job\(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid\) to service_role/,
    );
    assert.match(
      sql,
      /revoke all on function complete_athena_generation_job\(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid\) from authenticated/,
    );
    assert.match(
      sql,
      /grant execute on function fail_athena_generation_job\(uuid, uuid, text, text, boolean, timestamptz, jsonb, text\) to service_role/,
    );
    assert.match(
      sql,
      /revoke all on function fail_athena_generation_job\(uuid, uuid, text, text, boolean, timestamptz, jsonb, text\) from authenticated/,
    );
  });
});

describe("FREE-11 Convert authority — plan continuity", () => {
  it("does not clear consumed when plan changes free → full → free", () => {
    const current = world({
      status: "consumed",
      prospectId: PROSPECT_A,
      reservedAt: null,
      reservationToken: null,
    });
    applyFreeConvertPlanChange({ world: current, nextPlan: "full" });
    applyFreeConvertPlanChange({ world: current, nextPlan: "free" });
    assert.equal(current.organization.status, "consumed");
    assert.equal(
      applyReserveFreeConvert({
        world: current,
        organizationId: ORG,
        nowMs: Date.now(),
        nextToken: "again",
      }).outcome,
      "already_consumed",
    );
  });
});
