/**
 * Deterministic Think Differently source-calendar divergence (L8).
 * Date-aligned comparison plus week-portfolio similarity.
 * Reuses L5 similarity primitives. No LLM similarity.
 */

import type { SocialCalendarPackageV1 } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import type { SocialPlannerAssetFingerprint } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  SOCIAL_PLANNER_HOOK_RULES,
  distributionOverlap,
  hookSimilarity,
  isShortHook,
  scoreAssetSimilarity,
  scoreWeekSimilarity,
  setJaccard,
  textSimilarity,
  weekPortfolioFromAssets,
} from "@/services/socialPlanner/diversity/socialPlannerSimilarity";
import {
  SOCIAL_PLANNER_SOURCE_DIVERGENCE_ALGORITHM_VERSION,
  SOCIAL_PLANNER_SOURCE_DIVERGENCE_THRESHOLDS as THRESHOLDS,
  SOCIAL_PLANNER_SOURCE_NEGATIVE_BOUNDS,
  SOCIAL_PLANNER_SOURCE_NEGATIVE_SCHEMA_VERSION,
  type SocialPlannerSourceNegativeContext,
  type SocialPlannerThinkDifferentlyDayComparison,
  type SocialPlannerThinkDifferentlyDivergenceResult,
  type SocialPlannerThinkDifferentlyViolation,
} from "@/services/socialPlanner/thinkDifferently/socialPlannerThinkDifferentlyTypes";

export { SOCIAL_PLANNER_SOURCE_DIVERGENCE_ALGORITHM_VERSION };

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

function topicAngleArchetypeKey(fingerprint: SocialPlannerAssetFingerprint): string {
  return `${fingerprint.topic}|${fingerprint.angle}|${fingerprint.contentArchetype}`;
}

function assetsByDate(
  socialPackage: SocialCalendarPackageV1,
): Map<string, SocialCalendarPackageV1["assets"][number]> {
  return new Map(socialPackage.assets.map((asset) => [asset.date, asset]));
}

function dayChangedDimensions(
  candidate: SocialPlannerAssetFingerprint,
  source: SocialPlannerAssetFingerprint,
): string[] {
  const changed: string[] = [];
  if (candidate.assetType !== source.assetType) changed.push("assetType");
  if (candidate.family !== source.family) changed.push("family");
  if (candidate.contentArchetype !== source.contentArchetype) {
    changed.push("contentArchetype");
  }
  if (candidate.objective !== source.objective) changed.push("objective");
  if (textSimilarity(candidate.topic, source.topic) < THRESHOLDS.topicMatch) {
    changed.push("topic");
  }
  if (textSimilarity(candidate.angle, source.angle) < THRESHOLDS.angleMatch) {
    changed.push("angle");
  }
  if (
    hookSimilarity(candidate.hookNormalized, source.hookNormalized) < 0.7
  ) {
    changed.push("hook");
  }
  if (textSimilarity(candidate.audience, source.audience) < 0.7) {
    changed.push("audience");
  }
  if (textSimilarity(candidate.visualStyle, source.visualStyle) < 0.7) {
    changed.push("visualStyle");
  }
  return changed;
}

function isExactOrNearHookReuse(
  candidateHook: string | null,
  sourceHook: string | null,
): boolean {
  if (!candidateHook || !sourceHook || isShortHook(candidateHook)) return false;
  if (candidateHook === sourceHook) return true;
  return hookSimilarity(candidateHook, sourceHook) >= SOCIAL_PLANNER_HOOK_RULES.nearDuplicateJaccard;
}

export function buildSourceNegativeContext(
  sourcePackage: SocialCalendarPackageV1,
): SocialPlannerSourceNegativeContext {
  return {
    schemaVersion: SOCIAL_PLANNER_SOURCE_NEGATIVE_SCHEMA_VERSION,
    period: {
      periodStart: sourcePackage.period.periodStart,
      periodEnd: sourcePackage.period.periodEnd,
      dates: [...sourcePackage.period.dates],
    },
    strategySummary: clip(
      sourcePackage.strategySummary,
      SOCIAL_PLANNER_SOURCE_NEGATIVE_BOUNDS.strategySummaryMaxChars,
    ),
    weeklyCreativeDirection: clip(
      sourcePackage.whyThisWeekWorks,
      SOCIAL_PLANNER_SOURCE_NEGATIVE_BOUNDS.weeklyDirectionMaxChars,
    ),
    weekFingerprint: {
      assetTypes: [...sourcePackage.weekFingerprint.assetTypes],
      families: [...sourcePackage.weekFingerprint.families],
      objectives: [...sourcePackage.weekFingerprint.objectives],
      archetypes: [...sourcePackage.weekFingerprint.archetypes],
      personaIds: [],
      topics: [...sourcePackage.weekFingerprint.topics],
      calendarAnchorIds: [...sourcePackage.weekFingerprint.calendarAnchorIds],
    },
    days: sourcePackage.assets.map((asset) => {
      const fingerprint = asset.creativeFingerprint;
      return {
        date: asset.date,
        assetType: fingerprint.assetType,
        family: fingerprint.family,
        contentArchetype: fingerprint.contentArchetype,
        topic: fingerprint.topic,
        angle: fingerprint.angle,
        hookNormalized: fingerprint.hookNormalized,
        hookType: fingerprint.hookType,
        objective: fingerprint.objective,
        audience: fingerprint.audience,
        visualStyle: fingerprint.visualStyle,
        calendarAnchorIds: [...fingerprint.calendarAnchorIds],
        calendarAnchorLabels: asset.calendarAnchors
          .map((anchor) => anchor.label)
          .filter(Boolean)
          .slice(0, 2),
      };
    }),
  };
}

export function evaluateThinkDifferentlyDivergence(input: {
  candidatePackage: SocialCalendarPackageV1;
  sourcePackage: SocialCalendarPackageV1;
}): SocialPlannerThinkDifferentlyDivergenceResult {
  const { candidatePackage, sourcePackage } = input;
  const sourceByDate = assetsByDate(sourcePackage);
  const sourceHooks = sourcePackage.assets
    .map((asset) => asset.creativeFingerprint.hookNormalized)
    .filter((hook): hook is string => Boolean(hook));

  const days: SocialPlannerThinkDifferentlyDayComparison[] = [];
  const violations: SocialPlannerThinkDifferentlyViolation[] = [];
  let highestSourceAssetSimilarity = 0;
  let topicAngleHookPreserved = 0;

  for (const candidateAsset of candidatePackage.assets) {
    const sourceAsset = sourceByDate.get(candidateAsset.date);
    if (!sourceAsset) {
      violations.push({
        code: "SOURCE_DATE_MISALIGN",
        message: `Candidate date ${candidateAsset.date} is missing from the source calendar.`,
        candidateDate: candidateAsset.date,
      });
      days.push({
        date: candidateAsset.date,
        score: 0,
        materiallyDifferent: false,
        changedDimensions: [],
        topicAngleArchetypeRepeat: false,
        hookReuse: false,
      });
      continue;
    }

    const candidate = candidateAsset.creativeFingerprint;
    const source = sourceAsset.creativeFingerprint;
    const breakdown = scoreAssetSimilarity({
      candidate,
      historical: source,
      recencyWeight: 1,
      userGuidance: null,
    });
    highestSourceAssetSimilarity = Math.max(
      highestSourceAssetSimilarity,
      breakdown.score,
    );

    const topicAngleArchetypeRepeat =
      topicAngleArchetypeKey(candidate) === topicAngleArchetypeKey(source) &&
      candidate.topic.length > 0;
    const sameDayHookReuse = isExactOrNearHookReuse(
      candidate.hookNormalized,
      source.hookNormalized,
    );
    const anySourceHookReuse = sourceHooks.some((hook) =>
      isExactOrNearHookReuse(candidate.hookNormalized, hook),
    );
    const changedDimensions = dayChangedDimensions(candidate, source);
    const materiallyDifferent =
      !topicAngleArchetypeRepeat &&
      !sameDayHookReuse &&
      changedDimensions.length >= THRESHOLDS.materialDayChangedDimensions &&
      breakdown.score < THRESHOLDS.assetReject;

    if (
      textSimilarity(candidate.topic, source.topic) >= THRESHOLDS.topicMatch &&
      textSimilarity(candidate.angle, source.angle) >= THRESHOLDS.angleMatch &&
      hookSimilarity(candidate.hookNormalized, source.hookNormalized) >= 0.7
    ) {
      topicAngleHookPreserved += 1;
    }

    days.push({
      date: candidateAsset.date,
      score: breakdown.score,
      materiallyDifferent,
      changedDimensions,
      topicAngleArchetypeRepeat,
      hookReuse: sameDayHookReuse,
    });

    if (topicAngleArchetypeRepeat) {
      violations.push({
        code: "SAME_DAY_TOPIC_ANGLE_ARCHETYPE",
        message:
          "Think Differently cannot repeat the source topic + angle + archetype on the same day.",
        candidateDate: candidateAsset.date,
        score: breakdown.score,
      });
    }
    if (anySourceHookReuse) {
      violations.push({
        code: "EXACT_SOURCE_HOOK",
        message: "Think Differently cannot reuse a source hook.",
        candidateDate: candidateAsset.date,
        score: breakdown.score,
      });
    }
    if (breakdown.score >= THRESHOLDS.assetReject) {
      violations.push({
        code: "SOURCE_ASSET_SIMILARITY",
        message:
          "This day's creative treatment is too similar to the source calendar day.",
        candidateDate: candidateAsset.date,
        score: breakdown.score,
      });
    }
  }

  const candidateWeek = weekPortfolioFromAssets(
    candidatePackage.assets,
    candidatePackage.weekFingerprint,
  );
  const sourceWeek = weekPortfolioFromAssets(
    sourcePackage.assets,
    sourcePackage.weekFingerprint,
  );
  const sourceWeekSimilarity = scoreWeekSimilarity(candidateWeek, sourceWeek);
  const formatChangeScore = Number(
    (1 - distributionOverlap(candidateWeek.assetTypeCounts, sourceWeek.assetTypeCounts)).toFixed(4),
  );
  const archetypeChangeScore = Number(
    (1 - distributionOverlap(candidateWeek.archetypeCounts, sourceWeek.archetypeCounts)).toFixed(4),
  );
  const topicTreatmentChangeScore = Number(
    (
      1 -
      setJaccard(
        candidatePackage.assets.map((asset) =>
          topicAngleArchetypeKey(asset.creativeFingerprint),
        ),
        sourcePackage.assets.map((asset) =>
          topicAngleArchetypeKey(asset.creativeFingerprint),
        ),
      )
    ).toFixed(4),
  );
  const hookReuseDays = days.filter((day) => day.hookReuse).length;
  const hookChangeScore = Number((1 - hookReuseDays / Math.max(days.length, 1)).toFixed(4));
  const materiallyDifferentDays = days.filter((day) => day.materiallyDifferent).length;

  const weekFingerprintIdentity = Number(
    (
      (setJaccard(
        candidatePackage.weekFingerprint.assetTypes,
        sourcePackage.weekFingerprint.assetTypes,
      ) +
        setJaccard(
          candidatePackage.weekFingerprint.archetypes,
          sourcePackage.weekFingerprint.archetypes,
        ) +
        setJaccard(
          candidatePackage.weekFingerprint.topics,
          sourcePackage.weekFingerprint.topics,
        ) +
        setJaccard(
          candidatePackage.weekFingerprint.objectives,
          sourcePackage.weekFingerprint.objectives,
        )) /
      4
    ).toFixed(4),
  );

  if (sourceWeekSimilarity >= THRESHOLDS.weekReject) {
    violations.push({
      code: "SOURCE_WEEK_SIMILARITY",
      message:
        "The Think Differently week still mirrors the source week's format, objective, and archetype mix.",
      score: sourceWeekSimilarity,
    });
  }
  if (materiallyDifferentDays < THRESHOLDS.minMateriallyDifferentDays) {
    violations.push({
      code: "INSUFFICIENT_DAILY_DIVERGENCE",
      message: `Think Differently requires at least ${THRESHOLDS.minMateriallyDifferentDays} of 7 days to change creative treatment.`,
      score: materiallyDifferentDays,
    });
  }
  if (
    formatChangeScore < THRESHOLDS.formatChangeMin &&
    archetypeChangeScore < THRESHOLDS.archetypeChangeMin
  ) {
    violations.push({
      code: "FORMAT_ARCHETYPE_STAGNANT",
      message:
        "Think Differently must redistribute formats or archetypes, not only rewrite captions.",
      score: Math.max(formatChangeScore, archetypeChangeScore),
    });
  }
  if (
    Math.max(formatChangeScore, archetypeChangeScore, topicTreatmentChangeScore) <
    THRESHOLDS.weeklyDirectionChangeMin
  ) {
    violations.push({
      code: "WEEKLY_DIRECTION_UNCHANGED",
      message: "The weekly creative direction is still the source calendar's obvious treatment.",
      score: Math.max(formatChangeScore, archetypeChangeScore, topicTreatmentChangeScore),
    });
  }
  if (hookChangeScore < THRESHOLDS.hookChangeMin) {
    violations.push({
      code: "HOOK_PARAPHRASE_WEEK",
      message: "Most source hooks were reused or only lightly paraphrased.",
      score: hookChangeScore,
    });
  }
  if (topicAngleHookPreserved >= THRESHOLDS.topicAngleHookPreserveDays) {
    violations.push({
      code: "TOPIC_ANGLE_HOOK_PRESERVED",
      message:
        "Most days kept the source topic, angle, and hook even when the format changed.",
      score: topicAngleHookPreserved,
    });
  }
  if (
    weekFingerprintIdentity >= THRESHOLDS.weekFingerprintNearIdentity &&
    sourceWeekSimilarity >= 0.55
  ) {
    violations.push({
      code: "WEEK_FINGERPRINT_NEAR_IDENTITY",
      message: "The week fingerprint is essentially the source calendar.",
      score: weekFingerprintIdentity,
    });
  }

  const uniqueViolations = dedupeViolations(violations);
  return {
    accepted: uniqueViolations.length === 0,
    sourceWeekSimilarity,
    highestSourceAssetSimilarity: Number(highestSourceAssetSimilarity.toFixed(4)),
    formatChangeScore,
    archetypeChangeScore,
    topicTreatmentChangeScore,
    hookChangeScore,
    materiallyDifferentDays,
    days,
    violations: uniqueViolations,
  };
}

function dedupeViolations(
  violations: SocialPlannerThinkDifferentlyViolation[],
): SocialPlannerThinkDifferentlyViolation[] {
  const seen = new Set<string>();
  const unique: SocialPlannerThinkDifferentlyViolation[] = [];
  for (const violation of violations) {
    const key = `${violation.code}|${violation.candidateDate ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(violation);
  }
  return unique;
}

export function formatThinkDifferentlyViolations(
  result: SocialPlannerThinkDifferentlyDivergenceResult,
): string[] {
  return result.violations.map((violation) => {
    const where = [violation.candidateDate, violation.code].filter(Boolean).join(" / ");
    return `${violation.message} (${where})`;
  });
}

export function compactSourceFingerprintSummary(
  sourcePackage: SocialCalendarPackageV1,
): string {
  return sourcePackage.assets
    .map((asset) => {
      const fingerprint = asset.creativeFingerprint;
      return `- ${asset.date}: ${fingerprint.assetType} / ${fingerprint.contentArchetype} / ${fingerprint.topic} / ${fingerprint.angle} / hook:${fingerprint.hookNormalized ?? "none"} / ${fingerprint.objective}`;
    })
    .join("\n");
}
