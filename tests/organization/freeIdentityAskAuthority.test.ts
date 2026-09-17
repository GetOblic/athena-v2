/**
 * FREE-8 — organization-scoped Free Identity Ask reservation authority.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  FREE_IDENTITY_ASK_LIMIT,
  FREE_IDENTITY_ASK_RESERVATION_STALE_MS,
  emptyFreeIdentityAskState,
  resolveFreeIdentityAskPresentation,
} from "../../lib/organization/freeIdentityAsk";
import {
  applyConsumeFreeIdentityAsk,
  applyFreeIdentityAskPlanChange,
  applyReleaseFreeIdentityAsk,
  applyReserveFreeIdentityAsk,
} from "../../lib/organization/freeIdentityAskReservation";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20260917000002_add_organization_free_identity_ask.sql";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("FREE-8 Identity Ask authority", () => {
  it("defines the product limit once as 3", () => {
    assert.equal(FREE_IDENTITY_ASK_LIMIT, 3);
    const policy = read("lib/organization/freeIdentityAsk.ts");
    assert.match(policy, /export const FREE_IDENTITY_ASK_LIMIT = 3/);
    assert.equal(policy.split("FREE_IDENTITY_ASK_LIMIT = 3").length, 2);
    assert.doesNotMatch(
      read("app/api/identity/conversation/route.ts"),
      /FREE_IDENTITY_ASK_LIMIT\s*=\s*3|consumedCount\s*>=\s*3/,
    );
    assert.doesNotMatch(
      read("components/identity/IdentityConversationPanel.tsx"),
      /\b3 remaining\b|2 remaining|1 remaining/,
    );
  });

  it("keeps schema generic and organization-scoped", () => {
    assert.equal(existsSync(join(ROOT, MIGRATION)), true);
    const sql = read(MIGRATION);
    assert.match(sql, /free_identity_ask_consumed_count integer not null default 0/);
    assert.match(sql, /free_identity_ask_reserved_count integer not null default 0/);
    assert.match(sql, /free_identity_ask_reserved_at timestamptz/);
    assert.doesNotMatch(sql, /free_starter_/);
    assert.doesNotMatch(sql, /create table/i);
    assert.doesNotMatch(sql, /message_table|conversation_messages/);
    assert.doesNotMatch(sql, /FREE_IDENTITY_ASK_LIMIT|limit integer not null default 3/);
    assert.match(sql, /p_limit integer/);
  });

  it("reserves, consumes, and releases without decrementing consumed", () => {
    const state = emptyFreeIdentityAskState();
    const reserved = applyReserveFreeIdentityAsk({
      state,
      limit: FREE_IDENTITY_ASK_LIMIT,
      nowMs: 1_000,
    });
    assert.equal(reserved.outcome, "reserved");
    assert.equal(state.reservedCount, 1);
    assert.equal(state.consumedCount, 0);

    const consumed = applyConsumeFreeIdentityAsk({ state });
    assert.equal(consumed.outcome, "consumed");
    assert.equal(state.consumedCount, 1);
    assert.equal(state.reservedCount, 0);
    assert.equal(state.reservedAt, null);

    const released = applyReleaseFreeIdentityAsk({ state });
    assert.equal(released.outcome, "ignored");
    assert.equal(state.consumedCount, 1);
  });

  it("allows the second and third successful exchanges, then denies the fourth", () => {
    const state = emptyFreeIdentityAskState();
    for (let index = 1; index <= FREE_IDENTITY_ASK_LIMIT; index += 1) {
      const reserved = applyReserveFreeIdentityAsk({
        state,
        limit: FREE_IDENTITY_ASK_LIMIT,
        nowMs: index * 1_000,
      });
      assert.equal(reserved.outcome, "reserved", `exchange ${index}`);
      assert.equal(applyConsumeFreeIdentityAsk({ state }).outcome, "consumed");
      assert.equal(state.consumedCount, index);
    }

    const fourth = applyReserveFreeIdentityAsk({
      state,
      limit: FREE_IDENTITY_ASK_LIMIT,
      nowMs: 10_000,
    });
    assert.deepEqual(fourth, {
      outcome: "denied",
      reason: "exhausted",
      recovered: false,
      consumedCount: 3,
      reservedCount: 0,
    });
    assert.equal(state.consumedCount, 3);
  });

  it("releases on provider-style failure and allows retry", () => {
    const state = emptyFreeIdentityAskState();
    applyReserveFreeIdentityAsk({
      state,
      limit: FREE_IDENTITY_ASK_LIMIT,
      nowMs: 1_000,
    });
    assert.equal(applyReleaseFreeIdentityAsk({ state }).outcome, "released");
    assert.equal(state.consumedCount, 0);
    assert.equal(state.reservedCount, 0);

    const retry = applyReserveFreeIdentityAsk({
      state,
      limit: FREE_IDENTITY_ASK_LIMIT,
      nowMs: 2_000,
    });
    assert.equal(retry.outcome, "reserved");
    assert.equal(applyConsumeFreeIdentityAsk({ state }).outcome, "consumed");
    assert.equal(state.consumedCount, 1);
  });

  it("lets exactly one concurrent reservation win when one exchange remains", () => {
    const state = emptyFreeIdentityAskState();
    state.consumedCount = 2;
    const first = applyReserveFreeIdentityAsk({
      state,
      limit: FREE_IDENTITY_ASK_LIMIT,
      nowMs: 1_000,
    });
    const second = applyReserveFreeIdentityAsk({
      state,
      limit: FREE_IDENTITY_ASK_LIMIT,
      nowMs: 1_100,
    });
    assert.equal(first.outcome, "reserved");
    assert.deepEqual(second, {
      outcome: "denied",
      reason: "in_flight",
      recovered: false,
      consumedCount: 2,
      reservedCount: 1,
    });
    assert.equal(state.reservedCount, 1);
  });

  it("recovers a stale reservation during the next reserve", () => {
    assert.equal(FREE_IDENTITY_ASK_RESERVATION_STALE_MS, 120_000);
    const state = emptyFreeIdentityAskState();
    state.consumedCount = 2;
    applyReserveFreeIdentityAsk({
      state,
      limit: FREE_IDENTITY_ASK_LIMIT,
      nowMs: 1_000,
    });
    assert.equal(state.reservedCount, 1);

    const tooSoon = applyReserveFreeIdentityAsk({
      state,
      limit: FREE_IDENTITY_ASK_LIMIT,
      nowMs: 1_000 + 119_000,
    });
    assert.equal(tooSoon.outcome, "denied");
    assert.equal(tooSoon.recovered, false);

    const recovered = applyReserveFreeIdentityAsk({
      state,
      limit: FREE_IDENTITY_ASK_LIMIT,
      nowMs: 1_000 + 120_000,
    });
    assert.equal(recovered.outcome, "reserved");
    assert.equal(recovered.recovered, true);
    assert.equal(state.consumedCount, 2);
    assert.equal(state.reservedCount, 1);
  });

  it("retains consumed across plan changes and never resets it", () => {
    const state = emptyFreeIdentityAskState();
    state.consumedCount = 3;
    assert.equal(
      applyFreeIdentityAskPlanChange({ state, nextPlan: "full" }).consumedCount,
      3,
    );
    assert.equal(
      resolveFreeIdentityAskPresentation({
        athenaPlan: "full",
        trained: true,
        consumedCount: 3,
      }),
      "full",
    );
    assert.equal(
      applyFreeIdentityAskPlanChange({ state, nextPlan: "free" }).consumedCount,
      3,
    );
    assert.equal(
      resolveFreeIdentityAskPresentation({
        athenaPlan: "free",
        trained: true,
        consumedCount: 3,
      }),
      "exhausted",
    );
    assert.equal(
      resolveFreeIdentityAskPresentation({
        athenaPlan: "free",
        trained: true,
        consumedCount: 0,
      }),
      "available",
    );
  });

  it("reviews the additive service-role migration", () => {
    const sql = read(MIGRATION);
    const outsideFunctions = sql.replace(
      /create or replace function[\s\S]*?\$\$;/g,
      "",
    );
    assert.doesNotMatch(outsideFunctions, /^\s*update\b/im);
    assert.doesNotMatch(outsideFunctions, /^\s*delete\b/im);
    assert.doesNotMatch(outsideFunctions, /\bdrop table\b/i);
    assert.doesNotMatch(outsideFunctions, /\btruncate\b/i);
    assert.match(sql, /for update/);
    assert.match(sql, /interval '2 minutes'/);
    assert.equal((sql.match(/security definer/g) ?? []).length, 3);
    assert.equal((sql.match(/set search_path = public/g) ?? []).length, 3);
    assert.match(
      sql,
      /grant execute on function reserve_athena_free_identity_ask\(uuid, integer\) to service_role/,
    );
    assert.match(
      sql,
      /revoke all on function reserve_athena_free_identity_ask\(uuid, integer\) from authenticated/,
    );
    assert.match(
      sql,
      /grant execute on function consume_athena_free_identity_ask\(uuid\) to service_role/,
    );
    assert.match(
      sql,
      /grant execute on function release_athena_free_identity_ask\(uuid\) to service_role/,
    );
    assert.doesNotMatch(sql, /grant execute[^;]*authenticated/);
    assert.doesNotMatch(sql, /free_starter_/);
    assert.match(
      read("services/organization/freeIdentityAskAuthority.ts"),
      /reserve_athena_free_identity_ask/,
    );
  });
});
