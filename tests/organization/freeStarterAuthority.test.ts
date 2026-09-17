import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  FREE_STARTER_RESERVATION_STALE_MS,
  isFreeStarterEligible,
  isFreeTrained,
  resolveFreeStarterStatus,
} from "../../lib/organization/freeStarter";
import {
  applyBindFreeStarter,
  applyConsumeFreeStarter,
  applyPlanChange,
  applyReleaseFreeStarter,
  applyReserveFreeStarter,
  emptyFreeStarterOrganizationState,
  type FreeStarterWorld,
} from "../../lib/organization/freeStarterReservation";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20260917000001_add_organization_free_starter.sql";
const ORG = "11111111-1111-4111-8111-111111111111";
const CAL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CAL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function world(
  overrides: Partial<FreeStarterWorld["organization"]> = {},
): FreeStarterWorld {
  return {
    organization: {
      ...emptyFreeStarterOrganizationState(),
      ...overrides,
    },
    calendars: {},
    jobs: [],
  };
}

describe("FREE-5 starter authority — eligibility", () => {
  it("starts available and only trained Free can reserve", () => {
    assert.equal(resolveFreeStarterStatus(null), "available");
    assert.equal(resolveFreeStarterStatus(undefined), "available");
    assert.equal(isFreeTrained({ athenaPlan: "free", defineKind: "ready" }), true);
    assert.equal(
      isFreeTrained({ athenaPlan: "free", defineKind: "needs_setup" }),
      false,
    );
    assert.equal(isFreeTrained({ athenaPlan: "full", defineKind: "ready" }), false);
    assert.equal(
      isFreeStarterEligible({
        athenaPlan: "free",
        defineKind: "ready",
        starterStatus: "available",
      }),
      true,
    );
    assert.equal(
      isFreeStarterEligible({
        athenaPlan: "free",
        defineKind: "needs_setup",
        starterStatus: "available",
      }),
      false,
    );
    assert.equal(
      isFreeStarterEligible({
        athenaPlan: "full",
        defineKind: "ready",
        starterStatus: "available",
      }),
      false,
    );
  });
});

describe("FREE-5 starter authority — reservation machine", () => {
  it("first reservation succeeds and binds to the exact calendar", () => {
    const current = world();
    const reserved = applyReserveFreeStarter({
      world: current,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "token-1",
    });
    assert.equal(reserved.outcome, "reserved");
    if (reserved.outcome !== "reserved") return;
    assert.equal(reserved.recovered, false);
    assert.equal(current.organization.status, "reserved");
    assert.equal(current.organization.reservationToken, "token-1");
    assert.equal(current.organization.calendarId, null);

    const bound = applyBindFreeStarter({
      world: current,
      reservationToken: "token-1",
      calendarId: CAL_A,
    });
    assert.deepEqual(bound, { outcome: "bound", calendarId: CAL_A });
    assert.equal(current.organization.calendarId, CAL_A);
  });

  it("concurrent or double reservation loses without a second calendar bind", () => {
    const current = world();
    const first = applyReserveFreeStarter({
      world: current,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "token-1",
    });
    const second = applyReserveFreeStarter({
      world: current,
      organizationId: ORG,
      nowMs: 1_100,
      nextToken: "token-2",
    });
    assert.equal(first.outcome, "reserved");
    assert.equal(second.outcome, "already_reserved");
    assert.equal(current.organization.reservationToken, "token-1");

    assert.deepEqual(
      applyBindFreeStarter({
        world: current,
        reservationToken: "token-2",
        calendarId: CAL_B,
      }),
      { outcome: "conflict" },
    );
    assert.deepEqual(
      applyBindFreeStarter({
        world: current,
        reservationToken: "token-1",
        calendarId: CAL_A,
      }),
      { outcome: "bound", calendarId: CAL_A },
    );
    assert.equal(current.organization.calendarId, CAL_A);
  });

  it("Ready consumes only the reserved calendar and viewing does not reopen it", () => {
    const current = world({
      status: "reserved",
      calendarId: CAL_A,
      reservedAt: 1_000,
      reservationToken: "token-1",
    });
    assert.deepEqual(applyConsumeFreeStarter({ world: current, calendarId: CAL_B }), {
      outcome: "ignored",
    });
    assert.equal(current.organization.status, "reserved");
    assert.deepEqual(applyConsumeFreeStarter({ world: current, calendarId: CAL_A }), {
      outcome: "consumed",
    });
    assert.equal(current.organization.status, "consumed");
    assert.equal(current.organization.calendarId, CAL_A);
    assert.deepEqual(applyConsumeFreeStarter({ world: current, calendarId: CAL_A }), {
      outcome: "already",
    });
    assert.equal(
      applyReserveFreeStarter({
        world: current,
        organizationId: ORG,
        nowMs: 9_000_000,
        nextToken: "token-late",
      }).outcome,
      "already_consumed",
    );
  });

  it("retryable worker failure stays reserved and terminal failure releases only that reservation", () => {
    const current = world({
      status: "reserved",
      calendarId: CAL_A,
      reservedAt: 1_000,
      reservationToken: "token-1",
    });
    current.jobs.push({
      calendarId: CAL_A,
      organizationId: ORG,
      status: "retryable",
    });
    current.calendars[CAL_A] = {
      id: CAL_A,
      organizationId: ORG,
      status: "Processing",
    };

    assert.equal(
      applyReserveFreeStarter({
        world: current,
        organizationId: ORG,
        nowMs: 1_000 + FREE_STARTER_RESERVATION_STALE_MS + 1,
        nextToken: "token-2",
      }).outcome,
      "already_reserved",
    );

    assert.deepEqual(
      applyReleaseFreeStarter({
        world: current,
        calendarId: CAL_B,
      }),
      { outcome: "ignored" },
    );
    assert.equal(current.organization.status, "reserved");

    current.jobs[0].status = "failed";
    current.calendars[CAL_A].status = "Processing Failed";
    assert.deepEqual(
      applyReleaseFreeStarter({
        world: current,
        calendarId: CAL_A,
      }),
      { outcome: "released" },
    );
    assert.equal(current.organization.status, "available");
    assert.equal(current.organization.calendarId, CAL_A);
  });

  it("recovers a stale crash reservation and consumes leftover Ready on the next reserve", () => {
    const unbound = world({
      status: "reserved",
      calendarId: null,
      reservedAt: 1_000,
      reservationToken: "old-token",
    });
    assert.equal(
      applyReserveFreeStarter({
        world: unbound,
        organizationId: ORG,
        nowMs: 1_000 + FREE_STARTER_RESERVATION_STALE_MS - 1,
        nextToken: "fresh",
      }).outcome,
      "already_reserved",
    );
    const recovered = applyReserveFreeStarter({
      world: unbound,
      organizationId: ORG,
      nowMs: 1_000 + FREE_STARTER_RESERVATION_STALE_MS,
      nextToken: "fresh",
    });
    assert.equal(recovered.outcome, "reserved");
    if (recovered.outcome !== "reserved") return;
    assert.equal(recovered.recovered, true);
    assert.equal(unbound.organization.reservationToken, "fresh");

    const leftoverReady = world({
      status: "reserved",
      calendarId: CAL_A,
      reservedAt: 1_000,
      reservationToken: "token-1",
    });
    leftoverReady.calendars[CAL_A] = {
      id: CAL_A,
      organizationId: ORG,
      status: "Ready",
    };
    assert.equal(
      applyReserveFreeStarter({
        world: leftoverReady,
        organizationId: ORG,
        nowMs: 1_000 + FREE_STARTER_RESERVATION_STALE_MS,
        nextToken: "too-late",
      }).outcome,
      "already_consumed",
    );
    assert.equal(leftoverReady.organization.status, "consumed");
  });
});

describe("FREE-5 starter authority — plan continuity", () => {
  it("does not clear consumed when plan changes free → full → free", () => {
    const current = world({
      status: "consumed",
      calendarId: CAL_A,
      reservedAt: null,
      reservationToken: null,
    });
    applyPlanChange({ world: current, nextPlan: "full" });
    applyPlanChange({ world: current, nextPlan: "free" });
    assert.equal(current.organization.status, "consumed");
    assert.equal(current.organization.calendarId, CAL_A);
    assert.equal(
      applyReserveFreeStarter({
        world: current,
        organizationId: ORG,
        nowMs: Date.now(),
        nextToken: "again",
      }).outcome,
      "already_consumed",
    );
  });
});

describe("FREE-5 starter authority — SQL contract", () => {
  it("adds the smallest organization reservation columns and service-role RPCs", () => {
    assert.equal(existsSync(join(ROOT, MIGRATION)), true);
    const sql = read(MIGRATION);
    assert.match(sql, /add column if not exists free_starter_status text/);
    assert.match(sql, /add column if not exists free_starter_calendar_id uuid/);
    assert.match(sql, /add column if not exists free_starter_reserved_at timestamptz/);
    assert.match(
      sql,
      /add column if not exists free_starter_reservation_token uuid/,
    );
    assert.match(sql, /for update/);
    assert.match(sql, /interval '2 minutes'/);
    assert.match(sql, /create or replace function reserve_athena_free_starter/);
    assert.match(sql, /create or replace function bind_athena_free_starter_calendar/);
    assert.match(sql, /create or replace function consume_athena_free_starter/);
    assert.match(sql, /create or replace function release_athena_free_starter/);
    assert.match(sql, /grant execute on function reserve_athena_free_starter\(uuid\) to service_role/);
    assert.match(sql, /revoke all on function reserve_athena_free_starter\(uuid\) from authenticated/);
    assert.doesNotMatch(sql, /create table .*quota/i);
    assert.doesNotMatch(sql, /athena_plan\s*=/);
    assert.match(sql, /perform consume_athena_free_starter\(v_job\.organization_id, v_job\.calendar_id\)/);
    assert.match(sql, /perform release_athena_free_starter\(/);
    const failFn = sql.slice(sql.lastIndexOf("create or replace function fail_athena_social_calendar_generation_job"));
    const failedBranchStart = failFn.indexOf("if v_status = 'failed' then");
    const retryableBranch = failFn.slice(failFn.indexOf("else", failedBranchStart));
    assert.match(failFn, /if v_status = 'failed' then/);
    assert.match(
      failFn.slice(failedBranchStart, failFn.indexOf("else", failedBranchStart)),
      /perform release_athena_free_starter/,
    );
    assert.doesNotMatch(retryableBranch, /perform release_athena_free_starter/);
  });

  it("does not execute the migration from application code", () => {
    const service = read("services/organization/freeStarterAuthority.ts");
    const page = read("app/page.tsx");
    const home = read("services/home/freeStarterHomeReadService.ts");
    for (const source of [service, page, home]) {
      assert.doesNotMatch(source, /supabase migration|db push|exec\(sql/i);
    }
  });
});
