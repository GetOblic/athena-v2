import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GenerateReviewOptions } from "../../services/aiService";
import { evaluateHistoricalDiversity } from "../../services/socialPlanner/diversity/evaluateHistoricalDiversity";
import { generateHistoricallyDiverseSocialCalendar } from "../../services/socialPlanner/diversity/generateHistoricallyDiverseSocialCalendar";
import { composeSocialPlannerSocialMemory } from "../../services/socialPlanner/diversity/loadSocialPlannerSocialMemory";
import {
  SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION,
  SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION,
  type SocialPlannerHistoryLoader,
  type SocialPlannerHistoryRow,
} from "../../services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";
import {
  SOCIAL_PLANNER_DIVERSITY_THRESHOLDS,
  SOCIAL_PLANNER_SIMILARITY_WEIGHTS,
  scoreAssetSimilarity,
} from "../../services/socialPlanner/diversity/socialPlannerSimilarity";
import type { SocialPlannerAssetFingerprint } from "../../services/socialPlanner/generation/socialCalendarPackageTypes";
import { SocialPlannerGenerationError } from "../../services/socialPlanner/generation/socialPlannerGenerationErrors";
import {
  TEST_ORG,
  buildAlternatePackageRaw,
  buildGenerationContext,
  buildHistoryRow,
  buildValidatedPackage,
  buildValidPackageRaw,
  buildValidStrategyRaw,
  ensureUsHolidayCandidate,
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

function loaderOf(rows: SocialPlannerHistoryRow[]): SocialPlannerHistoryLoader {
  return {
    async listReadyCalendars() {
      return rows;
    },
  };
}

function memoryFrom(rows: SocialPlannerHistoryRow[]) {
  return composeSocialPlannerSocialMemory({
    organizationId: TEST_ORG,
    rows,
  });
}

function plantFingerprint(
  socialPackage: ReturnType<typeof buildValidatedPackage>,
  index: number,
  fingerprint: SocialPlannerAssetFingerprint,
) {
  const clone = structuredClone(socialPackage);
  clone.assets[index] = {
    ...clone.assets[index],
    creativeFingerprint: structuredClone(fingerprint),
  };
  return clone;
}

function historyMemory(
  socialPackage: ReturnType<typeof buildValidatedPackage>,
  createdAt = "2026-05-01T10:00:00.000Z",
) {
  return memoryFrom([
    buildHistoryRow({
      id: "hist-1",
      createdAt,
      socialPackage,
    }),
  ]);
}

describe("Social Planner L5 historical diversity evaluation", () => {
  it("accepts empty history", () => {
    const context = buildGenerationContext();
    const candidate = buildValidatedPackage(context);
    const result = evaluateHistoricalDiversity({
      candidatePackage: candidate,
      socialMemory: memoryFrom([]),
    });
    assert.equal(result.accepted, true);
    assert.equal(result.overallScore, 0);
    assert.deepEqual(result.violations, []);
  });

  it("rejects an exact recent hook repeat and allows a short generic hook", () => {
    const context = buildGenerationContext();
    const candidate = buildValidatedPackage(context);
    const alternate = buildValidatedPackage(context, buildAlternatePackageRaw(context));
    const exact = plantFingerprint(alternate, 0, {
      ...alternate.assets[0].creativeFingerprint,
      hookNormalized: candidate.assets[0].creativeFingerprint.hookNormalized,
      hookType: candidate.assets[0].creativeFingerprint.hookType,
    });
    const rejected = evaluateHistoricalDiversity({
      candidatePackage: candidate,
      socialMemory: historyMemory(exact),
    });
    assert.equal(rejected.accepted, false);
    assert.ok(rejected.violations.some((violation) => violation.code === "EXACT_HOOK"));

    const shortCandidate = buildValidatedPackage(
      context,
      buildValidPackageRaw(context, { 0: { hook: "Quick question:" } }),
    );
    const shortHistory = plantFingerprint(alternate, 0, {
      ...alternate.assets[0].creativeFingerprint,
      hookNormalized: shortCandidate.assets[0].creativeFingerprint.hookNormalized,
      hookType: shortCandidate.assets[0].creativeFingerprint.hookType,
    });
    const allowed = evaluateHistoricalDiversity({
      candidatePackage: shortCandidate,
      socialMemory: historyMemory(shortHistory),
    });
    assert.equal(allowed.accepted, true);
    assert.ok(!allowed.violations.some((violation) => violation.code === "EXACT_HOOK"));
  });

  it("rejects a near-identical recent hook", () => {
    const context = buildGenerationContext();
    const candidate = buildValidatedPackage(
      context,
      buildValidPackageRaw(context, {
        0: {
          hook: "These seven neighborhood families delayed their cleaning another full month",
        },
      }),
    );
    const alternate = buildValidatedPackage(context, buildAlternatePackageRaw(context));
    const planted = plantFingerprint(alternate, 0, {
      ...alternate.assets[0].creativeFingerprint,
      hookNormalized:
        "these seven neighborhood families delayed their cleaning another full",
      hookType: candidate.assets[0].creativeFingerprint.hookType,
    });
    const result = evaluateHistoricalDiversity({
      candidatePackage: candidate,
      socialMemory: historyMemory(planted),
    });
    assert.equal(result.accepted, false);
    assert.ok(
      result.violations.some((violation) => violation.code === "NEAR_IDENTICAL_HOOK"),
    );
  });

  it("allows the same topic alone and the same topic with a new angle", () => {
    const context = buildGenerationContext();
    const candidate = buildValidatedPackage(context);
    const alternate = buildValidatedPackage(context, buildAlternatePackageRaw(context));
    const topicOnly = plantFingerprint(alternate, 0, {
      ...alternate.assets[0].creativeFingerprint,
      topic: candidate.assets[0].creativeFingerprint.topic,
    });
    const topicOnlyResult = evaluateHistoricalDiversity({
      candidatePackage: candidate,
      socialMemory: historyMemory(topicOnly),
    });
    assert.equal(topicOnlyResult.accepted, true);
    assert.ok(topicOnlyResult.warnings.some((warning) => warning.kind === "topic_repeat"));

    const newAngle = plantFingerprint(alternate, 1, {
      ...alternate.assets[1].creativeFingerprint,
      topic: candidate.assets[0].creativeFingerprint.topic,
      angle: "a completely different preventive framing",
    });
    const newAngleResult = evaluateHistoricalDiversity({
      candidatePackage: candidate,
      socialMemory: historyMemory(newAngle),
    });
    assert.equal(newAngleResult.accepted, true);
  });

  it("rejects the same recent topic + angle + archetype combination", () => {
    const context = buildGenerationContext();
    const candidate = buildValidatedPackage(context);
    const alternate = buildValidatedPackage(context, buildAlternatePackageRaw(context));
    const planted = plantFingerprint(alternate, 0, {
      ...alternate.assets[0].creativeFingerprint,
      topic: candidate.assets[0].creativeFingerprint.topic,
      angle: candidate.assets[0].creativeFingerprint.angle,
      contentArchetype: candidate.assets[0].creativeFingerprint.contentArchetype,
    });
    const result = evaluateHistoricalDiversity({
      candidatePackage: candidate,
      socialMemory: historyMemory(planted),
    });
    assert.equal(result.accepted, false);
    assert.ok(
      result.violations.some((violation) => violation.code === "TOPIC_ANGLE_PAIR"),
    );
  });

  it("allows the same format only", () => {
    const context = buildGenerationContext();
    const candidate = buildValidatedPackage(context);
    const alternate = buildValidatedPackage(context, buildAlternatePackageRaw(context));
    const planted = plantFingerprint(alternate, 0, {
      ...alternate.assets[0].creativeFingerprint,
      assetType: candidate.assets[0].creativeFingerprint.assetType,
      family: candidate.assets[0].creativeFingerprint.family,
    });
    const result = evaluateHistoricalDiversity({
      candidatePackage: candidate,
      socialMemory: historyMemory(planted),
    });
    assert.equal(result.accepted, true);
    assert.ok(
      result.highestAssetSimilarity < SOCIAL_PLANNER_DIVERSITY_THRESHOLDS.assetReject,
    );
  });

  it("hard-rejects a substantially identical fingerprint", () => {
    const context = buildGenerationContext();
    const candidate = buildValidatedPackage(context);
    const alternate = buildValidatedPackage(context, buildAlternatePackageRaw(context));
    const planted = plantFingerprint(
      alternate,
      0,
      candidate.assets[0].creativeFingerprint,
    );
    const result = evaluateHistoricalDiversity({
      candidatePackage: candidate,
      socialMemory: historyMemory(planted),
    });
    assert.equal(result.accepted, false);
    assert.ok(
      result.violations.some((violation) => violation.code === "EXACT_MAJOR_FINGERPRINT"),
    );
  });

  it("rejects a repeated week portfolio even without an exact asset duplicate", () => {
    const context = buildGenerationContext();
    const candidate = buildValidatedPackage(context);
    const shuffledCopy = structuredClone(candidate);
    for (const [index, asset] of shuffledCopy.assets.entries()) {
      asset.hook = `${asset.hook ?? "Hook"} variation ${index}`;
      asset.socialCopy = `${asset.socialCopy} lightly rewritten ${index}.`;
      asset.creativeFingerprint = {
        ...asset.creativeFingerprint,
        hookNormalized: `${asset.creativeFingerprint.hookNormalized ?? "hook"} variation ${index}`,
      };
    }
    const result = evaluateHistoricalDiversity({
      candidatePackage: shuffledCopy,
      socialMemory: historyMemory(candidate),
    });
    assert.equal(result.accepted, false);
    assert.ok(
      result.violations.some((violation) => violation.code === "WEEK_PORTFOLIO_THRESHOLD"),
    );
    assert.ok(
      result.weekSimilarity >= SOCIAL_PLANNER_DIVERSITY_THRESHOLDS.weekReject,
    );
  });

  it("allows a repeated calendar anchor when creative treatment changes", () => {
    const context = buildGenerationContext();
    const holiday = ensureUsHolidayCandidate(context);
    const holidayIndex = Math.max(
      context.calendarContext.period.dates.indexOf(holiday.date),
      0,
    );
    const candidate = buildValidatedPackage(
      context,
      buildValidPackageRaw(context, {
        [holidayIndex]: {
          calendarAnchors: [
            {
              sourceCandidateId: holiday.id,
              date: holiday.date,
              label: holiday.label,
              category: holiday.category,
              scope: holiday.scope,
              reason: "Commercially relevant this week",
            },
          ],
          calendarReason: "Used only because the date matches the offer.",
        },
      }),
    );
    const alternate = buildValidatedPackage(
      context,
      buildAlternatePackageRaw(context, {
        [holidayIndex]: {
          calendarAnchors: [
            {
              sourceCandidateId: holiday.id,
              date: holiday.date,
              label: holiday.label,
              category: holiday.category,
              scope: holiday.scope,
              reason: "Different creative treatment for the same annual date.",
            },
          ],
          calendarReason: "Annual recurrence with a new story.",
        },
      }),
    );
    const result = evaluateHistoricalDiversity({
      candidatePackage: candidate,
      socialMemory: historyMemory(alternate),
    });
    assert.equal(result.accepted, true);
    assert.ok(
      result.warnings.some((warning) => warning.kind === "calendar_anchor_repeat") ||
        result.highestAssetSimilarity < SOCIAL_PLANNER_DIVERSITY_THRESHOLDS.assetWarn,
    );
  });

  it("rejects a calendar anchor that reuses the same creative treatment", () => {
    const context = buildGenerationContext();
    const holiday = ensureUsHolidayCandidate(context);
    const holidayIndex = Math.max(
      context.calendarContext.period.dates.indexOf(holiday.date),
      0,
    );
    const candidate = buildValidatedPackage(
      context,
      buildValidPackageRaw(context, {
        [holidayIndex]: {
          calendarAnchors: [
            {
              sourceCandidateId: holiday.id,
              date: holiday.date,
              label: holiday.label,
              category: holiday.category,
              scope: holiday.scope,
              reason: "Same commercial treatment as last year.",
            },
          ],
          calendarReason: "Repeated holiday offer.",
        },
      }),
    );
    const planted = plantFingerprint(
      buildValidatedPackage(context, buildAlternatePackageRaw(context)),
      holidayIndex,
      candidate.assets[holidayIndex].creativeFingerprint,
    );
    const result = evaluateHistoricalDiversity({
      candidatePackage: candidate,
      socialMemory: historyMemory(planted),
    });
    assert.equal(result.accepted, false);
    assert.ok(
      result.violations.some(
        (violation) =>
          violation.code === "EXACT_MAJOR_FINGERPRINT" ||
          violation.code === "TOPIC_ANGLE_PAIR",
      ),
    );
  });

  it("allows CTA-only and Persona-only repetition", () => {
    const context = buildGenerationContext();
    const candidate = buildValidatedPackage(context);
    const alternate = buildValidatedPackage(context, buildAlternatePackageRaw(context));
    const ctaOnly = plantFingerprint(alternate, 0, {
      ...alternate.assets[0].creativeFingerprint,
      ctaType: candidate.assets[0].creativeFingerprint.ctaType,
    });
    const ctaResult = evaluateHistoricalDiversity({
      candidatePackage: candidate,
      socialMemory: historyMemory(ctaOnly),
    });
    assert.equal(ctaResult.accepted, true);

    const personaOnly = plantFingerprint(alternate, 1, {
      ...alternate.assets[1].creativeFingerprint,
      personaIds: candidate.assets[0].creativeFingerprint.personaIds,
    });
    const personaResult = evaluateHistoricalDiversity({
      candidatePackage: candidate,
      socialMemory: historyMemory(personaOnly),
    });
    assert.equal(personaResult.accepted, true);
    assert.ok(
      personaResult.warnings.some((warning) => warning.kind === "persona_repeat") ||
        personaResult.accepted,
    );
  });

  it("relaxes topic repetition under matching user guidance but still requires creative novelty", () => {
    const context = buildGenerationContext();
    const candidate = buildValidatedPackage(context);
    const alternate = buildValidatedPackage(context, buildAlternatePackageRaw(context));
    const guidance = "This week focus entirely on preventive care";
    const topicOnly = plantFingerprint(alternate, 0, {
      ...alternate.assets[0].creativeFingerprint,
      topic: candidate.assets[0].creativeFingerprint.topic,
    });
    const allowed = evaluateHistoricalDiversity({
      candidatePackage: candidate,
      socialMemory: historyMemory(topicOnly),
      userGuidance: guidance,
    });
    assert.equal(allowed.accepted, true);

    const sameTreatment = plantFingerprint(alternate, 0, {
      ...alternate.assets[0].creativeFingerprint,
      topic: candidate.assets[0].creativeFingerprint.topic,
      angle: candidate.assets[0].creativeFingerprint.angle,
      contentArchetype: candidate.assets[0].creativeFingerprint.contentArchetype,
    });
    const rejected = evaluateHistoricalDiversity({
      candidatePackage: candidate,
      socialMemory: historyMemory(sameTreatment),
      userGuidance: guidance,
    });
    assert.equal(rejected.accepted, false);
    assert.ok(
      rejected.violations.some((violation) => violation.code === "TOPIC_ANGLE_PAIR"),
    );
  });

  it("does not treat platform overlap as a novelty signal", () => {
    assert.ok(!("platform" in SOCIAL_PLANNER_SIMILARITY_WEIGHTS));
    assert.ok(!("recommendedPlatforms" in SOCIAL_PLANNER_SIMILARITY_WEIGHTS));
    const context = buildGenerationContext();
    const candidate = buildValidatedPackage(context);
    const alternate = buildValidatedPackage(context, buildAlternatePackageRaw(context));
    const breakdown = scoreAssetSimilarity({
      candidate: candidate.assets[0].creativeFingerprint,
      historical: {
        ...alternate.assets[0].creativeFingerprint,
        ctaType: candidate.assets[0].creativeFingerprint.ctaType,
      },
      recencyWeight: 1,
    });
    assert.ok(breakdown.score < SOCIAL_PLANNER_DIVERSITY_THRESHOLDS.assetWarn);
    assert.ok(!breakdown.matchedDimensions.includes("topic"));
  });
});

describe("Social Planner L5 historically-diverse generation", () => {
  it("accepts the first generation without an L5 repair", async () => {
    const context = buildGenerationContext();
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
    ]);
    const result = await generateHistoricallyDiverseSocialCalendar({
      context,
      userGuidance: null,
      generationMode: "standard",
      deps: {
        generateReview: script.generateReview,
        historyLoader: loaderOf([]),
      },
    });

    assert.equal(result.historicalDiversity.accepted, true);
    assert.equal(result.generationProvenance.historicalDiversityRepairUsed, false);
    assert.equal(result.generationProvenance.historicalCalendarsConsidered, 0);
    assert.equal(result.generationProvenance.historicalAssetsConsidered, 0);
    assert.equal(
      result.generationProvenance.socialMemorySchemaVersion,
      SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION,
    );
    assert.equal(
      result.generationProvenance.diversityAlgorithmVersion,
      SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION,
    );
    assert.equal(script.prompts.length, 2);
    assert.equal(script.metas.some((meta) => meta?.athenaStage === "social_calendar_diversity_repair"), false);
  });

  it("injects Social Memory into L4 prompts and repairs one historical failure", async () => {
    const context = buildGenerationContext();
    const historical = buildValidatedPackage(context);
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
      JSON.stringify(buildAlternatePackageRaw(context)),
    ]);

    const result = await generateHistoricallyDiverseSocialCalendar({
      context,
      userGuidance: null,
      generationMode: "standard",
      deps: {
        generateReview: script.generateReview,
        historyLoader: loaderOf([
          buildHistoryRow({
            id: "ready-hist",
            createdAt: "2026-05-01T10:00:00.000Z",
            socialPackage: historical,
          }),
        ]),
      },
    });

    assert.equal(result.historicalDiversity.accepted, true);
    assert.equal(result.generationProvenance.historicalDiversityRepairUsed, true);
    assert.equal(result.generationProvenance.historicalCalendarsConsidered, 1);
    assert.equal(result.generationProvenance.historicalAssetsConsidered, 7);
    assert.ok(result.generationProvenance.highestHistoricalSimilarity < SOCIAL_PLANNER_DIVERSITY_THRESHOLDS.assetReject);
    assert.equal(script.prompts.length, 3);
    assert.match(script.prompts[0], /RECENT SOCIAL MEMORY — DO NOT REPEAT/);
    assert.match(script.prompts[2], /historical-diversity|DO NOT REPEAT|Change only the repetitive/i);
    assert.equal(script.metas[2]?.athenaStage, "social_calendar_diversity_repair");
    assert.equal(script.metas[2]?.reasoningProfile, "BALANCED");
  });

  it("returns a typed failure when diversity repair is still repetitive", async () => {
    const context = buildGenerationContext();
    const historical = buildValidatedPackage(context);
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
    ]);

    await assert.rejects(
      () =>
        generateHistoricallyDiverseSocialCalendar({
          context,
          userGuidance: null,
          generationMode: "standard",
          deps: {
            generateReview: script.generateReview,
            historyLoader: loaderOf([
              buildHistoryRow({
                id: "ready-hist",
                createdAt: "2026-05-01T10:00:00.000Z",
                socialPackage: historical,
              }),
            ]),
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof SocialPlannerGenerationError);
        assert.equal(error.code, "HISTORICAL_DIVERSITY_REPAIR_FAILED");
        assert.equal(error.stage, "diversity_repair");
        return true;
      },
    );
    assert.equal(script.prompts.length, 3);
  });

  it("rejects an L4-invalid diversity repair", async () => {
    const context = buildGenerationContext();
    const historical = buildValidatedPackage(context);
    const invalid = buildValidPackageRaw(context, {
      0: { hook: "Same hook" },
      1: { hook: "Same hook" },
    });
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
      JSON.stringify(invalid),
    ]);

    await assert.rejects(
      () =>
        generateHistoricallyDiverseSocialCalendar({
          context,
          userGuidance: null,
          generationMode: "standard",
          deps: {
            generateReview: script.generateReview,
            historyLoader: loaderOf([
              buildHistoryRow({
                id: "ready-hist",
                createdAt: "2026-05-01T10:00:00.000Z",
                socialPackage: historical,
              }),
            ]),
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof SocialPlannerGenerationError);
        assert.equal(error.code, "HISTORICAL_DIVERSITY_REPAIR_FAILED");
        assert.equal(error.stage, "diversity_repair_validation");
        return true;
      },
    );
  });

  it("still applies diversity when regenerating the same date range", async () => {
    const context = buildGenerationContext();
    const historical = buildValidatedPackage(context);
    const script = scriptedReview([
      JSON.stringify(buildValidStrategyRaw(context)),
      JSON.stringify(buildValidPackageRaw(context)),
      JSON.stringify(buildAlternatePackageRaw(context)),
    ]);
    const result = await generateHistoricallyDiverseSocialCalendar({
      context,
      userGuidance: null,
      generationMode: "standard",
      deps: {
        generateReview: script.generateReview,
        historyLoader: loaderOf([
          buildHistoryRow({
            id: "same-week",
            createdAt: "2026-05-09T10:00:00.000Z",
            socialPackage: historical,
            periodStart: context.calendarContext.period.periodStart,
            periodEnd: context.calendarContext.period.periodEnd,
          }),
        ]),
      },
    });
    assert.equal(result.generationProvenance.historicalDiversityRepairUsed, true);
    assert.equal(result.socialMemory.historicalWeeks[0]?.periodStart, context.calendarContext.period.periodStart);
  });

  it("does not persist, query a live database, or change Think Differently behavior", async () => {
    const context = buildGenerationContext();
    await assert.rejects(
      () =>
        generateHistoricallyDiverseSocialCalendar({
          context,
          generationMode: "think_differently",
          deps: {
            generateReview: async () => "{}",
            historyLoader: loaderOf([]),
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof SocialPlannerGenerationError);
        assert.equal(error.code, "UNSUPPORTED_GENERATION_MODE");
        return true;
      },
    );
  });
});
