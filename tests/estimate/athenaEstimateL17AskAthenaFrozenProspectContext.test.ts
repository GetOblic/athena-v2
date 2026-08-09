/**
 * Athena Estimate V27 L17 — Ask Athena frozen Prospect generation context.
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
  AthenaEstimatePackage,
  EstimateProspectGenerationContextV1,
} from "../../services/estimate/athenaEstimateTypes";
import {
  ESTIMATE_PROSPECT_CONTEXT_COMPOSED_TEXT_MAX_CHARS,
} from "../../services/estimate/athenaEstimateTypes";
import {
  toPublicAthenaEstimateDetail,
  toPublicAthenaEstimateSummary,
} from "../../services/estimate/athenaEstimatePublic";
import {
  buildFrozenEstimateFactsBlock,
  buildFrozenProspectGenerationContextBlock,
  composeEstimateConversationContext,
} from "../../services/estimateConversation/estimateConversationContext";
import { normalizeEstimateConversationPlainText } from "../../services/estimateConversation/estimateConversationPlainText";
import {
  buildEstimateConversationPrompt,
  estimatePromptContainsImmutabilityContract,
  estimatePromptDistinguishesTrustClasses,
  estimatePromptForbidsLiveResearchClaims,
  estimatePromptRequiresPlainTextOutput,
  estimatePromptTreatsFrozenProspectAsHistorical,
} from "../../services/estimateConversation/estimateConversationPrompt";
import {
  sendEstimateConversationForMaster,
  resetEstimateConversationConcurrencyForTests,
} from "../../services/estimateConversation/estimateConversationService";
import {
  ESTIMATE_CONVERSATION_LIMITS,
} from "../../services/estimateConversation/estimateConversationTypes";

const ROOT = process.cwd();
const PROSPECT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const MASTER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACCOUNT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ORG_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

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

function validFrozenContext(
  overrides?: Partial<EstimateProspectGenerationContextV1>,
): EstimateProspectGenerationContextV1 {
  return {
    schemaVersion: "estimate_prospect_context_v1",
    prospectId: PROSPECT_ID,
    businessName: "ABC Dental Generation Name",
    capturedAt: "2026-08-09T12:00:00.000Z",
    composedText:
      "PROSPECT COMMERCIAL TARGET INTELLIGENCE\nExact generation freeze marker ALPHA-7741\nLocal dental clinic positioning.",
    available: {
      profile: true,
      notesOrAdditionalContext: true,
      adsContent: false,
      websiteIntelligence: true,
      executiveIntelligence: true,
      strategicAssetBlueprint: false,
    },
    sources: {
      linkedDiscussionId: null,
      executiveVersionId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    },
    ...overrides,
  };
}

function sampleEstimate(overrides?: Partial<AthenaEstimate>): AthenaEstimate {
  return {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    licensee_account_id: ACCOUNT_ID,
    organization_id: ORG_ID,
    requested_by: MASTER_ID,
    organization_name_snapshot: "Acme Co",
    prospect_id: null,
    prospect_business_name_snapshot: null,
    prospect_generation_context_json: null,
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

function prospectReadyEstimate(
  overrides?: Partial<AthenaEstimate>,
): AthenaEstimate {
  return sampleEstimate({
    prospect_id: PROSPECT_ID,
    prospect_business_name_snapshot: "ABC Dental Snapshot",
    prospect_generation_context_json: validFrozenContext(),
    ...overrides,
  });
}

const methodology = {
  configKey: "estimate_pricing_methodology" as const,
  revisionId: "rev-live-1",
  instructionText: "Prefer value-based packaging for advisory Estimates.",
  configured: true,
  updatedAt: null,
  updatedBy: null,
};

describe("Athena Estimate L17 Ask Athena frozen Prospect context", () => {
  it("1/2/28. Org-only Ready Estimate: no frozen Prospect section / no empty heading; V26-compatible", async () => {
    const assembled = await composeEstimateConversationContext({
      estimate: sampleEstimate(),
      methodology,
      deps: {
        buildBrain: async () => null,
        loadDeepIntelligence: async () => null,
      },
    });
    assert.equal(assembled.frozenProspectGenerationContext, null);
    assert.equal(assembled.meta.includedFrozenProspectGenerationContext, false);
    assert.equal(assembled.meta.frozenProspectContextSource, null);
    assert.doesNotMatch(assembled.frozenEstimateFacts, /Commercial target/);
    assert.doesNotMatch(assembled.frozenEstimateFacts, /Prospect removed/);
    assert.doesNotMatch(assembled.frozenEstimateFacts, /prospectTargetStatus/);

    const prompt = buildEstimateConversationPrompt({
      assembled,
      history: [],
      userMessage: "Why this price?",
    });
    const userContent = prompt.messages[prompt.messages.length - 1].content;
    assert.doesNotMatch(userContent, /FROZEN PROSPECT GENERATION CONTEXT/);
    assert.match(userContent, /FROZEN ESTIMATE FACTS/);
    assert.match(userContent, /CURRENT GETOBLIC ESTIMATE PRICING METHODOLOGY/);
    assert.match(userContent, /CURRENT TRUSTED ATHENA INTELLIGENCE/);
  });

  it("3/4. Prospect Ready Estimate includes exact validated composedText", async () => {
    const freeze = validFrozenContext({
      composedText: "EXACT-COMPOSED-TEXT-MARKER-991",
    });
    const assembled = await composeEstimateConversationContext({
      estimate: prospectReadyEstimate({
        prospect_generation_context_json: freeze,
      }),
      methodology,
      deps: {
        buildBrain: async () => null,
        loadDeepIntelligence: async () => null,
      },
    });
    assert.equal(assembled.meta.includedFrozenProspectGenerationContext, true);
    assert.equal(assembled.meta.frozenProspectContextSource, "frozen_estimate_row");
    assert.equal(
      assembled.frozenProspectGenerationContext,
      "EXACT-COMPOSED-TEXT-MARKER-991",
    );

    const prompt = buildEstimateConversationPrompt({
      assembled,
      history: [],
      userMessage: "What Prospect facts informed this?",
    });
    const userContent = prompt.messages[prompt.messages.length - 1].content;
    assert.match(userContent, /FROZEN PROSPECT GENERATION CONTEXT/);
    assert.match(userContent, /EXACT-COMPOSED-TEXT-MARKER-991/);
    assert.ok(
      userContent.indexOf("FROZEN ESTIMATE FACTS") <
        userContent.indexOf("FROZEN PROSPECT GENERATION CONTEXT"),
    );
    assert.ok(
      userContent.indexOf("FROZEN PROSPECT GENERATION CONTEXT") <
        userContent.indexOf("CURRENT GETOBLIC ESTIMATE PRICING METHODOLOGY"),
    );
  });

  it("5/6/7/8. Ask does not live-load Prospect by id / EV / Blueprint / website", () => {
    const context = read(
      "services/estimateConversation/estimateConversationContext.ts",
    );
    const service = read(
      "services/estimateConversation/estimateConversationService.ts",
    );
    const prompt = read(
      "services/estimateConversation/estimateConversationPrompt.ts",
    );
    // Strip block comments so documentation negatives do not false-positive.
    const stripComments = (source: string) =>
      source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const source of [context, service, prompt].map(stripComments)) {
      assert.doesNotMatch(source, /getProspectById\s*\(/);
      assert.doesNotMatch(source, /getProspects\s*\(/);
      assert.doesNotMatch(source, /composeEstimateProspectGenerationContext/);
      assert.doesNotMatch(
        source,
        /loadProspectCurrentExecutive|getCurrentExecutiveVersion/,
      );
      assert.doesNotMatch(source, /getProspectBlueprint|loadProspectBlueprint/);
      assert.doesNotMatch(
        source,
        /loadProspectWebsiteIntelligence|getProspectWebsiteIntelligence/,
      );
      assert.doesNotMatch(source, /listProspectDiscussions|opportunityLibraries/);
    }
    assert.match(context, /validateEstimateProspectGenerationContext/);
    assert.match(context, /prospect_generation_context_json/);
    assert.match(context, /Does NOT live-reload Prospect intelligence/);
  });

  it("9/10. Active Prospect edited/renamed after Ready: conversation remains frozen", async () => {
    const freeze = validFrozenContext({
      businessName: "Generation-Time Name",
      composedText: "Generation freeze body BEFORE edits",
    });
    const estimate = prospectReadyEstimate({
      prospect_id: PROSPECT_ID,
      prospect_business_name_snapshot: "Snapshot At Create",
      prospect_generation_context_json: freeze,
    });
    // Simulate post-Ready CRM rename/edit: row freeze + snapshot unchanged.
    const assembled = await composeEstimateConversationContext({
      estimate,
      methodology,
      deps: {
        buildBrain: async () => null,
        loadDeepIntelligence: async () => null,
      },
    });
    assert.equal(
      assembled.frozenProspectGenerationContext,
      "Generation freeze body BEFORE edits",
    );
    assert.equal(
      assembled.frozenProspectGenerationMeta.generationTimeBusinessName,
      "Generation-Time Name",
    );
    assert.match(
      assembled.frozenEstimateFacts,
      /"prospectBusinessNameSnapshot": "Snapshot At Create"/,
    );
    assert.doesNotMatch(
      assembled.frozenProspectGenerationContext ?? "",
      /Live renamed|NEW WEBSITE/,
    );
  });

  it("11/12/13/14. Prospect removed: Ask available, freeze included, facts mark removed, no regenerate claim", async () => {
    const freeze = validFrozenContext({
      composedText: "Removed-prospect freeze body",
    });
    const estimate = prospectReadyEstimate({
      prospect_id: null,
      prospect_business_name_snapshot: "ABC Dental Snapshot",
      prospect_generation_context_json: freeze,
    });
    const assembled = await composeEstimateConversationContext({
      estimate,
      methodology,
      deps: {
        buildBrain: async () => null,
        loadDeepIntelligence: async () => null,
      },
    });
    assert.equal(assembled.meta.includedFrozenProspectGenerationContext, true);
    assert.equal(
      assembled.frozenProspectGenerationContext,
      "Removed-prospect freeze body",
    );
    assert.match(assembled.frozenEstimateFacts, /"prospectRemoved": true/);
    assert.match(assembled.frozenEstimateFacts, /Prospect removed/);
    assert.match(
      assembled.frozenEstimateFacts,
      /"prospectTargetStatus": "Prospect removed"/,
    );

    const system = read(
      "services/ai/prompts/estimateConversation/estimateConversationSystemPrompt.ts",
    );
    assert.ok(estimatePromptTreatsFrozenProspectAsHistorical(system));
    assert.match(
      system,
      /do NOT claim Regenerate is available for that Prospect-targeted Estimate/i,
    );

    resetEstimateConversationConcurrencyForTests();
    let providerCalls = 0;
    const { result } = await sendEstimateConversationForMaster({
      masterUserId: MASTER_ID,
      estimateId: estimate.id,
      body: { message: "Why was this priced this way?" },
      deps: {
        requireMaster: async () => ({
          id: ACCOUNT_ID,
          user_id: MASTER_ID,
          email: "master@example.com",
        }),
        getEstimate: async () => estimate,
        assertRelationship: async () => ({
          licenseeAccountId: ACCOUNT_ID,
          organizationId: ORG_ID,
          relationshipId: "rel-1",
        }),
        getMethodology: async () => methodology,
        listMessages: async () => [],
        insertMessagePair: async (input) => ({
          userMessage: {
            id: "u1",
            estimateId: estimate.id,
            licenseeAccountId: ACCOUNT_ID,
            organizationId: ORG_ID,
            role: "user",
            content: input.userContent,
            createdAt: "2026-08-09T01:00:00.000Z",
          },
          assistantMessage: {
            id: "a1",
            estimateId: estimate.id,
            licenseeAccountId: ACCOUNT_ID,
            organizationId: ORG_ID,
            role: "assistant",
            content: input.assistantContent,
            createdAt: "2026-08-09T01:00:01.000Z",
          },
        }),
        callProvider: async () => {
          providerCalls += 1;
          return "At the time this Estimate was generated, the available Prospect intelligence indicated a local clinic positioning.";
        },
        contextDeps: {
          buildBrain: async () => null,
          loadDeepIntelligence: async () => null,
        },
      },
    });
    assert.equal(providerCalls, 1);
    assert.equal(result.ok, true);
  });

  it("15/16. Malformed frozen context: raw JSON not injected; safe deterministic fallback", async () => {
    const malformed = {
      schemaVersion: "estimate_prospect_context_v1",
      prospectId: PROSPECT_ID,
      businessName: "Broken",
      capturedAt: "not-a-date",
      composedText: "SHOULD-NOT-APPEAR-IN-PROMPT",
      available: { profile: true },
      sources: {},
    } as unknown as EstimateProspectGenerationContextV1;

    const resolved = buildFrozenProspectGenerationContextBlock(
      prospectReadyEstimate({
        prospect_generation_context_json: malformed,
      }),
    );
    assert.equal(resolved.included, false);
    assert.equal(resolved.unavailable, true);
    assert.equal(resolved.block, null);

    const assembled = await composeEstimateConversationContext({
      estimate: prospectReadyEstimate({
        prospect_generation_context_json: malformed,
      }),
      methodology,
      deps: {
        buildBrain: async () => null,
        loadDeepIntelligence: async () => null,
      },
    });
    assert.equal(assembled.frozenProspectGenerationContext, null);
    assert.equal(assembled.meta.includedFrozenProspectGenerationContext, false);
    assert.ok(
      assembled.missingNotes.some((note) =>
        note.includes("Frozen Prospect generation context was unavailable"),
      ),
    );
    const prompt = buildEstimateConversationPrompt({
      assembled,
      history: [],
      userMessage: "Explain the Estimate",
    });
    const userContent = prompt.messages[prompt.messages.length - 1].content;
    assert.doesNotMatch(userContent, /SHOULD-NOT-APPEAR-IN-PROMPT/);
    assert.doesNotMatch(userContent, /FROZEN PROSPECT GENERATION CONTEXT/);
    assert.match(userContent, /FROZEN ESTIMATE FACTS/);
  });

  it("17/18. Frozen Prospect max 12,000 enforced; frozen Estimate facts budget unchanged", () => {
    assert.equal(ESTIMATE_CONVERSATION_LIMITS.maxFrozenProspectContextChars, 12_000);
    assert.equal(ESTIMATE_CONVERSATION_LIMITS.maxFrozenEstimateFactsChars, 8_000);
    assert.equal(
      ESTIMATE_CONVERSATION_LIMITS.maxFrozenProspectContextChars,
      ESTIMATE_PROSPECT_CONTEXT_COMPOSED_TEXT_MAX_CHARS,
    );

    const exactMax = "Z".repeat(
      ESTIMATE_CONVERSATION_LIMITS.maxFrozenProspectContextChars,
    );
    const atMax = buildFrozenProspectGenerationContextBlock(
      prospectReadyEstimate({
        prospect_generation_context_json: validFrozenContext({
          composedText: exactMax,
        }),
      }),
    );
    assert.equal(atMax.included, true);
    assert.equal(atMax.block, exactMax);
    assert.equal(
      atMax.block?.length,
      ESTIMATE_CONVERSATION_LIMITS.maxFrozenProspectContextChars,
    );

    const oversize = "Z".repeat(
      ESTIMATE_CONVERSATION_LIMITS.maxFrozenProspectContextChars + 500,
    );
    const resolved = buildFrozenProspectGenerationContextBlock(
      prospectReadyEstimate({
        prospect_generation_context_json: {
          ...validFrozenContext(),
          composedText: oversize,
        } as EstimateProspectGenerationContextV1,
      }),
    );
    // Validator rejects >12k — fail-open, no injection of oversized raw text.
    assert.equal(resolved.included, false);
    assert.equal(resolved.block, null);

    const facts = buildFrozenEstimateFactsBlock(sampleEstimate());
    assert.ok(
      facts.length <= ESTIMATE_CONVERSATION_LIMITS.maxFrozenEstimateFactsChars,
    );
  });

  it("19/20/21/22. Methodology, live org intel, history, and total prompt budget preserved", async () => {
    assert.equal(ESTIMATE_CONVERSATION_LIMITS.maxLiveIntelligenceTotalChars, 12_000);
    assert.equal(ESTIMATE_CONVERSATION_LIMITS.maxMethodologyChars, 6_000);
    assert.equal(ESTIMATE_CONVERSATION_LIMITS.maxTotalPromptChars, 100_000);
    assert.equal(ESTIMATE_CONVERSATION_LIMITS.maxHistoryMessageCount, 20);

    const assembled = await composeEstimateConversationContext({
      estimate: prospectReadyEstimate(),
      methodology,
      deps: {
        buildBrain: async () => null,
        loadDeepIntelligence: async () => null,
      },
    });
    assert.ok(
      assembled.liveIntelligenceCharCount <=
        ESTIMATE_CONVERSATION_LIMITS.maxLiveIntelligenceTotalChars,
    );
    assert.match(
      assembled.methodologyBlock,
      /CURRENT GETOBLIC ESTIMATE PRICING METHODOLOGY/,
    );

    const longHistory = Array.from({ length: 5 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `history-${i}-${"x".repeat(200)}`,
    }));
    const prompt = buildEstimateConversationPrompt({
      assembled,
      history: longHistory,
      userMessage: "Must survive question marker Q-UNIQUE-17",
    });
    assert.ok(prompt.promptCharCount <= ESTIMATE_CONVERSATION_LIMITS.maxTotalPromptChars);
    const userContent = prompt.messages[prompt.messages.length - 1].content;
    assert.match(userContent, /Q-UNIQUE-17/);
    const historyJoined = prompt.messages
      .filter((message) => message.role !== "system")
      .map((message) => message.content)
      .join("\n");
    assert.match(historyJoined, /history-0/);
    assert.match(historyJoined, /history-4/);
  });

  it("23/24/29/30. Plain-text contract + historical Prospect semantics; normalization unchanged", () => {
    const system = read(
      "services/ai/prompts/estimateConversation/estimateConversationSystemPrompt.ts",
    );
    assert.ok(estimatePromptContainsImmutabilityContract(system));
    assert.ok(estimatePromptDistinguishesTrustClasses(system));
    assert.ok(estimatePromptForbidsLiveResearchClaims(system));
    assert.ok(estimatePromptRequiresPlainTextOutput(system));
    assert.ok(estimatePromptTreatsFrozenProspectAsHistorical(system));
    assert.match(system, /At the time this Estimate was generated/);
    assert.match(
      system,
      /Do not claim a Prospect fact is current merely because it appears in frozen context/,
    );

    assert.equal(
      normalizeEstimateConversationPlainText("Hello **world**"),
      "Hello world",
    );
    assert.equal(
      assistantReplyContainsForbiddenEstimateClaims(
        "I checked the Prospect's current website before answering.",
      ),
      true,
    );
    assert.equal(
      assistantReplyContainsForbiddenEstimateClaims(
        "At the time this Estimate was generated, the available Prospect intelligence indicated a clinic focus.",
      ),
      false,
    );
  });

  it("25. Atomic user/assistant persistence path unchanged", () => {
    const service = read(
      "services/estimateConversation/estimateConversationService.ts",
    );
    assert.match(service, /insertAthenaEstimateMessagePair|insertMessagePair/);
    assert.match(service, /normalizeEstimateConversationPlainText/);
    assert.match(service, /assertAssistantReplyAllowed/);
    assert.doesNotMatch(service, /athena_estimate_messages schema/);
  });

  it("26. Browser/public DTOs still omit frozen Prospect context", () => {
    const estimate = prospectReadyEstimate();
    const detail = toPublicAthenaEstimateDetail(estimate, true) as unknown as Record<
      string,
      unknown
    >;
    const summary = toPublicAthenaEstimateSummary(
      estimate,
      true,
    ) as unknown as Record<string, unknown>;
    assert.equal("prospectGenerationContext" in detail, false);
    assert.equal("prospect_generation_context_json" in detail, false);
    assert.equal("prospectGenerationContext" in summary, false);
    assert.equal("composedText" in detail, false);

    const panel = read(
      "components/licensee/estimate/EstimateAskAthenaPanel.tsx",
    );
    assert.doesNotMatch(panel, /prospect_generation_context|composedText/);
    assert.doesNotMatch(
      read("services/estimate/athenaEstimatePublic.ts"),
      /prospect_generation_context|prospectGenerationContext/,
    );
  });

  it("27. Context metadata proves live Prospect libraries are false", async () => {
    const assembled = await composeEstimateConversationContext({
      estimate: prospectReadyEstimate(),
      methodology,
      deps: {
        buildBrain: async () => null,
        loadDeepIntelligence: async () => null,
      },
    });
    assert.equal(assembled.meta.includedLiveProspectLibraries, false);
    assert.equal(
      assembled.meta.includedProspectDiscussionOpportunityLibraries,
      false,
    );
    assert.equal(assembled.meta.includedFrozenProspectGenerationContext, true);
    assert.equal(assembled.meta.frozenProspectContextSource, "frozen_estimate_row");

    const prompt = buildEstimateConversationPrompt({
      assembled,
      history: [],
      userMessage: "meta?",
    });
    const userContent = prompt.messages[prompt.messages.length - 1].content;
    assert.match(userContent, /includedLiveProspectLibraries: false/);
    assert.match(
      userContent,
      /includedProspectDiscussionOpportunityLibraries: false/,
    );
    assert.match(userContent, /includedFrozenProspectGenerationContext: true/);
    assert.match(userContent, /frozenProspectContextSource: frozen_estimate_row/);
  });

  it("31–34. Non-interference markers for Quote/SEO/Ads and no migration added", () => {
    assert.doesNotMatch(
      read("app/licensee/quote/page.tsx"),
      /buildFrozenProspectGenerationContextBlock|FROZEN_PROSPECT_GENERATION_CONTEXT/,
    );
    assert.doesNotMatch(
      read("services/seo/seoContextComposer.ts"),
      /buildFrozenProspectGenerationContextBlock/,
    );
    const migrations = collectFiles("supabase/migrations");
    assert.equal(
      migrations.some((path) => path.includes("ask_athena") || path.includes("l17")),
      false,
    );
    assert.equal(
      ESTIMATE_CONVERSATION_LIMITS.maxFrozenEstimateFactsChars,
      8_000,
    );
  });

  it("Active Prospect facts identify Active status", () => {
    const facts = buildFrozenEstimateFactsBlock(
      prospectReadyEstimate(),
      { hasFrozenProspectGenerationContext: true },
    );
    assert.match(facts, /"prospectTargetStatus": "Active"/);
    assert.match(facts, /"prospectRemoved": false/);
    assert.match(facts, /"commercialTarget": "ABC Dental Snapshot"/);
    assert.match(facts, /"hasFrozenProspectGenerationContext": true/);
  });
});
