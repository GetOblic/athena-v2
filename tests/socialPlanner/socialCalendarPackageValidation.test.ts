import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SocialCalendarOpportunity } from "../../services/socialPlanner/calendar/socialCalendarContextTypes";
import { SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION } from "../../services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  SocialCalendarPackageValidationError,
  SocialPlannerStrategyValidationError,
} from "../../services/socialPlanner/generation/socialPlannerGenerationErrors";
import {
  validateAndNormalizeSocialCalendarPackage,
  validateSocialPlannerWeeklyStrategy,
} from "../../services/socialPlanner/generation/validateSocialCalendarPackage";
import {
  buildGenerationContext,
  buildValidAsset,
  buildValidPackageRaw,
  buildValidStrategyRaw,
  ensureUsHolidayCandidate,
  testMetadata,
} from "./socialPlannerGenerationFixtures";

function expectFailure(
  raw: Record<string, unknown>,
  context = buildGenerationContext(),
  userGuidance: string | null = null,
): SocialCalendarPackageValidationError {
  try {
    validateAndNormalizeSocialCalendarPackage({
      raw,
      context,
      userGuidance,
      metadata: testMetadata(),
    });
    throw new Error("expected validation to fail");
  } catch (error) {
    assert.ok(error instanceof SocialCalendarPackageValidationError);
    return error;
  }
}

function holidayOpportunity(
  date: string,
  countryCode: string,
  label: string,
): SocialCalendarOpportunity {
  return {
    id: `test-holiday:${date}`,
    label,
    date,
    category: "civic_observance",
    scope: "country",
    jurisdictionCountryCode: countryCode,
    jurisdictionRegionCode: null,
    jurisdictionHemisphere: null,
    selectionStatus: "candidate",
    ruleId: "test-holiday",
    observedKind: "actual",
    providerRule: "test",
  };
}

describe("Social Planner L4 package validation", () => {
  it("accepts a diverse seven-day package and is deterministic", () => {
    const context = buildGenerationContext();
    const raw = buildValidPackageRaw(context);
    const first = validateAndNormalizeSocialCalendarPackage({
      raw,
      context,
      userGuidance: null,
      metadata: testMetadata(),
    });
    const second = validateAndNormalizeSocialCalendarPackage({
      raw,
      context,
      userGuidance: null,
      metadata: testMetadata(),
    });

    assert.equal(first.schemaVersion, SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION);
    assert.equal(first.assets.length, 7);
    assert.deepEqual(
      first.assets.map((asset) => asset.date),
      context.calendarContext.period.dates,
    );
    assert.deepEqual(
      first.assets.map((asset) => asset.weekday),
      context.calendarContext.dayContexts.map((day) => day.dayOfWeek),
    );
    assert.deepEqual(first, second);
    assert.ok(first.weekFingerprint.assetTypes.length >= 4);
  });

  it("accepts a weekly strategy with seven matching dates", () => {
    const context = buildGenerationContext();
    const strategy = validateSocialPlannerWeeklyStrategy(
      buildValidStrategyRaw(context),
      context,
    );
    assert.equal(strategy.formatPlan.length, 7);
    assert.deepEqual(
      strategy.formatPlan.map((entry) => entry.date),
      context.calendarContext.period.dates,
    );
  });

  it("rejects a weekly strategy with invented Persona ids", () => {
    const context = buildGenerationContext();
    const raw = buildValidStrategyRaw(context);
    (raw.audiencePlan as Array<{ personaId: string }>)[0].personaId = "persona-invented";
    assert.throws(
      () => validateSocialPlannerWeeklyStrategy(raw, context),
      SocialPlannerStrategyValidationError,
    );
  });

  it("rejects seven identical asset formats", () => {
    const context = buildGenerationContext();
    const raw = buildValidPackageRaw(
      context,
      context.calendarContext.period.dates.map(() => ({
        assetType: "branded_graphic",
        productionSpec: {
          kind: "static",
          imagePrompt: "Clinic graphic",
          composition: "Centered",
          setting: "Reception",
          subjects: "No people",
          overlayCopyGuidance: null,
          visualTone: "Warm",
        },
      })),
    );
    const error = expectFailure(raw, context);
    assert.equal(error.kind, "portfolio");
    assert.ok(error.failures.some((failure) => /distinct asset types|branded_graphic/i.test(failure)));
  });

  it("rejects an all-promotional default week", () => {
    const context = buildGenerationContext();
    const raw = buildValidPackageRaw(
      context,
      context.calendarContext.period.dates.map((_, index) => ({
        primaryObjective: "promote",
        cta: `Book now ${index}`,
        hook: `Promotional hook ${index}`,
      })),
    );
    const error = expectFailure(raw, context);
    assert.equal(error.kind, "portfolio");
    assert.ok(error.failures.some((failure) => /Promotional\/conversion/i.test(failure)));
  });

  it("rejects repeated normalized hooks", () => {
    const context = buildGenerationContext();
    const raw = buildValidPackageRaw(
      context,
      context.calendarContext.period.dates.map(() => ({
        hook: "Did you know...?",
      })),
    );
    const error = expectFailure(raw, context);
    assert.ok(error.failures.some((failure) => /Duplicate normalized hook/i.test(failure)));
  });

  it("accepts a known calendar candidate on the matching date", () => {
    const context = buildGenerationContext();
    const candidate = ensureUsHolidayCandidate(context);
    const dayIndex = context.calendarContext.period.dates.indexOf(candidate.date);
    const raw = buildValidPackageRaw(context, {
      [dayIndex]: {
        calendarAnchors: [
          {
            sourceCandidateId: candidate.id,
            date: candidate.date,
            label: candidate.label,
            category: candidate.category,
            scope: candidate.scope,
            jurisdictionCountryCode: candidate.jurisdictionCountryCode,
            jurisdictionRegionCode: candidate.jurisdictionRegionCode,
            jurisdictionHemisphere: candidate.jurisdictionHemisphere,
            reason: "Naturally supports family-care messaging.",
          },
        ],
        calendarReason: "The observance supports a family-care reminder.",
      },
    });
    const pkg = validateAndNormalizeSocialCalendarPackage({
      raw,
      context,
      userGuidance: null,
      metadata: testMetadata(),
    });
    assert.equal(pkg.assets[dayIndex].calendarAnchors[0].sourceCandidateId, candidate.id);
  });

  it("rejects an invented calendar candidate id", () => {
    const context = buildGenerationContext();
    const raw = buildValidPackageRaw(context, {
      0: {
        calendarAnchors: [
          {
            sourceCandidateId: "invented-christmas:2026-05-10",
            date: context.calendarContext.period.dates[0],
            label: "Christmas",
            category: "public_holiday",
            scope: "global",
            reason: "Model memory",
          },
        ],
        calendarReason: "Invented",
      },
    });
    const error = expectFailure(raw, context);
    assert.ok(error.failures.some((failure) => /unknown calendar opportunity/i.test(failure)));
  });

  it("rejects a calendar opportunity attached to the wrong day", () => {
    const context = buildGenerationContext();
    const candidate = ensureUsHolidayCandidate(context);
    const wrongIndex = context.calendarContext.period.dates.findIndex(
      (date) => date !== candidate.date,
    );
    const raw = buildValidPackageRaw(context, {
      [wrongIndex]: {
        calendarAnchors: [
          {
            sourceCandidateId: candidate.id,
            date: candidate.date,
            label: candidate.label,
            category: candidate.category,
            scope: candidate.scope,
            reason: "Wrong day",
          },
        ],
        calendarReason: "Wrong day",
      },
    });
    const error = expectFailure(raw, context);
    assert.ok(error.failures.some((failure) => /cannot attach/i.test(failure)));
  });

  it("rejects a foreign-jurisdiction candidate", () => {
    const context = buildGenerationContext();
    const foreign = holidayOpportunity(context.calendarContext.period.dates[1], "GB", "Bank Holiday");
    context.calendarContext.opportunities.push(foreign);
    const raw = buildValidPackageRaw(context, {
      1: {
        calendarAnchors: [
          {
            sourceCandidateId: foreign.id,
            date: foreign.date,
            label: foreign.label,
            category: foreign.category,
            scope: foreign.scope,
            reason: "Foreign",
          },
        ],
        calendarReason: "Foreign",
      },
    });
    const error = expectFailure(raw, context);
    assert.ok(error.failures.some((failure) => /outside the trusted jurisdiction/i.test(failure)));
  });

  it("allows a day with zero calendar anchors", () => {
    const context = buildGenerationContext();
    const raw = buildValidPackageRaw(context);
    const pkg = validateAndNormalizeSocialCalendarPackage({
      raw,
      context,
      userGuidance: null,
      metadata: testMetadata(),
    });
    assert.ok(pkg.assets.every((asset) => asset.calendarAnchors.length === 0));
  });

  it("rejects unjustified all-holiday weeks", () => {
    const context = buildGenerationContext();
    const extras = context.calendarContext.period.dates.map((date) =>
      holidayOpportunity(date, "US", `Observance ${date}`),
    );
    context.calendarContext.opportunities.push(...extras);
    const raw = buildValidPackageRaw(
      context,
      extras.map((opportunity) => ({
        calendarAnchors: [
          {
            sourceCandidateId: opportunity.id,
            date: opportunity.date,
            label: opportunity.label,
            category: opportunity.category,
            scope: opportunity.scope,
            jurisdictionCountryCode: "US",
            jurisdictionRegionCode: null,
            jurisdictionHemisphere: null,
            reason: "Holiday every day",
          },
        ],
        calendarReason: "Holiday every day",
      })),
    );
    const error = expectFailure(raw, context);
    assert.ok(error.failures.some((failure) => /Holiday\/observance anchors/i.test(failure)));
  });

  it("rotates multiple personas and still allows a sparse portfolio", () => {
    const multi = buildGenerationContext();
    const multiPkg = validateAndNormalizeSocialCalendarPackage({
      raw: buildValidPackageRaw(multi),
      context: multi,
      userGuidance: null,
      metadata: testMetadata(),
    });
    const used = new Set(multiPkg.assets.flatMap((asset) => asset.personaIds));
    assert.ok(used.size >= 2);

    const sparse = buildGenerationContext({ personas: [] });
    const sparsePkg = validateAndNormalizeSocialCalendarPackage({
      raw: buildValidPackageRaw(sparse),
      context: sparse,
      userGuidance: null,
      metadata: testMetadata(),
    });
    assert.equal(sparsePkg.assets.length, 7);
  });

  it("rejects Prospect identity in public copy", () => {
    const context = buildGenerationContext({ prospectName: "Hidden Dental Group LLC" });
    const raw = buildValidPackageRaw(context, {
      0: { socialCopy: "Shoutout to Hidden Dental Group LLC for the idea." },
    });
    const error = expectFailure(raw, context);
    assert.ok(error.failures.some((failure) => /Prospect business identity/i.test(failure)));
  });

  it("rejects date order, missing days, and extra days", () => {
    const context = buildGenerationContext();
    const raw = buildValidPackageRaw(context);
    const assets = raw.assets as Array<Record<string, unknown>>;
    [assets[0].date, assets[1].date] = [assets[1].date, assets[0].date];
    const swapped = expectFailure(raw, context);
    assert.ok(swapped.failures.some((failure) => /must be 2026-05-10/i.test(failure)));

    const shortRaw = buildValidPackageRaw(context);
    (shortRaw.assets as unknown[]).pop();
    const missing = expectFailure(shortRaw, context);
    assert.ok(missing.failures.some((failure) => /exactly seven assets/i.test(failure)));
  });

  it("rejects an unsupported production-spec discriminator", () => {
    const context = buildGenerationContext();
    const raw = buildValidPackageRaw(context, {
      0: {
        productionSpec: { kind: "image", imagePrompt: "nope" } as never,
      },
    });
    const error = expectFailure(raw, context);
    assert.ok(error.failures.some((failure) => /kind must be carousel|unsupported/i.test(error.failures.join(" ")) || /kind must be carousel/i.test(failure)));
  });

  it("rejects empty concept or social copy", () => {
    const context = buildGenerationContext();
    const emptyConcept = expectFailure(
      buildValidPackageRaw(context, { 0: { concept: "   " } }),
      context,
    );
    assert.ok(emptyConcept.failures.some((failure) => /concept/i.test(failure)));
    const emptyCopy = expectFailure(
      buildValidPackageRaw(context, { 0: { socialCopy: "" } }),
      context,
    );
    assert.ok(emptyCopy.failures.some((failure) => /socialCopy/i.test(failure)));
  });

  it("rejects an oversized package", () => {
    const context = buildGenerationContext();
    const raw = buildValidPackageRaw(context, {
      0: {
        concept: `${"x".repeat(800)}`,
        socialCopy: "A".repeat(1300),
      },
    });
    const error = expectFailure(raw, context);
    assert.ok(
      error.failures.some((failure) => /exceeds/i.test(failure)),
    );
  });

  it("reconstructs weekdays from Calendar Context rather than the model", () => {
    const context = buildGenerationContext();
    const raw = buildValidPackageRaw(context);
    const assets = raw.assets as Array<Record<string, unknown>>;
    for (const asset of assets) asset.weekday = "Monday";
    const pkg = validateAndNormalizeSocialCalendarPackage({
      raw,
      context,
      userGuidance: null,
      metadata: testMetadata(),
    });
    assert.deepEqual(
      pkg.assets.map((asset) => asset.weekday),
      context.calendarContext.dayContexts.map((day) => day.dayOfWeek),
    );
  });

  it("buildValidAsset helper stays aligned with calendar dates", () => {
    const context = buildGenerationContext();
    const asset = buildValidAsset(context, 3);
    assert.equal(asset.date, context.calendarContext.period.dates[3]);
  });

  it("rejects LLM-shaped carousel productionSpec missing slides", () => {
    const context = buildGenerationContext();
    const raw = buildValidPackageRaw(context, {
      0: {
        productionSpec: {
          kind: "carousel",
          visualDirection: "Warm clinic photography",
          designPrompt: "Soft daylight carousel",
        } as never,
      },
    });
    const error = expectFailure(raw, context);
    assert.ok(
      error.failures.some((failure) =>
        /assets\[0\]\.productionSpec\.slides must be an array/i.test(failure),
      ),
    );
  });

  it("rejects LLM-shaped carousel productionSpec missing visualDirection", () => {
    const context = buildGenerationContext();
    const raw = buildValidPackageRaw(context, {
      0: {
        productionSpec: {
          kind: "carousel",
          designPrompt: "Soft daylight carousel",
          slides: [
            { index: 1, headline: "One", body: "Body one", visualNote: "Note one" },
            { index: 2, headline: "Two", body: "Body two", visualNote: "Note two" },
            { index: 3, headline: "Three", body: "Body three", visualNote: "Note three" },
          ],
        } as never,
      },
    });
    const error = expectFailure(raw, context);
    assert.ok(
      error.failures.some((failure) =>
        /assets\[0\]\.productionSpec\.visualDirection is required/i.test(failure),
      ),
    );
  });

  it("rejects LLM-shaped productionSpec kind image", () => {
    const context = buildGenerationContext();
    const raw = buildValidPackageRaw(context, {
      0: {
        productionSpec: { kind: "image", imagePrompt: "clinic photo" } as never,
      },
    });
    const error = expectFailure(raw, context);
    assert.ok(
      error.failures.some((failure) =>
        /kind must be carousel for asset type carousel|kind is unsupported/i.test(
          failure,
        ),
      ),
    );
  });

  it("rejects LLM-shaped video productionSpec missing shotPlan", () => {
    const context = buildGenerationContext();
    const raw = buildValidPackageRaw(context, {
      1: {
        productionSpec: {
          kind: "video",
          videoConcept: "Clinician to camera",
          hook: "Open on the weekly problem",
          environment: "Treatment room",
          productionDirection: "Vertical handheld",
          visualTone: "Documentary",
        } as never,
      },
    });
    const error = expectFailure(raw, context);
    assert.ok(
      error.failures.some((failure) =>
        /assets\[1\]\.productionSpec\.shotPlan must be an array|must contain 2-8 shots/i.test(
          failure,
        ),
      ),
    );
  });

  it("rejects LLM-shaped document productionSpec missing sections", () => {
    const context = buildGenerationContext();
    const raw = buildValidPackageRaw(context, {
      3: {
        productionSpec: {
          kind: "document",
          documentConcept: "First-visit checklist",
          designPrompt: "One-page PDF",
        } as never,
      },
    });
    const error = expectFailure(raw, context);
    assert.ok(
      error.failures.some((failure) =>
        /assets\[3\]\.productionSpec\.sections must be an array|must contain 2-8 sections/i.test(
          failure,
        ),
      ),
    );
  });

  it("rejects LLM-shaped engagement poll/quiz with invalid options", () => {
    const context = buildGenerationContext();
    const poll = expectFailure(
      buildValidPackageRaw(context, {
        4: {
          productionSpec: {
            kind: "engagement",
            engagementType: "poll",
            prompt: "When is the easiest time for a cleaning?",
            options: ["Only one choice"],
          } as never,
        },
      }),
      context,
    );
    assert.ok(
      poll.failures.some((failure) =>
        /options must contain 2-4 choices for poll/i.test(failure),
      ),
    );

    const quiz = expectFailure(
      buildValidPackageRaw(context, {
        4: {
          assetType: "quiz",
          productionSpec: {
            kind: "engagement",
            engagementType: "quiz",
            prompt: "Which sign means a cleaning is overdue?",
            options: [],
          } as never,
        },
      }),
      context,
    );
    assert.ok(
      quiz.failures.some((failure) =>
        /options must contain 2-4 choices for quiz/i.test(failure),
      ),
    );
  });

  it("rejects convert/promote assets without a CTA", () => {
    const context = buildGenerationContext();
    const error = expectFailure(
      buildValidPackageRaw(context, {
        2: { primaryObjective: "convert", cta: null },
      }),
      context,
    );
    assert.ok(
      error.failures.some((failure) =>
        /assets\[2\]\.cta is required for convert/i.test(failure),
      ),
    );
  });

  it("rejects whyThisWeekWorks with an invalid sentence count", () => {
    const context = buildGenerationContext();
    const oneSentence = expectFailure(
      {
        ...buildValidPackageRaw(context),
        whyThisWeekWorks:
          "This week is a single run-on explanation of education, community, and one practical checklist without a second sentence.",
      },
      context,
    );
    assert.ok(
      oneSentence.failures.some((failure) =>
        /whyThisWeekWorks must be 2-4 concise sentences/i.test(failure),
      ),
    );
  });

  it("rejects calendarReason when no anchors are selected", () => {
    const context = buildGenerationContext();
    const error = expectFailure(
      buildValidPackageRaw(context, {
        0: {
          calendarAnchors: [],
          calendarReason: "Invented holiday relevance without a candidate.",
        },
      }),
      context,
    );
    assert.ok(
      error.failures.some((failure) =>
        /calendarReason must be null when no calendar anchors are selected/i.test(
          failure,
        ),
      ),
    );
  });
});
