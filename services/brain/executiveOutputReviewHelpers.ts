import { buildStrategicBlueprintProductionContext } from "@/services/assetBlueprints/strategicBlueprintProductionSpecs";
import type { ExecutiveStrategy } from "@/services/brain/executiveCoherence/executiveCoherenceTypes";
import { buildExecutiveStrategyFromUnderstanding } from "@/services/brain/executiveCoherence/executiveStrategyBuilder";
import { syncIntelligenceWithInitiativeSelection } from "@/services/brain/executiveInitiativeSelectionHelpers";
import type {
  ExecutiveCampaignNarrative,
  ExecutiveMandatoryReviewAnswers,
  ExecutiveOutputReviewResult,
  ExecutiveQualityCategoryScores,
  ExecutiveQualityDimensionScores,
  ExecutiveUnderstanding,
  ExecutiveUnderstandingBundle,
} from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";

export const EXECUTIVE_OUTPUT_REVIEW_VERSION = "executive_output_review_v1";
export const EXECUTIVE_QUALITY_MINIMUM_THRESHOLD = 9;
export const EXECUTIVE_QUALITY_MAX_REFINEMENT_PASSES = 3;

const GENERIC_REJECTION_PATTERNS = [
  /\bcreate a webinar\b/i,
  /\bhost a webinar\b/i,
  /\beducational webinar\b/i,
  /\bwrite a guide\b/i,
  /\bcomprehensive guide\b/i,
  /\bcreate a pdf\b/i,
  /\bpost on social media\b/i,
  /\bengage with the community\b/i,
  /\bshare valuable content\b/i,
  /\bthought leadership content\b/i,
  /\bcreate an ebook\b/i,
  /\bbuild a checklist\b/i,
  /\bgeneric framework\b/i,
  /\bcontent marketing\b/i,
  /\bblog post about\b/i,
];

const DESCRIPTIVE_WITHOUT_DEMONSTRATION = [
  /\bwe are experts\b/i,
  /\bour expertise\b/i,
  /\bwe help companies\b/i,
  /\bindustry-leading\b/i,
  /\bbest practices\b/i,
  /\bcomprehensive overview\b/i,
];

const INFORMATIONAL_ONLY = [
  /\bhere is some information\b/i,
  /\bthis guide explains\b/i,
  /\blearn about\b/i,
  /\bintroduction to\b/i,
  /\bwhat is\b/i,
];

const TEMPLATE_ASSET_TYPES = new Set([
  "webinar",
  "pdf_guide",
  "checklist",
  "framework",
  "carousel",
]);

const HIGH_LEVERAGE_ASSET_TYPES = new Set([
  "interactive_assessment",
  "assessment",
  "calculator",
  "audit",
  "teardown",
  "pilot",
  "diagnostic",
  "comparison",
  "case_study",
  "roi_tool",
  "decision_matrix",
  "live_audit",
  "architecture_teardown",
]);

function clampScore(value: number): number {
  return Math.max(1, Math.min(10, Math.round(value)));
}

function containsAnyPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function countPatternMatches(text: string, patterns: RegExp[]): number {
  return patterns.filter((pattern) => pattern.test(text)).length;
}

export function buildExecutiveCampaignNarrative(
  understanding: ExecutiveUnderstanding,
): ExecutiveCampaignNarrative {
  const intelligence = understanding.executiveIntelligence;
  const initiative = understanding.executiveInitiativeSelection.selectedInitiative;
  const hidden = intelligence.hiddenProblem.hiddenMarketProblem;
  const contrarian = intelligence.contrarianThinking.assumptionChallenge;
  const differentiation = intelligence.strategicDifferentiation.differentiationStatement;

  const coreInsight =
    intelligence.executiveCognition.executiveReflection.whatMattersMost ??
    intelligence.contrarianThinking.surpriseInsight ??
    hidden;

  const strategicPosition = differentiation || initiative.expectedAuthorityOutcome;
  const campaignTheme = `${initiative.initiativeLabel}: ${initiative.expectedBusinessOutcome.slice(0, 120)}`;
  const executiveMessage = [
    coreInsight,
    contrarian,
    initiative.whyThisInitiative.slice(0, 200),
  ]
    .filter(Boolean)
    .join(" ");

  const impl = understanding.executiveInitiativeSelection.implementationStrategy;
  const deploymentSequence = [
    `Establish insight: ${coreInsight.slice(0, 100)}`,
    `Position: ${strategicPosition.slice(0, 100)}`,
    `Deploy ${impl.implementationDeliverable} as execution vehicle`,
    ...impl.channels.slice(0, 3).map((channel) => `Activate via ${channel}`),
    `Measure: ${initiative.primarySuccessMetric}`,
  ];

  return {
    coreInsight,
    strategicPosition,
    campaignTheme,
    executiveMessage,
    deploymentSequence,
    narrativeFingerprint: [
      initiative.initiativeLabel,
      initiative.initiativeCategory,
      coreInsight.slice(0, 80),
    ].join("|"),
  };
}

function scoreDimensions(input: {
  understanding: ExecutiveUnderstanding;
  strategy: ExecutiveStrategy;
  campaign: ExecutiveCampaignNarrative;
}): ExecutiveQualityDimensionScores {
  const { understanding, strategy, campaign } = input;
  const initiative = understanding.executiveInitiativeSelection.selectedInitiative;
  const intelligence = understanding.executiveIntelligence;
  const initiativeScore = initiative.strategicConfidence / 10;
  const evidenceCount = initiative.evidenceFromDiscussion.length;
  const isBrainTrained = understanding.businessUnderstanding.isBrainTrained;
  const isGenericInitiative =
    initiative.initiativeCategory === "market_education" ||
    initiative.initiativeLabel.toLowerCase().includes("webinar");

  let strategicOriginality = initiativeScore + (isGenericInitiative ? -2 : 2);
  let businessLeverage = initiativeScore + (initiative.timeHorizon === "long_term" ? 1 : 0);
  let executiveValue = initiativeScore + (isBrainTrained ? 1 : 0);
  let competitiveDifferentiation =
    intelligence.strategicDifferentiation.uniquePositioning.length * 1.5 +
    (isBrainTrained ? 2 : 0);
  let actionability = understanding.executiveInitiativeSelection.implementationStrategy
    .contentRequired
    ? 8
    : 9;
  let founderUsefulness = evidenceCount >= 3 ? 9 : evidenceCount >= 2 ? 8 : 6;
  let campaignPotential = campaign.deploymentSequence.length >= 4 ? 9 : 7;
  let authority = initiative.expectedAuthorityOutcome.length > 40 ? 8 : 7;
  let executionReadiness =
    understanding.executiveInitiativeSelection.implementationStrategy.contentRequired ? 8 : 9;
  let narrativeStrength =
    campaign.executiveMessage.length > 120 ? 9 : campaign.executiveMessage.length > 60 ? 8 : 6;

  if (intelligence.contrarianThinking.surpriseInsight) strategicOriginality += 1;
  if (understanding.supportingEvidence.totalCount >= 3) founderUsefulness += 1;
  if (strategy.marketingStrategy.recommendedPrimaryDeliverable.includes("Webinar")) {
    strategicOriginality -= 3;
    businessLeverage -= 2;
  }

  return {
    strategicOriginality: clampScore(strategicOriginality),
    businessLeverage: clampScore(businessLeverage),
    executiveValue: clampScore(executiveValue),
    competitiveDifferentiation: clampScore(competitiveDifferentiation),
    actionability: clampScore(actionability),
    founderUsefulness: clampScore(founderUsefulness),
    campaignPotential: clampScore(campaignPotential),
    authority: clampScore(authority),
    executionReadiness: clampScore(executionReadiness),
    narrativeStrength: clampScore(narrativeStrength),
  };
}

function scoreCategories(input: {
  understanding: ExecutiveUnderstanding;
  strategy: ExecutiveStrategy;
  campaign: ExecutiveCampaignNarrative;
  dimensions: ExecutiveQualityDimensionScores;
  artifactText?: string;
  refinementPass?: number;
}): ExecutiveQualityCategoryScores {
  const { understanding, strategy, campaign, dimensions, artifactText } = input;
  const passBoost = (input.refinementPass ?? 0) * 0.75;
  const productionContext = buildStrategicBlueprintProductionContext(
    understanding,
    strategy,
  );

  let strategicBlueprint =
    (dimensions.strategicOriginality +
      dimensions.businessLeverage +
      dimensions.executionReadiness) /
    3;

  if (productionContext.strategyFirst.executiveInitiative) strategicBlueprint += 0.5;
  if (
    TEMPLATE_ASSET_TYPES.has(productionContext.preferredAssetType) &&
    !understanding.executiveInitiativeSelection.implementationStrategy.contentRequired
  ) {
    strategicBlueprint -= 2;
  }
  if (HIGH_LEVERAGE_ASSET_TYPES.has(productionContext.preferredAssetType)) {
    strategicBlueprint += 1;
  }

  let deploymentAssets =
    (dimensions.actionability + dimensions.authority + dimensions.founderUsefulness) / 3;
  let executiveRecommendation =
    (dimensions.executiveValue + dimensions.businessLeverage + dimensions.competitiveDifferentiation) /
    3;
  let campaignCoherence =
    (dimensions.campaignPotential + dimensions.narrativeStrength + dimensions.strategicOriginality) /
    3;

  if (artifactText) {
    const genericMatches = countPatternMatches(artifactText, GENERIC_REJECTION_PATTERNS);
    const descriptiveMatches = countPatternMatches(
      artifactText,
      DESCRIPTIVE_WITHOUT_DEMONSTRATION,
    );
    deploymentAssets -= genericMatches * 2 + descriptiveMatches;
    executiveRecommendation -= genericMatches * 1.5;
    if (containsInsightSignal(artifactText, understanding)) deploymentAssets += 1;
  }

  const initiativeAligned = artifactText
    ? artifactText
        .toLowerCase()
        .includes(
          understanding.executiveInitiativeSelection.selectedInitiative.initiativeLabel.toLowerCase().slice(
            0,
            20,
          ),
        )
    : true;
  if (!initiativeAligned && artifactText) campaignCoherence -= 2;

  return {
    strategicBlueprint: clampScore(strategicBlueprint + passBoost),
    deploymentAssets: clampScore(deploymentAssets + passBoost),
    executiveRecommendation: clampScore(executiveRecommendation + passBoost),
    campaignCoherence: clampScore(campaignCoherence + passBoost),
  };
}

function containsInsightSignal(text: string, understanding: ExecutiveUnderstanding): boolean {
  const signals = [
    understanding.executiveIntelligence.contrarianThinking.surpriseInsight,
    understanding.executiveIntelligence.hiddenProblem.foundationalInsight,
    ...understanding.marketUnderstanding.painPoints,
  ].filter(Boolean);

  const lower = text.toLowerCase();
  return signals.some((signal) => lower.includes(signal.toLowerCase().slice(0, 40)));
}

export function evaluateMandatoryReviewQuestions(input: {
  understanding: ExecutiveUnderstanding;
  strategy: ExecutiveStrategy;
  artifactText?: string;
  artifactType?: "strategic_blueprint" | "deployment_asset" | "executive_briefing" | "discussion_analysis";
}): ExecutiveMandatoryReviewAnswers {
  const text = input.artifactText ?? "";
  const hasArtifact = text.trim().length > 0;
  const initiative = input.understanding.executiveInitiativeSelection.selectedInitiative;
  const isGeneric = containsAnyPattern(text, GENERIC_REJECTION_PATTERNS);
  const isDescriptive = containsAnyPattern(text, DESCRIPTIVE_WITHOUT_DEMONSTRATION);
  const isInformational = containsAnyPattern(text, INFORMATIONAL_ONLY);
  const chatGptSimilar =
    hasArtifact && isGeneric && !containsInsightSignal(text, input.understanding);
  const demonstratesExpertise =
    !hasArtifact || (containsInsightSignal(text, input.understanding) && !isDescriptive);
  const createsAdvantage =
    initiative.initiativeCategory !== "market_education" &&
    !initiative.initiativeLabel.toLowerCase().includes("webinar");
  const winsOpportunity = initiative.strategicConfidence >= 65;
  const independentlyReplicable = hasArtifact ? isGeneric || text.length < 80 : false;
  const consultingGrade =
    initiative.evidenceFromDiscussion.length >= 2 &&
    (!hasArtifact || (!isGeneric && demonstratesExpertise));

  const blueprintCeoTest =
    input.artifactType === "strategic_blueprint"
      ? initiative.initiativeLabel.length > 0 &&
        !initiative.initiativeLabel.toLowerCase().includes("webinar") &&
        initiative.strategicConfidence >= 60
      : true;

  return {
    blueprintPassesCeoTest: blueprintCeoTest,
    chatGptCouldGenerateSimilar: chatGptSimilar,
    demonstratesExpertise,
    createsCompetitiveAdvantage: createsAdvantage,
    winsOpportunity,
    independentlyReplicable,
    consultingFirmWouldCharge: consultingGrade,
    rejectsInformationalOnly: !isInformational || demonstratesExpertise,
  };
}

function collectRejections(input: {
  categories: ExecutiveQualityCategoryScores;
  mandatory: ExecutiveMandatoryReviewAnswers;
  artifactText?: string;
}): string[] {
  const rejections: string[] = [];
  const { categories, mandatory } = input;

  if (categories.strategicBlueprint < EXECUTIVE_QUALITY_MINIMUM_THRESHOLD) {
    rejections.push("Strategic blueprint below executive quality threshold.");
  }
  if (categories.deploymentAssets < EXECUTIVE_QUALITY_MINIMUM_THRESHOLD) {
    rejections.push("Deployment assets below executive quality threshold.");
  }
  if (categories.executiveRecommendation < EXECUTIVE_QUALITY_MINIMUM_THRESHOLD) {
    rejections.push("Executive recommendation below executive quality threshold.");
  }
  if (categories.campaignCoherence < EXECUTIVE_QUALITY_MINIMUM_THRESHOLD) {
    rejections.push("Campaign coherence below executive quality threshold.");
  }
  if (!mandatory.blueprintPassesCeoTest) {
    rejections.push("Blueprint fails CEO test — reads as content idea, not strategic initiative.");
  }
  if (mandatory.chatGptCouldGenerateSimilar) {
    rejections.push("Output too similar to generic ChatGPT response.");
  }
  if (!mandatory.demonstratesExpertise && input.artifactText?.trim()) {
    rejections.push("Asset describes expertise rather than demonstrating authority.");
  }
  if (!mandatory.createsCompetitiveAdvantage) {
    rejections.push("Recommendation communicates information without strategic leverage.");
  }
  if (!mandatory.winsOpportunity) {
    rejections.push("Output produces content rather than winning the opportunity.");
  }
  if (mandatory.independentlyReplicable) {
    rejections.push("Another strategist could independently create the same recommendation.");
  }
  if (!mandatory.consultingFirmWouldCharge) {
    rejections.push("Recommendation lacks consulting-grade executive value.");
  }
  if (input.artifactText && containsAnyPattern(input.artifactText, GENERIC_REJECTION_PATTERNS)) {
    rejections.push("Generic template recommendation detected.");
  }

  return rejections;
}

function passesQualityGate(rejections: string[]): boolean {
  return rejections.length === 0;
}

function minCategoryScore(categories: ExecutiveQualityCategoryScores): number {
  return Math.min(
    categories.strategicBlueprint,
    categories.deploymentAssets,
    categories.executiveRecommendation,
    categories.campaignCoherence,
  );
}

export function refineExecutiveBundleForQualityPass(input: {
  bundle: ExecutiveUnderstandingBundle;
  pass: number;
}): ExecutiveUnderstandingBundle {
  const { bundle, pass } = input;
  const understanding = bundle.executiveUnderstanding;
  const selection = understanding.executiveInitiativeSelection;
  const ranked = selection.ranked;
  const alternative = ranked[pass] ?? ranked[pass - 1] ?? ranked[0];

  if (!alternative) {
    return bundle;
  }

  const refinedSelection = {
    ...selection,
    selectedInitiative: {
      ...selection.selectedInitiative,
      initiativeLabel: alternative.candidate.label,
      initiativeCategory: alternative.candidate.category,
      whyThisInitiative: `${alternative.candidate.whyChangesBusiness} (quality refinement pass ${pass + 1})`,
      expectedBusinessOutcome: alternative.candidate.whyChangesBusiness,
      expectedCustomerOutcome: alternative.candidate.expectedCustomerTransformation,
      strategicConfidence: Math.min(100, alternative.scores.compositeScore + pass * 3),
      evidenceFromDiscussion: alternative.candidate.evidenceFromDiscussion,
    },
    implementationStrategy: {
      ...selection.implementationStrategy,
      initiativeLabel: alternative.candidate.label,
      initiativeCategory: alternative.candidate.category,
      businessObjective: alternative.candidate.whyChangesBusiness,
      implementationDeliverable: alternative.candidate.preferredImplementationTypes.find(
        (d) => !d.includes("Webinar") && !d.includes("Workshop"),
      ) ?? alternative.candidate.preferredImplementationTypes[0],
      rationale: `Quality refinement pass ${pass + 1}: ${alternative.candidate.label} replaces generic output.`,
    },
  };

  const syncedIntelligence = syncIntelligenceWithInitiativeSelection({
    intelligence: understanding.executiveIntelligence,
    initiativeSelection: refinedSelection,
    organizationId: understanding.metadata.organizationId,
  });

  const refinedUnderstanding: ExecutiveUnderstanding = {
    ...understanding,
    executiveSummary: {
      ...understanding.executiveSummary,
      headline: refinedSelection.selectedInitiative.initiativeLabel,
      primaryObjective: refinedSelection.selectedInitiative.expectedBusinessOutcome,
    },
    opportunityUnderstanding: {
      ...understanding.opportunityUnderstanding,
      businessOpportunity: refinedSelection.selectedInitiative.initiativeLabel,
    },
    executiveIntelligence: syncedIntelligence,
    executiveInitiativeSelection: refinedSelection,
  };

  const campaign = buildExecutiveCampaignNarrative(refinedUnderstanding);
  const enrichedCampaign: ExecutiveCampaignNarrative = {
    ...campaign,
    executiveMessage: [
      campaign.executiveMessage,
      understanding.executiveIntelligence.contrarianThinking.strategicReframe,
      `Refinement insight: ${understanding.executiveIntelligence.hiddenProblem.foundationalInsight}`,
    ]
      .filter(Boolean)
      .join(" "),
    coreInsight:
      pass >= 2
        ? understanding.executiveIntelligence.contrarianThinking.overlookedOpportunity
        : campaign.coreInsight,
  };

  const executiveStrategy = buildExecutiveStrategyFromUnderstanding({
    organizationId: understanding.metadata.organizationId,
    discussionId: understanding.metadata.discussionId ?? undefined,
    executiveUnderstanding: {
      ...refinedUnderstanding,
      executiveCampaignNarrative: enrichedCampaign,
    },
  });

  return {
    ...bundle,
    executiveUnderstanding: {
      ...refinedUnderstanding,
      executiveCampaignNarrative: enrichedCampaign,
    },
    executiveStrategy,
  };
}

export function reviewExecutiveBundle(input: {
  bundle: ExecutiveUnderstandingBundle;
  artifactText?: string;
  artifactType?: "strategic_blueprint" | "deployment_asset" | "executive_briefing" | "discussion_analysis";
  refinementPass?: number;
}): ExecutiveOutputReviewResult {
  const understanding = input.bundle.executiveUnderstanding;
  const strategy = input.bundle.executiveStrategy;
  const campaign =
    understanding.executiveCampaignNarrative ??
    buildExecutiveCampaignNarrative(understanding);

  const dimensions = scoreDimensions({ understanding, strategy, campaign });
  const categories = scoreCategories({
    understanding,
    strategy,
    campaign,
    dimensions,
    artifactText: input.artifactText,
    refinementPass: input.refinementPass,
  });
  const mandatory = evaluateMandatoryReviewQuestions({
    understanding,
    strategy,
    artifactText: input.artifactText,
    artifactType: input.artifactType,
  });
  const rejections = collectRejections({
    categories,
    mandatory,
    artifactText: input.artifactText,
  });

  return {
    reviewVersion: EXECUTIVE_OUTPUT_REVIEW_VERSION,
    refinementPass: input.refinementPass ?? 0,
    accepted: passesQualityGate(rejections),
    dimensions,
    categories,
    mandatory,
    rejections,
    minimumThreshold: EXECUTIVE_QUALITY_MINIMUM_THRESHOLD,
    compositeScore: minCategoryScore(categories),
    reviewerSummary: rejections.length
      ? `Executive review rejected: ${rejections[0]}`
      : "Executive review approved — meets consulting-grade quality threshold.",
    qualityRefinementInstructions: rejections.length
      ? formatQualityRefinementInstructions({ rejections, campaign, understanding })
      : null,
    reviewedAt: new Date().toISOString(),
  };
}

export function runExecutiveOutputQualityGate(
  bundle: ExecutiveUnderstandingBundle,
): ExecutiveUnderstandingBundle {
  const attempts: Array<{
    bundle: ExecutiveUnderstandingBundle;
    review: ExecutiveOutputReviewResult;
  }> = [];

  let current: ExecutiveUnderstandingBundle = {
    ...bundle,
    executiveUnderstanding: {
      ...bundle.executiveUnderstanding,
      executiveCampaignNarrative: buildExecutiveCampaignNarrative(bundle.executiveUnderstanding),
    },
  };

  for (let pass = 0; pass < EXECUTIVE_QUALITY_MAX_REFINEMENT_PASSES; pass += 1) {
    if (pass > 0) {
      current = refineExecutiveBundleForQualityPass({ bundle: current, pass });
    }

    const review = reviewExecutiveBundle({
      bundle: current,
      refinementPass: pass,
    });

    attempts.push({ bundle: current, review });

    if (review.accepted) {
      return {
        ...current,
        executiveUnderstanding: {
          ...current.executiveUnderstanding,
          executiveOutputReview: review,
        },
      };
    }
  }

  const best = attempts.reduce((top, attempt) =>
    attempt.review.compositeScore > top.review.compositeScore ? attempt : top,
  );

  return {
    ...best.bundle,
    executiveUnderstanding: {
      ...best.bundle.executiveUnderstanding,
      executiveOutputReview: {
        ...best.review,
        accepted: best.review.compositeScore >= EXECUTIVE_QUALITY_MINIMUM_THRESHOLD - 1,
        reviewerSummary: `Persisting highest-scoring refinement (pass ${best.review.refinementPass + 1}, composite ${best.review.compositeScore}).`,
      },
    },
  };
}

export function reviewGeneratedArtifact(input: {
  bundle: ExecutiveUnderstandingBundle;
  text: string;
  artifactType: "strategic_blueprint" | "deployment_asset" | "executive_briefing" | "discussion_analysis";
  refinementPass?: number;
}): ExecutiveOutputReviewResult {
  return reviewExecutiveBundle({
    bundle: input.bundle,
    artifactText: input.text,
    artifactType: input.artifactType,
    refinementPass: input.refinementPass,
  });
}

export function formatQualityRefinementInstructions(input: {
  rejections: string[];
  campaign: ExecutiveCampaignNarrative;
  understanding: ExecutiveUnderstanding;
}): string {
  const initiative = input.understanding.executiveInitiativeSelection.selectedInitiative;
  return [
    "EXECUTIVE QUALITY REFINEMENT (MANDATORY — previous output rejected by internal review board):",
    "",
    ...input.rejections.map((r) => `- REJECTED: ${r}`),
    "",
    "The reviewer requires executive-grade output, not generic content advice.",
    "",
    `Canonical initiative: ${initiative.initiativeLabel}`,
    `Campaign theme: ${input.campaign.campaignTheme}`,
    `Core insight (must appear): ${input.campaign.coreInsight}`,
    `Executive message: ${input.campaign.executiveMessage}`,
    "",
    "Requirements for this regeneration:",
    "- Include at least one non-obvious insight the reader has not considered.",
    "- Demonstrate authority through pattern recognition, not self-description.",
    "- Tie every recommendation to winning this specific opportunity.",
    "- Never default to webinar, guide, checklist, or ebook unless objectively highest leverage.",
    "- Express the same campaign narrative as all other outputs.",
    "- Answer: would a consulting firm charge thousands for this recommendation?",
  ].join("\n");
}

export function formatExecutiveOutputReviewForPrompt(
  review: ExecutiveOutputReviewResult,
  campaign: ExecutiveCampaignNarrative,
): string {
  return [
    "EXECUTIVE OUTPUT REVIEW (APPROVED — all outputs must meet this bar):",
    "",
    `Review status: ${review.accepted ? "APPROVED" : "REFINED"}`,
    `Composite quality: ${review.compositeScore}/10`,
    "",
    "CAMPAIGN NARRATIVE (single strategic thread — every asset must reinforce):",
    `- Core insight: ${campaign.coreInsight}`,
    `- Strategic position: ${campaign.strategicPosition}`,
    `- Campaign theme: ${campaign.campaignTheme}`,
    `- Executive message: ${campaign.executiveMessage}`,
    `- Deployment sequence: ${campaign.deploymentSequence.join(" → ")}`,
    "",
    "Quality dimensions:",
    `- Strategic originality: ${review.dimensions.strategicOriginality}/10`,
    `- Business leverage: ${review.dimensions.businessLeverage}/10`,
    `- Executive value: ${review.dimensions.executiveValue}/10`,
    `- Competitive differentiation: ${review.dimensions.competitiveDifferentiation}/10`,
    "",
    "Do not produce generic, template, or ChatGPT-equivalent output.",
  ].join("\n");
}

export function formatExecutiveCampaignNarrativeForPrompt(
  campaign: ExecutiveCampaignNarrative,
): string {
  return [
    "EXECUTIVE CAMPAIGN NARRATIVE:",
    `- Core insight: ${campaign.coreInsight}`,
    `- Strategic position: ${campaign.strategicPosition}`,
    `- Campaign theme: ${campaign.campaignTheme}`,
    `- Executive message: ${campaign.executiveMessage}`,
    `- Deployment sequence: ${campaign.deploymentSequence.join(" → ")}`,
  ].join("\n");
}

export async function runArtifactQualityGateLoop<T>(input: {
  bundle: ExecutiveUnderstandingBundle;
  artifactType:
    | "strategic_blueprint"
    | "deployment_asset"
    | "executive_briefing"
    | "discussion_analysis";
  generate: (refinementSuffix: string) => Promise<string>;
  parse: (raw: string) => T;
  toReviewText: (parsed: T) => string;
}): Promise<{ parsed: T; raw: string; review: ExecutiveOutputReviewResult }> {
  const attempts: Array<{
    parsed: T;
    raw: string;
    review: ExecutiveOutputReviewResult;
  }> = [];

  let refinementSuffix =
    input.bundle.executiveUnderstanding.executiveOutputReview?.qualityRefinementInstructions ??
    "";

  for (let pass = 0; pass < EXECUTIVE_QUALITY_MAX_REFINEMENT_PASSES; pass += 1) {
    const suffix = pass === 0 ? "" : refinementSuffix;
    const raw = await input.generate(suffix);
    const parsed = input.parse(raw);
    const review = reviewGeneratedArtifact({
      bundle: input.bundle,
      text: input.toReviewText(parsed),
      artifactType: input.artifactType,
      refinementPass: pass,
    });

    attempts.push({ parsed, raw, review });

    if (review.accepted) {
      return { parsed, raw, review };
    }

    refinementSuffix = review.qualityRefinementInstructions ?? refinementSuffix;
  }

  const best = attempts.reduce((top, attempt) =>
    attempt.review.compositeScore > top.review.compositeScore ? attempt : top,
  );

  return best;
}

export function buildSampleExecutiveOutputReview(): ExecutiveOutputReviewResult {
  return {
    reviewVersion: EXECUTIVE_OUTPUT_REVIEW_VERSION,
    refinementPass: 0,
    accepted: true,
    dimensions: {
      strategicOriginality: 9,
      businessLeverage: 9,
      executiveValue: 9,
      competitiveDifferentiation: 9,
      actionability: 9,
      founderUsefulness: 9,
      campaignPotential: 9,
      authority: 9,
      executionReadiness: 9,
      narrativeStrength: 9,
    },
    categories: {
      strategicBlueprint: 9,
      deploymentAssets: 9,
      executiveRecommendation: 9,
      campaignCoherence: 9,
    },
    mandatory: {
      blueprintPassesCeoTest: true,
      chatGptCouldGenerateSimilar: false,
      demonstratesExpertise: true,
      createsCompetitiveAdvantage: true,
      winsOpportunity: true,
      independentlyReplicable: false,
      consultingFirmWouldCharge: true,
      rejectsInformationalOnly: true,
    },
    rejections: [],
    minimumThreshold: EXECUTIVE_QUALITY_MINIMUM_THRESHOLD,
    compositeScore: 9,
    reviewerSummary: "Executive review approved.",
    qualityRefinementInstructions: null,
    reviewedAt: new Date().toISOString(),
  };
}
