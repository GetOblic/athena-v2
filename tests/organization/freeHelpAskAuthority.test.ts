/**
 * FREE-12 — organization-scoped Free Help Ask reservation authority.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  FREE_HELP_ASK_LIMIT,
  FREE_HELP_ASK_RESERVATION_STALE_MS,
  emptyFreeHelpAskState,
  resolveFreeHelpAskPresentation,
} from "../../lib/organization/freeHelpAsk";
import {
  applyConsumeFreeHelpAsk,
  applyFreeHelpAskPlanChange,
  applyReleaseFreeHelpAsk,
  applyReserveFreeHelpAsk,
} from "../../lib/organization/freeHelpAskReservation";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20260917000007_add_organization_free_help_ask.sql";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("FREE-12 Help Ask authority", () => {
  it("defines the product limit once as 1", () => {
    assert.equal(FREE_HELP_ASK_LIMIT, 1);
    const policy = read("lib/organization/freeHelpAsk.ts");
    assert.match(policy, /export const FREE_HELP_ASK_LIMIT = 1/);
    assert.equal(policy.split("FREE_HELP_ASK_LIMIT = 1").length, 2);
    assert.doesNotMatch(
      read("app/api/getting-started/conversation/route.ts"),
      /FREE_HELP_ASK_LIMIT\s*=\s*1|consumedCount\s*>=\s*1/,
    );
    assert.doesNotMatch(
      read("components/getting-started/GettingStartedConversationPanel.tsx"),
      /\b1 remaining\b|0 remaining/,
    );
  });

  it("keeps schema generic, organization-scoped, and separate from Identity Ask", () => {
    assert.equal(existsSync(join(ROOT, MIGRATION)), true);
    const sql = read(MIGRATION);
    assert.match(sql, /free_help_ask_consumed_count integer not null default 0/);
    assert.match(sql, /free_help_ask_reserved_count integer not null default 0/);
    assert.match(sql, /free_help_ask_reserved_at timestamptz/);
    assert.doesNotMatch(sql, /free_identity_ask_/);
    assert.doesNotMatch(sql, /free_starter_/);
    assert.doesNotMatch(sql, /create table/i);
    assert.doesNotMatch(sql, /message_table|conversation_messages/);
    assert.doesNotMatch(sql, /FREE_HELP_ASK_LIMIT|limit integer not null default 1/);
    assert.match(sql, /p_limit integer/);
  });

  it("reserves, consumes, and releases without decrementing consumed", () => {
    const state = emptyFreeHelpAskState();
    const reserved = applyReserveFreeHelpAsk({
      state,
      limit: FREE_HELP_ASK_LIMIT,
      nowMs: 1_000,
    });
    assert.equal(reserved.outcome, "reserved");
    assert.equal(state.reservedCount, 1);
    assert.equal(state.consumedCount, 0);

    const consumed = applyConsumeFreeHelpAsk({ state });
    assert.equal(consumed.outcome, "consumed");
    assert.equal(state.consumedCount, 1);
    assert.equal(state.reservedCount, 0);
    assert.equal(state.reservedAt, null);

    const released = applyReleaseFreeHelpAsk({ state });
    assert.equal(released.outcome, "ignored");
    assert.equal(state.consumedCount, 1);
  });

  it("denies the second reservation after one successful exchange", () => {
    const state = emptyFreeHelpAskState();
    const reserved = applyReserveFreeHelpAsk({
      state,
      limit: FREE_HELP_ASK_LIMIT,
      nowMs: 1_000,
    });
    assert.equal(reserved.outcome, "reserved");
    assert.equal(applyConsumeFreeHelpAsk({ state }).outcome, "consumed");
    assert.equal(state.consumedCount, 1);

    const second = applyReserveFreeHelpAsk({
      state,
      limit: FREE_HELP_ASK_LIMIT,
      nowMs: 2_000,
    });
    assert.deepEqual(second, {
      outcome: "denied",
      reason: "exhausted",
      recovered: false,
      consumedCount: 1,
      reservedCount: 0,
    });
    assert.equal(state.consumedCount, 1);
  });

  it("releases on provider-style failure and allows retry", () => {
    const state = emptyFreeHelpAskState();
    applyReserveFreeHelpAsk({
      state,
      limit: FREE_HELP_ASK_LIMIT,
      nowMs: 1_000,
    });
    assert.equal(applyReleaseFreeHelpAsk({ state }).outcome, "released");
    assert.equal(state.consumedCount, 0);
    assert.equal(state.reservedCount, 0);

    const retry = applyReserveFreeHelpAsk({
      state,
      limit: FREE_HELP_ASK_LIMIT,
      nowMs: 2_000,
    });
    assert.equal(retry.outcome, "reserved");
    assert.equal(applyConsumeFreeHelpAsk({ state }).outcome, "consumed");
    assert.equal(state.consumedCount, 1);
  });

  it("lets exactly one concurrent reservation win", () => {
    const state = emptyFreeHelpAskState();
    const first = applyReserveFreeHelpAsk({
      state,
      limit: FREE_HELP_ASK_LIMIT,
      nowMs: 1_000,
    });
    const second = applyReserveFreeHelpAsk({
      state,
      limit: FREE_HELP_ASK_LIMIT,
      nowMs: 1_100,
    });
    assert.equal(first.outcome, "reserved");
    assert.deepEqual(second, {
      outcome: "denied",
      reason: "in_flight",
      recovered: false,
      consumedCount: 0,
      reservedCount: 1,
    });
    assert.equal(state.reservedCount, 1);
  });

  it("recovers a stale reservation during the next reserve", () => {
    assert.equal(FREE_HELP_ASK_RESERVATION_STALE_MS, 120_000);
    const state = emptyFreeHelpAskState();
    applyReserveFreeHelpAsk({
      state,
      limit: FREE_HELP_ASK_LIMIT,
      nowMs: 1_000,
    });
    assert.equal(state.reservedCount, 1);

    const tooSoon = applyReserveFreeHelpAsk({
      state,
      limit: FREE_HELP_ASK_LIMIT,
      nowMs: 1_000 + 119_000,
    });
    assert.equal(tooSoon.outcome, "denied");
    assert.equal(tooSoon.recovered, false);

    const recovered = applyReserveFreeHelpAsk({
      state,
      limit: FREE_HELP_ASK_LIMIT,
      nowMs: 1_000 + 120_000,
    });
    assert.equal(recovered.outcome, "reserved");
    assert.equal(recovered.recovered, true);
    assert.equal(state.consumedCount, 0);
    assert.equal(state.reservedCount, 1);
  });

  it("retains consumed across plan changes and never resets it", () => {
    const state = emptyFreeHelpAskState();
    state.consumedCount = 1;
    assert.equal(
      applyFreeHelpAskPlanChange({ state, nextPlan: "full" }).consumedCount,
      1,
    );
    assert.equal(
      resolveFreeHelpAskPresentation({
        athenaPlan: "full",
        consumedCount: 1,
      }),
      "full",
    );
    assert.equal(
      applyFreeHelpAskPlanChange({ state, nextPlan: "free" }).consumedCount,
      1,
    );
    assert.equal(
      resolveFreeHelpAskPresentation({
        athenaPlan: "free",
        consumedCount: 1,
      }),
      "exhausted",
    );
    assert.equal(
      resolveFreeHelpAskPresentation({
        athenaPlan: "free",
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
      /grant execute on function reserve_athena_free_help_ask\(uuid, integer\) to service_role/,
    );
    assert.match(
      sql,
      /revoke all on function reserve_athena_free_help_ask\(uuid, integer\) from authenticated/,
    );
    assert.match(
      sql,
      /grant execute on function consume_athena_free_help_ask\(uuid\) to service_role/,
    );
    assert.match(
      sql,
      /grant execute on function release_athena_free_help_ask\(uuid\) to service_role/,
    );
    assert.doesNotMatch(sql, /grant execute[^;]*authenticated/);
    assert.doesNotMatch(sql, /free_identity_ask_|free_starter_/);
    assert.match(
      read("services/organization/freeHelpAskAuthority.ts"),
      /reserve_athena_free_help_ask/,
    );
  });
});
