/**
 * Deterministic Social Planner historical similarity (L5).
 * Deterministic fingerprint overlap only. No vector search or LLM classification.
 */

import { normalizeComparableText } from "@/services/socialPlanner/generation/socialPlannerCreativeFingerprint";
import type {
  SocialPlannerAssetFingerprint,
  SocialPlannerWeekFingerprint,
} from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  SOCIAL_PLANNER_RECENCY,
  SOCIAL_PLANNER_SOCIAL_MEMORY_BOUNDS,
  type SocialPlannerHistoricalAsset,
  type SocialPlannerHistoricalWeek,
} from "@/services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";

export const SOCIAL_PLANNER_SIMILARITY_WEIGHTS = {
  topic: 0.14,
  angle: 0.12,
  hookNormalized: 0.12,
  contentArchetype: 0.08,
  hookType: 0.03,
  assetType: 0.06,
  family: 0.03,
  objective: 0.05,
  audience: 0.04,
  visualStyle: 0.04,
  ctaType: 0.02,
  calendarAnchorIds: 0.02,
} as const;

export const SOCIAL_PLANNER_SIMILARITY_BONUSES = {
  topicAngleArchetype: 0.1,
  topicAngleHook: 0.1,
  typeArchetypeTopicAudience: 0.08,
  visualFormatTopic: 0.06,
  personaTopicTreatment: 0.05,
  calendarAnchorTreatment: 0.04,
} as const;

export const SOCIAL_PLANNER_GUIDED_TOPIC_WEIGHT_FACTOR = 0.25;

export const SOCIAL_PLANNER_HOOK_RULES = {
  minTokens: 4,
  minChars: 18,
  nearDuplicateJaccard: 0.85,
  prefixTokens: 5,
  prefixMinHookTokens: 6,
  shortExactFactor: 0.25,
} as const;

export const SOCIAL_PLANNER_WEEK_SIMILARITY_WEIGHTS = {
  assetType: 0.28,
  family: 0.12,
  objective: 0.22,
  archetype: 0.22,
  topic: 0.1,
  audience: 0.04,
  persona: 0.02,
} as const;

export const SOCIAL_PLANNER_DIVERSITY_THRESHOLDS = {
  assetReject: 0.72,
  weekReject: 0.82,
  clusteredScore: 0.55,
  clusteredCount: 3,
  assetWarn: 0.45,
  weekWarn: 0.6,
  hardRecentMinWeight: 0.7,
  majorFingerprintMinWeight: 0.3,
} as const;

export type SocialPlannerMatchedDimension = keyof typeof SOCIAL_PLANNER_SIMILARITY_WEIGHTS;

export type SocialPlannerAssetSimilarityBreakdown = {
  score: number;
  recencyWeightedScore: number;
  matchedDimensions: SocialPlannerMatchedDimension[];
  dimensionScores: Partial<Record<SocialPlannerMatchedDimension, number>>;
};

export function socialPlannerRecencyWeight(rank: number): number {
  const raw =
    SOCIAL_PLANNER_RECENCY.newestWeight - rank * SOCIAL_PLANNER_RECENCY.step;
  return Math.max(SOCIAL_PLANNER_RECENCY.floor, Number(raw.toFixed(1)));
}

export function tokenizeComparableText(value: string): string[] {
  return normalizeComparableText(value)
    .split(" ")
    .filter(Boolean)
    .slice(0, SOCIAL_PLANNER_SOCIAL_MEMORY_BOUNDS.maxTokensPerField);
}

export function jaccardTokenOverlap(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) intersection += 1;
  }
  const union = leftSet.size + rightSet.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function textSimilarity(left: string, right: string): number {
  const a = normalizeComparableText(left);
  const b = normalizeComparableText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  return jaccardTokenOverlap(tokenizeComparableText(a), tokenizeComparableText(b));
}

export function isShortHook(hook: string | null): boolean {
  if (!hook) return true;
  const tokens = tokenizeComparableText(hook);
  const chars = normalizeComparableText(hook).length;
  return (
    tokens.length < SOCIAL_PLANNER_HOOK_RULES.minTokens &&
    chars < SOCIAL_PLANNER_HOOK_RULES.minChars
  );
}

export function hookSimilarity(
  left: string | null,
  right: string | null,
): number {
  if (!left || !right) return 0;
  const a = normalizeComparableText(left);
  const b = normalizeComparableText(right);
  if (!a || !b) return 0;
  if (a === b) {
    return isShortHook(a) ? SOCIAL_PLANNER_HOOK_RULES.shortExactFactor : 1;
  }
  if (isShortHook(a) || isShortHook(b)) return 0;

  const leftTokens = tokenizeComparableText(a);
  const rightTokens = tokenizeComparableText(b);
  const jaccard = jaccardTokenOverlap(leftTokens, rightTokens);
  const prefixLen = commonPrefixLength(leftTokens, rightTokens);
  if (
    prefixLen >= SOCIAL_PLANNER_HOOK_RULES.prefixTokens &&
    leftTokens.length >= SOCIAL_PLANNER_HOOK_RULES.prefixMinHookTokens &&
    rightTokens.length >= SOCIAL_PLANNER_HOOK_RULES.prefixMinHookTokens
  ) {
    return Math.max(jaccard, 0.85);
  }
  return jaccard;
}

function commonPrefixLength(left: string[], right: string[]): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

function sharedIdOverlap(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0) return false;
  const rightSet = new Set(right);
  return left.some((id) => rightSet.has(id));
}

export function isTopicRelaxedByUserGuidance(
  topic: string,
  userGuidance: string | null,
): boolean {
  if (!userGuidance) return false;
  const guidance = normalizeComparableText(userGuidance);
  const normalizedTopic = normalizeComparableText(topic);
  if (!guidance || !normalizedTopic) return false;
  if (guidance.includes(normalizedTopic)) return true;
  const topicTokens = tokenizeComparableText(normalizedTopic).filter(
    (token) => token.length >= 3,
  );
  if (topicTokens.length === 0) return false;
  const guidanceTokens = new Set(tokenizeComparableText(guidance));
  return topicTokens.every((token) => guidanceTokens.has(token));
}

export function scoreAssetSimilarity(input: {
  candidate: SocialPlannerAssetFingerprint;
  historical: SocialPlannerAssetFingerprint;
  recencyWeight: number;
  userGuidance?: string | null;
}): SocialPlannerAssetSimilarityBreakdown {
  const { candidate, historical } = input;
  const dimensionScores: Partial<Record<SocialPlannerMatchedDimension, number>> =
    {};
  const matchedDimensions: SocialPlannerMatchedDimension[] = [];

  const topicRelaxed = isTopicRelaxedByUserGuidance(
    candidate.topic,
    input.userGuidance ?? null,
  );
  const topicRaw = textSimilarity(candidate.topic, historical.topic);
  const topicScore =
    topicRaw * (topicRelaxed ? SOCIAL_PLANNER_GUIDED_TOPIC_WEIGHT_FACTOR : 1);
  const angleScore = textSimilarity(candidate.angle, historical.angle);
  const hookScore = hookSimilarity(
    candidate.hookNormalized,
    historical.hookNormalized,
  );
  const audienceScore = textSimilarity(candidate.audience, historical.audience);
  const visualScore = textSimilarity(
    candidate.visualStyle,
    historical.visualStyle,
  );

  const exact = {
    contentArchetype: candidate.contentArchetype === historical.contentArchetype,
    hookType: candidate.hookType === historical.hookType,
    assetType: candidate.assetType === historical.assetType,
    family: candidate.family === historical.family,
    objective: candidate.objective === historical.objective,
    ctaType:
      candidate.ctaType === historical.ctaType && candidate.ctaType !== "none",
    calendarAnchor: sharedIdOverlap(
      candidate.calendarAnchorIds,
      historical.calendarAnchorIds,
    ),
    persona: sharedIdOverlap(candidate.personaIds, historical.personaIds),
  };

  const visualContributes = visualScore > 0 && (topicRaw >= 0.7 || exact.assetType);
  const calendarContributes =
    exact.calendarAnchor &&
    (topicRaw >= 0.7 || angleScore >= 0.7 || exact.assetType || exact.contentArchetype);

  const weighted = {
    topic: topicScore * SOCIAL_PLANNER_SIMILARITY_WEIGHTS.topic,
    angle: angleScore * SOCIAL_PLANNER_SIMILARITY_WEIGHTS.angle,
    hookNormalized: hookScore * SOCIAL_PLANNER_SIMILARITY_WEIGHTS.hookNormalized,
    contentArchetype: exact.contentArchetype
      ? SOCIAL_PLANNER_SIMILARITY_WEIGHTS.contentArchetype
      : 0,
    hookType: exact.hookType ? SOCIAL_PLANNER_SIMILARITY_WEIGHTS.hookType : 0,
    assetType: exact.assetType ? SOCIAL_PLANNER_SIMILARITY_WEIGHTS.assetType : 0,
    family: exact.family ? SOCIAL_PLANNER_SIMILARITY_WEIGHTS.family : 0,
    objective: exact.objective ? SOCIAL_PLANNER_SIMILARITY_WEIGHTS.objective : 0,
    audience: audienceScore * SOCIAL_PLANNER_SIMILARITY_WEIGHTS.audience,
    visualStyle: visualContributes
      ? visualScore * SOCIAL_PLANNER_SIMILARITY_WEIGHTS.visualStyle
      : 0,
    ctaType: exact.ctaType ? SOCIAL_PLANNER_SIMILARITY_WEIGHTS.ctaType : 0,
    calendarAnchorIds: calendarContributes
      ? SOCIAL_PLANNER_SIMILARITY_WEIGHTS.calendarAnchorIds
      : 0,
  };

  const material: Record<SocialPlannerMatchedDimension, boolean> = {
    topic: topicRaw >= 0.7,
    angle: angleScore >= 0.7,
    hookNormalized: hookScore >= 0.7,
    contentArchetype: exact.contentArchetype,
    hookType: exact.hookType,
    assetType: exact.assetType,
    family: exact.family,
    objective: exact.objective,
    audience: audienceScore >= 0.7,
    visualStyle: visualContributes && visualScore >= 0.7,
    ctaType: exact.ctaType,
    calendarAnchorIds: calendarContributes,
  };

  let score = 0;
  for (const [key, value] of Object.entries(weighted) as Array<
    [SocialPlannerMatchedDimension, number]
  >) {
    dimensionScores[key] = value;
    score += value;
    if (material[key]) matchedDimensions.push(key);
  }

  if (topicRaw >= 0.99 && angleScore >= 0.99 && exact.contentArchetype) {
    score += SOCIAL_PLANNER_SIMILARITY_BONUSES.topicAngleArchetype;
  }
  if (topicRaw >= 0.99 && angleScore >= 0.99 && hookScore >= 0.8) {
    score += SOCIAL_PLANNER_SIMILARITY_BONUSES.topicAngleHook;
  }
  if (
    exact.assetType &&
    exact.contentArchetype &&
    topicRaw >= 0.99 &&
    audienceScore >= 0.99
  ) {
    score += SOCIAL_PLANNER_SIMILARITY_BONUSES.typeArchetypeTopicAudience;
  }
  if (visualContributes && exact.assetType && topicRaw >= 0.99) {
    score += SOCIAL_PLANNER_SIMILARITY_BONUSES.visualFormatTopic;
  }
  if (
    exact.persona &&
    topicRaw >= 0.99 &&
    (angleScore >= 0.99 || exact.contentArchetype)
  ) {
    score += SOCIAL_PLANNER_SIMILARITY_BONUSES.personaTopicTreatment;
  }
  if (exact.calendarAnchor && topicRaw >= 0.99 && angleScore >= 0.99) {
    score += SOCIAL_PLANNER_SIMILARITY_BONUSES.calendarAnchorTreatment;
  }

  const bounded = Math.min(1, Number(score.toFixed(4)));
  return {
    score: bounded,
    recencyWeightedScore: Number((bounded * input.recencyWeight).toFixed(4)),
    matchedDimensions,
    dimensionScores,
  };
}

export function countValues(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    if (!value) continue;
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

export function distributionOverlap(
  left: Record<string, number>,
  right: Record<string, number>,
): number {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const leftTotal = Object.values(left).reduce((sum, value) => sum + value, 0);
  const rightTotal = Object.values(right).reduce((sum, value) => sum + value, 0);
  if (leftTotal === 0 && rightTotal === 0) return 0;
  if (leftTotal === 0 || rightTotal === 0) return 0;
  let l1 = 0;
  for (const key of keys) {
    l1 += Math.abs((left[key] ?? 0) / leftTotal - (right[key] ?? 0) / rightTotal);
  }
  return Number((1 - l1 / 2).toFixed(4));
}

export function setJaccard(left: string[], right: string[]): number {
  const leftSet = new Set(left.filter(Boolean));
  const rightSet = new Set(right.filter(Boolean));
  if (leftSet.size === 0 || rightSet.size === 0) return 0;
  let intersection = 0;
  for (const value of leftSet) {
    if (rightSet.has(value)) intersection += 1;
  }
  return intersection / (leftSet.size + rightSet.size - intersection);
}

export function scoreWeekSimilarity(
  candidate: SocialPlannerHistoricalWeek | WeekPortfolio,
  historical: SocialPlannerHistoricalWeek | WeekPortfolio,
): number {
  const score =
    SOCIAL_PLANNER_WEEK_SIMILARITY_WEIGHTS.assetType *
      distributionOverlap(candidate.assetTypeCounts, historical.assetTypeCounts) +
    SOCIAL_PLANNER_WEEK_SIMILARITY_WEIGHTS.family *
      distributionOverlap(candidate.familyCounts, historical.familyCounts) +
    SOCIAL_PLANNER_WEEK_SIMILARITY_WEIGHTS.objective *
      distributionOverlap(candidate.objectiveCounts, historical.objectiveCounts) +
    SOCIAL_PLANNER_WEEK_SIMILARITY_WEIGHTS.archetype *
      distributionOverlap(candidate.archetypeCounts, historical.archetypeCounts) +
    SOCIAL_PLANNER_WEEK_SIMILARITY_WEIGHTS.topic *
      setJaccard(candidate.weekFingerprint.topics, historical.weekFingerprint.topics) +
    SOCIAL_PLANNER_WEEK_SIMILARITY_WEIGHTS.audience *
      setJaccard(
        Object.keys(candidate.audienceCounts),
        Object.keys(historical.audienceCounts),
      ) +
    SOCIAL_PLANNER_WEEK_SIMILARITY_WEIGHTS.persona *
      setJaccard(
        candidate.weekFingerprint.personaIds,
        historical.weekFingerprint.personaIds,
      );
  return Number(Math.min(1, score).toFixed(4));
}

export type WeekPortfolio = {
  weekFingerprint: SocialPlannerWeekFingerprint;
  assetTypeCounts: Record<string, number>;
  familyCounts: Record<string, number>;
  objectiveCounts: Record<string, number>;
  archetypeCounts: Record<string, number>;
  audienceCounts: Record<string, number>;
};

export function weekPortfolioFromAssets(
  assets: Array<{ creativeFingerprint: SocialPlannerAssetFingerprint }>,
  weekFingerprint: SocialPlannerWeekFingerprint,
): WeekPortfolio {
  return {
    weekFingerprint,
    assetTypeCounts: countValues(
      assets.map((asset) => asset.creativeFingerprint.assetType),
    ),
    familyCounts: countValues(
      assets.map((asset) => asset.creativeFingerprint.family),
    ),
    objectiveCounts: countValues(
      assets.map((asset) => asset.creativeFingerprint.objective),
    ),
    archetypeCounts: countValues(
      assets.map((asset) => asset.creativeFingerprint.contentArchetype),
    ),
    audienceCounts: countValues(
      assets.map((asset) => asset.creativeFingerprint.audience),
    ),
  };
}

export function majorFingerprintKey(
  fingerprint: SocialPlannerAssetFingerprint,
): string {
  return [
    fingerprint.assetType,
    fingerprint.family,
    fingerprint.contentArchetype,
    fingerprint.topic,
    fingerprint.angle,
    fingerprint.hookNormalized ?? "",
    fingerprint.objective,
    fingerprint.audience,
  ].join("|");
}

export function topicAngleKey(fingerprint: SocialPlannerAssetFingerprint): string {
  return `${fingerprint.topic}|${fingerprint.angle}`;
}

export function typeArchetypeTopicAudienceKey(
  fingerprint: SocialPlannerAssetFingerprint,
): string {
  return [
    fingerprint.assetType,
    fingerprint.contentArchetype,
    fingerprint.topic,
    fingerprint.audience,
  ].join("|");
}

export function findBestHistoricalAssetMatch(input: {
  candidate: SocialPlannerAssetFingerprint;
  historicalAssets: SocialPlannerHistoricalAsset[];
  userGuidance?: string | null;
}): {
  historical: SocialPlannerHistoricalAsset;
  breakdown: SocialPlannerAssetSimilarityBreakdown;
} | null {
  let best: {
    historical: SocialPlannerHistoricalAsset;
    breakdown: SocialPlannerAssetSimilarityBreakdown;
  } | null = null;
  for (const historical of input.historicalAssets) {
    const breakdown = scoreAssetSimilarity({
      candidate: input.candidate,
      historical: historical.creativeFingerprint,
      recencyWeight: historical.recencyWeight,
      userGuidance: input.userGuidance,
    });
    if (
      !best ||
      breakdown.recencyWeightedScore > best.breakdown.recencyWeightedScore
    ) {
      best = { historical, breakdown };
    }
  }
  return best;
}
