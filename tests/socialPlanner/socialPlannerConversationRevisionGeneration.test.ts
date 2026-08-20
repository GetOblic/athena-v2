import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GenerateReviewOptions } from "../../services/aiService";
import { generateConversationRevisionSocialCalendar } from "../../services/socialPlanner/conversationRevision/generateConversationRevisionSocialCalendar";
import { buildConversationRevisionRepairPrompt } from "../../services/socialPlanner/conversationRevision/socialPlannerRevisionPrompt";
import { evaluateHistoricalDiversity } from "../../services/socialPlanner/diversity/evaluateHistoricalDiversity";
import { composeSocialPlannerSocialMemory } from "../../services/socialPlanner/diversity/loadSocialPlannerSocialMemory";
import { generateSocialCalendarPackage } from "../../services/socialPlanner/generation/socialPlannerGenerationService";
import { SocialPlannerGenerationError } from "../../services/socialPlanner/generation/socialPlannerGenerationErrors";
import {
  SOCIAL_PLANNER_ASSET_PROMPT_VERSION,
  SOCIAL_PLANNER_REPAIR_PROMPT_VERSION,
} from "../../services/socialPlanner/generation/socialCalendarPackageTypes";
import { buildSocialPlannerPackageOutputContract } from "../../services/socialPlanner/generation/socialPlannerGenerationPrompts";
import { validateAndNormalizeSocialCalendarPackage } from "../../services/socialPlanner/generation/validateSocialCalendarPackage";
import {
  SOCIAL_PLANNER_CONVERSATION_REVISION_BRIEF_SCHEMA_VERSION,
  SOCIAL_PLANNER_CONVERSATION_REVISION_CONTEXT_SCHEMA_VERSION,
  SOCIAL_PLANNER_CONVERSATION_REVISION_PROMPT_VERSION,
  SOCIAL_PLANNER_CONVERSATION_REVISION_REPAIR_PROMPT_VERSION,
  SOCIAL_PLANNER_REVISION_SATISFACTION_ALGORITHM_VERSION,
  type SocialPlannerConversationRevisionContextV1,
} from "../../services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";
import {
  SOCIAL_PLANNER_THINK_DIFFERENTLY_PROMPT_VERSION,
  SOCIAL_PLANNER_THINK_DIFFERENTLY_REPAIR_PROMPT_VERSION,
} from "../../services/socialPlanner/thinkDifferently/socialPlannerThinkDifferentlyTypes";
import {
  TEST_ORG,
  buildGenerationContext,
  buildHistoryRow,
  buildValidatedPackage,
  buildValidPackageRaw,
  buildValidStrategyRaw,
} from "./socialPlannerGenerationFixtures";

function scriptedReview(replies: string[]) {
  const prompts: string[] = [];
  const metas: Array<GenerateReviewOptions | undefined> = [];
  let index = 0;
  return {
    prompts,
    metas,
    generateReview: async (prompt: string, meta?: GenerateReviewOptions) => {
      prompts.push(prompt);
      metas.push(meta);
      const reply = replies[index];
      index += 1;
      if (reply == null) {
        throw new Error("Unexpected extra generateReview call");
      }
      return reply;
    },
  };
}

function revisionContext(
  overrides: Partial<SocialPlannerConversationRevisionContextV1["brief"]> = {},
): SocialPlannerConversationRevisionContextV1 {
  const dates = buildGenerationContext().calendarContext.period.dates;
  return {
    schemaVersion: SOCIAL_PLANNER_CONVERSATION_REVISION_CONTEXT_SCHEMA_VERSION,
    appliedAt: "2026-08-20T12:00:00.000Z",
    brief: {
      schemaVersion: SOCIAL_PLANNER_CONVERSATION_REVISION_BRIEF_SCHEMA_VERSION,
      sourceCalendarId: "cal-v1",
      conversationMessageCount: 2,
      latestUserMessageId: "msg-user-1",
      latestUserMessageAt: "2026-08-20T12:00:00.000Z",
      actionable: true,
      global: { changeSummary: "Make Monday a poll." },
      dayChanges: [
        {
          date: dates[0],
          requestedChangeSummary: "Refresh Monday's hook without changing the week.",
        },
      ],
      preserve: dates.slice(1),
      avoid: [],
      ...overrides,
    },
  };
}

function pollMondayRevisionContext(): SocialPlannerConversationRevisionContextV1 {
  const dates = buildGenerationContext().calendarContext.period.dates;
  return revisionContext({
    dayChanges: [
      {
        date: dates[0],
        requestedAssetType: "poll",
        requestedChangeSummary: "Turn Monday into a poll.",
      },
    ],
  });
}

function pollMondayPackageRaw(
  context: ReturnType<typeof buildGenerationContext>,
): Record<string, unknown> {
  return buildValidPackageRaw(context, {
    0: {
      assetType: "poll",
      contentArchetype: "question",
      primaryObjective: "engage",
      hook: "When should Saturday mornings actually open?",
      productionSpec: {
        kind: "engagement",
        engagementType: "poll",
        prompt: "When is the easiest time for a cleaning?",
        options: ["After school", "Saturday morning", "Lunch break"],
        visualSupport: "Simple branded story frame, no people required.",
      },
    },
  });
}

function currentCandidateFromRepairPrompt(prompt: string): {
  strategySummary: string;
  assets: Array<Record<string, unknown>>;
} {
  const start = prompt.indexOf("=== CURRENT CANDIDATE PACKAGE ===");
  const end = prompt.indexOf("=== USER GUIDANCE ===");
  assert.ok(start >= 0 && end > start);
  return JSON.parse(
    prompt.slice(start + "=== CURRENT CANDIDATE PACKAGE ===".length, end).trim(),
  ) as {
    strategySummary: string;
    assets: Array<Record<string, unknown>>;
  };
}

describe("Social Planner L9 conversation revision generation", () => {
  it("L4 requires frozen revision context and injects preservation extras", async () => {
    const context = buildGenerationContext();
    await assert.rejects(
      () =>
        generateSocialCalendarPackage({
          context,
          generationMode: "conversation_revision",
          deps: { generateReview: async () => "{}" },
        }),
      (error: unknown) => {
        assert.ok(error instanceof SocialPlannerGenerationError);
        assert.equal(error.code, "UNSUPPORTED_GENERATION_MODE");
        return true;
      },
    );

    const sourcePackage = buildValidatedPackage();
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
    ]);
    const result = await generateSocialCalendarPackage({
      context,
      generationMode: "conversation_revision",
      revisionContext: revisionContext(),
      sourcePackage,
      deps: { generateReview: script.generateReview },
    });
    assert.equal(result.package.generationMetadata.generationMode, "conversation_revision");
    assert.match(script.prompts[0], /CONVERSATION REVISION/);
    assert.match(script.prompts[0], /FROZEN REVISION CONTEXT/);
    assert.doesNotMatch(script.prompts[0], /THINK DIFFERENTLY \(CREATIVE DIVERGENCE\)/);
  });

  it("does not reject preserved source days merely for matching the source", () => {
    const source = buildValidatedPackage();
    const memory = composeSocialPlannerSocialMemory({
      organizationId: TEST_ORG,
      rows: [
        buildHistoryRow({
          id: "cal-v1",
          createdAt: "2026-08-01T00:00:00.000Z",
          socialPackage: source,
        }),
      ],
    });
    const preserved = evaluateHistoricalDiversity({
      candidatePackage: source,
      socialMemory: memory,
      revisionMode: {
        sourceCalendarId: "cal-v1",
        preservedDates: source.period.dates.slice(1),
      },
    });
    assert.equal(
      preserved.violations.some(
        (violation) =>
          violation.historicalCalendarId === "cal-v1" &&
          violation.candidateDate === source.period.dates[1],
      ),
      false,
    );

    const standard = evaluateHistoricalDiversity({
      candidatePackage: source,
      socialMemory: memory,
    });
    assert.equal(standard.accepted, false);
  });

  it("generates a revision, checks satisfaction, and records compact provenance", async () => {
    const context = buildGenerationContext();
    const sourcePackage = buildValidatedPackage();
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
    ]);
    const result = await generateConversationRevisionSocialCalendar({
      context,
      userGuidance: "Keep evenings bookable.",
      sourceCalendar: {
        id: "cal-v1",
        root_calendar_id: null,
        version_number: 1,
      },
      sourcePackage,
      revisionContext: revisionContext(),
      derivativeVersionNumber: 2,
      deps: {
        historyLoader: {
          async listReadyCalendars() {
            return [];
          },
        },
        generateReview: script.generateReview,
      },
    });
    assert.equal(result.package.generationMetadata.generationMode, "conversation_revision");
    assert.equal(result.revisionSatisfaction.accepted, true);
    assert.equal(result.revisionRepairUsed, false);
    assert.equal(result.generationProvenance.generationMode, "conversation_revision");
    assert.equal(result.generationProvenance.conversationMessageCount, 2);
    assert.equal(result.generationProvenance.latestUserMessageId, "msg-user-1");
    assert.doesNotMatch(
      JSON.stringify(result.generationProvenance),
      /Change Monday|transcript/,
    );
  });

  it("L9 repair embeds the shared package contract and keeps valid candidate fields", () => {
    const context = buildGenerationContext();
    const currentPackage = buildValidatedPackage(context);
    const prompt = buildConversationRevisionRepairPrompt({
      context,
      userGuidance: "Keep evenings bookable.",
      sourcePackage: currentPackage,
      revisionContext: pollMondayRevisionContext(),
      currentPackage,
      satisfaction: {
        accepted: false,
        algorithmVersion: SOCIAL_PLANNER_REVISION_SATISFACTION_ALGORITHM_VERSION,
        preservedDates: currentPackage.period.dates.slice(1),
        revisedDates: [currentPackage.period.dates[0]],
        enforcedDirectives: [`requestedAssetType:${currentPackage.period.dates[0]}`],
        violations: [
          {
            code: "REQUESTED_ASSET_TYPE",
            message: `${currentPackage.period.dates[0]} must use asset type poll.`,
            candidateDate: currentPackage.period.dates[0],
          },
        ],
      },
    });

    const contract = buildSocialPlannerPackageOutputContract();
    assert.ok(prompt.includes(contract));
    assert.match(prompt, /social_planner_conversation_revision_repair_v2/);
    assert.match(prompt, /COMPLETE corrected weekly Social Calendar package/i);
    assert.match(prompt, /not a patch or a partial asset list/i);
    assert.match(prompt, /All seven assets must remain present/i);
    assert.match(prompt, /Keep exactly seven assets/);

    const candidate = currentCandidateFromRepairPrompt(prompt);
    assert.equal(candidate.assets.length, 7);
    assert.equal(candidate.assets[0]?.audience, currentPackage.assets[0].audience);
    assert.deepEqual(
      candidate.assets[0]?.productionSpec,
      currentPackage.assets[0].productionSpec,
    );
    const candidateFamilies = new Set(
      candidate.assets.map(
        (asset) => (asset.productionSpec as { kind?: string } | undefined)?.kind,
      ),
    );
    const packageFamilies = new Set(
      currentPackage.assets.map((asset) => asset.productionSpec.kind),
    );
    assert.deepEqual(candidateFamilies, packageFamilies);
    assert.ok(candidateFamilies.has("static"));
    assert.ok(candidateFamilies.has("carousel") || candidateFamilies.has("video"));
    assert.ok(candidateFamilies.has("document"));
    assert.ok(candidateFamilies.has("engagement"));
    assert.deepEqual(candidate.assets[0]?.personaIds, currentPackage.assets[0].personaIds);
    assert.deepEqual(
      candidate.assets[0]?.calendarAnchors,
      currentPackage.assets[0].calendarAnchors,
    );
    assert.equal("sourceSignals" in (candidate.assets[0] ?? {}), false);
    assert.equal(
      SOCIAL_PLANNER_CONVERSATION_REVISION_PROMPT_VERSION,
      "social_planner_conversation_revision_v1",
    );
    assert.equal(
      SOCIAL_PLANNER_CONVERSATION_REVISION_REPAIR_PROMPT_VERSION,
      "social_planner_conversation_revision_repair_v2",
    );
    assert.equal(SOCIAL_PLANNER_ASSET_PROMPT_VERSION, "social_planner_assets_v2");
    assert.equal(SOCIAL_PLANNER_REPAIR_PROMPT_VERSION, "social_planner_repair_v2");
    assert.equal(
      SOCIAL_PLANNER_THINK_DIFFERENTLY_PROMPT_VERSION,
      "social_planner_think_differently_v1",
    );
    assert.equal(
      SOCIAL_PLANNER_THINK_DIFFERENTLY_REPAIR_PROMPT_VERSION,
      "social_planner_think_differently_repair_v1",
    );
  });

  it("repairs a satisfaction miss into a validator-accepted seven-asset package", async () => {
    const context = buildGenerationContext();
    const sourcePackage = buildValidatedPackage(context);
    const repairedRaw = pollMondayPackageRaw(context);
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
      JSON.stringify(repairedRaw),
    ]);

    const result = await generateConversationRevisionSocialCalendar({
      context,
      userGuidance: "Keep evenings bookable.",
      sourceCalendar: {
        id: "cal-v1",
        root_calendar_id: null,
        version_number: 1,
      },
      sourcePackage,
      revisionContext: pollMondayRevisionContext(),
      derivativeVersionNumber: 2,
      deps: {
        historyLoader: {
          async listReadyCalendars() {
            return [];
          },
        },
        generateReview: script.generateReview,
      },
    });

    assert.equal(result.revisionRepairUsed, true);
    assert.equal(
      result.generationProvenance.conversationRevisionRepairPromptVersion,
      "social_planner_conversation_revision_repair_v2",
    );
    assert.equal(result.package.assets.length, 7);
    assert.equal(result.package.assets[0].assetType, "poll");
    assert.ok(result.package.assets[0].audience);
    assert.equal(result.package.assets[0].productionSpec.kind, "engagement");
    assert.ok(script.prompts[2]?.includes(buildSocialPlannerPackageOutputContract()));
    const candidate = currentCandidateFromRepairPrompt(script.prompts[2] ?? "");
    assert.equal(candidate.assets[0]?.audience, sourcePackage.assets[0].audience);
    assert.deepEqual(
      candidate.assets[0]?.productionSpec,
      sourcePackage.assets[0].productionSpec,
    );

    const validated = validateAndNormalizeSocialCalendarPackage({
      raw: repairedRaw,
      context,
      userGuidance: "Keep evenings bookable.",
      metadata: sourcePackage.generationMetadata,
    });
    assert.equal(validated.assets.length, 7);
    assert.ok(validated.assets[0].audience);
    assert.equal(validated.assets[0].productionSpec.kind, "engagement");
  });

  it("throws CONVERSATION_REVISION_REPAIR_FAILED with bounded failures when repair omits required fields", async () => {
    const context = buildGenerationContext();
    const sourcePackage = buildValidatedPackage(context);
    const invalidRepair = {
      ...pollMondayPackageRaw(context),
      assets: (pollMondayPackageRaw(context).assets as Array<Record<string, unknown>>).map(
        (asset) => {
          const rest = { ...asset };
          delete rest.audience;
          delete rest.productionSpec;
          return rest;
        },
      ),
    };
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
      JSON.stringify(invalidRepair),
    ]);

    await assert.rejects(
      () =>
        generateConversationRevisionSocialCalendar({
          context,
          userGuidance: null,
          sourceCalendar: {
            id: "cal-v1",
            root_calendar_id: null,
            version_number: 1,
          },
          sourcePackage,
          revisionContext: pollMondayRevisionContext(),
          derivativeVersionNumber: 2,
          deps: {
            historyLoader: {
              async listReadyCalendars() {
                return [];
              },
            },
            generateReview: script.generateReview,
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof SocialPlannerGenerationError);
        assert.equal(error.code, "CONVERSATION_REVISION_REPAIR_FAILED");
        assert.equal(error.stage, "conversation_revision_repair_validation");
        assert.ok(Array.isArray(error.failures));
        assert.ok(
          error.failures.some((failure) => /assets\[0\]\.audience is required/i.test(failure)),
        );
        assert.ok(
          error.failures.some((failure) =>
            /assets\[0\]\.productionSpec must be an object/i.test(failure),
          ),
        );
        assert.ok(error.failures.length <= 32);
        return true;
      },
    );
    assert.equal(script.prompts.length, 3);
  });
});
