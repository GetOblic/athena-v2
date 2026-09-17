/**
 * FREE-12 — Getting Started / Help conversation server gate for Free Ask allowance.
 */

import "./gettingStartedConversationTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { FREE_HELP_ASK_LIMIT } from "../../lib/organization/freeHelpAsk";
import {
  applyConsumeFreeHelpAsk,
  applyReleaseFreeHelpAsk,
  applyReserveFreeHelpAsk,
} from "../../lib/organization/freeHelpAskReservation";
import {
  runGettingStartedConversation,
  resetGettingStartedConversationConcurrencyForTests,
} from "../../services/gettingStartedConversation/gettingStartedConversationService";
import { AthenaConversationError } from "../../services/athenaConversation/athenaConversationTypes";
import type { GettingStartedConversationServiceDeps } from "../../services/gettingStartedConversation/gettingStartedConversationService";
import type { AthenaPlan } from "../../services/athenaPlan";
import type { ReserveFreeHelpAskResult } from "../../services/organization/freeHelpAskAuthority";
import type { FreeHelpAskState } from "../../lib/organization/freeHelpAsk";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function createHarness(input: {
  plan: AthenaPlan;
  consumedCount?: number;
  provider?: () => Promise<string>;
}) {
  const state: FreeHelpAskState = {
    consumedCount: input.consumedCount ?? 0,
    reservedCount: 0,
    reservedAt: null,
  };
  let providerCalls = 0;
  let assembleCalls = 0;
  let reserveCalls = 0;
  let nowMs = 1_000;

  const deps: GettingStartedConversationServiceDeps = {
    resolvePlan: async () => input.plan,
    reserveAsk: async (_organizationId, limit = FREE_HELP_ASK_LIMIT) => {
      reserveCalls += 1;
      const result = applyReserveFreeHelpAsk({
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
      } satisfies ReserveFreeHelpAskResult;
    },
    consumeAsk: async () => {
      applyConsumeFreeHelpAsk({ state });
    },
    releaseAsk: async () => {
      applyReleaseFreeHelpAsk({ state });
    },
    assembleContext: () => {
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
      return "Athena can help you start with Athena Brain.";
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
  body: unknown = { message: "What should I complete first?", history: [] },
) {
  return runGettingStartedConversation({
    organizationId: "org-1",
    userId,
    body,
    requestId: `req-${userId}`,
    deps: harness.deps,
  });
}

afterEach(() => {
  resetGettingStartedConversationConcurrencyForTests();
});

describe("FREE-12 Help Ask server gate", () => {
  it("lets Full Help remain unmetered, including after Free consumption", async () => {
    const harness = createHarness({
      plan: "full",
      consumedCount: 1,
    });
    const { result } = await ask(harness);
    assert.equal(result.ok, true);
    assert.equal(harness.reserveCalls(), 0);
    assert.equal(harness.state.consumedCount, 1);
    assert.equal(harness.providerCalls(), 1);
  });

  it("reserves and consumes the first successful Free Help exchange", async () => {
    const harness = createHarness({ plan: "free" });
    const { result } = await ask(harness);
    assert.equal(result.ok, true);
    assert.equal(harness.reserveCalls(), 1);
    assert.equal(harness.state.consumedCount, 1);
    assert.equal(harness.state.reservedCount, 0);
    assert.equal(harness.providerCalls(), 1);
    assert.equal(harness.assembleCalls(), 1);
  });

  it("denies a consumed Free second Ask before the provider", async () => {
    const harness = createHarness({ plan: "free" });
    const first = await ask(harness, "user-1");
    assert.equal(first.result.ok, true);
    resetGettingStartedConversationConcurrencyForTests();

    await assert.rejects(
      () => ask(harness, "user-2"),
      (error: unknown) =>
        error instanceof AthenaConversationError &&
        error.code === "FREE_HELP_ASK_EXHAUSTED" &&
        error.httpStatus === 403 &&
        error.retryable === false &&
        error.message === "Athena has answered your question.",
    );
    assert.equal(harness.providerCalls(), 1);
    assert.equal(harness.assembleCalls(), 1);
    assert.equal(harness.state.consumedCount, 1);
    assert.equal(harness.state.reservedCount, 0);
  });

  it("releases reservation on provider failure and allows retry", async () => {
    let failNext = true;
    const harness = createHarness({
      plan: "free",
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
        return "Recovered Help answer.";
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
    resetGettingStartedConversationConcurrencyForTests();

    const retry = await ask(harness);
    assert.equal(retry.result.ok, true);
    assert.equal(harness.state.consumedCount, 1);
    assert.equal(harness.providerCalls(), 2);
  });

  it("does not consume an empty provider response", async () => {
    const harness = createHarness({
      plan: "free",
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

  it("does not reserve on validation failure", async () => {
    const harness = createHarness({ plan: "free" });
    await assert.rejects(
      () => ask(harness, "user-1", { message: "", history: [] }),
      (error: unknown) =>
        error instanceof AthenaConversationError &&
        error.code === "VALIDATION_ERROR",
    );
    assert.equal(harness.reserveCalls(), 0);
    assert.equal(harness.assembleCalls(), 0);
    assert.equal(harness.providerCalls(), 0);
    assert.equal(harness.state.consumedCount, 0);
    assert.equal(harness.state.reservedCount, 0);
  });

  it("lets exactly one concurrent Free Help request reach the provider", async () => {
    const harness = createHarness({ plan: "free" });
    const results = await Promise.allSettled([
      ask(harness, "member-a"),
      ask(harness, "member-b"),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(harness.providerCalls(), 1);
    assert.equal(harness.state.consumedCount, 1);
    assert.equal(harness.state.reservedCount, 0);
    const denial = rejected[0];
    assert.ok(denial && denial.status === "rejected");
    assert.ok(denial.reason instanceof AthenaConversationError);
    assert.ok(
      denial.reason.code === "FREE_HELP_ASK_EXHAUSTED" ||
        denial.reason.code === "RATE_LIMITED",
    );
  });

  it("treats previous Free consumption as authoritative after Full → Free", async () => {
    const exhausted = createHarness({
      plan: "free",
      consumedCount: 1,
    });
    await assert.rejects(
      () => ask(exhausted),
      (error: unknown) =>
        error instanceof AthenaConversationError &&
        error.code === "FREE_HELP_ASK_EXHAUSTED",
    );
    assert.equal(exhausted.providerCalls(), 0);

    const unused = createHarness({
      plan: "free",
      consumedCount: 0,
    });
    const { result } = await ask(unused);
    assert.equal(result.ok, true);
    assert.equal(unused.state.consumedCount, 1);
  });

  it("enforces the gate inside Getting Started so a crafted POST cannot reach the provider", () => {
    const route = read("app/api/getting-started/conversation/route.ts");
    const service = read(
      "services/gettingStartedConversation/gettingStartedConversationService.ts",
    );
    assert.match(route, /runGettingStartedConversation/);
    assert.doesNotMatch(route, /callGeminiViaOpenRouter/);
    assert.match(service, /isFreeHelpAskMetered/);
    assert.match(service, /reserveAsk/);
    assert.match(service, /callProvider/);
    const runFn = service.slice(
      service.indexOf("export async function runGettingStartedConversation"),
    );
    assert.ok(
      runFn.indexOf("await reserveAsk") <
        runFn.indexOf("const assembled = assembleContext"),
    );
    assert.ok(
      runFn.indexOf("const assembled = assembleContext") <
        runFn.indexOf("await callProvider"),
    );
    assert.ok(runFn.indexOf("await callProvider") < runFn.indexOf("await consumeAsk"));
    assert.match(service, /releaseAsk/);
    assert.match(service, /FREE_HELP_ASK_EXHAUSTED/);
    assert.doesNotMatch(service, /FREE_IDENTITY_ASK|free_identity_ask_|reserveFreeIdentityAsk/);
    assert.doesNotMatch(service, /free_starter_|reserveFreeStarter/);
  });

  it("leaves Identity Ask, Social Planner, Estimate, FREE-5/6/7, and middleware unchanged", () => {
    const forbidden =
      /freeHelpAsk|FREE_HELP_ASK|reserve_athena_free_help_ask/;
    assert.doesNotMatch(
      read("services/identityConversation/identityConversationService.ts"),
      forbidden,
    );
    assert.doesNotMatch(
      read("app/api/identity/conversation/route.ts"),
      forbidden,
    );
    assert.doesNotMatch(
      read("lib/organization/freeIdentityAsk.ts"),
      forbidden,
    );
    assert.doesNotMatch(
      read("services/organization/freeIdentityAskAuthority.ts"),
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
    assert.doesNotMatch(read("middleware.ts"), forbidden);
  });
});
