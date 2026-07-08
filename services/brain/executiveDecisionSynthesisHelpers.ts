import type { MarketingDeliverableRecommendation } from "@/services/brain/executiveCoherence/executiveCoherenceTypes";
import type {
  BuyerPsychologyAssessment,
  ContentGenerationObjectives,
  ExecutiveCognitionLayers,
  ExecutiveDecision,
  ExecutiveDecisionDocument,
  ExecutiveDecisionSynthesis,
  ExecutiveIntelligencePipeline,
  ExecutiveMemoryComparison,
  HiddenProblemAssessment,
  MarketPatternClassification,
  MarketUnderstandingAssessment,
  OpportunityQualityDimensions,
  PriorityAssessment,
  RecommendedDirection,
  StrategicDifferentiationAssessment,
} from "@/services/brain/executiveReasoningTypes";
import type { ExecutiveReasoningSourceContext } from "@/services/brain/executiveReasoningTypes";
import type {
  DecisionTrace,
  EvaluatedStrategicPossibility,
  StrategicEvaluationScores,
  StrategicPossibilityCandidate,
} from "@/services/brain/executiveReasoningTypes";

export const EXECUTIVE_DECISION_SYNTHESIS_VERSION = "executive_decision_synthesis_v1";

const ALL_DELIVERABLES: MarketingDeliverableRecommendation[] = [
  "Educational Guide",
  "Decision Framework",
  "Comparison Resource",
  "Diagnostic Checklist",
  "Authority Whitepaper",
  "Executive Webinar",
  "Educational Video",
  "Trust-Building Landing Page",
  "Multi-step Email Journey",
  "Lead Magnet",
  "FAQ Resource",
  "Case Study Collection",
  "Community Campaign",
  "Interactive Assessment",
  "Downloadable Toolkit",
  "Educational Workshop",
];

const GENERIC_DELIVERABLES: MarketingDeliverableRecommendation[] = [
  "Executive Webinar",
  "Educational Guide",
  "Community Campaign",
  "Lead Magnet",
];

const PROMOTIONAL_DELIVERABLES: MarketingDeliverableRecommendation[] = [
  "Executive Webinar",
  "Trust-Building Landing Page",
  "Lead Magnet",
  "Case Study Collection",
];

const ELIMINATION_THRESHOLD = 38;
const DIVERSITY_SCORE_GAP = 10;

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function hashPick<T>(seed: string, options: T[]): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return options[hash % options.length] ?? options[0];
}

function normalizeStage(buyerStage: string | null | undefined): string {
  const stage = (buyerStage ?? "aware").toLowerCase();
  if (stage.includes("unaware")) return "unaware";
  if (stage.includes("high_intent") || stage.includes("high intent")) return "high_intent";
  if (stage.includes("decision")) return "decision";
  if (stage.includes("consideration")) return "consideration";
  if (stage.includes("aware")) return "aware";
  return "aware";
}

function collectRecentDeliverableUsage(
  context: ExecutiveReasoningSourceContext,
): MarketingDeliverableRecommendation[] {
  const recent: MarketingDeliverableRecommendation[] = [];
  const deployment = context.executiveMemory.patternKnowledge.mostCommonDeploymentType;
  const recommendation =
    context.executiveMemory.patternKnowledge.mostCommonRecommendation;

  const deploymentMap: Record<string, MarketingDeliverableRecommendation> = {
    pdf_guide: "Educational Guide",
    webinar: "Executive Webinar",
    carousel: "Community Campaign",
    checklist: "Diagnostic Checklist",
    framework: "Decision Framework",
    lead_magnet: "Lead Magnet",
    email_sequence: "Multi-step Email Journey",
    landing_page: "Trust-Building Landing Page",
    video_script: "Educational Video",
  };

  if (deployment && deploymentMap[deployment]) {
    recent.push(deploymentMap[deployment]);
  }
  if (recommendation && ALL_DELIVERABLES.includes(recommendation as MarketingDeliverableRecommendation)) {
    recent.push(recommendation as MarketingDeliverableRecommendation);
  }

  for (const asset of context.knowledgeMemory.assets.slice(0, 5)) {
    const assetType = asset.assetType?.toLowerCase() ?? "";
    if (assetType.includes("webinar")) recent.push("Executive Webinar");
    if (assetType.includes("guide")) recent.push("Educational Guide");
    if (assetType.includes("carousel")) recent.push("Community Campaign");
  }

  return [...new Set(recent)];
}

function deliverablesForDirection(
  direction: RecommendedDirection["primary"],
): MarketingDeliverableRecommendation[] {
  switch (direction) {
    case "educational":
      return [
        "Educational Guide",
        "FAQ Resource",
        "Decision Framework",
        "Diagnostic Checklist",
        "Interactive Assessment",
      ];
    case "consultative":
      return [
        "Decision Framework",
        "Comparison Resource",
        "Diagnostic Checklist",
        "Case Study Collection",
        "Interactive Assessment",
      ];
    case "sales_first":
      return [
        "Case Study Collection",
        "Authority Whitepaper",
        "Trust-Building Landing Page",
        "Downloadable Toolkit",
      ];
    case "relationship_first":
      return [
        "Multi-step Email Journey",
        "Trust-Building Landing Page",
        "Community Campaign",
        "Educational Workshop",
      ];
    case "monitor":
      return ["FAQ Resource", "Diagnostic Checklist", "Educational Video", "Lead Magnet"];
    case "escalate":
      return [
        "Educational Workshop",
        "Case Study Collection",
        "Authority Whitepaper",
        "Executive Webinar",
      ];
    default:
      return ["Decision Framework", "Diagnostic Checklist"];
  }
}

function deliverablesForPattern(
  pattern: MarketPatternClassification["primaryPattern"],
): MarketingDeliverableRecommendation[] {
  switch (pattern) {
    case "misconception":
      return ["FAQ Resource", "Comparison Resource", "Educational Video"];
    case "curriculum_opportunity":
      return ["Decision Framework", "Educational Workshop", "Educational Guide"];
    case "reputation_opportunity":
      return ["Case Study Collection", "Authority Whitepaper", "FAQ Resource"];
    case "competitive_weakness":
      return ["Comparison Resource", "Case Study Collection", "Decision Framework"];
    case "positioning_opportunity":
      return ["Authority Whitepaper", "Educational Video", "Community Campaign"];
    case "product_opportunity":
      return ["Trust-Building Landing Page", "Lead Magnet", "Interactive Assessment"];
    case "recurring_market_trend":
      return ["Decision Framework", "Authority Whitepaper", "Multi-step Email Journey"];
    case "emerging_opportunity":
      return ["Diagnostic Checklist", "Interactive Assessment", "Decision Framework"];
    default:
      return ["FAQ Resource", "Educational Guide"];
  }
}

function deliverablesForPlatform(platform: string | null): MarketingDeliverableRecommendation[] {
  switch (platform) {
    case "reddit":
      return [
        "Decision Framework",
        "Diagnostic Checklist",
        "Comparison Resource",
        "FAQ Resource",
      ];
    case "facebook":
      return ["Community Campaign", "Educational Video", "FAQ Resource"];
    case "linkedin":
      return ["Authority Whitepaper", "Case Study Collection", "Decision Framework"];
    case "instagram":
      return ["Community Campaign", "Educational Video", "Diagnostic Checklist"];
    default:
      return ["Decision Framework", "Educational Guide"];
  }
}

export function generateStrategicPossibilities(input: {
  context: ExecutiveReasoningSourceContext;
  direction: RecommendedDirection;
  marketUnderstanding: MarketUnderstandingAssessment;
  buyerPsychology: BuyerPsychologyAssessment;
  differentiation: StrategicDifferentiationAssessment;
  cognition: ExecutiveCognitionLayers;
  preliminaryAsset: MarketingDeliverableRecommendation;
  alternatives: MarketingDeliverableRecommendation[];
}): StrategicPossibilityCandidate[] {
  const pattern = input.cognition.marketPatternClassification;
  const platform = input.marketUnderstanding.platform;
  const stage = normalizeStage(
    input.context.discussionMemory.focus?.latestAnalysis?.buyer_stage ?? null,
  );

  const pool = uniqueStrings([
    input.preliminaryAsset,
    ...input.alternatives,
    ...deliverablesForDirection(input.direction.primary),
    ...deliverablesForPattern(pattern.primaryPattern),
    ...deliverablesForPlatform(platform),
    ...(stage.includes("decision") || stage.includes("high_intent")
      ? (["Case Study Collection", "Trust-Building Landing Page"] as const)
      : []),
    ...(stage.includes("unaware") || stage.includes("aware")
      ? (["Educational Guide", "FAQ Resource", "Community Campaign"] as const)
      : []),
    ...(pattern.primaryPattern === "curriculum_opportunity"
      ? (["Educational Workshop", "Decision Framework"] as const)
      : []),
  ]) as MarketingDeliverableRecommendation[];

  const seed = [
    input.context.organization.id,
    input.context.discussionMemory.focus?.discussion?.id ?? "",
    input.direction.primary,
    pattern.primaryPattern,
    platform ?? "",
  ].join("|");

  const ordered = pool.slice(0, 14);
  if (ordered.length < 8) {
    for (const deliverable of ALL_DELIVERABLES) {
      if (ordered.length >= 10) break;
      if (!ordered.includes(deliverable)) ordered.push(deliverable);
    }
  }

  return ordered.map((deliverable, index) => ({
    id: `${deliverable.replace(/\s+/g, "_").toLowerCase()}_${index}`,
    label: deliverable,
    deliverable,
    strategicDirection: inferStrategicDirection(deliverable, input.direction.primary),
    source: inferCandidateSource(deliverable, input),
  }));
}

function inferStrategicDirection(
  deliverable: MarketingDeliverableRecommendation,
  direction: RecommendedDirection["primary"],
): string {
  if (deliverable.includes("Case Study") || deliverable.includes("Whitepaper")) {
    return "proof_led_authority";
  }
  if (deliverable.includes("Framework") || deliverable.includes("Checklist")) {
    return "decision_support";
  }
  if (deliverable.includes("Community") || deliverable.includes("Video")) {
    return "community_education";
  }
  return `${direction}_aligned`;
}

function inferCandidateSource(
  deliverable: MarketingDeliverableRecommendation,
  input: {
    preliminaryAsset: MarketingDeliverableRecommendation;
    alternatives: MarketingDeliverableRecommendation[];
    marketUnderstanding: MarketUnderstandingAssessment;
    cognition: ExecutiveCognitionLayers;
  },
): StrategicPossibilityCandidate["source"] {
  if (deliverable === input.preliminaryAsset) return "discussion";
  if (input.alternatives.includes(deliverable)) return "psychology";
  if (
    deliverablesForPattern(input.cognition.marketPatternClassification.primaryPattern).includes(
      deliverable,
    )
  ) {
    return "market_pattern";
  }
  if (deliverablesForPlatform(input.marketUnderstanding.platform).includes(deliverable)) {
    return "platform";
  }
  return "direction";
}

function scorePossibility(input: {
  candidate: StrategicPossibilityCandidate;
  context: ExecutiveReasoningSourceContext;
  hiddenProblem: HiddenProblemAssessment;
  buyerPsychology: BuyerPsychologyAssessment;
  differentiation: StrategicDifferentiationAssessment;
  opportunityQuality: OpportunityQualityDimensions;
  priority: PriorityAssessment;
  cognition: ExecutiveCognitionLayers;
  direction: RecommendedDirection;
  marketUnderstanding: MarketUnderstandingAssessment;
}): StrategicEvaluationScores {
  const { candidate, context, opportunityQuality, priority, cognition } = input;
  const deliverable = candidate.deliverable;
  const stage = normalizeStage(
    context.discussionMemory.focus?.latestAnalysis?.buyer_stage ?? null,
  );
  const diffAssessment = input.differentiation;
  const isBrainTrained = context.identityMemory.isBrainTrained;

  let businessImpact = opportunityQuality.businessImpact;
  let trustBuilding = 50;
  let buyerReadiness = 45;
  let educationalValue = 50;
  let differentiationValue = differentiationScore(deliverable, diffAssessment, isBrainTrained);
  let reusePotential = 50;
  let authorityPotential = 45;
  let contentLongevity = 50;
  let deploymentEase = 55;
  let conversionPotential = 45;
  let brandAlignment = isBrainTrained ? 65 : 40;
  let executiveFit = isBrainTrained ? 60 : 35;
  let marketTiming = priority.level === "immediate_action" ? 80 : priority.level === "high_intent" ? 65 : 45;

  if (["Decision Framework", "Diagnostic Checklist", "FAQ Resource"].includes(deliverable)) {
    educationalValue += 20;
    trustBuilding += 15;
  }
  if (["Case Study Collection", "Authority Whitepaper"].includes(deliverable)) {
    authorityPotential += 25;
    conversionPotential += 15;
    businessImpact += 10;
  }
  if (["Executive Webinar", "Lead Magnet", "Trust-Building Landing Page"].includes(deliverable)) {
    conversionPotential += 20;
    if (stage.includes("unaware") || stage.includes("aware")) {
      conversionPotential -= 25;
    }
  }
  if (["Educational Guide", "Decision Framework", "Comparison Resource"].includes(deliverable)) {
    reusePotential += 20;
    contentLongevity += 20;
  }
  if (["Community Campaign", "Educational Video"].includes(deliverable)) {
    deploymentEase += 20;
  }
  if (deliverablesForDirection(input.direction.primary).includes(deliverable)) {
    executiveFit += 15;
  }
  if (deliverablesForPattern(cognition.marketPatternClassification.primaryPattern).includes(deliverable)) {
    marketTiming += 15;
  }
  if (stage.includes("consideration") && deliverable.includes("Comparison")) {
    buyerReadiness += 20;
  }
  if (stage.includes("decision") && deliverable.includes("Case Study")) {
    buyerReadiness += 20;
  }

  const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

  const scores: Omit<StrategicEvaluationScores, "compositeScore"> = {
    businessImpact: clamp(businessImpact),
    trustBuilding: clamp(trustBuilding),
    buyerReadiness: clamp(buyerReadiness),
    educationalValue: clamp(educationalValue),
    differentiation: clamp(differentiationValue),
    reusePotential: clamp(reusePotential),
    authorityPotential: clamp(authorityPotential),
    contentLongevity: clamp(contentLongevity),
    deploymentEase: clamp(deploymentEase),
    conversionPotential: clamp(conversionPotential),
    brandAlignment: clamp(brandAlignment),
    executiveFit: clamp(executiveFit),
    marketTiming: clamp(marketTiming),
  };

  const compositeScore = Math.round(
    scores.businessImpact * 0.14 +
      scores.trustBuilding * 0.08 +
      scores.buyerReadiness * 0.1 +
      scores.educationalValue * 0.08 +
      scores.differentiation * 0.12 +
      scores.reusePotential * 0.08 +
      scores.authorityPotential * 0.08 +
      scores.contentLongevity * 0.06 +
      scores.deploymentEase * 0.04 +
      scores.conversionPotential * 0.08 +
      scores.brandAlignment * 0.06 +
      scores.executiveFit * 0.04 +
      scores.marketTiming * 0.04,
  );

  return { ...scores, compositeScore };
}

function differentiationScore(
  deliverable: MarketingDeliverableRecommendation,
  differentiation: StrategicDifferentiationAssessment,
  isBrainTrained: boolean,
): number {
  let score =
    differentiation.uniquePositioning.length * 10 +
    differentiation.executiveBrainSignals.length * 8 +
    (isBrainTrained ? 20 : 5);

  if (GENERIC_DELIVERABLES.includes(deliverable)) {
    score -= 20;
  }
  if (["Decision Framework", "Interactive Assessment", "Authority Whitepaper"].includes(deliverable)) {
    score += 10;
  }
  return score;
}

function eliminatePossibility(input: {
  evaluated: EvaluatedStrategicPossibility;
  context: ExecutiveReasoningSourceContext;
  buyerPsychology: BuyerPsychologyAssessment;
  differentiation: StrategicDifferentiationAssessment;
  cognition: ExecutiveCognitionLayers;
  recentUsage: MarketingDeliverableRecommendation[];
}): string | null {
  const { evaluated, recentUsage, buyerPsychology, differentiation, cognition } = input;
  const { candidate, scores } = evaluated;
  const stage = normalizeStage(
    input.context.discussionMemory.focus?.latestAnalysis?.buyer_stage ?? null,
  );

  if (scores.compositeScore < ELIMINATION_THRESHOLD) {
    return "Low leverage — composite score below executive threshold.";
  }

  if (
    GENERIC_DELIVERABLES.includes(candidate.deliverable) &&
    scores.differentiation < 45 &&
    !differentiation.executiveBrainSignals.length
  ) {
    return "Generic asset without sufficient Executive Brain differentiation.";
  }

  if (
    recentUsage.includes(candidate.deliverable) &&
    scores.compositeScore < 58 &&
    scores.differentiation < 55
  ) {
    return "Recently overused without sufficient advantage to repeat.";
  }

  if (
    PROMOTIONAL_DELIVERABLES.includes(candidate.deliverable) &&
    (stage.includes("unaware") || stage.includes("aware"))
  ) {
    return "Too promotional for current buyer psychology and readiness.";
  }

  if (
    candidate.deliverable === "Executive Webinar" &&
    cognition.marketPatternClassification.primaryPattern === "isolated_question"
  ) {
    return "Poor fit — isolated question does not justify webinar-scale commitment.";
  }

  if (
    scores.educationalValue < 35 &&
    !["Case Study Collection", "Trust-Building Landing Page"].includes(candidate.deliverable)
  ) {
    return "Weak educational value for current market pattern.";
  }

  if (
    scores.brandAlignment < 30 &&
    input.context.identityMemory.isBrainTrained
  ) {
    return "Poor brand alignment with trained Executive Brain.";
  }

  const domainRelevance = cognition.executiveMemoryComparison.recurringObjections.length;
  if (
    candidate.deliverable === "Community Campaign" &&
    domainRelevance === 0 &&
    scores.businessImpact < 50
  ) {
    return "Low leverage community campaign without domain signal support.";
  }

  return null;
}

function applyDiversitySelection(input: {
  ranked: EvaluatedStrategicPossibility[];
  recentUsage: MarketingDeliverableRecommendation[];
  seed: string;
}): { selected: EvaluatedStrategicPossibility; diversityApplied: boolean } {
  if (input.ranked.length === 0) {
    throw new Error("No ranked strategic possibilities available for decision synthesis.");
  }

  const [first, second] = input.ranked;
  const firstOverused = input.recentUsage.includes(first.candidate.deliverable);
  const closeSecond =
    second &&
    first.scores.compositeScore - second.scores.compositeScore <= DIVERSITY_SCORE_GAP;

  if (firstOverused && closeSecond && !input.recentUsage.includes(second.candidate.deliverable)) {
    return { selected: second, diversityApplied: true };
  }

  if (firstOverused && input.ranked.length > 2) {
    const alternative = input.ranked.find(
      (entry, index) =>
        index > 0 &&
        !input.recentUsage.includes(entry.candidate.deliverable) &&
        first.scores.compositeScore - entry.scores.compositeScore <= DIVERSITY_SCORE_GAP + 5,
    );
    if (alternative) {
      return { selected: alternative, diversityApplied: true };
    }
  }

  return { selected: first, diversityApplied: false };
}

function buildExecutiveDecisionFromSelection(input: {
  selected: EvaluatedStrategicPossibility;
  eliminated: EvaluatedStrategicPossibility[];
  ranked: EvaluatedStrategicPossibility[];
  pipeline: Pick<
    ExecutiveIntelligencePipeline,
    | "hiddenProblem"
    | "buyerPsychology"
    | "strategicDifferentiation"
    | "contrarianThinking"
    | "suggestedOpportunityTitle"
    | "executiveCognition"
  >;
  priority: PriorityAssessment;
  diversityApplied: boolean;
}): ExecutiveDecision {
  const cognition = input.pipeline.executiveCognition;
  const deliverable = input.selected.candidate.deliverable;
  const topAlternatives = input.ranked
    .filter((entry) => entry.candidate.id !== input.selected.candidate.id)
    .slice(0, 3);

  const whyNotAlternatives = topAlternatives.map(
    (alt) =>
      `${alt.candidate.deliverable}: eliminated or outranked (score ${alt.scores.compositeScore} vs ${input.selected.scores.compositeScore}) — ${alt.eliminationReason ?? "lower executive leverage"}`,
  );

  for (const rejected of input.eliminated.slice(0, 3)) {
    if (rejected.eliminationReason) {
      whyNotAlternatives.push(
        `${rejected.candidate.deliverable}: rejected — ${rejected.eliminationReason}`,
      );
    }
  }

  const generationObjectives = cognition.generationObjectives;
  const decisionDocument: ExecutiveDecisionDocument = {
    hiddenMarketProblem: input.pipeline.hiddenProblem.hiddenMarketProblem,
    strategicInsight: input.pipeline.contrarianThinking.assumptionChallenge,
    businessOpportunity: input.pipeline.suggestedOpportunityTitle,
    competitiveAdvantage:
      input.pipeline.strategicDifferentiation.competitiveAdvantage.join("; ") ||
      input.pipeline.strategicDifferentiation.differentiationStatement,
    buyerPsychologySummary: [
      input.pipeline.buyerPsychology.coreFear,
      input.pipeline.buyerPsychology.desiredTransformation,
      input.pipeline.buyerPsychology.emotionalBlocker,
    ]
      .filter(Boolean)
      .join(" | "),
    businessObjective: generationObjectives.businessObjective,
    recommendedAssetType: deliverable,
    assetSelectionReason: `Selected after evaluating ${input.ranked.length + input.eliminated.length} strategic possibilities. Highest-leverage decision (score ${input.selected.scores.compositeScore}).${input.diversityApplied ? " Diversity safeguard applied." : ""}`,
    positioningStrategy: generationObjectives.positioningObjective,
    successMetric:
      input.pipeline.buyerPsychology.primarySuccessMetric ??
      cognition.executiveDecisionDocument.successMetric,
    marketPattern: cognition.marketPatternClassification.analystSummary,
    generationObjectives,
    reusability: cognition.reusabilityAssessment,
  };

  return {
    chosenStrategy: deliverable,
    chosenStrategyLabel: deliverable,
    whyThisStrategy: `Highest-leverage strategic decision after multi-candidate synthesis. ${decisionDocument.assetSelectionReason}`,
    whyNotAlternatives: whyNotAlternatives.slice(0, 5),
    whyNow: input.priority.rationale[0] ?? cognition.executiveDecisionDocument.businessObjective,
    expectedBusinessOutcome: generationObjectives.businessObjective,
    expectedCustomerOutcome:
      input.pipeline.buyerPsychology.desiredTransformation ??
      generationObjectives.psychologicalObjective,
    expectedAuthorityOutcome:
      input.selected.scores.authorityPotential >= 60
        ? "Strengthen market authority and executive positioning."
        : "Maintain credible educational presence without over-promoting.",
    expectedReuse: cognition.reusabilityAssessment.longTermLeverage,
    primarySuccessMetric:
      input.pipeline.buyerPsychology.primarySuccessMetric ??
      decisionDocument.successMetric,
    secondarySuccessMetric:
      input.pipeline.buyerPsychology.decisionTrigger ??
      generationObjectives.callToActionObjective,
    strategicConfidence: input.selected.scores.compositeScore,
    deploymentApproach: inferDeploymentApproach(deliverable),
    generationObjectives,
    decisionDocument,
  };
}

function inferDeploymentApproach(deliverable: MarketingDeliverableRecommendation): string {
  if (deliverable.includes("Community") || deliverable.includes("Video")) {
    return "Community-first deployment with social amplification and follow-up nurture.";
  }
  if (deliverable.includes("Email") || deliverable.includes("Landing")) {
    return "Direct nurture deployment with email sequence and conversion landing path.";
  }
  if (deliverable.includes("Webinar") || deliverable.includes("Workshop")) {
    return "Live engagement deployment with registration funnel and post-event follow-up.";
  }
  return "Educational deployment with community reply, private follow-up, and reusable asset library entry.";
}

function buildDecisionTrace(input: {
  context: ExecutiveReasoningSourceContext;
  selected: ExecutiveDecision;
  eliminated: EvaluatedStrategicPossibility[];
  diversityApplied: boolean;
  candidateCount: number;
}): DecisionTrace {
  return {
    organizationId: input.context.organization.id,
    timestamp: new Date().toISOString(),
    chosenStrategy: input.selected.chosenStrategy,
    rejectedStrategies: input.eliminated.map((entry) => ({
      strategy: entry.candidate.deliverable,
      reason: entry.eliminationReason ?? "Outranked by higher-leverage alternative.",
    })),
    decisionConfidence: input.selected.strategicConfidence,
    businessObjective: input.selected.expectedBusinessOutcome,
    expectedOutcome: input.selected.expectedCustomerOutcome,
    diversityApplied: input.diversityApplied,
    candidateCount: input.candidateCount,
    eliminatedCount: input.eliminated.length,
  };
}

export function buildExecutiveDecisionSynthesis(input: {
  context: ExecutiveReasoningSourceContext;
  direction: RecommendedDirection;
  priority: PriorityAssessment;
  pipeline: Omit<ExecutiveIntelligencePipeline, "executiveDecisionSynthesis">;
}): ExecutiveDecisionSynthesis {
  const { pipeline, context, direction, priority } = input;
  const recentUsage = collectRecentDeliverableUsage(context);
  const seed = [
    context.organization.id,
    context.discussionMemory.focus?.discussion?.id ?? "",
    pipeline.executiveCognition.marketPatternClassification.primaryPattern,
  ].join("|");

  const candidates = generateStrategicPossibilities({
    context,
    direction,
    marketUnderstanding: pipeline.marketUnderstanding,
    buyerPsychology: pipeline.buyerPsychology,
    differentiation: pipeline.strategicDifferentiation,
    cognition: pipeline.executiveCognition,
    preliminaryAsset: pipeline.assetStrategy.selectedAssetType,
    alternatives: pipeline.assetStrategy.alternativeAssetsConsidered as MarketingDeliverableRecommendation[],
  });

  const evaluated: EvaluatedStrategicPossibility[] = candidates.map((candidate) => {
    const scores = scorePossibility({
      candidate,
      context,
      hiddenProblem: pipeline.hiddenProblem,
      buyerPsychology: pipeline.buyerPsychology,
      differentiation: pipeline.strategicDifferentiation,
      opportunityQuality: pipeline.opportunityQuality,
      priority,
      cognition: pipeline.executiveCognition,
      direction,
      marketUnderstanding: pipeline.marketUnderstanding,
    });
    return {
      candidate,
      scores,
      status: "ranked" as const,
      eliminationReason: null,
    };
  });

  const eliminated: EvaluatedStrategicPossibility[] = [];
  const surviving: EvaluatedStrategicPossibility[] = [];

  for (const entry of evaluated) {
    const reason = eliminatePossibility({
      evaluated: entry,
      context,
      buyerPsychology: pipeline.buyerPsychology,
      differentiation: pipeline.strategicDifferentiation,
      cognition: pipeline.executiveCognition,
      recentUsage,
    });
    if (reason) {
      eliminated.push({ ...entry, status: "eliminated", eliminationReason: reason });
    } else {
      surviving.push(entry);
    }
  }

  const ranked = [...surviving].sort(
    (a, b) => b.scores.compositeScore - a.scores.compositeScore,
  );

  const fallbackRanked =
    ranked.length > 0
      ? ranked
      : [...evaluated].sort((a, b) => b.scores.compositeScore - a.scores.compositeScore);

  const { selected: selectedEvaluated, diversityApplied } = applyDiversitySelection({
    ranked: fallbackRanked,
    recentUsage,
    seed,
  });

  const selectedDecision = buildExecutiveDecisionFromSelection({
    selected: selectedEvaluated,
    eliminated,
    ranked: fallbackRanked,
    pipeline,
    priority,
    diversityApplied,
  });

  const decisionTrace = buildDecisionTrace({
    context,
    selected: selectedDecision,
    eliminated,
    diversityApplied,
    candidateCount: candidates.length,
  });

  return {
    synthesisVersion: EXECUTIVE_DECISION_SYNTHESIS_VERSION,
    candidatesGenerated: candidates.length,
    possibilities: [...eliminated, ...fallbackRanked],
    eliminated,
    ranked: fallbackRanked,
    selectedDecision,
    decisionTrace,
  };
}

export function formatExecutiveDecisionSynthesisForPrompt(
  synthesis: ExecutiveDecisionSynthesis,
): string {
  const decision = synthesis.selectedDecision;
  return [
    "ATHENA EXECUTIVE DECISION SYNTHESIS (SINGLE SOURCE OF TRUTH — ALL OUTPUTS MUST ALIGN):",
    "",
    "Multiple strategic possibilities were generated, evaluated, and weak options eliminated.",
    `Candidates evaluated: ${synthesis.candidatesGenerated} | Eliminated: ${synthesis.eliminated.length} | Selected confidence: ${decision.strategicConfidence}`,
    "",
    "SELECTED EXECUTIVE DECISION:",
    `- Chosen strategy: ${decision.chosenStrategy}`,
    `- Why this strategy: ${decision.whyThisStrategy}`,
    `- Why now: ${decision.whyNow}`,
    `- Why NOT alternatives: ${decision.whyNotAlternatives.join(" ") || "No viable alternatives surpassed selection criteria."}`,
    `- Expected business outcome: ${decision.expectedBusinessOutcome}`,
    `- Expected customer outcome: ${decision.expectedCustomerOutcome}`,
    `- Expected authority outcome: ${decision.expectedAuthorityOutcome}`,
    `- Expected reuse: ${decision.expectedReuse}`,
    `- Primary success metric: ${decision.primarySuccessMetric}`,
    `- Secondary success metric: ${decision.secondarySuccessMetric}`,
    `- Deployment approach: ${decision.deploymentApproach}`,
    synthesis.decisionTrace.diversityApplied
      ? "- Diversity safeguard: applied to avoid over-repeating recent asset types."
      : "",
    "",
    "REJECTED STRATEGIES (do not independently recommend these):",
    ...synthesis.eliminated.slice(0, 6).map(
      (entry) =>
        `- ${entry.candidate.deliverable}: ${entry.eliminationReason ?? "eliminated"}`,
    ),
    "",
    "INSTRUCTIONS:",
    "Every Opportunity, Briefing, Deployment Asset, and Blueprint must express THIS decision.",
    "Do not independently select a different strategic direction downstream.",
    "Determine objectives from the Executive Decision before generating any copy.",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function buildSampleExecutiveDecisionSynthesis(): ExecutiveDecisionSynthesis {
  return {
    synthesisVersion: EXECUTIVE_DECISION_SYNTHESIS_VERSION,
    candidatesGenerated: 10,
    possibilities: [],
    eliminated: [
      {
        candidate: {
          id: "executive_webinar_0",
          label: "Executive Webinar",
          deliverable: "Executive Webinar",
          strategicDirection: "community_education",
          source: "direction",
        },
        scores: {
          businessImpact: 40,
          trustBuilding: 45,
          buyerReadiness: 35,
          educationalValue: 40,
          differentiation: 30,
          reusePotential: 50,
          authorityPotential: 55,
          contentLongevity: 45,
          deploymentEase: 30,
          conversionPotential: 50,
          brandAlignment: 50,
          executiveFit: 40,
          marketTiming: 40,
          compositeScore: 42,
        },
        status: "eliminated",
        eliminationReason: "Generic asset without sufficient Executive Brain differentiation.",
      },
    ],
    ranked: [],
    selectedDecision: {
      chosenStrategy: "Decision Framework",
      chosenStrategyLabel: "Decision Framework",
      whyThisStrategy: "Highest-leverage strategic decision after multi-candidate synthesis.",
      whyNotAlternatives: ["Executive Webinar: rejected — generic without differentiation."],
      whyNow: "Evaluation signals present.",
      expectedBusinessOutcome: "Advance buyer confidence before conversion.",
      expectedCustomerOutcome: "Confidence in a viable career path.",
      expectedAuthorityOutcome: "Strengthen market authority.",
      expectedReuse: "6-12 month reuse potential.",
      primarySuccessMetric: "Reduced uncertainty.",
      secondarySuccessMetric: "Evidence of graduate business success.",
      strategicConfidence: 72,
      deploymentApproach: "Educational deployment with community reply and follow-up.",
      generationObjectives: {
        businessObjective: "Advance buyer confidence.",
        psychologicalObjective: "Confidence in viable career path.",
        positioningObjective: "Clinical credibility positioning.",
        conversationObjective: "Address curriculum opportunity.",
        callToActionObjective: "Evidence of success.",
      },
      decisionDocument: {
        hiddenMarketProblem: "Students fear competence alone will not create business success.",
        strategicInsight: "Course duration is not the purchase driver.",
        businessOpportunity: "Market pattern opportunity",
        competitiveAdvantage: "Clinical credibility",
        buyerPsychologySummary: "Fear of expensive mistake.",
        businessObjective: "Advance buyer confidence.",
        recommendedAssetType: "Decision Framework",
        assetSelectionReason: "Selected after evaluating 10 possibilities.",
        positioningStrategy: "Clinical credibility.",
        successMetric: "Reduced uncertainty.",
        marketPattern: "curriculum opportunity",
        generationObjectives: {
          businessObjective: "Advance buyer confidence.",
          psychologicalObjective: "Confidence.",
          positioningObjective: "Clinical credibility.",
          conversationObjective: "Curriculum reframe.",
          callToActionObjective: "Evidence of success.",
        },
        reusability: {
          evergreenPotential: "high",
          reuseFormats: ["lead magnet"],
          longTermLeverage: "High reuse.",
          curriculumImprovement: null,
          salesEnablementPotential: null,
        },
      },
    },
    decisionTrace: {
      organizationId: "sample-org",
      timestamp: new Date().toISOString(),
      chosenStrategy: "Decision Framework",
      rejectedStrategies: [
        { strategy: "Executive Webinar", reason: "Generic without differentiation." },
      ],
      decisionConfidence: 72,
      businessObjective: "Advance buyer confidence.",
      expectedOutcome: "Confidence in viable career path.",
      diversityApplied: false,
      candidateCount: 10,
      eliminatedCount: 1,
    },
  };
}
