/**
 * Historical Social Planner diversity evaluation (L5).
 * Deterministic accept / warn / fail against bounded Social Memory.
 */

import type { SocialCalendarPackageV1 } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import type { SocialPlannerAssetFingerprint } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION,
  SOCIAL_PLANNER_SOCIAL_MEMORY_BOUNDS,
  type SocialPlannerAssetSimilarityComparison,
  type SocialPlannerHistoricalDiversityResult,
  type SocialPlannerHistoricalDiversityViolation,
  type SocialPlannerHistoricalDiversityWarning,
  type SocialPlannerSocialMemoryV1,
} from "@/services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";
import {
  SOCIAL_PLANNER_DIVERSITY_THRESHOLDS,
  SOCIAL_PLANNER_HOOK_RULES,
  findBestHistoricalAssetMatch,
  hookSimilarity,
  isShortHook,
  isTopicRelaxedByUserGuidance,
  majorFingerprintKey,
  scoreAssetSimilarity,
  scoreWeekSimilarity,
  topicAngleKey,
  typeArchetypeTopicAudienceKey,
  weekPortfolioFromAssets,
} from "@/services/socialPlanner/diversity/socialPlannerSimilarity";

export { SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION };

const THRESHOLDS = SOCIAL_PLANNER_DIVERSITY_THRESHOLDS;

function emptyAccepted(): SocialPlannerHistoricalDiversityResult {
  return {
    accepted: true,
    overallScore: 0,
    highestAssetSimilarity: 0,
    weekSimilarity: 0,
    violations: [],
    warnings: [],
    comparisons: [],
  };
}

function hardRecent(weight: number): boolean {
  return weight >= THRESHOLDS.hardRecentMinWeight;
}

function collectHardViolations(input: {
  candidateDate: string;
  candidate: SocialPlannerAssetFingerprint;
  userGuidance: string | null;
  memory: SocialPlannerSocialMemoryV1;
}): SocialPlannerHistoricalDiversityViolation[] {
  const violations: SocialPlannerHistoricalDiversityViolation[] = [];
  const candidateKey = majorFingerprintKey(input.candidate);
  const candidateTopicAngle = topicAngleKey(input.candidate);
  const candidateCombo = typeArchetypeTopicAudienceKey(input.candidate);
  const topicRelaxed = isTopicRelaxedByUserGuidance(
    input.candidate.topic,
    input.userGuidance,
  );

  for (const historical of input.memory.historicalAssets) {
    const hist = historical.creativeFingerprint;
    const score = scoreAssetSimilarity({
      candidate: input.candidate,
      historical: hist,
      recencyWeight: historical.recencyWeight,
      userGuidance: input.userGuidance,
    }).recencyWeightedScore;

    if (
      historical.recencyWeight >= THRESHOLDS.majorFingerprintMinWeight &&
      candidateKey === majorFingerprintKey(hist)
    ) {
      violations.push({
        kind: "hard_duplicate",
        code: "EXACT_MAJOR_FINGERPRINT",
        message:
          "Candidate repeats a substantially identical creative fingerprint from recent history.",
        candidateDate: input.candidateDate,
        historicalCalendarId: historical.calendarId,
        historicalAssetDate: historical.date,
        score,
      });
    }

    const hookScore = hookSimilarity(
      input.candidate.hookNormalized,
      hist.hookNormalized,
    );
    if (
      hardRecent(historical.recencyWeight) &&
      input.candidate.hookNormalized &&
      hist.hookNormalized &&
      !isShortHook(input.candidate.hookNormalized)
    ) {
      if (input.candidate.hookNormalized === hist.hookNormalized) {
        violations.push({
          kind: "hard_duplicate",
          code: "EXACT_HOOK",
          message: "Candidate repeats an exact recent hook.",
          candidateDate: input.candidateDate,
          historicalCalendarId: historical.calendarId,
          historicalAssetDate: historical.date,
          score,
        });
      } else if (hookScore >= SOCIAL_PLANNER_HOOK_RULES.nearDuplicateJaccard) {
        violations.push({
          kind: "hard_duplicate",
          code: "NEAR_IDENTICAL_HOOK",
          message: "Candidate hook is near-identical to a recent historical hook.",
          candidateDate: input.candidateDate,
          historicalCalendarId: historical.calendarId,
          historicalAssetDate: historical.date,
          score,
        });
      }
    }

    if (
      hardRecent(historical.recencyWeight) &&
      candidateTopicAngle === topicAngleKey(hist) &&
      input.candidate.topic.length > 0
    ) {
      violations.push({
        kind: "hard_duplicate",
        code: "TOPIC_ANGLE_PAIR",
        message: topicRelaxed
          ? "User guidance allows this topic, but the same topic + angle treatment recently recurred."
          : "Candidate repeats a recent topic + angle pair.",
        candidateDate: input.candidateDate,
        historicalCalendarId: historical.calendarId,
        historicalAssetDate: historical.date,
        score,
      });
    }

    if (
      hardRecent(historical.recencyWeight) &&
      candidateCombo === typeArchetypeTopicAudienceKey(hist)
    ) {
      violations.push({
        kind: "hard_duplicate",
        code: "TYPE_ARCHETYPE_TOPIC_AUDIENCE",
        message:
          "Candidate repeats a recent asset type + archetype + topic + audience combination.",
        candidateDate: input.candidateDate,
        historicalCalendarId: historical.calendarId,
        historicalAssetDate: historical.date,
        score,
      });
    }
  }

  return dedupeViolations(violations);
}

function dedupeViolations(
  violations: SocialPlannerHistoricalDiversityViolation[],
): SocialPlannerHistoricalDiversityViolation[] {
  const seen = new Set<string>();
  const unique: SocialPlannerHistoricalDiversityViolation[] = [];
  for (const violation of violations) {
    const key = [
      violation.code,
      violation.candidateDate ?? "",
      violation.historicalCalendarId ?? "",
      violation.historicalAssetDate ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(violation);
  }
  return unique;
}

export type SocialPlannerDiversityRevisionMode = {
  sourceCalendarId: string;
  preservedDates: readonly string[];
};

function shouldIgnoreSourcePreservationHit(input: {
  revisionMode?: SocialPlannerDiversityRevisionMode;
  candidateDate?: string;
  historicalCalendarId?: string;
}): boolean {
  if (!input.revisionMode || !input.candidateDate || !input.historicalCalendarId) {
    return false;
  }
  return (
    input.historicalCalendarId === input.revisionMode.sourceCalendarId &&
    input.revisionMode.preservedDates.includes(input.candidateDate)
  );
}

export function evaluateHistoricalDiversity(input: {
  candidatePackage: SocialCalendarPackageV1;
  socialMemory: SocialPlannerSocialMemoryV1;
  userGuidance?: string | null;
  revisionMode?: SocialPlannerDiversityRevisionMode;
}): SocialPlannerHistoricalDiversityResult {
  const memory = input.socialMemory;
  if (memory.historicalAssets.length === 0) {
    return emptyAccepted();
  }

  const userGuidance = input.userGuidance ?? null;
  const violations: SocialPlannerHistoricalDiversityViolation[] = [];
  const warnings: SocialPlannerHistoricalDiversityWarning[] = [];
  const comparisons: SocialPlannerAssetSimilarityComparison[] = [];
  const moderateHits: SocialPlannerAssetSimilarityComparison[] = [];

  for (const asset of input.candidatePackage.assets) {
    const fingerprint = asset.creativeFingerprint;
    violations.push(
      ...collectHardViolations({
        candidateDate: asset.date,
        candidate: fingerprint,
        userGuidance,
        memory,
      }).filter(
        (violation) =>
          !shouldIgnoreSourcePreservationHit({
            revisionMode: input.revisionMode,
            candidateDate: violation.candidateDate ?? asset.date,
            historicalCalendarId: violation.historicalCalendarId,
          }),
      ),
    );

    const best = findBestHistoricalAssetMatch({
      candidate: fingerprint,
      historicalAssets: memory.historicalAssets,
      userGuidance,
    });
    if (!best) continue;

    const comparison: SocialPlannerAssetSimilarityComparison = {
      score: best.breakdown.score,
      recencyWeightedScore: best.breakdown.recencyWeightedScore,
      matchedDimensions: best.breakdown.matchedDimensions,
      historicalCalendarId: best.historical.calendarId,
      historicalAssetDate: best.historical.date,
      candidateDate: asset.date,
    };
    comparisons.push(comparison);

    const ignoreSourcePreserve = shouldIgnoreSourcePreservationHit({
      revisionMode: input.revisionMode,
      candidateDate: asset.date,
      historicalCalendarId: comparison.historicalCalendarId,
    });

    if (comparison.recencyWeightedScore >= THRESHOLDS.assetReject) {
      if (!ignoreSourcePreserve) {
        violations.push({
          kind: "asset_similarity",
          code: "ASSET_SIMILARITY_THRESHOLD",
          message:
            "Candidate asset exceeds the historical similarity threshold against recent Social Memory.",
          candidateDate: asset.date,
          historicalCalendarId: comparison.historicalCalendarId,
          historicalAssetDate: comparison.historicalAssetDate,
          score: comparison.recencyWeightedScore,
        });
      }
    } else if (comparison.recencyWeightedScore >= THRESHOLDS.clusteredScore) {
      if (!ignoreSourcePreserve) {
        moderateHits.push(comparison);
      }
    }

    if (
      comparison.recencyWeightedScore >= THRESHOLDS.assetWarn &&
      comparison.recencyWeightedScore < THRESHOLDS.assetReject
    ) {
      warnings.push({
        kind: "moderate_asset_similarity",
        message: "Candidate resembles recent creative treatment but stays below the reject threshold.",
        candidateDate: asset.date,
      });
    }

    const topicMatch = best.breakdown.matchedDimensions.includes("topic");
    const angleMatch = best.breakdown.matchedDimensions.includes("angle");
    if (topicMatch && !angleMatch) {
      warnings.push({
        kind: "topic_repeat",
        message: isTopicRelaxedByUserGuidance(fingerprint.topic, userGuidance)
          ? "Core topic recurs as requested by user guidance; creative treatment still varies."
          : "Core topic recurs from recent history; angle and format differ.",
        candidateDate: asset.date,
      });
    }
    if (best.breakdown.matchedDimensions.includes("objective") && !topicMatch) {
      warnings.push({
        kind: "objective_repeat",
        message: "Objective recurs from recent history without matching the prior creative treatment.",
        candidateDate: asset.date,
      });
    }
    if (
      fingerprint.personaIds.length > 0 &&
      best.historical.creativeFingerprint.personaIds.some((id) =>
        fingerprint.personaIds.includes(id),
      ) &&
      !best.breakdown.matchedDimensions.includes("hookNormalized")
    ) {
      warnings.push({
        kind: "persona_repeat",
        message: "The same Persona is reused, which is allowed when creative treatment changes.",
        candidateDate: asset.date,
      });
    }
    if (
      best.breakdown.matchedDimensions.includes("ctaType") &&
      best.breakdown.matchedDimensions.length <= 2
    ) {
      warnings.push({
        kind: "cta_repeat",
        message: "CTA type recurs. That is expected and is not a diversity failure.",
        candidateDate: asset.date,
      });
    }
    if (
      best.breakdown.matchedDimensions.includes("calendarAnchorIds") &&
      !angleMatch
    ) {
      warnings.push({
        kind: "calendar_anchor_repeat",
        message:
          "A recurring calendar opportunity is reused. Annual anchors are allowed when creative treatment changes.",
        candidateDate: asset.date,
      });
    }
  }

  if (moderateHits.length >= THRESHOLDS.clusteredCount) {
    violations.push({
      kind: "clustered_moderate",
      code: "CLUSTERED_MODERATE_SIMILARITY",
      message: `${moderateHits.length} assets have moderate historical similarity. The week as a whole repeats recent creative combinations.`,
      score: moderateHits[0]?.recencyWeightedScore,
    });
  }

  const candidateWeek = weekPortfolioFromAssets(
    input.candidatePackage.assets,
    input.candidatePackage.weekFingerprint,
  );
  let weekSimilarity = 0;
  let weekHistoricalId: string | undefined;
  for (const historicalWeek of memory.historicalWeeks) {
    const raw = scoreWeekSimilarity(candidateWeek, historicalWeek);
    const weighted = Number((raw * historicalWeek.recencyWeight).toFixed(4));
    if (weighted > weekSimilarity) {
      weekSimilarity = weighted;
      weekHistoricalId = historicalWeek.calendarId;
    }
  }

  const weekIsPreservedSource =
    Boolean(input.revisionMode) &&
    weekHistoricalId === input.revisionMode?.sourceCalendarId &&
    (input.revisionMode?.preservedDates.length ?? 0) > 0;

  if (weekSimilarity >= THRESHOLDS.weekReject && !weekIsPreservedSource) {
    violations.push({
      kind: "week_similarity",
      code: "WEEK_PORTFOLIO_THRESHOLD",
      message:
        "The candidate week mirrors a recent week's format, objective, and archetype composition.",
      historicalCalendarId: weekHistoricalId,
      score: weekSimilarity,
    });
  } else if (weekSimilarity >= THRESHOLDS.weekWarn && !weekIsPreservedSource) {
    warnings.push({
      kind: "moderate_week_similarity",
      message: "The weekly portfolio resembles recent history but stays below the reject threshold.",
    });
  }

  const uniqueViolations = dedupeViolations(violations);
  const highestAssetSimilarity = comparisons.reduce(
    (max, comparison) => Math.max(max, comparison.recencyWeightedScore),
    0,
  );
  const boundedComparisons = [...comparisons]
    .sort((left, right) => right.recencyWeightedScore - left.recencyWeightedScore)
    .slice(0, SOCIAL_PLANNER_SOCIAL_MEMORY_BOUNDS.maxComparisons);

  return {
    accepted: uniqueViolations.length === 0,
    overallScore: Math.max(highestAssetSimilarity, weekSimilarity),
    highestAssetSimilarity,
    weekSimilarity,
    violations: uniqueViolations,
    warnings: warnings.slice(0, 16),
    comparisons: boundedComparisons,
  };
}

export function formatHistoricalDiversityViolations(
  result: SocialPlannerHistoricalDiversityResult,
): string[] {
  return result.violations.map((violation) => {
    const where = [
      violation.candidateDate ? `candidate ${violation.candidateDate}` : null,
      violation.historicalAssetDate
        ? `historical ${violation.historicalAssetDate}`
        : null,
      violation.code,
    ]
      .filter(Boolean)
      .join(" / ");
    return `${violation.message} (${where})`;
  });
}
