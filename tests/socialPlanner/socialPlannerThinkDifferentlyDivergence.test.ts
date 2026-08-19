import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSourceNegativeContext,
  evaluateThinkDifferentlyDivergence,
} from "../../services/socialPlanner/thinkDifferently/socialPlannerSourceDivergence";
import { SOCIAL_PLANNER_SOURCE_DIVERGENCE_THRESHOLDS } from "../../services/socialPlanner/thinkDifferently/socialPlannerThinkDifferentlyTypes";
import {
  buildAlternatePackageRaw,
  buildGenerationContext,
  buildValidatedPackage,
  buildValidPackageRaw,
  ensureUsHolidayCandidate,
} from "./socialPlannerGenerationFixtures";

describe("Social Planner L8 source divergence", () => {
  it("fails an exact source package repeat", () => {
    const context = buildGenerationContext();
    const source = buildValidatedPackage(context);
    const result = evaluateThinkDifferentlyDivergence({
      candidatePackage: source,
      sourcePackage: source,
    });
    assert.equal(result.accepted, false);
    assert.ok(result.sourceWeekSimilarity >= SOCIAL_PLANNER_SOURCE_DIVERGENCE_THRESHOLDS.weekReject);
    assert.ok(result.violations.some((violation) => violation.code === "EXACT_SOURCE_HOOK"));
    assert.ok(
      result.violations.some(
        (violation) => violation.code === "SAME_DAY_TOPIC_ANGLE_ARCHETYPE",
      ),
    );
  });

  it("fails caption paraphrase and identical week fingerprints", () => {
    const context = buildGenerationContext();
    const source = buildValidatedPackage(context);
    const paraphrased = structuredClone(source);
    for (const asset of paraphrased.assets) {
      asset.socialCopy = `${asset.socialCopy} Please share this with a friend.`;
    }
    const result = evaluateThinkDifferentlyDivergence({
      candidatePackage: paraphrased,
      sourcePackage: source,
    });
    assert.equal(result.accepted, false);
    assert.ok(
      result.violations.some(
        (violation) =>
          violation.code === "WEEK_FINGERPRINT_NEAR_IDENTITY" ||
          violation.code === "SOURCE_WEEK_SIMILARITY",
      ),
    );
  });

  it("accepts 4+ materially different daily treatments", () => {
    const context = buildGenerationContext();
    const source = buildValidatedPackage(context, buildValidPackageRaw(context));
    const candidate = buildValidatedPackage(context, buildAlternatePackageRaw(context));
    const result = evaluateThinkDifferentlyDivergence({
      candidatePackage: candidate,
      sourcePackage: source,
    });
    assert.equal(result.accepted, true, result.violations.map((v) => v.code).join(","));
    assert.ok(
      result.materiallyDifferentDays >=
        SOCIAL_PLANNER_SOURCE_DIVERGENCE_THRESHOLDS.minMateriallyDifferentDays,
    );
    assert.ok(result.formatChangeScore >= SOCIAL_PLANNER_SOURCE_DIVERGENCE_THRESHOLDS.formatChangeMin);
  });

  it("allows the same topic when creative treatment changes", () => {
    const context = buildGenerationContext();
    const source = buildValidatedPackage(context);
    const raw = buildAlternatePackageRaw(context, source.assets.map((asset) => ({
      topic: asset.topic,
    })));
    const candidate = buildValidatedPackage(context, raw);
    const result = evaluateThinkDifferentlyDivergence({
      candidatePackage: candidate,
      sourcePackage: source,
    });
    assert.equal(result.accepted, true, result.violations.map((v) => v.code).join(","));
  });

  it("allows the same holiday anchor with a new treatment", () => {
    const context = buildGenerationContext();
    const holiday = ensureUsHolidayCandidate(context);
    const source = buildValidatedPackage(
      context,
      buildValidPackageRaw(context, [
        {
          calendarAnchors: [
            {
              sourceCandidateId: holiday.id,
              date: holiday.date,
              label: holiday.label,
              category: holiday.category,
              scope: holiday.scope,
              reason: "Seasonal family visit",
            },
          ],
          calendarReason: "Use the holiday as a booking reminder.",
        },
      ]),
    );
    const candidate = buildValidatedPackage(
      context,
      buildAlternatePackageRaw(context, [
        {
          calendarAnchors: [
            {
              sourceCandidateId: holiday.id,
              date: holiday.date,
              label: holiday.label,
              category: holiday.category,
              scope: holiday.scope,
              reason: "Holiday as a community thank-you, not a promo.",
            },
          ],
          calendarReason: "Keep the date, change the story.",
        },
      ]),
    );
    const result = evaluateThinkDifferentlyDivergence({
      candidatePackage: candidate,
      sourcePackage: source,
    });
    assert.equal(result.accepted, true, result.violations.map((v) => v.code).join(","));
    assert.deepEqual(
      candidate.assets[0]?.creativeFingerprint.calendarAnchorIds,
      source.assets[0]?.creativeFingerprint.calendarAnchorIds,
    );
  });

  it("fails different formats that still keep topic+angle+hook on most days", () => {
    const context = buildGenerationContext();
    const source = buildValidatedPackage(context);
    const raw = buildAlternatePackageRaw(
      context,
      source.assets.map((asset) => ({
        topic: asset.topic,
        angle: asset.angle,
        hook: asset.hook,
        contentArchetype: asset.contentArchetype,
      })),
    );
    const candidate = buildValidatedPackage(context, raw);
    const result = evaluateThinkDifferentlyDivergence({
      candidatePackage: candidate,
      sourcePackage: source,
    });
    assert.equal(result.accepted, false);
    assert.ok(
      result.violations.some(
        (violation) =>
          violation.code === "TOPIC_ANGLE_HOOK_PRESERVED" ||
          violation.code === "SAME_DAY_TOPIC_ANGLE_ARCHETYPE",
      ),
    );
  });

  it("does not treat shared business facts as repetition", () => {
    const context = buildGenerationContext();
    const source = buildValidatedPackage(context);
    const candidate = buildValidatedPackage(context, buildAlternatePackageRaw(context));
    const result = evaluateThinkDifferentlyDivergence({
      candidatePackage: candidate,
      sourcePackage: source,
    });
    assert.equal(result.accepted, true);
    assert.equal(
      result.violations.some((violation) => /fact|business|clinic/i.test(violation.code)),
      false,
    );
  });

  it("compares the same calendar date, not unordered asset sets", () => {
    const context = buildGenerationContext();
    const source = buildValidatedPackage(context);
    const raw = buildAlternatePackageRaw(context);
    const candidate = buildValidatedPackage(context, raw);
    const result = evaluateThinkDifferentlyDivergence({
      candidatePackage: candidate,
      sourcePackage: source,
    });
    assert.deepEqual(
      result.days.map((day) => day.date),
      source.period.dates,
    );
    assert.equal(result.days.length, 7);
  });

  it("builds compact source-negative context without production prompts or internals", () => {
    const context = buildGenerationContext();
    const source = buildValidatedPackage(context);
    const negative = buildSourceNegativeContext(source);
    assert.equal(negative.schemaVersion, "social_planner_source_negative_v1");
    assert.equal(negative.days.length, 7);
    const serialized = JSON.stringify(negative);
    assert.doesNotMatch(serialized, /sourceSignals/);
    assert.doesNotMatch(serialized, /productionSpec/);
    assert.doesNotMatch(serialized, /socialCopy/);
    assert.doesNotMatch(serialized, /generationMetadata/);
    assert.deepEqual(negative.weekFingerprint.personaIds, []);
    assert.match(serialized, /weekFingerprint/);
    assert.match(serialized, /hookNormalized/);
  });
});
