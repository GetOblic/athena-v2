import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  FREE_TRACTION_RESERVATION_STALE_MS,
  isFreeTrained,
  isFreeTractionEligible,
  resolveFreeTractionStatus,
} from "../../lib/organization/freeTraction";
import {
  evaluateFreeTractionGeneration,
} from "../../lib/organization/freeTractionGeneration";
import {
  applyBindFreeTraction,
  applyConsumeFreeTraction,
  applyFreeTractionPlanChange,
  applyReleaseFreeTraction,
  applyReserveFreeTraction,
  emptyFreeTractionOrganizationState,
  type FreeTractionWorld,
} from "../../lib/organization/freeTractionReservation";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20260917000004_add_organization_free_traction.sql";
const ORG = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CAMPAIGN_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function world(
  overrides: Partial<FreeTractionWorld["organization"]> = {},
): FreeTractionWorld {
  return {
    organization: {
      ...emptyFreeTractionOrganizationState(),
      ...overrides,
    },
    campaigns: {},
    jobs: [],
  };
}

describe("FREE-10 Traction authority — eligibility", () => {
  it("Full bypasses and only trained Free can reserve", () => {
    assert.equal(resolveFreeTractionStatus(null), "available");
    assert.equal(isFreeTrained({ athenaPlan: "free", defineKind: "ready" }), true);
    assert.equal(
      isFreeTrained({ athenaPlan: "free", defineKind: "needs_setup" }),
      false,
    );
    assert.deepEqual(
      evaluateFreeTractionGeneration({
        athenaPlan: "full",
        defineKind: "ready",
        action: "create",
      }),
      { allow: true },
    );
    assert.equal(
      evaluateFreeTractionGeneration({
        athenaPlan: "free",
        defineKind: "needs_setup",
        action: "create",
      }).allow,
      false,
    );
    assert.equal(
      isFreeTractionEligible({
        athenaPlan: "free",
        defineKind: "ready",
        tractionStatus: "available",
      }),
      true,
    );
  });

  it("denies consumed / reserved create", () => {
    assert.equal(
      evaluateFreeTractionGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        tractionStatus: "consumed",
        action: "create",
      }).allow,
      false,
    );
    assert.equal(
      evaluateFreeTractionGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        tractionStatus: "reserved",
        action: "create",
      }).allow,
      false,
    );
  });
});

describe("FREE-10 Traction authority — reservation machine", () => {
  it("first reservation succeeds and binds the exact campaign", () => {
    const current = world();
    const reserved = applyReserveFreeTraction({
      world: current,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "token-1",
    });
    assert.equal(reserved.outcome, "reserved");
    if (reserved.outcome !== "reserved") return;
    assert.equal(reserved.recovered, false);
    assert.equal(current.organization.campaignId, null);

    assert.deepEqual(
      applyBindFreeTraction({
        world: current,
        reservationToken: "token-1",
        campaignId: CAMPAIGN_A,
      }),
      { outcome: "bound", campaignId: CAMPAIGN_A },
    );
    assert.equal(current.organization.campaignId, CAMPAIGN_A);
  });

  it("second concurrent reserve is denied without a second bind", () => {
    const current = world();
    const first = applyReserveFreeTraction({
      world: current,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "token-1",
    });
    const second = applyReserveFreeTraction({
      world: current,
      organizationId: ORG,
      nowMs: 1_100,
      nextToken: "token-2",
    });
    assert.equal(first.outcome, "reserved");
    assert.equal(second.outcome, "already_reserved");
    assert.deepEqual(
      applyBindFreeTraction({
        world: current,
        reservationToken: "token-2",
        campaignId: CAMPAIGN_B,
      }),
      { outcome: "conflict" },
    );
  });

  it("wrong token cannot bind and a different campaign cannot replace bind", () => {
    const current = world();
    applyReserveFreeTraction({
      world: current,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "token-1",
    });
    assert.deepEqual(
      applyBindFreeTraction({
        world: current,
        reservationToken: "wrong",
        campaignId: CAMPAIGN_A,
      }),
      { outcome: "conflict" },
    );
    assert.deepEqual(
      applyBindFreeTraction({
        world: current,
        reservationToken: "token-1",
        campaignId: CAMPAIGN_A,
      }),
      { outcome: "bound", campaignId: CAMPAIGN_A },
    );
    assert.deepEqual(
      applyBindFreeTraction({
        world: current,
        reservationToken: "token-1",
        campaignId: CAMPAIGN_B,
      }),
      { outcome: "conflict" },
    );
    assert.equal(current.organization.campaignId, CAMPAIGN_A);
  });

  it("historical Ready lazily consumes and failed historical alone does not", () => {
    const ready = world();
    ready.campaigns[CAMPAIGN_B] = {
      id: CAMPAIGN_B,
      organizationId: ORG,
      status: "Ready",
    };
    assert.equal(
      applyReserveFreeTraction({
        world: ready,
        organizationId: ORG,
        nowMs: 1_000,
        nextToken: "token-1",
      }).outcome,
      "already_consumed",
    );
    assert.equal(ready.organization.status, "consumed");
    assert.equal(ready.organization.campaignId, CAMPAIGN_B);

    const failedOnly = world();
    failedOnly.campaigns[CAMPAIGN_A] = {
      id: CAMPAIGN_A,
      organizationId: ORG,
      status: "Processing Failed",
    };
    const reserved = applyReserveFreeTraction({
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
      campaignId: null,
      reservedAt: 1_000,
      reservationToken: "old-token",
    });
    assert.equal(
      applyReserveFreeTraction({
        world: unbound,
        organizationId: ORG,
        nowMs: 1_000 + FREE_TRACTION_RESERVATION_STALE_MS - 1,
        nextToken: "fresh",
      }).outcome,
      "already_reserved",
    );
    const recovered = applyReserveFreeTraction({
      world: unbound,
      organizationId: ORG,
      nowMs: 1_000 + FREE_TRACTION_RESERVATION_STALE_MS,
      nextToken: "fresh",
    });
    assert.equal(recovered.outcome, "reserved");
    if (recovered.outcome !== "reserved") return;
    assert.equal(recovered.recovered, true);

    const leftoverReady = world({
      status: "reserved",
      campaignId: CAMPAIGN_A,
      reservedAt: 1_000,
      reservationToken: "token-1",
    });
    leftoverReady.campaigns[CAMPAIGN_A] = {
      id: CAMPAIGN_A,
      organizationId: ORG,
      status: "Ready",
    };
    assert.equal(
      applyReserveFreeTraction({
        world: leftoverReady,
        organizationId: ORG,
        nowMs: 1_000 + FREE_TRACTION_RESERVATION_STALE_MS,
        nextToken: "too-late",
      }).outcome,
      "already_consumed",
    );
  });

  it("bound retryable campaign does not create a second campaign", () => {
    const current = world({
      status: "reserved",
      campaignId: CAMPAIGN_A,
      reservedAt: 1_000,
      reservationToken: "token-1",
    });
    current.campaigns[CAMPAIGN_A] = {
      id: CAMPAIGN_A,
      organizationId: ORG,
      status: "Queued",
    };
    current.jobs.push({
      campaignId: CAMPAIGN_A,
      organizationId: ORG,
      status: "queued",
    });
    assert.equal(
      applyReserveFreeTraction({
        world: current,
        organizationId: ORG,
        nowMs: 1_000 + FREE_TRACTION_RESERVATION_STALE_MS + 1,
        nextToken: "token-2",
      }).outcome,
      "already_reserved",
    );
    assert.equal(current.organization.campaignId, CAMPAIGN_A);
  });

  it("retryable failure stays reserved and terminal failure releases only that campaign", () => {
    const current = world({
      status: "reserved",
      campaignId: CAMPAIGN_A,
      reservedAt: 1_000,
      reservationToken: "token-1",
    });
    current.jobs.push({
      campaignId: CAMPAIGN_A,
      organizationId: ORG,
      status: "retryable",
    });
    current.campaigns[CAMPAIGN_A] = {
      id: CAMPAIGN_A,
      organizationId: ORG,
      status: "Processing",
    };

    assert.equal(
      applyReserveFreeTraction({
        world: current,
        organizationId: ORG,
        nowMs: 1_000 + FREE_TRACTION_RESERVATION_STALE_MS + 1,
        nextToken: "token-2",
      }).outcome,
      "already_reserved",
    );

    current.jobs[0].status = "failed";
    current.campaigns[CAMPAIGN_A].status = "Processing Failed";
    assert.deepEqual(
      applyReleaseFreeTraction({
        world: current,
        campaignId: CAMPAIGN_B,
      }),
      { outcome: "ignored" },
    );
    assert.deepEqual(
      applyReleaseFreeTraction({
        world: current,
        campaignId: CAMPAIGN_A,
      }),
      { outcome: "released" },
    );
    assert.equal(current.organization.status, "available");
    assert.equal(current.organization.campaignId, CAMPAIGN_A);
  });

  it("Ready consumes only the bound campaign and delete cannot reopen it", () => {
    const current = world({
      status: "reserved",
      campaignId: CAMPAIGN_A,
      reservedAt: 1_000,
      reservationToken: "token-1",
    });
    assert.deepEqual(
      applyConsumeFreeTraction({ world: current, campaignId: CAMPAIGN_B }),
      { outcome: "ignored" },
    );
    assert.deepEqual(
      applyConsumeFreeTraction({ world: current, campaignId: CAMPAIGN_A }),
      { outcome: "consumed" },
    );
    assert.equal(current.organization.campaignId, CAMPAIGN_A);
    assert.equal(current.organization.reservedAt, null);
    assert.equal(current.organization.reservationToken, null);
    delete current.campaigns[CAMPAIGN_A];
    assert.equal(
      applyReserveFreeTraction({
        world: current,
        organizationId: ORG,
        nowMs: 9_000_000,
        nextToken: "after-delete",
      }).outcome,
      "already_consumed",
    );
  });
});

describe("FREE-10 Traction authority — SQL contract", () => {
  it("adds the smallest organization reservation columns and service-role RPCs", () => {
    assert.equal(existsSync(join(ROOT, MIGRATION)), true);
    const sql = read(MIGRATION);
    assert.match(sql, /add column if not exists free_traction_status text/);
    assert.match(sql, /add column if not exists free_traction_campaign_id uuid/);
    assert.match(sql, /add column if not exists free_traction_reserved_at timestamptz/);
    assert.match(
      sql,
      /add column if not exists free_traction_reservation_token uuid/,
    );
    assert.match(sql, /for update/);
    assert.match(sql, /interval '2 minutes'/);
    assert.match(sql, /create or replace function reserve_athena_free_traction/);
    assert.match(sql, /create or replace function bind_athena_free_traction_campaign/);
    assert.match(sql, /create or replace function consume_athena_free_traction/);
    assert.match(sql, /create or replace function release_athena_free_traction/);
    assert.match(sql, /grant execute on function reserve_athena_free_traction\(uuid\) to service_role/);
    assert.match(sql, /revoke all on function reserve_athena_free_traction\(uuid\) from authenticated/);
    assert.doesNotMatch(sql, /create table .*quota/i);
    assert.doesNotMatch(sql, /athena_plan\s*=/);
    assert.doesNotMatch(sql, /package_json\s*=\s*'free'/);
    assert.match(
      sql,
      /perform consume_athena_free_traction\(v_job\.organization_id, v_job\.campaign_id\)/,
    );
    const failFn = sql.slice(
      sql.lastIndexOf("create or replace function fail_athena_ad_generation_job"),
    );
    const failedBranchStart = failFn.indexOf("if v_status = 'failed' then");
    const retryableBranch = failFn.slice(failFn.indexOf("else", failedBranchStart));
    assert.match(
      failFn.slice(failedBranchStart, failFn.indexOf("else", failedBranchStart)),
      /perform release_athena_free_traction/,
    );
    assert.doesNotMatch(retryableBranch, /perform release_athena_free_traction/);
    assert.doesNotMatch(sql, /update ad_campaigns[\s\S]{0,80}free_traction/);
    assert.match(sql, /from ad_campaigns c/);
    assert.doesNotMatch(sql, /free_starter_|free_visibility_|social_calendars/);
  });

  it("does not execute the migration from application code", () => {
    const service = read("services/organization/freeTractionAuthority.ts");
    const orchestration = read("services/ads/freeTractionOrchestration.ts");
    const page = read("app/ads/page.tsx");
    for (const source of [service, orchestration, page]) {
      assert.doesNotMatch(source, /supabase migration|db push|exec\(sql/i);
    }
  });
});

describe("FREE-10 Traction authority — plan continuity", () => {
  it("does not clear consumed when plan changes free → full → free", () => {
    const current = world({
      status: "consumed",
      campaignId: CAMPAIGN_A,
      reservedAt: null,
      reservationToken: null,
    });
    applyFreeTractionPlanChange({ world: current, nextPlan: "full" });
    applyFreeTractionPlanChange({ world: current, nextPlan: "free" });
    assert.equal(current.organization.status, "consumed");
    assert.equal(
      applyReserveFreeTraction({
        world: current,
        organizationId: ORG,
        nowMs: Date.now(),
        nextToken: "again",
      }).outcome,
      "already_consumed",
    );
  });
});
