import type { MarketingDeliverableRecommendation } from "@/services/brain/executiveCoherence/executiveCoherenceTypes";
import { ensureExecutiveRecommendation } from "@/services/brain/executiveCoherence/executiveRecommendationContracts";
import type {
  AssetStrategyAssessment,
  BuyerPsychologyAssessment,
  ContentGenerationObjectives,
  ContrarianThinkingAssessment,
  ExecutiveCognitionLayers,
  ExecutiveDecisionDocument,
  ExecutiveMemoryComparison,
  ExecutiveRecommendation,
  ExecutiveReflection,
  HiddenProblemAssessment,
  MarketPatternClassification,
  MarketPatternKind,
  MarketUnderstandingAssessment,
  ReusabilityAssessment,
  StrategicCriticAssessment,
  StrategicDifferentiationAssessment,
} from "@/services/brain/executiveReasoningTypes";
import type { ExecutiveReasoningSourceContext } from "@/services/brain/executiveReasoningTypes";

export const EXECUTIVE_COGNITION_VERSION = "executive_cognition_v1";

const GENERIC_DELIVERABLES: MarketingDeliverableRecommendation[] = [
  "Executive Webinar",
  "Educational Guide",
  "Community Campaign",
  "Lead Magnet",
];

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

export function buildExecutiveReflection(input: {
  hiddenProblem: HiddenProblemAssessment;
  contrarian: ContrarianThinkingAssessment;
  buyerPsychology: BuyerPsychologyAssessment;
  differentiation: StrategicDifferentiationAssessment;
}): ExecutiveReflection {
  return {
    whatSurprised: input.contrarian.surpriseInsight,
    whatMattersMost: input.hiddenProblem.foundationalInsight,
    realBusinessProblem: input.hiddenProblem.hiddenMarketProblem,
    marketMisunderstanding: input.hiddenProblem.surfaceInterpretation,
    conventionalAssumption: input.contrarian.conventionalAssumption,
    assumptionIsTrue: false,
    indirectConcern: input.buyerPsychology.emotionalBlocker,
    strategistNotice: input.contrarian.assumptionChallenge,
    longTermOpportunity: input.contrarian.overlookedOpportunity,
    reusableAssetOpportunity: input.differentiation.competitiveAdvantage[0] ?? null,
  };
}

export function buildExecutiveMemoryComparison(
  context: ExecutiveReasoningSourceContext,
): ExecutiveMemoryComparison {
  const memory = context.executiveMemory;
  const learning = context.executiveLearning;
  const historicalDataAvailable =
    memory.metadata.discussionCount > 1 ||
    memory.painPointKnowledge.length > 0 ||
    learning.briefingLearning.approved > 0;

  const recurringObjections = uniqueStrings([
    memory.patternKnowledge.mostCommonObjection,
    ...memory.painPointKnowledge.slice(0, 5).map((entry) => entry.painPoint),
    ...context.marketEvidence
      .filter((entry) => entry.category === "objection")
      .slice(0, 3)
      .map((entry) => entry.value),
  ]);

  const recurringMisconceptions = uniqueStrings([
    learning.patternLearning.mostCommonObjection,
    memory.patternKnowledge.mostCommonOpportunityReason,
  ]);

  const repeatedBuyingSignals = uniqueStrings([
    ...memory.buyingSignalKnowledge.slice(0, 5).map((entry) => entry.signal),
    learning.patternLearning.mostApprovedBuyerStage
      ? `buyer_stage:${learning.patternLearning.mostApprovedBuyerStage}`
      : null,
  ]);

  const repeatedEmotionalPatterns = uniqueStrings([
    memory.patternKnowledge.mostCommonBuyerStage
      ? `stage:${memory.patternKnowledge.mostCommonBuyerStage}`
      : null,
    ...memory.painPointKnowledge.slice(0, 3).map((entry) => entry.painPoint),
  ]);

  const repeatedContentOpportunities = uniqueStrings([
    memory.patternKnowledge.mostCommonRecommendation,
    memory.patternKnowledge.mostCommonDeploymentType
      ? `deployment:${memory.patternKnowledge.mostCommonDeploymentType}`
      : null,
    ...memory.contentKnowledge.assetTypeCoverage.slice(0, 3),
  ]);

  const repeatedPositioningOpportunities = uniqueStrings([
    memory.patternKnowledge.highestOpportunityCategory,
    ...memory.competitorKnowledge.slice(0, 2).map((entry) => `vs ${entry.name}`),
  ]);

  return {
    historicalDataAvailable,
    recurringObjections,
    recurringMisconceptions,
    repeatedBuyingSignals,
    repeatedEmotionalPatterns,
    repeatedContentOpportunities,
    repeatedPositioningOpportunities,
    previousSimilarDiscussions: memory.metadata.discussionCount,
    previousApprovedDecisions: learning.briefingLearning.approved,
  };
}

function classifyMarketPattern(input: {
  text: string;
  hiddenProblem: HiddenProblemAssessment;
  memoryComparison: ExecutiveMemoryComparison;
  marketUnderstanding: MarketUnderstandingAssessment;
}): MarketPatternClassification {
  const combined = input.text.toLowerCase();
  const scores: Record<MarketPatternKind, number> = {
    recurring_market_trend: 0,
    isolated_question: 0,
    emerging_opportunity: 0,
    misconception: 0,
    competitive_weakness: 0,
    positioning_opportunity: 0,
    product_opportunity: 0,
    curriculum_opportunity: 0,
    reputation_opportunity: 0,
  };

  if (input.memoryComparison.recurringObjections.length >= 2) {
    scores.recurring_market_trend += 30;
  }
  if (input.memoryComparison.previousSimilarDiscussions >= 3) {
    scores.recurring_market_trend += 20;
  }
  if (input.marketUnderstanding.discussionMaturity === "early") {
    scores.isolated_question += 25;
  }
  if (input.hiddenProblem.confidence >= 70) {
    scores.emerging_opportunity += 25;
  }
  if (/myth|misconception|wrong|not true|actually/.test(combined)) {
    scores.misconception += 30;
  }
  if (/competitor|alternative|other school|vs |compare/.test(combined)) {
    scores.competitive_weakness += 25;
  }
  if (/position|different|unique|stand out|authority/.test(combined)) {
    scores.positioning_opportunity += 25;
  }
  if (/product|offer|service|package/.test(combined)) {
    scores.product_opportunity += 20;
  }
  if (/course|curriculum|training|certification|program/.test(combined)) {
    scores.curriculum_opportunity += 25;
  }
  if (/trust|scam|review|reputation|credibility/.test(combined)) {
    scores.reputation_opportunity += 30;
  }

  const ranked = (Object.entries(scores) as Array<[MarketPatternKind, number]>).sort(
    (a, b) => b[1] - a[1],
  );
  const primaryPattern = ranked[0]?.[1] > 0 ? ranked[0][0] : "emerging_opportunity";
  const secondaryPatterns = ranked
    .slice(1, 3)
    .filter(([, score]) => score >= 15)
    .map(([pattern]) => pattern);

  const analystSummary = `Market analyst classification: ${primaryPattern.replace(/_/g, " ")}${
    secondaryPatterns.length
      ? ` with secondary signals: ${secondaryPatterns.join(", ").replace(/_/g, " ")}`
      : ""
  }.`;

  return { primaryPattern, secondaryPatterns, analystSummary };
}

export function buildMarketPatternClassification(input: {
  context: ExecutiveReasoningSourceContext;
  hiddenProblem: HiddenProblemAssessment;
  memoryComparison: ExecutiveMemoryComparison;
  marketUnderstanding: MarketUnderstandingAssessment;
}): MarketPatternClassification {
  const focus = input.context.discussionMemory.focus?.discussion;
  const analysis = input.context.discussionMemory.focus?.latestAnalysis;
  const text = uniqueStrings([
    focus?.title,
    focus?.summary,
    focus?.ai_notes,
    analysis?.summary,
    analysis?.pain_points,
  ]).join(" ");

  return classifyMarketPattern({
    text,
    hiddenProblem: input.hiddenProblem,
    memoryComparison: input.memoryComparison,
    marketUnderstanding: input.marketUnderstanding,
  });
}

export function buildContentGenerationObjectives(input: {
  hiddenProblem: HiddenProblemAssessment;
  buyerPsychology: BuyerPsychologyAssessment;
  differentiation: StrategicDifferentiationAssessment;
  executiveRecommendation: ExecutiveRecommendation;
  marketPattern: MarketPatternClassification;
}): ContentGenerationObjectives {
  return {
    businessObjective: input.executiveRecommendation.expectedBusinessOutcome,
    psychologicalObjective:
      input.buyerPsychology.desiredTransformation ??
      "Reduce fear and increase decision confidence.",
    positioningObjective:
      input.differentiation.differentiationStatement.slice(0, 200) ||
      "Lead with executive brain differentiation.",
    conversationObjective: `Address ${input.marketPattern.primaryPattern.replace(/_/g, " ")} while reframing beyond surface discussion.`,
    callToActionObjective:
      input.buyerPsychology.decisionTrigger ??
      input.executiveRecommendation.conversionMechanism,
  };
}

export function buildReusabilityAssessment(input: {
  assetStrategy: AssetStrategyAssessment;
  executiveRecommendation: ExecutiveRecommendation;
  marketPattern: MarketPatternClassification;
  memoryComparison: ExecutiveMemoryComparison;
}): ReusabilityAssessment {
  const reuseFormats: string[] = [];
  const asset = input.assetStrategy.selectedAssetType;

  if (
    ["Decision Framework", "Diagnostic Checklist", "FAQ Resource", "Comparison Resource"].includes(
      asset,
    )
  ) {
    reuseFormats.push("evergreen lead magnet", "email nurture asset", "sales enablement resource");
  }
  if (["Case Study Collection", "Authority Whitepaper"].includes(asset)) {
    reuseFormats.push("proof library", "webinar content", "workshop material");
  }
  if (["Educational Workshop", "Executive Webinar"].includes(asset)) {
    reuseFormats.push("recorded webinar", "mini course", "workshop replay");
  }
  if (input.marketPattern.primaryPattern === "curriculum_opportunity") {
    reuseFormats.push("curriculum module", "student onboarding resource");
  }

  const evergreenPotential = input.executiveRecommendation.estimatedReusePotential;

  return {
    evergreenPotential,
    reuseFormats: uniqueStrings(reuseFormats),
    longTermLeverage:
      evergreenPotential === "high"
        ? "Asset can be repurposed across community, email, social, and sales for 6-12 months."
        : evergreenPotential === "medium"
          ? "Asset supports multiple touchpoints with moderate adaptation."
          : "Primarily single-use for this discussion cycle.",
    curriculumImprovement:
      input.marketPattern.primaryPattern === "curriculum_opportunity"
        ? "Insights may inform curriculum positioning or module design."
        : null,
    salesEnablementPotential:
      ["Case Study Collection", "Comparison Resource", "Decision Framework"].includes(asset)
        ? "Strong candidate for sales conversation support and objection handling."
        : null,
  };
}

export function applyStrategicCritic(input: {
  assetStrategy: AssetStrategyAssessment;
  differentiation: StrategicDifferentiationAssessment;
  executiveRecommendation: ExecutiveRecommendation;
  context: ExecutiveReasoningSourceContext;
}): StrategicCriticAssessment {
  const selected = input.assetStrategy.selectedAssetType;
  const critiqueNotes: string[] = [];
  const isGeneric = GENERIC_DELIVERABLES.includes(selected);
  const leveragesExecutiveBrain =
    input.differentiation.executiveBrainSignals.length >= 2 &&
    input.context.identityMemory.isBrainTrained;
  const isDifferentiated =
    input.differentiation.uniquePositioning.length >= 2 &&
    input.differentiation.recommendationsMustReflect.length >= 2;
  const wouldAnotherBusinessReceiveSame =
    isGeneric && !isDifferentiated && !leveragesExecutiveBrain;

  if (isGeneric) {
    critiqueNotes.push(`Initial asset ${selected} risks generic template output.`);
  }
  if (wouldAnotherBusinessReceiveSame) {
    critiqueNotes.push("Recommendation could apply equally to competitors.");
  }
  if (!leveragesExecutiveBrain) {
    critiqueNotes.push("Executive Brain signals should be stronger in asset selection.");
  }

  let finalAssetType = selected;
  let assetRevised = false;
  let revisedRecommendation: string | null = null;

  if (isGeneric || wouldAnotherBusinessReceiveSame) {
    const alternative: MarketingDeliverableRecommendation =
      (input.assetStrategy.alternativeAssetsConsidered.find(
        (candidate) =>
          !GENERIC_DELIVERABLES.includes(
            candidate as MarketingDeliverableRecommendation,
          ),
      ) as MarketingDeliverableRecommendation | undefined) ?? "Decision Framework";

    if (alternative !== selected) {
      finalAssetType = alternative;
      assetRevised = true;
      revisedRecommendation = `Revised from ${selected} to ${alternative} after strategic critic — stronger differentiation and less template risk.`;
      critiqueNotes.push(revisedRecommendation);
    }
  }

  const strategistWouldApprove =
    !wouldAnotherBusinessReceiveSame &&
    (isDifferentiated || leveragesExecutiveBrain) &&
    (!isGeneric || assetRevised);

  if (strategistWouldApprove) {
    critiqueNotes.push("Strategic critic approves final recommendation.");
  } else if (!assetRevised) {
    critiqueNotes.push("Recommendation retained but flagged for stronger executive differentiation in generation.");
  }

  return {
    isGeneric,
    wouldAnotherBusinessReceiveSame,
    isDifferentiated,
    leveragesExecutiveBrain,
    strategistWouldApprove,
    critiqueNotes,
    revisedRecommendation,
    assetRevised,
    finalAssetType,
  };
}

export function buildExecutiveDecisionDocument(input: {
  hiddenProblem: HiddenProblemAssessment;
  contrarian: ContrarianThinkingAssessment;
  buyerPsychology: BuyerPsychologyAssessment;
  differentiation: StrategicDifferentiationAssessment;
  executiveRecommendation: ExecutiveRecommendation;
  strategicCritic: StrategicCriticAssessment;
  marketPattern: MarketPatternClassification;
  suggestedOpportunityTitle: string;
  generationObjectives: ContentGenerationObjectives;
  reusability: ReusabilityAssessment;
}): ExecutiveDecisionDocument {
  return {
    hiddenMarketProblem: input.hiddenProblem.hiddenMarketProblem,
    strategicInsight: input.contrarian.assumptionChallenge,
    businessOpportunity: input.suggestedOpportunityTitle,
    competitiveAdvantage:
      input.differentiation.competitiveAdvantage.join("; ") ||
      input.differentiation.differentiationStatement,
    buyerPsychologySummary: [
      input.buyerPsychology.coreFear,
      input.buyerPsychology.desiredTransformation,
      input.buyerPsychology.emotionalBlocker,
    ]
      .filter(Boolean)
      .join(" | "),
    businessObjective: input.generationObjectives.businessObjective,
    recommendedAssetType: input.strategicCritic.finalAssetType,
    assetSelectionReason: input.strategicCritic.revisedRecommendation
      ? `${ensureExecutiveRecommendation(input.executiveRecommendation).whyThisAsset} ${input.strategicCritic.revisedRecommendation}`
      : ensureExecutiveRecommendation(input.executiveRecommendation).whyThisAsset,
    positioningStrategy: input.generationObjectives.positioningObjective,
    successMetric:
      input.buyerPsychology.primarySuccessMetric ??
      ensureExecutiveRecommendation(input.executiveRecommendation).expectedBusinessOutcome,
    marketPattern: input.marketPattern.analystSummary,
    generationObjectives: input.generationObjectives,
    reusability: input.reusability,
  };
}

export function buildExecutiveCognitionLayers(input: {
  context: ExecutiveReasoningSourceContext;
  marketUnderstanding: MarketUnderstandingAssessment;
  hiddenProblem: HiddenProblemAssessment;
  buyerPsychology: BuyerPsychologyAssessment;
  differentiation: StrategicDifferentiationAssessment;
  contrarian: ContrarianThinkingAssessment;
  assetStrategy: AssetStrategyAssessment;
  executiveRecommendation: ExecutiveRecommendation;
  suggestedOpportunityTitle: string;
}): ExecutiveCognitionLayers {
  const executiveReflection = buildExecutiveReflection({
    hiddenProblem: input.hiddenProblem,
    contrarian: input.contrarian,
    buyerPsychology: input.buyerPsychology,
    differentiation: input.differentiation,
  });

  const executiveMemoryComparison = buildExecutiveMemoryComparison(input.context);

  const marketPatternClassification = buildMarketPatternClassification({
    context: input.context,
    hiddenProblem: input.hiddenProblem,
    memoryComparison: executiveMemoryComparison,
    marketUnderstanding: input.marketUnderstanding,
  });

  const strategicCritic = applyStrategicCritic({
    assetStrategy: input.assetStrategy,
    differentiation: input.differentiation,
    executiveRecommendation: input.executiveRecommendation,
    context: input.context,
  });

  const revisedAssetStrategy: AssetStrategyAssessment = strategicCritic.assetRevised
    ? {
        ...input.assetStrategy,
        selectedAssetType: strategicCritic.finalAssetType,
        selectionRationale: uniqueStrings([
          ...input.assetStrategy.selectionRationale,
          strategicCritic.revisedRecommendation,
        ]),
      }
    : input.assetStrategy;

  const generationObjectives = buildContentGenerationObjectives({
    hiddenProblem: input.hiddenProblem,
    buyerPsychology: input.buyerPsychology,
    differentiation: input.differentiation,
    executiveRecommendation: input.executiveRecommendation,
    marketPattern: marketPatternClassification,
  });

  const reusabilityAssessment = buildReusabilityAssessment({
    assetStrategy: revisedAssetStrategy,
    executiveRecommendation: input.executiveRecommendation,
    marketPattern: marketPatternClassification,
    memoryComparison: executiveMemoryComparison,
  });

  const executiveDecisionDocument = buildExecutiveDecisionDocument({
    hiddenProblem: input.hiddenProblem,
    contrarian: input.contrarian,
    buyerPsychology: input.buyerPsychology,
    differentiation: input.differentiation,
    executiveRecommendation: input.executiveRecommendation,
    strategicCritic,
    marketPattern: marketPatternClassification,
    suggestedOpportunityTitle: input.suggestedOpportunityTitle,
    generationObjectives,
    reusability: reusabilityAssessment,
  });

  return {
    cognitionVersion: EXECUTIVE_COGNITION_VERSION,
    executiveReflection,
    executiveMemoryComparison,
    marketPatternClassification,
    strategicCritic,
    generationObjectives,
    reusabilityAssessment,
    executiveDecisionDocument,
  };
}

export function formatExecutiveDecisionDocumentForPrompt(
  document: ExecutiveDecisionDocument,
): string {
  const objectives = document.generationObjectives;
  return [
    "ATHENA EXECUTIVE DECISION DOCUMENT (INTERNAL — GENERATION MUST FOLLOW):",
    "",
    "Do not generate from raw discussion alone. Use this decision document.",
    "",
    `- Hidden market problem: ${document.hiddenMarketProblem}`,
    `- Strategic insight: ${document.strategicInsight}`,
    `- Business opportunity: ${document.businessOpportunity}`,
    `- Competitive advantage: ${document.competitiveAdvantage}`,
    `- Buyer psychology: ${document.buyerPsychologySummary}`,
    `- Business objective: ${document.businessObjective}`,
    `- Recommended asset: ${document.recommendedAssetType}`,
    `- Asset selection reason: ${document.assetSelectionReason}`,
    `- Positioning strategy: ${document.positioningStrategy}`,
    `- Success metric: ${document.successMetric}`,
    `- Market pattern: ${document.marketPattern}`,
    "",
    "GENERATION OBJECTIVES (determine before writing any copy):",
    `- Business: ${objectives.businessObjective}`,
    `- Psychological: ${objectives.psychologicalObjective}`,
    `- Positioning: ${objectives.positioningObjective}`,
    `- Conversation: ${objectives.conversationObjective}`,
    `- CTA: ${objectives.callToActionObjective}`,
    "",
    "REUSABILITY:",
    `- Evergreen potential: ${document.reusability.evergreenPotential}`,
    `- Reuse formats: ${document.reusability.reuseFormats.join(", ") || "single-use"}`,
    `- Long-term leverage: ${document.reusability.longTermLeverage}`,
    document.reusability.curriculumImprovement
      ? `- Curriculum: ${document.reusability.curriculumImprovement}`
      : "",
    document.reusability.salesEnablementPotential
      ? `- Sales enablement: ${document.reusability.salesEnablementPotential}`
      : "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function formatExecutiveCognitionForPrompt(
  cognition: ExecutiveCognitionLayers,
): string {
  const reflection = cognition.executiveReflection;
  const memory = cognition.executiveMemoryComparison;
  const pattern = cognition.marketPatternClassification;
  const critic = cognition.strategicCritic;

  return [
    "ATHENA EXECUTIVE COGNITION (INTERNAL REASONING — DO NOT SKIP):",
    "",
    "EXECUTIVE REFLECTION:",
    `- What surprised: ${reflection.whatSurprised ?? "Not assessed"}`,
    `- What matters most: ${reflection.whatMattersMost ?? "Not assessed"}`,
    `- Real business problem: ${reflection.realBusinessProblem ?? "Not assessed"}`,
    `- Market misunderstanding: ${reflection.marketMisunderstanding ?? "Not assessed"}`,
    `- Conventional assumption (is it true?): ${reflection.conventionalAssumption ?? "Unknown"} → ${reflection.assumptionIsTrue ? "yes" : "no"}`,
    `- Indirect concern: ${reflection.indirectConcern ?? "Not assessed"}`,
    `- Strategist would notice: ${reflection.strategistNotice ?? "Not assessed"}`,
    `- Long-term opportunity: ${reflection.longTermOpportunity ?? "Not assessed"}`,
    `- Reusable asset opportunity: ${reflection.reusableAssetOpportunity ?? "Not assessed"}`,
    "",
    "EXECUTIVE MEMORY:",
    memory.historicalDataAvailable
      ? `- Recurring objections: ${memory.recurringObjections.join("; ") || "none"}`
      : "- No historical memory yet — reasoning from current intelligence only.",
    memory.historicalDataAvailable
      ? `- Repeated buying signals: ${memory.repeatedBuyingSignals.join("; ") || "none"}`
      : "",
    memory.historicalDataAvailable
      ? `- Previous approved decisions: ${memory.previousApprovedDecisions}`
      : "",
    "",
    "MARKET PATTERN DETECTION:",
    `- Primary: ${pattern.primaryPattern.replace(/_/g, " ")}`,
    pattern.secondaryPatterns.length
      ? `- Secondary: ${pattern.secondaryPatterns.join(", ").replace(/_/g, " ")}`
      : "",
    `- Analyst summary: ${pattern.analystSummary}`,
    "",
    "STRATEGIC CRITIC:",
    `- Generic risk: ${critic.isGeneric ? "yes — revised if needed" : "no"}`,
    `- Differentiated: ${critic.isDifferentiated ? "yes" : "needs stronger brain leverage"}`,
    `- Leverages Executive Brain: ${critic.leveragesExecutiveBrain ? "yes" : "partial"}`,
    `- Strategist approval: ${critic.strategistWouldApprove ? "approved" : "flagged"}`,
    critic.critiqueNotes.map((note) => `- ${note}`).join("\n"),
    critic.assetRevised ? `- Final asset after critique: ${critic.finalAssetType}` : "",
    "",
    formatExecutiveDecisionDocumentForPrompt(cognition.executiveDecisionDocument),
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}
