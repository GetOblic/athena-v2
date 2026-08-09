/**
 * Athena Estimate V26 L11 — Ask Athena backend.
 */
import "./../licensee/licenseeAuthTestEnv";

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  assistantReplyContainsForbiddenEstimateClaims,
} from "../../services/estimate/athenaEstimateValidation";
import type {
  AthenaEstimate,
  AthenaEstimateMessage,
  AthenaEstimatePackage,
} from "../../services/estimate/athenaEstimateTypes";
import {
  buildCurrentMethodologyBlock,
  buildFrozenEstimateFactsBlock,
  composeEstimateConversationContext,
} from "../../services/estimateConversation/estimateConversationContext";
import { normalizeEstimateConversationPlainText } from "../../services/estimateConversation/estimateConversationPlainText";
import {
  buildEstimateConversationPrompt,
  estimatePromptContainsImmutabilityContract,
  estimatePromptDistinguishesTrustClasses,
  estimatePromptForbidsLiveResearchClaims,
  estimatePromptHasDefaultLengthGuidance,
  estimatePromptRequiresPlainTextOutput,
} from "../../services/estimateConversation/estimateConversationPrompt";
import {
  listEstimateConversationForMaster,
  resetEstimateConversationConcurrencyForTests,
  sendEstimateConversationForMaster,
} from "../../services/estimateConversation/estimateConversationService";
import {
  boundEstimateConversationHistory,
  ESTIMATE_CONVERSATION_LIMITS,
  ESTIMATE_CONVERSATION_MODEL,
  EstimateConversationError,
} from "../../services/estimateConversation/estimateConversationTypes";
import {
  ESTIMATE_CONVERSATION_FORBIDDEN_KEYS,
  validateEstimateConversationRequest,
} from "../../services/estimateConversation/estimateConversationValidation";
import { ESTIMATE_INSTRUCTION_NOT_CONFIGURED } from "../../services/estimate/estimatePricingMethodologyInstruction";
import { ATHENA_CONVERSATION_LIMITS } from "../../services/athenaConversation/athenaConversationTypes";
import { LicenseeAccessError } from "../../services/licensee/licenseeIdentity";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function collectFiles(dir: string, acc: string[] = []): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return acc;
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      collectFiles(rel, acc);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
    ) {
      acc.push(rel);
    }
  }
  return acc;
}

function samplePackage(): AthenaEstimatePackage {
  return {
    schemaVersion: "estimate_v1",
    recommendedClientPrice: { amount: 12000, currencyCode: "USD" },
    recommendedPriceRange: {
      low: { amount: 10000, currencyCode: "USD" },
      high: { amount: 15000, currencyCode: "USD" },
    },
    scopeInterpretation: "Website redesign and messaging refresh.",
    pricingRationale: "Scope and commercial positioning support mid-market fee.",
    keyPriceDrivers: ["Scope breadth", "Urgency", "Positioning"],
    suggestedClientPositioning: "Position as strategic redesign, not commodity.",
    risksAndAssumptions: ["Assumes existing brand assets are usable."],
    geographyLabel: "United States",
    currencyResolution: "derived",
    guidanceDisclaimer: "Advisory Estimate — not a binding quote.",
    instructionProvenance: {
      configKey: "estimate_pricing_methodology",
      revisionId: "rev-hist-1",
      configured: true,
    },
    marketResearchClaimed: false,
    competitorQuotesFabricated: false,
  };
}

function sampleEstimate(overrides?: Partial<AthenaEstimate>): AthenaEstimate {
  return {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    licensee_account_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    organization_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    requested_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    organization_name_snapshot: "Acme Co",
    request_json: {
      projectNeed: "Redesign marketing site",
      additionalContext: "Need launch in 6 weeks",
      timeframe: "1_3_months",
    },
    status: "Ready",
    generation_stage: "completed",
    package_json: samplePackage(),
    error_code: null,
    error_message: null,
    currency_code: "USD",
    geography_label: "United States",
    currency_resolution: "derived",
    instruction_config_key: "estimate_pricing_methodology",
    instruction_revision_id: "rev-hist-1",
    instruction_configured: true,
    created_at: "2026-08-09T00:00:00.000Z",
    updated_at: "2026-08-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("Athena Estimate L11 Ask Athena backend", () => {
  it("1. GET history requires genuine active Master via getUser + requireLicenseeMasterAccount", () => {
    const route = read(
      "app/api/licensee/estimate/[id]/conversation/route.ts",
    );
    assert.match(route, /createSupabaseServerClient/);
    assert.match(route, /auth\.getUser/);
    assert.match(route, /UNAUTHORIZED/);
    assert.match(route, /401/);
    assert.match(route, /listEstimateConversationForMaster/);
    assert.match(route, /LicenseeAccessError/);
    assert.match(route, /403/);
    assert.doesNotMatch(route, /LICENSEE_MASTER_MARKER/);
    assert.doesNotMatch(route, /master-marker/);
    assert.doesNotMatch(route, /isSuperAdmin|super_admin/i);

    const service = read(
      "services/estimateConversation/estimateConversationService.ts",
    );
    assert.match(service, /requireLicenseeMasterAccount/);
  });

  it("2. GET constrained by Master ownership via visible-only lookup", () => {
    const service = read(
      "services/estimateConversation/estimateConversationService.ts",
    );
    assert.match(service, /getAthenaEstimateByIdForLicensee/);
    assert.match(
      service,
      /listEstimateConversationForMaster[\s\S]*getEstimate\(input\.estimateId, masterAccount\.id\)/,
    );
    const persistence = read(
      "services/estimate/athenaEstimateMessageService.ts",
    );
    assert.match(persistence, /\.eq\("licensee_account_id"/);
    assert.match(persistence, /\.eq\("estimate_id"/);
  });

  it("3. GET does not require current sub-account relationship", () => {
    const service = read(
      "services/estimateConversation/estimateConversationService.ts",
    );
    const listFn = service.slice(
      service.indexOf("export async function listEstimateConversationForMaster"),
      service.indexOf("export async function sendEstimateConversationForMaster"),
    );
    assert.doesNotMatch(listFn, /assertLicenseeOwnsSubAccount/);
    assert.doesNotMatch(listFn, /composeEstimateConversationContext/);
    assert.doesNotMatch(listFn, /getActiveEstimatePricingMethodologyInstruction/);
  });

  it("4/6. GET and POST hidden Estimate → 404 via visible-only lookup", () => {
    const service = read(
      "services/estimateConversation/estimateConversationService.ts",
    );
    assert.match(service, /getAthenaEstimateByIdForLicensee/);
    assert.doesNotMatch(
      service,
      /getAthenaEstimateByIdForLicenseeIncludingHidden/,
    );
    const estimateService = read("services/estimate/athenaEstimateService.ts");
    const getFn = estimateService.slice(
      estimateService.indexOf(
        "export async function getAthenaEstimateByIdForLicensee",
      ),
      estimateService.indexOf(
        "export async function getAthenaEstimateByIdForLicenseeIncludingHidden",
      ),
    );
    assert.match(getFn, /\.is\("hidden_at", null\)/);
  });

  it("5. POST requires Ready Estimate", async () => {
    resetEstimateConversationConcurrencyForTests();
    await assert.rejects(
      () =>
        sendEstimateConversationForMaster({
          masterUserId: "master-1",
          estimateId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          body: { message: "Why this price?" },
          deps: {
            requireMaster: async () => ({
              id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              user_id: "master-1",
              email: "m@example.com",
            }),
            getEstimate: async () =>
              sampleEstimate({ status: "Processing", package_json: null }),
            assertRelationship: async () => {
              throw new Error("should not reach relationship");
            },
          },
        }),
      (error: unknown) =>
        error instanceof EstimateConversationError &&
        error.code === "NOT_READY" &&
        error.httpStatus === 409,
    );
  });

  it("7/8. POST requires current relationship before tenant intelligence load", async () => {
    resetEstimateConversationConcurrencyForTests();
    let relationshipCalled = false;
    let contextCalled = false;
    await assert.rejects(
      () =>
        sendEstimateConversationForMaster({
          masterUserId: "master-1",
          estimateId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          body: { message: "Defend this price" },
          deps: {
            requireMaster: async () => ({
              id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              user_id: "master-1",
              email: "m@example.com",
            }),
            getEstimate: async () => sampleEstimate(),
            assertRelationship: async () => {
              relationshipCalled = true;
              throw new LicenseeAccessError(
                "Master does not own this sub-account relationship.",
              );
            },
            getMethodology: async () => {
              throw new Error("methodology should not load");
            },
            contextDeps: {
              buildBrain: async () => {
                contextCalled = true;
                return null;
              },
            },
          },
        }),
      (error: unknown) =>
        error instanceof LicenseeAccessError && relationshipCalled,
    );
    assert.equal(contextCalled, false);
  });

  it("9. re-added relationship allows send again", async () => {
    resetEstimateConversationConcurrencyForTests();
    const estimate = sampleEstimate();
    const inserted: AthenaEstimateMessage[] = [];
    let relationshipCalls = 0;

    const deps = {
      requireMaster: async () => ({
        id: estimate.licensee_account_id,
        user_id: "master-1",
        email: "m@example.com",
      }),
      getEstimate: async () => estimate,
      assertRelationship: async () => {
        relationshipCalls += 1;
        if (relationshipCalls === 1) {
          throw new LicenseeAccessError("relationship removed");
        }
        return {
          licenseeAccountId: estimate.licensee_account_id,
          organizationId: estimate.organization_id,
          relationshipId: "rel-1",
        };
      },
      getMethodology: async () => ({
        configKey: "estimate_pricing_methodology" as const,
        revisionId: "rev-live-2",
        instructionText: "Price for value and urgency.",
        configured: true,
        updatedAt: null,
        updatedBy: null,
      }),
      listMessages: async () => inserted,
      insertMessagePair: async (input: {
        estimateId: string;
        licenseeAccountId: string;
        organizationId: string;
        userContent: string;
        assistantContent: string;
      }) => {
        const userMessage: AthenaEstimateMessage = {
          id: `msg-${inserted.length + 1}`,
          estimateId: input.estimateId,
          licenseeAccountId: input.licenseeAccountId,
          organizationId: input.organizationId,
          role: "user",
          content: input.userContent,
          createdAt: new Date().toISOString(),
        };
        const assistantMessage: AthenaEstimateMessage = {
          id: `msg-${inserted.length + 2}`,
          estimateId: input.estimateId,
          licenseeAccountId: input.licenseeAccountId,
          organizationId: input.organizationId,
          role: "assistant",
          content: input.assistantContent,
          createdAt: new Date().toISOString(),
        };
        inserted.push(userMessage, assistantMessage);
        return { userMessage, assistantMessage };
      },
      callProvider: async () =>
        "The saved Estimate recommends 12000 USD. Advisably, a higher fee could be justified if urgency increases.",
      contextDeps: {
        buildBrain: async () => null,
        loadDeepIntelligence: async () => null,
      },
    };

    await assert.rejects(
      () =>
        sendEstimateConversationForMaster({
          masterUserId: "master-1",
          estimateId: estimate.id,
          body: { message: "Why this price?" },
          deps,
        }),
      LicenseeAccessError,
    );

    const { result } = await sendEstimateConversationForMaster({
      masterUserId: "master-1",
      estimateId: estimate.id,
      body: { message: "Why this price?" },
      deps,
    });
    assert.equal(result.ok, true);
    assert.equal(result.message.role, "assistant");
    assert.equal(inserted.length, 2);
    assert.equal(inserted[0].role, "user");
    assert.equal(inserted[1].role, "assistant");
  });

  it("10/11. POST requires configured methodology; missing → ESTIMATE_INSTRUCTION_NOT_CONFIGURED", async () => {
    resetEstimateConversationConcurrencyForTests();
    await assert.rejects(
      () =>
        sendEstimateConversationForMaster({
          masterUserId: "master-1",
          estimateId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          body: { message: "Would lower be too low?" },
          deps: {
            requireMaster: async () => ({
              id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              user_id: "master-1",
              email: "m@example.com",
            }),
            getEstimate: async () => sampleEstimate(),
            assertRelationship: async () => ({
              licenseeAccountId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              organizationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
              relationshipId: "rel-1",
            }),
            getMethodology: async () => ({
              configKey: "estimate_pricing_methodology" as const,
              revisionId: null,
              instructionText: "   ",
              configured: false,
              updatedAt: null,
              updatedBy: null,
            }),
          },
        }),
      (error: unknown) =>
        error instanceof EstimateConversationError &&
        error.code === ESTIMATE_INSTRUCTION_NOT_CONFIGURED &&
        error.httpStatus === 409,
    );
  });

  it("12/13. methodology revision is current at turn time; historical provenance unchanged", async () => {
    resetEstimateConversationConcurrencyForTests();
    const estimate = sampleEstimate({
      instruction_revision_id: "rev-hist-1",
    });
    const snapshot = structuredClone(estimate);
    let seenRevision: string | null = null;

    await sendEstimateConversationForMaster({
      masterUserId: "master-1",
      estimateId: estimate.id,
      body: { message: "How should I defend the price?" },
      deps: {
        requireMaster: async () => ({
          id: estimate.licensee_account_id,
          user_id: "master-1",
          email: "m@example.com",
        }),
        getEstimate: async () => estimate,
        assertRelationship: async () => ({
          licenseeAccountId: estimate.licensee_account_id,
          organizationId: estimate.organization_id,
          relationshipId: "rel-1",
        }),
        getMethodology: async () => ({
          configKey: "estimate_pricing_methodology" as const,
          revisionId: "rev-live-9",
          instructionText: "Current doctrine prefers premium packaging.",
          configured: true,
          updatedAt: null,
          updatedBy: null,
        }),
        listMessages: async () => [],
        insertMessagePair: async (input) => ({
          userMessage: {
            id: "id-user",
            estimateId: estimate.id,
            licenseeAccountId: estimate.licensee_account_id,
            organizationId: estimate.organization_id,
            role: "user" as const,
            content: input.userContent,
            createdAt: "2026-08-09T01:00:00.000Z",
          },
          assistantMessage: {
            id: "id-assistant",
            estimateId: estimate.id,
            licenseeAccountId: estimate.licensee_account_id,
            organizationId: estimate.organization_id,
            role: "assistant" as const,
            content: input.assistantContent,
            createdAt: "2026-08-09T01:00:01.000Z",
          },
        }),
        callProvider: async ({ messages }) => {
          const joined = messages.map((m) => m.content).join("\n");
          assert.match(joined, /rev-live-9/);
          assert.match(joined, /CURRENT GETOBLIC ESTIMATE PRICING METHODOLOGY/);
          seenRevision = "rev-live-9";
          return "Advisory guidance only; the saved Estimate remains unchanged.";
        },
        contextDeps: {
          buildBrain: async () => null,
          loadDeepIntelligence: async () => null,
        },
      },
    });

    assert.equal(seenRevision, "rev-live-9");
    assert.deepEqual(estimate, snapshot);
    assert.equal(estimate.instruction_revision_id, "rev-hist-1");
  });

  it("14/15. request body accepts message only; client cannot inject authority keys", () => {
    assert.deepEqual(validateEstimateConversationRequest({ message: " Hi " }), {
      message: "Hi",
    });
    assert.throws(
      () => validateEstimateConversationRequest({ message: "" }),
      EstimateConversationError,
    );
    assert.throws(
      () => validateEstimateConversationRequest(["nope"]),
      EstimateConversationError,
    );
    assert.throws(
      () => validateEstimateConversationRequest(null),
      EstimateConversationError,
    );
    for (const key of [
      "organizationId",
      "licenseeAccountId",
      "history",
      "methodology",
      "package",
      "role",
      "estimateId",
    ]) {
      assert.ok(ESTIMATE_CONVERSATION_FORBIDDEN_KEYS.includes(key as never));
      assert.throws(
        () =>
          validateEstimateConversationRequest({
            message: "ok",
            [key]: "injected",
          }),
        (error: unknown) =>
          error instanceof EstimateConversationError &&
          error.code === "VALIDATION_ERROR",
      );
    }
  });

  it("16/17/18/19. history loaded server-side, oldest-first, one thread per Estimate, ownership constrained", () => {
    const persistence = read(
      "services/estimate/athenaEstimateMessageService.ts",
    );
    assert.match(persistence, /listAthenaEstimateMessages/);
    assert.match(persistence, /\.order\("created_at", \{ ascending: true \}\)/);
    assert.match(persistence, /\.order\("id", \{ ascending: true \}\)/);
    assert.match(persistence, /created_at: userCreatedAt/);
    assert.match(persistence, /created_at: assistantCreatedAt/);
    assert.match(persistence, /baseMs \+ 1/);
    assert.match(persistence, /\.eq\("licensee_account_id"/);
    assert.match(persistence, /\.eq\("estimate_id"/);
    assert.doesNotMatch(persistence, /\.update\(/);
    assert.doesNotMatch(persistence, /\.delete\(/);

    const service = read(
      "services/estimateConversation/estimateConversationService.ts",
    );
    assert.match(service, /listMessages\(\{/);
    assert.match(service, /boundEstimateConversationHistory/);
    assert.doesNotMatch(service, /body\.history|request\.history/);

    const messages: AthenaEstimateMessage[] = [
      {
        id: "1",
        estimateId: "e1",
        licenseeAccountId: "l1",
        organizationId: "o1",
        role: "user",
        content: "first",
        createdAt: "2026-08-09T00:00:00.000Z",
      },
      {
        id: "2",
        estimateId: "e1",
        licenseeAccountId: "l1",
        organizationId: "o1",
        role: "assistant",
        content: "second",
        createdAt: "2026-08-09T00:01:00.000Z",
      },
    ];
    const bounded = boundEstimateConversationHistory(messages);
    assert.equal(bounded[0].content, "first");
    assert.equal(bounded[1].content, "second");
  });

  it("20/21/22. frozen facts, methodology, and current question remain distinct", () => {
    const frozen = buildFrozenEstimateFactsBlock(sampleEstimate());
    assert.match(frozen, /FROZEN_ESTIMATE_FACTS/);
    assert.match(frozen, /recommendedClientPrice/);
    assert.match(frozen, /12000/);
    assert.match(frozen, /scopeInterpretation/);
    assert.match(frozen, /pricingRationale/);

    const methodology = buildCurrentMethodologyBlock({
      configKey: "estimate_pricing_methodology",
      revisionId: "rev-x",
      instructionText: "Prefer value-based packaging.",
      configured: true,
      updatedAt: null,
      updatedBy: null,
    });
    assert.match(methodology, /CURRENT GETOBLIC ESTIMATE PRICING METHODOLOGY/);
    assert.match(methodology, /NOT client evidence/);
    assert.match(methodology, /NOT historical Estimate provenance/);

    const prompt = buildEstimateConversationPrompt({
      assembled: {
        organizationId: "org",
        estimateId: "est",
        frozenEstimateFacts: frozen,
        methodologyBlock: methodology,
        liveIntelligenceSections: [
          {
            type: "COMPACT_BRAIN_IDENTITY",
            trust: "confirmed_fact",
            label: "CURRENT TRUSTED ATHENA INTELLIGENCE — Compact Brain / Identity",
            content: "brain summary",
          },
        ],
        liveIntelligenceCharCount: 12,
        missingNotes: [],
        meta: {
          usedComposeEstimateOrganizationContext: false,
          includedProspectDiscussionOpportunityLibraries: false,
          includedSeoPackages: false,
          includedPersonas: false,
          methodologyRevisionId: "rev-x",
        },
      },
      history: [],
      userMessage: "What would justify charging more?",
    });

    const userContent = prompt.messages[prompt.messages.length - 1].content;
    assert.match(userContent, /FROZEN ESTIMATE FACTS/);
    assert.match(userContent, /CURRENT GETOBLIC ESTIMATE PRICING METHODOLOGY/);
    assert.match(userContent, /CURRENT TRUSTED ATHENA INTELLIGENCE/);
    assert.match(
      userContent,
      /CURRENT USER QUESTION \(guidance\/question — not client evidence\)/,
    );
    assert.match(userContent, /What would justify charging more\?/);
    assert.ok(
      userContent.indexOf("FROZEN ESTIMATE FACTS") <
        userContent.indexOf("CURRENT USER QUESTION"),
    );
  });

  it("23. bounded history uses canonical shared limits", () => {
    assert.equal(
      ESTIMATE_CONVERSATION_LIMITS.maxHistoryMessageCount,
      ATHENA_CONVERSATION_LIMITS.maxHistoryMessageCount,
    );
    assert.equal(
      ESTIMATE_CONVERSATION_LIMITS.maxHistoryTotalChars,
      ATHENA_CONVERSATION_LIMITS.maxHistoryTotalChars,
    );
    assert.equal(ESTIMATE_CONVERSATION_LIMITS.maxHistoryMessageCount, 20);
    assert.equal(ESTIMATE_CONVERSATION_LIMITS.maxHistoryTotalChars, 40_000);
    assert.equal(ESTIMATE_CONVERSATION_LIMITS.maxUserMessageLength, 4_000);

    const many: AthenaEstimateMessage[] = Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      estimateId: "e",
      licenseeAccountId: "l",
      organizationId: "o",
      role: i % 2 === 0 ? "user" : "assistant",
      content: `m${i}`,
      createdAt: `2026-08-09T00:${String(i).padStart(2, "0")}:00.000Z`,
    }));
    const bounded = boundEstimateConversationHistory(many);
    assert.equal(bounded.length, 20);
    assert.equal(bounded[0].content, "m5");
  });

  it("24/25/26. bounded live intelligence; full generation composer not reused; no library dumps", async () => {
    const contextSource = read(
      "services/estimateConversation/estimateConversationContext.ts",
    );
    assert.doesNotMatch(
      contextSource,
      /import\s*\{[^}]*composeEstimateOrganizationContext|composeEstimateOrganizationContext\s*\(/,
    );
    assert.match(
      contextSource,
      /Does NOT call composeEstimateOrganizationContext/,
    );
    assert.match(
      contextSource,
      /excludes Prospect\/Discussion\/Opportunity library dumps/,
    );
    assert.match(
      read("services/estimateConversation/estimateConversationTypes.ts"),
      /maxLiveIntelligenceTotalChars: 12_000/,
    );
    assert.doesNotMatch(contextSource, /getPersonas|listSeoReports/);
    assert.doesNotMatch(contextSource, /recentDiscussions|recentOpportunities/);

    const assembled = await composeEstimateConversationContext({
      estimate: sampleEstimate(),
      methodology: {
        configKey: "estimate_pricing_methodology",
        revisionId: "rev",
        instructionText: "Value-based.",
        configured: true,
        updatedAt: null,
        updatedBy: null,
      },
      deps: {
        buildBrain: async () => null,
        loadDeepIntelligence: async () => null,
      },
    });
    assert.equal(assembled.meta.usedComposeEstimateOrganizationContext, false);
    assert.equal(
      assembled.meta.includedProspectDiscussionOpportunityLibraries,
      false,
    );
    assert.equal(assembled.meta.includedSeoPackages, false);
    assert.equal(assembled.meta.includedPersonas, false);
    assert.ok(
      assembled.liveIntelligenceCharCount <=
        ESTIMATE_CONVERSATION_LIMITS.maxLiveIntelligenceTotalChars,
    );
  });

  it("27. saved Estimate never mutated — no Estimate writers in conversation POST path", () => {
    const service = read(
      "services/estimateConversation/estimateConversationService.ts",
    );
    assert.doesNotMatch(service, /createQueuedAthenaEstimate|markAthenaEstimate/);
    assert.doesNotMatch(service, /hideAthenaEstimate|package_json:/);
    assert.doesNotMatch(service, /\.update\(/);
    assert.doesNotMatch(service, /enqueueAthenaEstimateGenerationJob/);
    assert.doesNotMatch(service, /runEstimateGeneration|estimateGenerationPipeline/);
  });

  it("28/29/30. prompt immutability + advisory revision + forbidden live-research claims", () => {
    const system = read(
      "services/ai/prompts/estimateConversation/estimateConversationSystemPrompt.ts",
    );
    assert.ok(estimatePromptContainsImmutabilityContract(system));
    assert.ok(estimatePromptDistinguishesTrustClasses(system));
    assert.ok(estimatePromptForbidsLiveResearchClaims(system));
    assert.match(system, /label it as advisory/);
    assert.match(system, /Never claim or imply that you changed/);
    assert.match(system, /Regenerate or Create New Estimate/);
    assert.match(system, /Never claim live market research/);
    assert.match(system, /Never fabricate competitor quotes/);

    assert.equal(
      assistantReplyContainsForbiddenEstimateClaims(
        "We queried current market rates from a proprietary pricing database.",
      ),
      true,
    );
    for (const claim of [
      "I checked current market rates before answering.",
      "I searched competitor pricing for similar agencies.",
      "I found agencies charging $8,000 for this scope.",
      "According to a live pricing database, mid-market fees are higher.",
      "I looked this up online and the market supports that fee.",
      "Real competitor quotations were obtained for this reply.",
    ]) {
      assert.equal(
        assistantReplyContainsForbiddenEstimateClaims(claim),
        true,
        claim,
      );
    }
    assert.equal(
      assistantReplyContainsForbiddenEstimateClaims(
        "Advisably, you could charge more if urgency increases; the saved Estimate is unchanged.",
      ),
      false,
    );
  });

  it("28b. prompt requires plain-text output and concise default length", () => {
    const system = read(
      "services/ai/prompts/estimateConversation/estimateConversationSystemPrompt.ts",
    );
    assert.ok(estimatePromptRequiresPlainTextOutput(system));
    assert.ok(estimatePromptHasDefaultLengthGuidance(system));
    assert.match(system, /CLEAN PLAIN TEXT ONLY/);
    assert.match(system, /Markdown bold markers: \*\*/);
    assert.match(system, /Markdown headings: # \/ ## \/ ###/);
    assert.match(system, /HTML tags/);
    assert.match(system, /fenced code blocks/);
    assert.match(system, /Markdown tables/);
    assert.doesNotMatch(system, /render Markdown|markdown parser|remark|rehype/i);
    assert.match(system, /3–7 short paragraphs/);
    assert.match(system, /Answer the user's question directly first/);
    assert.match(
      system,
      /detailed breakdown|full analysis|exhaustive reasoning|step-by-step explanation|multiple scenarios/,
    );
    assert.match(system, /longer response is appropriate/);
    // Existing contracts remain intact alongside the presentation correction.
    assert.ok(estimatePromptContainsImmutabilityContract(system));
    assert.match(system, /label it as advisory/);
    assert.ok(estimatePromptForbidsLiveResearchClaims(system));
  });

  it("28c. assistant plain-text normalizer strips presentation markers", () => {
    assert.equal(
      normalizeEstimateConversationPlainText("**Current Scope:**"),
      "Current Scope:",
    );
    assert.equal(
      normalizeEstimateConversationPlainText("__Proposed Adjustment:__"),
      "Proposed Adjustment:",
    );
    assert.equal(
      normalizeEstimateConversationPlainText(
        [
          "# Full-Cycle Partner Acquisition Funnel Build-Out and Optimization:",
          "## Value:",
          "### Why this fee",
        ].join("\n"),
      ),
      [
        "Full-Cycle Partner Acquisition Funnel Build-Out and Optimization:",
        "Value:",
        "Why this fee",
      ].join("\n"),
    );
    assert.equal(
      normalizeEstimateConversationPlainText("* Defend urgency\n+ Keep scope tight"),
      "- Defend urgency\n- Keep scope tight",
    );
    assert.equal(
      normalizeEstimateConversationPlainText(
        ["```text", "advisory note", "```"].join("\n"),
      ),
      "advisory note",
    );
    assert.equal(
      normalizeEstimateConversationPlainText(
        [
          "**Current Scope:**",
          "* Keep brand refresh",
          "+ Drop optional CRM work",
          "",
          "```",
          "unchanged Estimate",
          "```",
        ].join("\n"),
      ),
      [
        "Current Scope:",
        "- Keep brand refresh",
        "- Drop optional CRM work",
        "",
        "unchanged Estimate",
      ].join("\n"),
    );

    const service = read(
      "services/estimateConversation/estimateConversationService.ts",
    );
    assert.match(service, /normalizeEstimateConversationPlainText/);
    assert.match(
      service,
      /normalizeEstimateConversationPlainText\(assistantRaw\)[\s\S]*validateAssistantReplyShape\(\s*assistantNormalized[\s\S]*assertAssistantReplyAllowed\(\s*assistantContent/,
    );
    assert.doesNotMatch(
      service,
      /remark|rehype|marked|markdown-it|DOMPurify|dangerouslySetInnerHTML/i,
    );
  });

  it("28d. normalization preserves plain text, lists, money, and paragraphs", () => {
    // 7. Existing clean plain text must remain unchanged.
    assert.equal(
      normalizeEstimateConversationPlainText(
        "Advisably keep the saved fee; the Estimate remains unchanged.",
      ),
      "Advisably keep the saved fee; the Estimate remains unchanged.",
    );

    // 8. Numbered lists must remain unchanged.
    assert.equal(
      normalizeEstimateConversationPlainText("1. Strategy\n2. Execution"),
      "1. Strategy\n2. Execution",
    );

    // 9. Existing hyphen bullets must remain unchanged.
    assert.equal(
      normalizeEstimateConversationPlainText("- Strategy\n- Execution"),
      "- Strategy\n- Execution",
    );

    // 10. Monetary values must remain unchanged.
    assert.equal(
      normalizeEstimateConversationPlainText(
        ["$48,000", "$33,600", "$75,000–$110,000"].join("\n"),
      ),
      ["$48,000", "$33,600", "$75,000–$110,000"].join("\n"),
    );

    // 11. Multiline paragraph structure must be preserved.
    assert.equal(
      normalizeEstimateConversationPlainText(
        "Paragraph one.\n\nParagraph two.\n\nParagraph three.",
      ),
      "Paragraph one.\n\nParagraph two.\n\nParagraph three.",
    );
  });

  it("28e. normalization never bypasses forbidden-claim validation", async () => {
    // 12/13. Normalize first; successful strip still cannot bypass forbidden claims.
    const markedForbidden =
      "**I checked current market rates** before answering.";
    const normalized = normalizeEstimateConversationPlainText(markedForbidden);
    assert.equal(normalized, "I checked current market rates before answering.");
    assert.equal(
      assistantReplyContainsForbiddenEstimateClaims(normalized),
      true,
    );

    resetEstimateConversationConcurrencyForTests();
    let pairCalls = 0;
    await assert.rejects(
      () =>
        sendEstimateConversationForMaster({
          masterUserId: "master-1",
          estimateId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          body: { message: "Why this fee?" },
          deps: {
            requireMaster: async () => ({
              id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              user_id: "master-1",
              email: "m@example.com",
            }),
            getEstimate: async () => sampleEstimate(),
            assertRelationship: async () => ({
              licenseeAccountId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              organizationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
              relationshipId: "rel-1",
            }),
            getMethodology: async () => ({
              configKey: "estimate_pricing_methodology" as const,
              revisionId: "rev",
              instructionText: "Doctrine",
              configured: true,
              updatedAt: null,
              updatedBy: null,
            }),
            listMessages: async () => [],
            insertMessagePair: async () => {
              pairCalls += 1;
              throw new Error("should not persist");
            },
            callProvider: async () => markedForbidden,
            contextDeps: {
              buildBrain: async () => null,
              loadDeepIntelligence: async () => null,
            },
          },
        }),
      (error: unknown) =>
        error instanceof EstimateConversationError &&
        error.code === "PROVIDER_ERROR",
    );
    assert.equal(pairCalls, 0);
  });

  it("28f. empty/meaningless normalized assistant content persists neither message", async () => {
    resetEstimateConversationConcurrencyForTests();
    let pairCalls = 0;
    await assert.rejects(
      () =>
        sendEstimateConversationForMaster({
          masterUserId: "master-1",
          estimateId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          body: { message: "Why?" },
          deps: {
            requireMaster: async () => ({
              id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              user_id: "master-1",
              email: "m@example.com",
            }),
            getEstimate: async () => sampleEstimate(),
            assertRelationship: async () => ({
              licenseeAccountId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              organizationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
              relationshipId: "rel-1",
            }),
            getMethodology: async () => ({
              configKey: "estimate_pricing_methodology" as const,
              revisionId: "rev",
              instructionText: "Doctrine",
              configured: true,
              updatedAt: null,
              updatedBy: null,
            }),
            listMessages: async () => [],
            insertMessagePair: async () => {
              pairCalls += 1;
              throw new Error("should not persist");
            },
            callProvider: async () => ["```", "```", "**   **", "# "].join("\n"),
            contextDeps: {
              buildBrain: async () => null,
              loadDeepIntelligence: async () => null,
            },
          },
        }),
      (error: unknown) =>
        error instanceof EstimateConversationError &&
        error.code === "PROVIDER_ERROR" &&
        /empty response/i.test(error.message),
    );
    assert.equal(pairCalls, 0);
    assert.equal(
      normalizeEstimateConversationPlainText(
        ["```", "```", "**   **", "# "].join("\n"),
      ),
      "",
    );
  });

  it("31/32/33. no web/search/FX/pricing APIs; no worker; synchronous provider route", () => {
    const service = read(
      "services/estimateConversation/estimateConversationService.ts",
    );
    assert.match(service, /callGeminiViaOpenRouter|callProvider/);
    assert.match(service, /scope: "estimate"/);
    assert.doesNotMatch(service, /estimate_package/);
    assert.doesNotMatch(service, /enqueueAthenaEstimate|claimJob|processJob/);
    assert.doesNotMatch(
      service,
      /from\(["']workers\/|athenaWorker|generation job executor/i,
    );
    assert.doesNotMatch(service, /fx|exchange.?rate|semrush|ahrefs|web.?search/i);

    const route = read(
      "app/api/licensee/estimate/[id]/conversation/route.ts",
    );
    assert.match(route, /export const maxDuration = 60/);
    assert.match(route, /sendEstimateConversationForMaster/);

    const provider = read(
      "services/athenaConversation/athenaConversationProvider.ts",
    );
    assert.match(provider, /scope: "identity" \| "getting-started" \| "estimate"/);
    assert.match(provider, /estimate_conversation/);
    assert.equal(ESTIMATE_CONVERSATION_MODEL, "google/gemini-2.5-flash");
  });

  it("34/35. atomic pair; provider failure persists neither row", async () => {
    resetEstimateConversationConcurrencyForTests();
    const inserted: AthenaEstimateMessage[] = [];
    await assert.rejects(
      () =>
        sendEstimateConversationForMaster({
          masterUserId: "master-1",
          estimateId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          body: { message: "Why?" },
          deps: {
            requireMaster: async () => ({
              id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              user_id: "master-1",
              email: "m@example.com",
            }),
            getEstimate: async () => sampleEstimate(),
            assertRelationship: async () => ({
              licenseeAccountId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              organizationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
              relationshipId: "rel-1",
            }),
            getMethodology: async () => ({
              configKey: "estimate_pricing_methodology" as const,
              revisionId: "rev",
              instructionText: "Doctrine",
              configured: true,
              updatedAt: null,
              updatedBy: null,
            }),
            listMessages: async () => [],
            insertMessagePair: async (input) => {
              const userMessage: AthenaEstimateMessage = {
                id: `m-${inserted.length}`,
                estimateId: input.estimateId,
                licenseeAccountId: input.licenseeAccountId,
                organizationId: input.organizationId,
                role: "user",
                content: input.userContent,
                createdAt: "2026-08-09T02:00:00.000Z",
              };
              const assistantMessage: AthenaEstimateMessage = {
                id: `m-${inserted.length + 1}`,
                estimateId: input.estimateId,
                licenseeAccountId: input.licenseeAccountId,
                organizationId: input.organizationId,
                role: "assistant",
                content: input.assistantContent,
                createdAt: "2026-08-09T02:00:01.000Z",
              };
              inserted.push(userMessage, assistantMessage);
              return { userMessage, assistantMessage };
            },
            callProvider: async () => {
              throw new EstimateConversationError(
                "PROVIDER_ERROR",
                "provider down",
                500,
              );
            },
            contextDeps: {
              buildBrain: async () => null,
              loadDeepIntelligence: async () => null,
            },
          },
        }),
      EstimateConversationError,
    );
    assert.equal(inserted.length, 0);

    const service = read(
      "services/estimateConversation/estimateConversationService.ts",
    );
    assert.match(service, /Atomic pair insert only after a valid assistant reply/);
    assert.match(service, /insertMessagePair|insertAthenaEstimateMessagePair/);
    assert.match(service, /pair_persist_failed/);
    assert.doesNotMatch(service, /assistant_persist_failed_after_user/);
  });

  it("atomic pair persistence contract: one multi-row insert; shared ownership; roles", () => {
    const persistence = read(
      "services/estimate/athenaEstimateMessageService.ts",
    );
    assert.match(persistence, /export async function insertAthenaEstimateMessagePair/);
    assert.match(
      persistence,
      /\.insert\(\[\s*userRow,\s*assistantRow\s*\]\)/,
    );
    assert.match(persistence, /role: "user" as const/);
    assert.match(persistence, /role: "assistant" as const/);
    assert.match(
      persistence,
      /rows\.find\(\(row\) => row\.role === "assistant"\)/,
    );
    assert.match(
      persistence,
      /userMessage\.estimateId !== estimateId/,
    );
    assert.match(
      persistence,
      /userMessage\.licenseeAccountId !== licenseeAccountId/,
    );
    assert.match(
      persistence,
      /userMessage\.organizationId !== organizationId/,
    );
    // No browser-selected role on the pair API.
    assert.match(
      persistence,
      /userContent: string;[\s\S]*assistantContent: string;/,
    );
    assert.doesNotMatch(
      persistence.slice(
        persistence.indexOf("export async function insertAthenaEstimateMessagePair"),
      ),
      /role:\s*AthenaEstimateMessageRole/,
    );

    const service = read(
      "services/estimateConversation/estimateConversationService.ts",
    );
    assert.match(service, /insertAthenaEstimateMessagePair/);
    assert.doesNotMatch(service, /insertAthenaEstimateMessage\b/);
    assert.doesNotMatch(service, /insertMessage\b/);
  });

  it("pair insert failure → MESSAGE_PERSISTENCE_FAILED; no partial pair persisted", async () => {
    resetEstimateConversationConcurrencyForTests();
    let pairCalls = 0;
    await assert.rejects(
      () =>
        sendEstimateConversationForMaster({
          masterUserId: "master-1",
          estimateId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          body: { message: "Why this fee?" },
          deps: {
            requireMaster: async () => ({
              id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              user_id: "master-1",
              email: "m@example.com",
            }),
            getEstimate: async () => sampleEstimate(),
            assertRelationship: async () => ({
              licenseeAccountId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              organizationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
              relationshipId: "rel-1",
            }),
            getMethodology: async () => ({
              configKey: "estimate_pricing_methodology" as const,
              revisionId: "rev",
              instructionText: "Doctrine",
              configured: true,
              updatedAt: null,
              updatedBy: null,
            }),
            listMessages: async () => [],
            insertMessagePair: async () => {
              pairCalls += 1;
              // Single-statement contract: failure means neither row persisted.
              throw new Error("db insert failed");
            },
            callProvider: async () =>
              "Advisory guidance only; the saved Estimate remains unchanged.",
            contextDeps: {
              buildBrain: async () => null,
              loadDeepIntelligence: async () => null,
            },
          },
        }),
      (error: unknown) =>
        error instanceof EstimateConversationError &&
        error.code === "MESSAGE_PERSISTENCE_FAILED" &&
        error.httpStatus === 500,
    );
    assert.equal(pairCalls, 1);
  });

  it("assistant validation failure persists neither row", async () => {
    resetEstimateConversationConcurrencyForTests();
    let pairCalls = 0;
    await assert.rejects(
      () =>
        sendEstimateConversationForMaster({
          masterUserId: "master-1",
          estimateId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          body: { message: "Why?" },
          deps: {
            requireMaster: async () => ({
              id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              user_id: "master-1",
              email: "m@example.com",
            }),
            getEstimate: async () => sampleEstimate(),
            assertRelationship: async () => ({
              licenseeAccountId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              organizationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
              relationshipId: "rel-1",
            }),
            getMethodology: async () => ({
              configKey: "estimate_pricing_methodology" as const,
              revisionId: "rev",
              instructionText: "Doctrine",
              configured: true,
              updatedAt: null,
              updatedBy: null,
            }),
            listMessages: async () => [],
            insertMessagePair: async () => {
              pairCalls += 1;
              throw new Error("should not persist");
            },
            callProvider: async () =>
              "We queried current market rates from a proprietary pricing database.",
            contextDeps: {
              buildBrain: async () => null,
              loadDeepIntelligence: async () => null,
            },
          },
        }),
      (error: unknown) =>
        error instanceof EstimateConversationError &&
        error.code === "PROVIDER_ERROR",
    );
    assert.equal(pairCalls, 0);
  });

  it("successful POST returns persisted assistant message; Estimate immutable", async () => {
    resetEstimateConversationConcurrencyForTests();
    const estimate = sampleEstimate();
    const snapshot = structuredClone(estimate);
    const { result } = await sendEstimateConversationForMaster({
      masterUserId: "master-1",
      estimateId: estimate.id,
      body: { message: "Defend the fee" },
      deps: {
        requireMaster: async () => ({
          id: estimate.licensee_account_id,
          user_id: "master-1",
          email: "m@example.com",
        }),
        getEstimate: async () => estimate,
        assertRelationship: async () => ({
          licenseeAccountId: estimate.licensee_account_id,
          organizationId: estimate.organization_id,
          relationshipId: "rel-1",
        }),
        getMethodology: async () => ({
          configKey: "estimate_pricing_methodology" as const,
          revisionId: "rev",
          instructionText: "Doctrine",
          configured: true,
          updatedAt: null,
          updatedBy: null,
        }),
        listMessages: async () => [],
        insertMessagePair: async (input) => {
          assert.equal(input.estimateId, estimate.id);
          assert.equal(input.licenseeAccountId, estimate.licensee_account_id);
          assert.equal(input.organizationId, estimate.organization_id);
          assert.equal(input.userContent, "Defend the fee");
          return {
            userMessage: {
              id: "u-1",
              estimateId: input.estimateId,
              licenseeAccountId: input.licenseeAccountId,
              organizationId: input.organizationId,
              role: "user" as const,
              content: input.userContent,
              createdAt: "2026-08-09T03:00:00.000Z",
            },
            assistantMessage: {
              id: "a-1",
              estimateId: input.estimateId,
              licenseeAccountId: input.licenseeAccountId,
              organizationId: input.organizationId,
              role: "assistant" as const,
              content: input.assistantContent,
              createdAt: "2026-08-09T03:00:01.000Z",
            },
          };
        },
        callProvider: async () =>
          "Advisably keep the saved fee; the Estimate remains unchanged.",
        contextDeps: {
          buildBrain: async () => null,
          loadDeepIntelligence: async () => null,
        },
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.message.id, "a-1");
    assert.equal(result.message.role, "assistant");
    assert.equal(
      result.message.content,
      "Advisably keep the saved fee; the Estimate remains unchanged.",
    );
    assert.equal(result.message.createdAt, "2026-08-09T03:00:01.000Z");
    assert.deepEqual(estimate, snapshot);
  });

  it("successful POST persists normalized plain-text assistant reply", async () => {
    resetEstimateConversationConcurrencyForTests();
    const estimate = sampleEstimate();
    let persistedAssistant = "";
    const { result } = await sendEstimateConversationForMaster({
      masterUserId: "master-1",
      estimateId: estimate.id,
      body: { message: "Summarize scope" },
      deps: {
        requireMaster: async () => ({
          id: estimate.licensee_account_id,
          user_id: "master-1",
          email: "m@example.com",
        }),
        getEstimate: async () => estimate,
        assertRelationship: async () => ({
          licenseeAccountId: estimate.licensee_account_id,
          organizationId: estimate.organization_id,
          relationshipId: "rel-1",
        }),
        getMethodology: async () => ({
          configKey: "estimate_pricing_methodology" as const,
          revisionId: "rev",
          instructionText: "Doctrine",
          configured: true,
          updatedAt: null,
          updatedBy: null,
        }),
        listMessages: async () => [],
        insertMessagePair: async (input) => {
          persistedAssistant = input.assistantContent;
          return {
            userMessage: {
              id: "u-2",
              estimateId: input.estimateId,
              licenseeAccountId: input.licenseeAccountId,
              organizationId: input.organizationId,
              role: "user" as const,
              content: input.userContent,
              createdAt: "2026-08-09T03:10:00.000Z",
            },
            assistantMessage: {
              id: "a-2",
              estimateId: input.estimateId,
              licenseeAccountId: input.licenseeAccountId,
              organizationId: input.organizationId,
              role: "assistant" as const,
              content: input.assistantContent,
              createdAt: "2026-08-09T03:10:01.000Z",
            },
          };
        },
        callProvider: async () =>
          [
            "**Current Scope:**",
            "* Keep brand refresh",
            "+ Drop optional CRM work",
            "## Value:",
            "Advisory only; Estimate unchanged.",
          ].join("\n"),
        contextDeps: {
          buildBrain: async () => null,
          loadDeepIntelligence: async () => null,
        },
      },
    });
    const expected = [
      "Current Scope:",
      "- Keep brand refresh",
      "- Drop optional CRM work",
      "Value:",
      "Advisory only; Estimate unchanged.",
    ].join("\n");
    assert.equal(persistedAssistant, expected);
    assert.equal(result.message.content, expected);
    assert.doesNotMatch(result.message.content, /\*\*|__/);
    assert.doesNotMatch(result.message.content, /^[#*+]/m);
  });

  it("36. Quote non-interference", () => {
    const quoteFiles = [
      "services/quote",
      "app/api/quote",
      "app/api/licensee/quote",
      "components/quote",
      "tests/quote",
    ];
    for (const dir of quoteFiles) {
      for (const file of collectFiles(dir)) {
        const source = read(file);
        assert.doesNotMatch(source, /estimateConversation/);
        assert.doesNotMatch(source, /athena_estimate_messages/);
        assert.doesNotMatch(
          source,
          /listEstimateConversationForMaster|sendEstimateConversationForMaster/,
        );
      }
    }
  });

  it("GET history happy path returns oldest-first public messages", async () => {
    const normalizedPersisted =
      "Current Scope:\n- Keep brand refresh\nAdvisory only; Estimate unchanged.";
    const result = await listEstimateConversationForMaster({
      masterUserId: "master-1",
      estimateId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      deps: {
        requireMaster: async () => ({
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          user_id: "master-1",
          email: "m@example.com",
        }),
        getEstimate: async () => sampleEstimate(),
        listMessages: async () => [
          {
            id: "1",
            estimateId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            licenseeAccountId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            organizationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            role: "user",
            content: "a",
            createdAt: "2026-08-09T00:00:00.000Z",
          },
          {
            id: "2",
            estimateId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            licenseeAccountId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            organizationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            role: "assistant",
            content: normalizedPersisted,
            createdAt: "2026-08-09T00:01:00.000Z",
          },
        ],
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.messages[0].content, "a");
    // 17. Subsequent GET history returns the normalized persisted assistant content.
    assert.equal(result.messages[1].content, normalizedPersisted);
  });

  it("API route exports GET + POST; no Hide/UI coupling", () => {
    assert.equal(
      existsSync(
        join(ROOT, "app/api/licensee/estimate/[id]/conversation/route.ts"),
      ),
      true,
    );
    const route = read(
      "app/api/licensee/estimate/[id]/conversation/route.ts",
    );
    assert.match(route, /export async function GET/);
    assert.match(route, /export async function POST/);
    assert.doesNotMatch(route, /hideAthenaEstimate/);

    const client = read(
      "components/licensee/estimate/LicenseeEstimateClient.tsx",
    );
    const askPanel = read(
      "components/licensee/estimate/EstimateAskAthenaPanel.tsx",
    );
    // L12 owns Ask Athena UI wiring against this L11 conversation route.
    assert.match(client, /EstimateAskAthenaPanel/);
    assert.match(askPanel, /\/conversation/);
    // 20. No UI Markdown/HTML renderer added.
    assert.match(askPanel, /whitespace-pre-wrap/);
    assert.match(askPanel, /\{message\.content\}/);
    assert.doesNotMatch(
      askPanel,
      /ReactMarkdown|remark|rehype|marked|markdown-it|dangerouslySetInnerHTML|DOMPurify/i,
    );
    // 21. No dependency added for normalization/rendering.
    const pkg = read("package.json");
    assert.doesNotMatch(
      pkg,
      /"react-markdown"|"remark"|"rehype"|"marked"|"markdown-it"|"dompurify"/i,
    );
  });

  it("message persistence uses service_role supabaseAdmin only", () => {
    const persistence = read(
      "services/estimate/athenaEstimateMessageService.ts",
    );
    assert.match(persistence, /supabaseAdmin/);
    assert.doesNotMatch(persistence, /createSupabaseServerClient/);
    assert.match(persistence, /from\("athena_estimate_messages"\)/);
  });

  it("immutability assertion fields remain untouched by conversation modules", () => {
    const conversationFiles = collectFiles("services/estimateConversation");
    conversationFiles.push(
      "services/estimate/athenaEstimateMessageService.ts",
      "app/api/licensee/estimate/[id]/conversation/route.ts",
      "services/ai/prompts/estimateConversation/estimateConversationSystemPrompt.ts",
    );
    for (const file of conversationFiles) {
      const source = read(file);
      assert.doesNotMatch(source, /status:\s*["']Ready["']/);
      assert.doesNotMatch(source, /package_json\s*:/);
      assert.doesNotMatch(source, /request_json\s*:/);
      assert.doesNotMatch(source, /hidden_at\s*:/);
      assert.doesNotMatch(source, /instruction_revision_id\s*:/);
    }
  });
});
