/**
 * FREE-8 — Identity conversation server gate for Free Ask allowance.
 */

import "../identityConversation/identityConversationTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  FREE_IDENTITY_ASK_LIMIT,
  isFreeIdentityAskTrained,
} from "../../lib/organization/freeIdentityAsk";
import { isIdentityBrainObtained } from "../../lib/organization/freeIdentityGeneration";
import { hasSuccessfulAthenaTraining } from "../../components/identity/identityPagePresentation";
import {
  applyConsumeFreeIdentityAsk,
  applyReleaseFreeIdentityAsk,
  applyReserveFreeIdentityAsk,
} from "../../lib/organization/freeIdentityAskReservation";
import {
  runIdentityConversation,
  resetIdentityConversationConcurrencyForTests,
} from "../../services/identityConversation/identityConversationService";
import {
  AthenaConversationError,
} from "../../services/athenaConversation/athenaConversationTypes";
import type { IdentityConversationServiceDeps } from "../../services/identityConversation/identityConversationService";
import type { AthenaIdentity } from "../../services/identity/identityService";
import type { AthenaPlan } from "../../services/athenaPlan";
import type { ReserveFreeIdentityAskResult } from "../../services/organization/freeIdentityAskAuthority";
import type { FreeIdentityAskState } from "../../lib/organization/freeIdentityAsk";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function sampleIdentity(
  overrides: Partial<AthenaIdentity> = {},
): AthenaIdentity {
  return {
    id: "id-1",
    user_id: "user-1",
    organization_id: "org-1",
    greeting_name: "Laurent",
    about_you: "voice",
    expertise: "knowledge",
    website: "https://example.com",
    brain_status: "ready",
    brain_last_updated: "2026-09-17T12:00:00.000Z",
    master_profile: { executive_intelligence: { executive_summary: "Clinic" } },
    master_profile_version: "1",
    master_profile_generated_at: "2026-09-17T12:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-17T12:00:00.000Z",
    ...overrides,
  };
}

function createHarness(input: {
  plan: AthenaPlan;
  trained: boolean;
  consumedCount?: number;
  provider?: () => Promise<string>;
}) {
  const state: FreeIdentityAskState = {
    consumedCount: input.consumedCount ?? 0,
    reservedCount: 0,
    reservedAt: null,
  };
  let providerCalls = 0;
  let assembleCalls = 0;
  let reserveCalls = 0;
  let nowMs = 1_000;

  const deps: IdentityConversationServiceDeps = {
    resolvePlan: async () => input.plan,
    loadIdentity: async () => (input.trained ? sampleIdentity() : null),
    reserveAsk: async (_organizationId, limit = FREE_IDENTITY_ASK_LIMIT) => {
      reserveCalls += 1;
      const result = applyReserveFreeIdentityAsk({
        state,
        limit,
        nowMs,
      });
      nowMs += 10;
      if (result.outcome === "reserved") {
        return { acquired: true, recovered: result.recovered };
      }
      return {
        acquired: false,
        reason: result.reason,
        consumedCount: result.consumedCount,
        reservedCount: result.reservedCount,
      } satisfies ReserveFreeIdentityAskResult;
    },
    consumeAsk: async () => {
      applyConsumeFreeIdentityAsk({ state });
    },
    releaseAsk: async () => {
      applyReleaseFreeIdentityAsk({ state });
    },
    assembleContext: async () => {
      assembleCalls += 1;
      return { sections: [], missingNotes: [] };
    },
    buildPrompt: () => ({
      systemPrompt: "system",
      messages: [{ role: "user", content: "question" }],
      promptCharCount: 8,
      contextCharCount: 0,
    }),
    callProvider: async () => {
      providerCalls += 1;
      if (input.provider) {
        return input.provider();
      }
      return "Athena understands this business.";
    },
  };

  return {
    state,
    deps,
    providerCalls: () => providerCalls,
    assembleCalls: () => assembleCalls,
    reserveCalls: () => reserveCalls,
  };
}

async function ask(
  harness: ReturnType<typeof createHarness>,
  userId = "user-1",
) {
  return runIdentityConversation({
    organizationId: "org-1",
    userId,
    body: { message: "What do you understand?", history: [] },
    requestId: `req-${userId}`,
    deps: harness.deps,
  });
}

afterEach(() => {
  resetIdentityConversationConcurrencyForTests();
});

describe("FREE-8 Identity Ask server gate", () => {
  it("reuses FREE-7 Brain-ready authority and does not invent a second trained definition", () => {
    const trained = sampleIdentity();
    const untrained = sampleIdentity({
      brain_status: "pending",
      brain_last_updated: null,
      master_profile: null,
    });
    assert.equal(isIdentityBrainObtained(trained), true);
    assert.equal(hasSuccessfulAthenaTraining(trained), true);
    assert.equal(isFreeIdentityAskTrained({ identity: trained }), true);
    assert.equal(isIdentityBrainObtained(untrained), false);
    assert.equal(hasSuccessfulAthenaTraining(untrained), false);
    assert.equal(isFreeIdentityAskTrained({ identity: untrained }), false);
    assert.match(
      read("lib/organization/freeIdentityAsk.ts"),
      /isIdentityBrainObtained/,
    );
    assert.doesNotMatch(
      read("lib/organization/freeIdentityAsk.ts"),
      /defineKind|needs_setup/,
    );
  });

  it("denies Free + untrained before reservation, assembly, or provider", async () => {
    const harness = createHarness({ plan: "free", trained: false });
    await assert.rejects(
      () => ask(harness),
      (error: unknown) =>
        error instanceof AthenaConversationError &&
        error.code === "FREE_IDENTITY_ASK_UNTRAINED" &&
        error.httpStatus === 403 &&
        error.retryable === false,
    );
    assert.equal(harness.reserveCalls(), 0);
    assert.equal(harness.assembleCalls(), 0);
    assert.equal(harness.providerCalls(), 0);
    assert.equal(harness.state.consumedCount, 0);
    assert.equal(harness.state.reservedCount, 0);
  });

  it("consumes the first three successful Free exchanges and denies the fourth before the provider", async () => {
    const harness = createHarness({ plan: "free", trained: true });
    for (let index = 1; index <= FREE_IDENTITY_ASK_LIMIT; index += 1) {
      const { result } = await ask(harness, `user-${index}`);
      assert.equal(result.ok, true);
      assert.equal(harness.state.consumedCount, index);
      resetIdentityConversationConcurrencyForTests();
    }
    assert.equal(harness.providerCalls(), 3);

    await assert.rejects(
      () => ask(harness, "user-4"),
      (error: unknown) =>
        error instanceof AthenaConversationError &&
        error.code === "FREE_IDENTITY_ASK_EXHAUSTED" &&
        error.httpStatus === 403,
    );
    assert.equal(harness.providerCalls(), 3);
    assert.equal(harness.assembleCalls(), 3);
    assert.equal(harness.state.consumedCount, 3);
    assert.equal(harness.state.reservedCount, 0);
  });

  it("releases reservation on provider failure and allows retry", async () => {
    let failNext = true;
    const harness = createHarness({
      plan: "free",
      trained: true,
      provider: async () => {
        if (failNext) {
          failNext = false;
          throw new AthenaConversationError(
            "PROVIDER_ERROR",
            "Athena could not complete the conversation response.",
            500,
            { retryable: false },
          );
        }
        return "Recovered understanding.";
      },
    });

    await assert.rejects(
      () => ask(harness),
      (error: unknown) =>
        error instanceof AthenaConversationError &&
        error.code === "PROVIDER_ERROR",
    );
    assert.equal(harness.state.consumedCount, 0);
    assert.equal(harness.state.reservedCount, 0);
    resetIdentityConversationConcurrencyForTests();

    const retry = await ask(harness);
    assert.equal(retry.result.ok, true);
    assert.equal(harness.state.consumedCount, 1);
    assert.equal(harness.providerCalls(), 2);
  });

  it("does not consume an empty provider response", async () => {
    const harness = createHarness({
      plan: "free",
      trained: true,
      provider: async () => "   ",
    });
    await assert.rejects(
      () => ask(harness),
      (error: unknown) =>
        error instanceof AthenaConversationError &&
        error.code === "PROVIDER_ERROR",
    );
    assert.equal(harness.state.consumedCount, 0);
    assert.equal(harness.state.reservedCount, 0);
  });

  it("lets exactly one concurrent Free ask with one remaining reach the provider", async () => {
    const harness = createHarness({
      plan: "free",
      trained: true,
      consumedCount: 2,
    });
    const results = await Promise.allSettled([
      ask(harness, "member-a"),
      ask(harness, "member-b"),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(harness.providerCalls(), 1);
    assert.equal(harness.state.consumedCount, 3);
    assert.equal(harness.state.reservedCount, 0);
    const denial = rejected[0];
    assert.ok(denial && denial.status === "rejected");
    assert.ok(denial.reason instanceof AthenaConversationError);
    assert.notEqual(denial.reason.code, "FREE_IDENTITY_ASK_UNTRAINED");
  });

  it("lets Full ask immediately without reserving, including after Free consumption", async () => {
    const harness = createHarness({
      plan: "full",
      trained: true,
      consumedCount: 3,
    });
    const { result } = await ask(harness);
    assert.equal(result.ok, true);
    assert.equal(harness.reserveCalls(), 0);
    assert.equal(harness.state.consumedCount, 3);
    assert.equal(harness.providerCalls(), 1);
  });

  it("treats previous Free consumption as authoritative after Full → Free", async () => {
    const exhausted = createHarness({
      plan: "free",
      trained: true,
      consumedCount: 3,
    });
    await assert.rejects(
      () => ask(exhausted),
      (error: unknown) =>
        error instanceof AthenaConversationError &&
        error.code === "FREE_IDENTITY_ASK_EXHAUSTED",
    );
    assert.equal(exhausted.providerCalls(), 0);

    const unused = createHarness({
      plan: "free",
      trained: true,
      consumedCount: 0,
    });
    const { result } = await ask(unused);
    assert.equal(result.ok, true);
    assert.equal(unused.state.consumedCount, 1);
  });

  it("enforces the gate inside the Identity conversation path so direct POST cannot reach the provider", () => {
    const route = read("app/api/identity/conversation/route.ts");
    const service = read(
      "services/identityConversation/identityConversationService.ts",
    );
    assert.match(route, /runIdentityConversation/);
    assert.doesNotMatch(route, /callGeminiViaOpenRouter/);
    assert.match(service, /isFreeIdentityAskMetered/);
    assert.match(service, /isFreeIdentityAskTrained/);
    assert.match(service, /reserveAsk/);
    assert.match(service, /callProvider/);
    const runFn = service.slice(service.indexOf("export async function runIdentityConversation"));
    assert.ok(
      runFn.indexOf("isFreeIdentityAskTrained") < runFn.indexOf("await reserveAsk"),
    );
    assert.ok(runFn.indexOf("await reserveAsk") < runFn.indexOf("await assembleContext"));
    assert.ok(runFn.indexOf("await assembleContext") < runFn.indexOf("await callProvider"));
    assert.ok(runFn.indexOf("await callProvider") < runFn.indexOf("await consumeAsk"));
    assert.match(service, /releaseAsk/);
    assert.match(service, /FREE_IDENTITY_ASK_EXHAUSTED/);
    assert.match(service, /FREE_IDENTITY_ASK_UNTRAINED/);
    assert.doesNotMatch(service, /free_starter_|reserveFreeStarter/);
  });

  it("leaves Getting Started, Social Planner, Estimate, FREE-5/6, and FREE-7 unchanged", () => {
    const forbidden =
      /freeIdentityAsk|FREE_IDENTITY_ASK|reserve_athena_free_identity_ask/;
    assert.doesNotMatch(
      read("services/gettingStartedConversation/gettingStartedConversationService.ts"),
      forbidden,
    );
    assert.doesNotMatch(
      read("app/api/getting-started/conversation/route.ts"),
      forbidden,
    );
    assert.doesNotMatch(
      read("services/socialPlanner/conversation/socialPlannerConversationService.ts"),
      forbidden,
    );
    assert.doesNotMatch(
      read("app/api/social-planner/[id]/conversation/route.ts"),
      forbidden,
    );
    assert.doesNotMatch(
      read("services/estimateConversation/estimateConversationService.ts"),
      forbidden,
    );
    assert.doesNotMatch(read("lib/organization/freeStarter.ts"), forbidden);
    assert.doesNotMatch(
      read("services/organization/freeStarterAuthority.ts"),
      forbidden,
    );
    assert.doesNotMatch(
      read("lib/organization/freeSocialPlannerGeneration.ts"),
      forbidden,
    );
    assert.doesNotMatch(
      read("lib/organization/freeIdentityGeneration.ts"),
      forbidden,
    );
    assert.doesNotMatch(
      read("services/organization/freeIdentityGenerationGuard.ts"),
      forbidden,
    );
    assert.doesNotMatch(
      read("app/api/identity/deep-scrape/route.ts"),
      forbidden,
    );
    assert.match(
      read("app/api/identity/deep-scrape/route.ts"),
      /assertCurrentFreeIdentityGeneration/,
    );
    assert.doesNotMatch(read("middleware.ts"), forbidden);
  });
});
