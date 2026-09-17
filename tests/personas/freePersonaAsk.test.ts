/**
 * FREE-14 — Persona / Audience conversation server gate for Free Ask allowance.
 */

import "./personaConversationTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { FREE_PERSONA_ASK_LIMIT } from "../../lib/organization/freePersonaAsk";
import {
  applyConsumeFreePersonaAsk,
  applyReleaseFreePersonaAsk,
  applyReserveFreePersonaAsk,
} from "../../lib/organization/freePersonaAskReservation";
import {
  runPersonaConversation,
  resetConversationConcurrencyForTests,
} from "../../services/personaConversation/personaConversationService";
import { PersonaConversationError } from "../../services/personaConversation/personaConversationTypes";
import type { PersonaConversationServiceDeps } from "../../services/personaConversation/personaConversationService";
import type { AthenaPlan } from "../../services/athenaPlan";
import type { ReserveFreePersonaAskResult } from "../../services/organization/freePersonaAskAuthority";
import type { FreePersonaAskState } from "../../lib/organization/freePersonaAsk";
import type { Persona } from "../../services/personas/personaService";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function samplePersona(): Persona {
  return {
    id: "persona-1",
    organization_id: "org-1",
  } as Persona;
}

function createHarness(input: {
  plan: AthenaPlan;
  consumedCount?: number;
  provider?: () => Promise<string>;
  assemble?: () => Promise<never> | Promise<{
    personaId: string;
    organizationId: string;
    executiveVersionId: string | null;
    versionState: "none";
    versionLabel: null;
    sections: [];
    referencedAsset: null;
    missingNotes: [];
  }>;
}) {
  const state: FreePersonaAskState = {
    consumedCount: input.consumedCount ?? 0,
    reservedCount: 0,
    reservedAt: null,
  };
  let providerCalls = 0;
  let assembleCalls = 0;
  let reserveCalls = 0;
  let nowMs = 1_000;

  const deps: PersonaConversationServiceDeps = {
    resolvePlan: async () => input.plan,
    reserveAsk: async (_organizationId, limit = FREE_PERSONA_ASK_LIMIT) => {
      reserveCalls += 1;
      const result = applyReserveFreePersonaAsk({
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
      } satisfies ReserveFreePersonaAskResult;
    },
    consumeAsk: async () => {
      applyConsumeFreePersonaAsk({ state });
    },
    releaseAsk: async () => {
      applyReleaseFreePersonaAsk({ state });
    },
    assembleContext: async () => {
      assembleCalls += 1;
      if (input.assemble) {
        return input.assemble();
      }
      return {
        personaId: "persona-1",
        organizationId: "org-1",
        executiveVersionId: null,
        versionState: "none",
        versionLabel: null,
        sections: [],
        referencedAsset: null,
        missingNotes: [],
      };
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
      return "This audience is motivated by convenience and trust.";
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
  body: unknown = {
    message: "What motivates this Persona most strongly?",
    history: [],
  },
) {
  return runPersonaConversation({
    organizationId: "org-1",
    userId,
    persona: samplePersona(),
    body,
    requestId: `req-${userId}`,
    deps: harness.deps,
  });
}

afterEach(() => {
  resetConversationConcurrencyForTests();
});

describe("FREE-14 Persona Ask server gate", () => {
  it("lets Full Persona Ask remain unmetered, including after Free consumption", async () => {
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

  it("reserves and consumes the first successful Free Ask with exactly one provider execution", async () => {
    const harness = createHarness({ plan: "free" });
    const { result } = await ask(harness);
    assert.equal(result.ok, true);
    assert.equal(harness.reserveCalls(), 1);
    assert.equal(harness.state.consumedCount, 1);
    assert.equal(harness.state.reservedCount, 0);
    assert.equal(harness.providerCalls(), 1);
    assert.equal(harness.assembleCalls(), 1);
  });

  it("denies a consumed Free second Ask before context and provider", async () => {
    const harness = createHarness({ plan: "free" });
    const first = await ask(harness, "user-1");
    assert.equal(first.result.ok, true);
    resetConversationConcurrencyForTests();

    await assert.rejects(
      () => ask(harness, "user-2"),
      (error: unknown) =>
        error instanceof PersonaConversationError &&
        error.code === "FREE_PERSONA_ASK_EXHAUSTED" &&
        error.httpStatus === 403 &&
        error.retryable === false &&
        error.message === "Athena has answered your audience question.",
    );
    assert.equal(harness.providerCalls(), 1);
    assert.equal(harness.assembleCalls(), 1);
    assert.equal(harness.state.consumedCount, 1);
    assert.equal(harness.state.reservedCount, 0);
  });

  it("denies a follow-up, starter-chip, nested Discuss, and crafted POST after consumption", async () => {
    const harness = createHarness({ plan: "free" });
    await ask(harness, "user-1");
    resetConversationConcurrencyForTests();

    const followUps = [
      { message: "Can you go deeper?", history: [] },
      {
        message: "Which objections should we address first?",
        history: [],
      },
      {
        message: "Discuss this asset.",
        history: [],
        executiveVersionId: "ev-archived",
        assetReference: { kind: "deployment" as const, key: "newsletter_idea" },
      },
    ];

    for (const [index, body] of followUps.entries()) {
      await assert.rejects(
        () => ask(harness, `follow-${index}`, body),
        (error: unknown) =>
          error instanceof PersonaConversationError &&
          error.code === "FREE_PERSONA_ASK_EXHAUSTED",
      );
      resetConversationConcurrencyForTests();
    }

    assert.equal(harness.providerCalls(), 1);
    assert.equal(harness.assembleCalls(), 1);
    assert.equal(harness.state.consumedCount, 1);
  });

  it("does not restore entitlement from archived version or asset-targeted Ask", async () => {
    const harness = createHarness({ plan: "free", consumedCount: 1 });
    await assert.rejects(
      () =>
        ask(harness, "archived", {
          message: "What did the previous version say?",
          history: [],
          executiveVersionId: "ev-archived",
        }),
      (error: unknown) =>
        error instanceof PersonaConversationError &&
        error.code === "FREE_PERSONA_ASK_EXHAUSTED",
    );
    await assert.rejects(
      () =>
        ask(harness, "asset", {
          message: "Discuss this blueprint.",
          history: [],
          executiveVersionId: "ev-archived",
          assetReference: { kind: "blueprint", key: "strategic_asset_blueprint" },
        }),
      (error: unknown) =>
        error instanceof PersonaConversationError &&
        error.code === "FREE_PERSONA_ASK_EXHAUSTED",
    );
    assert.equal(harness.providerCalls(), 0);
    assert.equal(harness.assembleCalls(), 0);
    assert.equal(harness.state.consumedCount, 1);
  });

  it("releases reservation on provider failure and allows retry", async () => {
    let failNext = true;
    const harness = createHarness({
      plan: "free",
      provider: async () => {
        if (failNext) {
          failNext = false;
          throw new PersonaConversationError(
            "PROVIDER_ERROR",
            "Athena could not complete the conversation response.",
            500,
            { retryable: false },
          );
        }
        return "Recovered audience answer.";
      },
    });

    await assert.rejects(
      () => ask(harness),
      (error: unknown) =>
        error instanceof PersonaConversationError &&
        error.code === "PROVIDER_ERROR",
    );
    assert.equal(harness.state.consumedCount, 0);
    assert.equal(harness.state.reservedCount, 0);
    resetConversationConcurrencyForTests();

    const retry = await ask(harness);
    assert.equal(retry.result.ok, true);
    assert.equal(harness.state.consumedCount, 1);
    assert.equal(harness.providerCalls(), 2);
  });

  it("releases reservation on timeout", async () => {
    const harness = createHarness({
      plan: "free",
      provider: async () => {
        throw new PersonaConversationError(
          "TIMEOUT",
          "Athena took too long to respond. Please try again.",
          504,
          { retryable: true },
        );
      },
    });
    await assert.rejects(
      () => ask(harness),
      (error: unknown) =>
        error instanceof PersonaConversationError && error.code === "TIMEOUT",
    );
    assert.equal(harness.state.consumedCount, 0);
    assert.equal(harness.state.reservedCount, 0);
  });

  it("does not consume an empty provider response", async () => {
    const harness = createHarness({
      plan: "free",
      provider: async () => "   ",
    });
    await assert.rejects(
      () => ask(harness),
      (error: unknown) =>
        error instanceof PersonaConversationError &&
        error.code === "PROVIDER_ERROR",
    );
    assert.equal(harness.state.consumedCount, 0);
    assert.equal(harness.state.reservedCount, 0);
  });

  it("releases reservation on context, version, and asset failure", async () => {
    for (const code of [
      "VERSION_NOT_FOUND",
      "ASSET_NOT_FOUND",
      "VALIDATION_ERROR",
    ] as const) {
      const harness = createHarness({
        plan: "free",
        assemble: async () => {
          throw new PersonaConversationError(
            code,
            `${code} during context assembly.`,
            code === "VALIDATION_ERROR" ? 400 : 404,
          );
        },
      });
      await assert.rejects(
        () => ask(harness),
        (error: unknown) =>
          error instanceof PersonaConversationError && error.code === code,
      );
      assert.equal(harness.state.consumedCount, 0);
      assert.equal(harness.state.reservedCount, 0);
      assert.equal(harness.providerCalls(), 0);
      resetConversationConcurrencyForTests();
    }
  });

  it("does not reserve on validation failure", async () => {
    const harness = createHarness({ plan: "free" });
    await assert.rejects(
      () => ask(harness, "user-1", { message: "", history: [] }),
      (error: unknown) =>
        error instanceof PersonaConversationError &&
        error.code === "VALIDATION_ERROR",
    );
    assert.equal(harness.reserveCalls(), 0);
    assert.equal(harness.assembleCalls(), 0);
    assert.equal(harness.providerCalls(), 0);
    assert.equal(harness.state.consumedCount, 0);
    assert.equal(harness.state.reservedCount, 0);
  });

  it("lets exactly one concurrent Free request reach the provider", async () => {
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
    assert.ok(denial.reason instanceof PersonaConversationError);
    assert.ok(
      denial.reason.code === "FREE_PERSONA_ASK_EXHAUSTED" ||
        denial.reason.code === "RATE_LIMITED",
    );
  });

  it("cannot obtain a second provider execution after consumption, including retry", async () => {
    const harness = createHarness({ plan: "free" });
    const first = await ask(harness, "user-1");
    assert.equal(first.result.ok, true);
    assert.equal(harness.providerCalls(), 1);
    resetConversationConcurrencyForTests();

    await assert.rejects(
      () => ask(harness, "user-1"),
      (error: unknown) =>
        error instanceof PersonaConversationError &&
        error.code === "FREE_PERSONA_ASK_EXHAUSTED" &&
        error.retryable === false,
    );
    assert.equal(harness.providerCalls(), 1);
    assert.equal(harness.state.consumedCount, 1);
  });

  it("treats previous Free consumption as authoritative after Full → Free", async () => {
    const exhausted = createHarness({
      plan: "free",
      consumedCount: 1,
    });
    await assert.rejects(
      () => ask(exhausted),
      (error: unknown) =>
        error instanceof PersonaConversationError &&
        error.code === "FREE_PERSONA_ASK_EXHAUSTED",
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

  it("enforces the gate inside runPersonaConversation so a crafted POST cannot reach the provider", () => {
    const route = read("app/api/personas/[id]/conversation/route.ts");
    const service = read(
      "services/personaConversation/personaConversationService.ts",
    );
    assert.match(route, /runPersonaConversation/);
    assert.doesNotMatch(route, /callGeminiViaOpenRouter/);
    assert.match(service, /isFreePersonaAskMetered/);
    assert.match(service, /reserveAsk/);
    assert.match(service, /callProvider/);
    const runFn = service.slice(
      service.indexOf("export async function runPersonaConversation"),
    );
    assert.ok(
      runFn.indexOf("await reserveAsk") <
        runFn.indexOf("const assembled = await assembleContext"),
    );
    assert.ok(
      runFn.indexOf("const assembled = await assembleContext") <
        runFn.indexOf("await callProvider"),
    );
    assert.ok(
      runFn.indexOf("await callProvider") < runFn.indexOf("await consumeAsk"),
    );
    assert.match(service, /releaseAsk/);
    assert.match(service, /FREE_PERSONA_ASK_EXHAUSTED/);
    assert.doesNotMatch(
      service,
      /FREE_IDENTITY_ASK|free_identity_ask_|reserveFreeIdentityAsk/,
    );
    assert.doesNotMatch(service, /FREE_HELP_ASK|free_help_ask_|reserveFreeHelpAsk/);
    assert.doesNotMatch(
      service,
      /free_audience_|reserveFreeAudience|consumeFreeAudience/,
    );
  });

  it("keeps Persona Ask read-only and isolated from FREE-13/13C authority", () => {
    const service = read(
      "services/personaConversation/personaConversationService.ts",
    );
    const isolation =
      /free_audience_|reserveFreeAudience|consumeFreeAudience|bindFreeAudience|publishExecutive|enqueueGeneration|deepScrape|appendObservation|thinkDifferently|refreshIntelligence|ad_campaign|social.?planner|createAdvertising|createSocial/i;
    assert.doesNotMatch(service, isolation);
    assert.doesNotMatch(
      read("services/personaConversation/personaConversationContext.ts"),
      isolation,
    );
    assert.doesNotMatch(
      read("app/api/personas/[id]/conversation/route.ts"),
      isolation,
    );

    const forbiddenAsk = /freePersonaAsk|FREE_PERSONA_ASK|reserve_athena_free_persona_ask/;
    assert.doesNotMatch(
      read("lib/organization/freeAudience.ts"),
      forbiddenAsk,
    );
    assert.doesNotMatch(
      read("lib/organization/freeAudienceGeneration.ts"),
      forbiddenAsk,
    );
    assert.doesNotMatch(
      read("lib/organization/freeAudienceIntelligence.ts"),
      forbiddenAsk,
    );
    assert.doesNotMatch(
      read("services/organization/freeAudienceAuthority.ts"),
      forbiddenAsk,
    );
    assert.doesNotMatch(
      read("services/organization/freeAudienceGenerationGuard.ts"),
      forbiddenAsk,
    );
    assert.doesNotMatch(
      read("services/organization/freeAudienceIntelligenceGuard.ts"),
      forbiddenAsk,
    );
    assert.doesNotMatch(
      read("services/personas/freeAudienceOrchestration.ts"),
      forbiddenAsk,
    );
    assert.doesNotMatch(
      read("lib/organization/freeHelpAsk.ts"),
      forbiddenAsk,
    );
    assert.doesNotMatch(
      read("lib/organization/freeIdentityAsk.ts"),
      forbiddenAsk,
    );
    assert.doesNotMatch(read("middleware.ts"), forbiddenAsk);
  });

  it("does not restore Free Ask when the audience is deleted", () => {
    const deleteBlock = read("services/personas/personaService.ts").slice(
      read("services/personas/personaService.ts").indexOf(
        "export async function deletePersona",
      ),
    );
    assert.doesNotMatch(deleteBlock, /free_persona_ask_/);
    assert.doesNotMatch(deleteBlock, /release_athena_free_persona_ask/);
    assert.doesNotMatch(deleteBlock, /consume_athena_free_persona_ask/);
    assert.doesNotMatch(
      read("lib/organization/freePersonaAsk.ts"),
      /deletePersona|sessionStorage|localStorage/,
    );
  });
});
