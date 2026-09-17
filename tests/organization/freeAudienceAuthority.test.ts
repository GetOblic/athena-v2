import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  FREE_AUDIENCE_RESERVATION_STALE_MS,
  isFreeAudienceEligible,
  isFreeTrained,
  resolveFreeAudienceStatus,
} from "../../lib/organization/freeAudience";
import { evaluateFreeAudienceGeneration } from "../../lib/organization/freeAudienceGeneration";
import {
  applyBindFreeAudience,
  applyConsumeFreeAudience,
  applyFreeAudiencePlanChange,
  applyReleaseFreeAudience,
  applyReserveFreeAudience,
  emptyFreeAudienceOrganizationState,
  type FreeAudienceWorld,
} from "../../lib/organization/freeAudienceReservation";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20260917000008_add_organization_free_audience.sql";
const ORG = "11111111-1111-4111-8111-111111111111";
const PERSONA_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PERSONA_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function world(
  overrides: Partial<FreeAudienceWorld["organization"]> = {},
): FreeAudienceWorld {
  return {
    organization: {
      ...emptyFreeAudienceOrganizationState(),
      ...overrides,
    },
    personas: {},
  };
}

describe("FREE-13 Audience authority — eligibility", () => {
  it("Full bypasses and only trained Free can reserve", () => {
    assert.equal(resolveFreeAudienceStatus(null), "available");
    assert.equal(isFreeTrained({ athenaPlan: "free", defineKind: "ready" }), true);
    assert.deepEqual(
      evaluateFreeAudienceGeneration({
        athenaPlan: "full",
        defineKind: "ready",
        action: "suggest",
      }),
      { allow: true },
    );
    assert.equal(
      evaluateFreeAudienceGeneration({
        athenaPlan: "free",
        defineKind: "needs_setup",
        action: "suggest",
      }).allow,
      false,
    );
    assert.equal(
      isFreeAudienceEligible({
        athenaPlan: "free",
        defineKind: "ready",
        audienceStatus: "available",
      }),
      true,
    );
  });

  it("denies consumed / reserved Suggest and allows persist while reserved", () => {
    assert.equal(
      evaluateFreeAudienceGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        audienceStatus: "consumed",
        action: "suggest",
      }).allow,
      false,
    );
    assert.equal(
      evaluateFreeAudienceGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        audienceStatus: "reserved",
        action: "suggest",
      }).allow,
      false,
    );
    assert.deepEqual(
      evaluateFreeAudienceGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        audienceStatus: "reserved",
        action: "persist",
      }),
      { allow: true },
    );
  });

  it("denies Free CSV before any persist", () => {
    for (const action of ["csv", "csv_preview"] as const) {
      const decision = evaluateFreeAudienceGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        audienceStatus: "available",
        action,
      });
      assert.equal(decision.allow, false);
      if (decision.allow) return;
      assert.equal(decision.code, "FREE_AUDIENCE_CSV_DENIED");
      assert.equal(decision.httpStatus, 403);
    }
    assert.deepEqual(
      evaluateFreeAudienceGeneration({
        athenaPlan: "full",
        action: "csv",
      }),
      { allow: true },
    );
  });
});

describe("FREE-13 Audience authority — reservation machine", () => {
  it("compare-and-swap reserve: only one unbound reservation", () => {
    const current = world();
    const first = applyReserveFreeAudience({
      world: current,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "token-1",
    });
    assert.equal(first.outcome, "reserved");
    const second = applyReserveFreeAudience({
      world: current,
      organizationId: ORG,
      nowMs: 1_100,
      nextToken: "token-2",
    });
    assert.equal(second.outcome, "already_reserved");
  });

  it("bind + consume succeeds once; second bind conflicts", () => {
    const current = world();
    applyReserveFreeAudience({
      world: current,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "token-1",
    });
    assert.deepEqual(
      applyBindFreeAudience({
        world: current,
        reservationToken: "token-1",
        personaId: PERSONA_A,
      }),
      { outcome: "bound", personaId: PERSONA_A },
    );
    assert.deepEqual(
      applyBindFreeAudience({
        world: current,
        reservationToken: "token-1",
        personaId: PERSONA_B,
      }),
      { outcome: "conflict" },
    );
    assert.deepEqual(
      applyConsumeFreeAudience({ world: current, personaId: PERSONA_A }),
      { outcome: "consumed" },
    );
    assert.equal(current.organization.status, "consumed");
  });

  it("provider-style release restores available; consume does not", () => {
    const current = world();
    applyReserveFreeAudience({
      world: current,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "token-1",
    });
    assert.deepEqual(
      applyReleaseFreeAudience({
        world: current,
        reservationToken: "token-1",
      }),
      { outcome: "released" },
    );
    assert.equal(current.organization.status, "available");

    applyReserveFreeAudience({
      world: current,
      organizationId: ORG,
      nowMs: 2_000,
      nextToken: "token-2",
    });
    applyBindFreeAudience({
      world: current,
      reservationToken: "token-2",
      personaId: PERSONA_A,
    });
    applyConsumeFreeAudience({ world: current, personaId: PERSONA_A });
    assert.deepEqual(
      applyReleaseFreeAudience({
        world: current,
        personaId: PERSONA_A,
      }),
      { outcome: "ignored" },
    );
    assert.equal(current.organization.status, "consumed");
  });

  it("delete does not restore entitlement", () => {
    const current = world();
    current.personas[PERSONA_A] = { id: PERSONA_A, organizationId: ORG };
    applyReserveFreeAudience({
      world: current,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "token-1",
    });
    assert.equal(current.organization.status, "consumed");
    delete current.personas[PERSONA_A];
    assert.equal(
      applyReserveFreeAudience({
        world: current,
        organizationId: ORG,
        nowMs: 9_000_000,
        nextToken: "after-delete",
      }).outcome,
      "already_consumed",
    );
  });

  it("recovers only a stale unbound reservation", () => {
    const current = world({
      status: "reserved",
      reservedAt: 1_000,
      reservationToken: "old",
    });
    assert.equal(
      applyReserveFreeAudience({
        world: current,
        organizationId: ORG,
        nowMs: 1_000 + FREE_AUDIENCE_RESERVATION_STALE_MS - 1,
        nextToken: "too-soon",
      }).outcome,
      "already_reserved",
    );
    const recovered = applyReserveFreeAudience({
      world: current,
      organizationId: ORG,
      nowMs: 1_000 + FREE_AUDIENCE_RESERVATION_STALE_MS,
      nextToken: "fresh",
    });
    assert.equal(recovered.outcome, "reserved");
    if (recovered.outcome !== "reserved") return;
    assert.equal(recovered.recovered, true);
    assert.equal(recovered.reservationToken, "fresh");
  });

  it("historical persona lazily consumes before a new reserve", () => {
    const current = world();
    current.personas[PERSONA_B] = { id: PERSONA_B, organizationId: ORG };
    assert.equal(
      applyReserveFreeAudience({
        world: current,
        organizationId: ORG,
        nowMs: 1_000,
        nextToken: "late",
      }).outcome,
      "already_consumed",
    );
    assert.equal(current.organization.personaId, PERSONA_B);
  });
});

describe("FREE-13 Audience authority — SQL contract", () => {
  it("adds the smallest organization reservation columns and service-role RPCs", () => {
    assert.equal(existsSync(join(ROOT, MIGRATION)), true);
    const sql = read(MIGRATION);
    assert.match(sql, /add column if not exists free_audience_status text/);
    assert.match(sql, /add column if not exists free_audience_persona_id uuid/);
    assert.match(sql, /add column if not exists free_audience_reserved_at timestamptz/);
    assert.match(
      sql,
      /add column if not exists free_audience_reservation_token uuid/,
    );
    assert.match(sql, /for update/);
    assert.match(sql, /interval '2 minutes'/);
    assert.match(sql, /create or replace function reserve_athena_free_audience/);
    assert.match(sql, /create or replace function bind_athena_free_audience_persona/);
    assert.match(sql, /create or replace function consume_athena_free_audience/);
    assert.match(sql, /create or replace function release_athena_free_audience/);
    assert.match(
      sql,
      /grant execute on function reserve_athena_free_audience\(uuid\) to service_role/,
    );
    assert.match(
      sql,
      /revoke all on function reserve_athena_free_audience\(uuid\) from authenticated/,
    );
    assert.doesNotMatch(sql, /create table .*quota/i);
    assert.doesNotMatch(sql, /athena_plan\s*=/);
    assert.match(sql, /from personas p/);
  });

  it("does not execute the migration from application code", () => {
    const service = read("services/organization/freeAudienceAuthority.ts");
    const orchestration = read("services/personas/freeAudienceOrchestration.ts");
    const page = read("app/personas/page.tsx");
    for (const source of [service, orchestration, page]) {
      assert.doesNotMatch(source, /supabase migration|db push|exec\(sql/i);
    }
  });
});

describe("FREE-13 Audience authority — plan continuity", () => {
  it("does not clear consumed when plan changes free → full → free", () => {
    const current = world({
      status: "consumed",
      personaId: PERSONA_A,
    });
    assert.equal(
      applyFreeAudiencePlanChange({ world: current, nextPlan: "full" }).status,
      "consumed",
    );
    assert.equal(
      applyFreeAudiencePlanChange({ world: current, nextPlan: "free" }).status,
      "consumed",
    );
  });
});
