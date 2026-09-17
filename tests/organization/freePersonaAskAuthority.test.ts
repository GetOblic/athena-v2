/**
 * FREE-14 — organization-scoped Free Persona / Audience Ask reservation authority.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  FREE_PERSONA_ASK_LIMIT,
  FREE_PERSONA_ASK_RESERVATION_STALE_MS,
  emptyFreePersonaAskState,
  resolveFreePersonaAskPresentation,
} from "../../lib/organization/freePersonaAsk";
import {
  applyConsumeFreePersonaAsk,
  applyFreePersonaAskPlanChange,
  applyReleaseFreePersonaAsk,
  applyReserveFreePersonaAsk,
} from "../../lib/organization/freePersonaAskReservation";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20260917000009_add_organization_free_persona_ask.sql";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("FREE-14 Persona Ask authority", () => {
  it("defines the product limit once as 1", () => {
    assert.equal(FREE_PERSONA_ASK_LIMIT, 1);
    const policy = read("lib/organization/freePersonaAsk.ts");
    assert.match(policy, /export const FREE_PERSONA_ASK_LIMIT = 1/);
    assert.equal(policy.split("FREE_PERSONA_ASK_LIMIT = 1").length, 2);
    assert.doesNotMatch(
      read("app/api/personas/[id]/conversation/route.ts"),
      /FREE_PERSONA_ASK_LIMIT\s*=\s*1|consumedCount\s*>=\s*1/,
    );
    assert.doesNotMatch(
      read("components/personas/PersonaConversationPanel.tsx"),
      /\b1 remaining\b|0 remaining/,
    );
  });

  it("keeps schema generic, organization-scoped, and separate from other Free counters", () => {
    assert.equal(existsSync(join(ROOT, MIGRATION)), true);
    const sql = read(MIGRATION);
    assert.match(
      sql,
      /free_persona_ask_consumed_count integer not null default 0/,
    );
    assert.match(
      sql,
      /free_persona_ask_reserved_count integer not null default 0/,
    );
    assert.match(sql, /free_persona_ask_reserved_at timestamptz/);
    assert.doesNotMatch(sql, /free_identity_ask_/);
    assert.doesNotMatch(sql, /free_help_ask_/);
    assert.doesNotMatch(sql, /free_audience_/);
    assert.doesNotMatch(sql, /free_starter_/);
    assert.doesNotMatch(sql, /create table/i);
    assert.doesNotMatch(sql, /message_table|conversation_messages/);
    assert.doesNotMatch(
      sql,
      /FREE_PERSONA_ASK_LIMIT|limit integer not null default 1/,
    );
    assert.match(sql, /p_limit integer/);
  });

  it("reserves, consumes, and releases without decrementing consumed", () => {
    const state = emptyFreePersonaAskState();
    const reserved = applyReserveFreePersonaAsk({
      state,
      limit: FREE_PERSONA_ASK_LIMIT,
      nowMs: 1_000,
    });
    assert.equal(reserved.outcome, "reserved");
    assert.equal(state.reservedCount, 1);
    assert.equal(state.consumedCount, 0);

    const consumed = applyConsumeFreePersonaAsk({ state });
    assert.equal(consumed.outcome, "consumed");
    assert.equal(state.consumedCount, 1);
    assert.equal(state.reservedCount, 0);
    assert.equal(state.reservedAt, null);

    const released = applyReleaseFreePersonaAsk({ state });
    assert.equal(released.outcome, "ignored");
    assert.equal(state.consumedCount, 1);
  });

  it("denies the second reservation after one successful exchange", () => {
    const state = emptyFreePersonaAskState();
    const reserved = applyReserveFreePersonaAsk({
      state,
      limit: FREE_PERSONA_ASK_LIMIT,
      nowMs: 1_000,
    });
    assert.equal(reserved.outcome, "reserved");
    assert.equal(applyConsumeFreePersonaAsk({ state }).outcome, "consumed");
    assert.equal(state.consumedCount, 1);

    const second = applyReserveFreePersonaAsk({
      state,
      limit: FREE_PERSONA_ASK_LIMIT,
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
    const state = emptyFreePersonaAskState();
    applyReserveFreePersonaAsk({
      state,
      limit: FREE_PERSONA_ASK_LIMIT,
      nowMs: 1_000,
    });
    assert.equal(applyReleaseFreePersonaAsk({ state }).outcome, "released");
    assert.equal(state.consumedCount, 0);
    assert.equal(state.reservedCount, 0);

    const retry = applyReserveFreePersonaAsk({
      state,
      limit: FREE_PERSONA_ASK_LIMIT,
      nowMs: 2_000,
    });
    assert.equal(retry.outcome, "reserved");
    assert.equal(applyConsumeFreePersonaAsk({ state }).outcome, "consumed");
    assert.equal(state.consumedCount, 1);
  });

  it("lets exactly one concurrent reservation win", () => {
    const state = emptyFreePersonaAskState();
    const first = applyReserveFreePersonaAsk({
      state,
      limit: FREE_PERSONA_ASK_LIMIT,
      nowMs: 1_000,
    });
    const second = applyReserveFreePersonaAsk({
      state,
      limit: FREE_PERSONA_ASK_LIMIT,
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
    assert.equal(FREE_PERSONA_ASK_RESERVATION_STALE_MS, 120_000);
    const state = emptyFreePersonaAskState();
    applyReserveFreePersonaAsk({
      state,
      limit: FREE_PERSONA_ASK_LIMIT,
      nowMs: 1_000,
    });
    assert.equal(state.reservedCount, 1);

    const tooSoon = applyReserveFreePersonaAsk({
      state,
      limit: FREE_PERSONA_ASK_LIMIT,
      nowMs: 1_000 + 119_000,
    });
    assert.equal(tooSoon.outcome, "denied");
    assert.equal(tooSoon.recovered, false);

    const recovered = applyReserveFreePersonaAsk({
      state,
      limit: FREE_PERSONA_ASK_LIMIT,
      nowMs: 1_000 + 120_000,
    });
    assert.equal(recovered.outcome, "reserved");
    assert.equal(recovered.recovered, true);
    assert.equal(state.consumedCount, 0);
    assert.equal(state.reservedCount, 1);
  });

  it("retains consumed across plan changes and never resets it", () => {
    const state = emptyFreePersonaAskState();
    state.consumedCount = 1;
    assert.equal(
      applyFreePersonaAskPlanChange({ state, nextPlan: "full" }).consumedCount,
      1,
    );
    assert.equal(
      resolveFreePersonaAskPresentation({
        athenaPlan: "full",
        consumedCount: 1,
      }),
      "full",
    );
    assert.equal(
      applyFreePersonaAskPlanChange({ state, nextPlan: "free" }).consumedCount,
      1,
    );
    assert.equal(
      resolveFreePersonaAskPresentation({
        athenaPlan: "free",
        consumedCount: 1,
      }),
      "exhausted",
    );
    assert.equal(
      resolveFreePersonaAskPresentation({
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
      /grant execute on function reserve_athena_free_persona_ask\(uuid, integer\) to service_role/,
    );
    assert.match(
      sql,
      /revoke all on function reserve_athena_free_persona_ask\(uuid, integer\) from authenticated/,
    );
    assert.match(
      sql,
      /grant execute on function consume_athena_free_persona_ask\(uuid\) to service_role/,
    );
    assert.match(
      sql,
      /grant execute on function release_athena_free_persona_ask\(uuid\) to service_role/,
    );
    assert.doesNotMatch(sql, /grant execute[^;]*authenticated/);
    assert.doesNotMatch(
      sql,
      /free_identity_ask_|free_help_ask_|free_audience_|free_starter_/,
    );
    assert.match(
      read("services/organization/freePersonaAskAuthority.ts"),
      /reserve_athena_free_persona_ask/,
    );
  });
});
