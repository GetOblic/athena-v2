/**
 * Validation for Executive Marketing Strategy (Sprint 12).
 * Run: npx tsx scripts/validateExecutiveMarketingStrategy.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildExecutiveStrategyFromUnderstanding } from "@/services/brain/executiveCoherence/executiveStrategyBuilder";
import {
  applyMarketingStrategyRefresh,
  buildExecutiveMarketingStrategy,
  DELIVERABLE_IMPLEMENTATION,
} from "@/services/brain/executiveCoherence/executiveMarketingStrategyBuilder";
import {
  formatExecutiveMarketingStrategyForPrompt,
  validateSharedExecutiveStrategy,
} from "@/services/brain/executiveCoherence/executiveCoherenceHelpers";
import {
  formatMarketingRecommendationForPrompt,
  listMarketingRecommendationIntents,
  MARKETING_RECOMMENDATION_CONTRACTS,
} from "@/services/brain/executiveCoherence/marketingRecommendationContracts";
import { buildStrategicBlueprintProductionContext } from "@/services/assetBlueprints/strategicBlueprintProductionSpecs";
import { buildSampleExecutiveIntelligencePipeline } from "@/services/brain/executiveIntelligenceHelpers";
import type { ExecutiveUnderstanding } from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";

const marketingBuilderPath = join(
  process.cwd(),
  "services/brain/executiveCoherence/executiveMarketingStrategyBuilder.ts",
);
const strategyBuilderPath = join(
  process.cwd(),
  "services/brain/executiveCoherence/executiveStrategyBuilder.ts",
);
const contractsPath = join(
  process.cwd(),
  "services/brain/executiveCoherence/marketingRecommendationContracts.ts",
);
const specsPath = join(
  process.cwd(),
  "services/assetBlueprints/strategicBlueprintProductionSpecs.ts",
);
const assemblyPath = join(
  process.cwd(),
  "services/brain/generationContracts/generationPromptAssembly.ts",
);
const blueprintServicePath = join(
  process.cwd(),
  "services/assetBlueprints/assetBlueprintService.ts",
);
const coherenceServicePath = join(
  process.cwd(),
  "services/brain/executiveCoherenceService.ts",
);

const marketingBuilderSource = readFileSync(marketingBuilderPath, "utf8");
const strategyBuilderSource = readFileSync(strategyBuilderPath, "utf8");
const contractsSource = readFileSync(contractsPath, "utf8");
const specsSource = readFileSync(specsPath, "utf8");
const assemblySource = readFileSync(assemblyPath, "utf8");
const blueprintServiceSource = readFileSync(blueprintServicePath, "utf8");
const coherenceServiceSource = readFileSync(coherenceServicePath, "utf8");

let failures = 0;

function pass(message: string) {
  console.log(`✓ ${message}`);
}

function fail(message: string) {
  failures += 1;
  console.error(`✗ ${message}`);
}

function sampleUnderstanding(
  overrides: Partial<{
    direction: ExecutiveUnderstanding["strategicUnderstanding"]["recommendedDirection"];
    buyerStage: string | null;
    priority: string;
    organizationId: string;
    assetType: ExecutiveUnderstanding["executiveIntelligence"]["assetStrategy"]["selectedAssetType"];
  }> = {},
): ExecutiveUnderstanding {
  const executiveIntelligence = buildSampleExecutiveIntelligencePipeline();
  const applyAssetType = (
    assetType: ExecutiveUnderstanding["executiveIntelligence"]["assetStrategy"]["selectedAssetType"],
  ) => {
    executiveIntelligence.assetStrategy.selectedAssetType = assetType;
    executiveIntelligence.executiveCognition.executiveDecisionDocument.recommendedAssetType =
      assetType;
    executiveIntelligence.executiveCognition.strategicCritic.finalAssetType = assetType;
    executiveIntelligence.executiveDecisionSynthesis.selectedDecision.chosenStrategy =
      assetType;
    executiveIntelligence.executiveDecisionSynthesis.selectedDecision.decisionDocument.recommendedAssetType =
      assetType;
    executiveIntelligence.executiveDecisionSynthesis.decisionTrace.chosenStrategy = assetType;
  };

  if (overrides.assetType) {
    applyAssetType(overrides.assetType);
  } else if (overrides.direction === "sales_first") {
    applyAssetType("Case Study Collection");
  } else if (overrides.direction === "educational") {
    applyAssetType("Educational Guide");
  }

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      organizationId: overrides.organizationId ?? "org-marketing-1",
      discussionId: "discussion-marketing-1",
      understandingVersion: "executive_understanding_v1",
      reasoningVersion: "executive_reasoning_v1",
      memoryEnriched: false,
      learningEnriched: false,
      degradationMode: "identity_and_current_only",
      understandingFingerprint: "marketing-sample-fingerprint",
    },
    executiveSummary: {
      headline: "Marketing strategy sample",
      narrative: "Sample narrative for marketing validation",
      primaryObjective: "Educate operators and convert high-intent prospects",
      discussionId: "discussion-marketing-1",
      scope: "discussion",
    },
    businessUnderstanding: {
      positioning: "B2B RevOps consultant",
      voice: "Direct and credible",
      expertise: "Pipeline operations",
      website: "https://example.com",
      homepageUnderstanding: "Helps operators scale revenue",
      businessConstraints: [],
      knowledgeCompleteness: 70,
      isBrainTrained: true,
      summary: "Strong positioning",
    },
    marketUnderstanding: {
      buyerStage: overrides.buyerStage ?? "consideration",
      painPoints: ["Manual reporting", "Pipeline visibility"],
      marketSignals: ["Budget scrutiny"],
      recurringTerminology: ["RevOps"],
      competitors: ["Spreadsheets"],
      emergingThemes: ["AI forecasting"],
      discussionRelevance: "High",
      domainRelevance: "RevOps",
      evidenceStrength: "moderate",
      historicalEnrichmentAvailable: false,
    },
    strategicUnderstanding: {
      recommendedPositioning: "Consultative expert",
      recommendedDirection: overrides.direction ?? "consultative",
      secondaryDirection: null,
      recommendedExecutiveAction: "Share a diagnostic framework",
      recommendedDeploymentDirection: "Community reply with follow-up asset",
      primaryExecutiveObjective: "Help operator diagnose reporting pain",
      rationale: ["Consultative approach supported by signals"],
    },
    opportunityUnderstanding: {
      businessOpportunity: "RevOps diagnostic opportunity",
      businessAlignment: "high",
      executiveAlignment: "aligned",
      importance: "high_intent",
      supportingEvidence: ["Current discussion pain point"],
      historicalEvidence: [],
      historicalEvidenceAvailable: false,
    },
    riskUnderstanding: {
      overallRisk: "low",
      signals: [],
      missingInformation: [],
      sparseHistory: true,
    },
    priorityUnderstanding: {
      level: overrides.priority ?? "high_intent",
      rationale: ["Strong intent signals"],
    },
    supportingEvidence: {
      entries: [
        {
          source: "current_discussion",
          label: "Current Discussion",
          detail: "Operator asked about reporting automation",
          optional: false,
        },
      ],
      totalCount: 1,
      historicalCount: 0,
    },
    executiveIntelligence,
  };
}

console.log("Executive Marketing Strategy Validation\n");

if (strategyBuilderSource.includes("buildExecutiveMarketingStrategy")) {
  pass("Executive Strategy builder integrates marketing strategy");
} else {
  fail("Executive Strategy builder missing marketing integration");
}

if (marketingBuilderSource.includes("applyMarketingStrategyRefresh")) {
  pass("Refresh behaviour helper present");
} else {
  fail("Refresh behaviour helper missing");
}

if (
  specsSource.includes("executiveStrategy") &&
  specsSource.includes("recommendedPrimaryDeliverable")
) {
  pass("Blueprint production specs consume Executive Marketing Strategy");
} else {
  fail("Blueprint production specs not integrated with marketing strategy");
}

if (
  assemblySource.includes("input.bundle.executiveStrategy") &&
  assemblySource.includes("buildStrategicBlueprintProductionContext")
) {
  pass("Prompt assembly passes executive strategy to blueprint specs");
} else {
  fail("Prompt assembly missing executive strategy for blueprint specs");
}

if (
  blueprintServiceSource.includes("executive_marketing_strategy") &&
  blueprintServiceSource.includes("applyMarketingStrategyRefresh")
) {
  pass("Blueprint refresh preserves marketing strategy when strongest");
} else {
  fail("Blueprint refresh behaviour not implemented");
}

if (
  !marketingBuilderSource.includes("generateReview") &&
  !marketingBuilderSource.includes("openai") &&
  !marketingBuilderSource.includes(".from(")
) {
  pass("Marketing strategy builder is deterministic (no AI or DB)");
} else {
  fail("Marketing strategy builder must remain deterministic");
}

const intents = listMarketingRecommendationIntents();
if (intents.length === 10) {
  pass("Marketing recommendation contracts cover all intents");
} else {
  fail(`Expected 10 marketing intents, found ${intents.length}`);
}

for (const intent of intents) {
  if (MARKETING_RECOMMENDATION_CONTRACTS[intent]?.purpose) {
    pass(`Contract defined for ${intent}`);
  } else {
    fail(`Missing contract for ${intent}`);
  }
}

const understanding = sampleUnderstanding({ direction: "consultative" });
const strategy = buildExecutiveStrategyFromUnderstanding({
  organizationId: "org-marketing-1",
  executiveUnderstanding: understanding,
});

if (strategy.marketingStrategy.executiveRecommendation?.whyThisAsset) {
  pass("Marketing strategy includes executive recommendation layer");
} else {
  fail("Marketing strategy missing executive recommendation");
}

if (strategy.marketingStrategy.recommendedPrimaryDeliverable) {
  pass("Executive Strategy includes marketing recommendation");
} else {
  fail("Executive Strategy missing marketing recommendation");
}

if (
  strategy.marketingStrategy.buyerProgressionGoal.currentStage &&
  strategy.marketingStrategy.buyerProgressionGoal.desiredNextStage
) {
  pass("Buyer progression goal defined");
} else {
  fail("Buyer progression goal missing");
}

const strategyRepeat = buildExecutiveStrategyFromUnderstanding({
  organizationId: "org-marketing-1",
  executiveUnderstanding: understanding,
});
if (
  strategy.marketingStrategy.marketingFingerprint ===
  strategyRepeat.marketingStrategy.marketingFingerprint
) {
  pass("Marketing recommendations are deterministic");
} else {
  fail("Marketing recommendations not deterministic");
}

const educational = buildExecutiveStrategyFromUnderstanding({
  organizationId: "org-marketing-1",
  executiveUnderstanding: sampleUnderstanding({
    direction: "educational",
    buyerStage: "aware",
    priority: "monitor",
  }),
});
const salesFirst = buildExecutiveStrategyFromUnderstanding({
  organizationId: "org-marketing-1",
  executiveUnderstanding: sampleUnderstanding({
    direction: "sales_first",
    buyerStage: "decision",
    priority: "immediate_action",
  }),
});

if (
  educational.marketingStrategy.recommendedPrimaryDeliverable !==
  salesFirst.marketingStrategy.recommendedPrimaryDeliverable
) {
  pass("Different contexts produce different marketing deliverables");
} else {
  fail("Marketing deliverables should vary by context");
}

const sharedCheck = validateSharedExecutiveStrategy([strategy, strategyRepeat]);
if (sharedCheck.consistent) {
  pass("Shared Executive Strategy validation includes marketing fingerprint");
} else {
  fail(`Shared strategy validation failed: ${sharedCheck.errors.join("; ")}`);
}

const orgMismatch = validateSharedExecutiveStrategy([
  strategy,
  buildExecutiveStrategyFromUnderstanding({
    organizationId: "org-other",
    executiveUnderstanding: sampleUnderstanding({ organizationId: "org-other" }),
  }),
]);
if (!orgMismatch.consistent) {
  pass("Organization isolation enforced in strategy validation");
} else {
  fail("Organization mismatch should fail validation");
}

const productionContext = buildStrategicBlueprintProductionContext(
  understanding,
  strategy,
);
if (
  productionContext.recommendedPrimaryDeliverable ===
  strategy.marketingStrategy.recommendedPrimaryDeliverable
) {
  pass("Blueprint production context uses marketing recommendation");
} else {
  fail("Blueprint production context drift from marketing strategy");
}

if (
  productionContext.preferredAssetType ===
  strategy.marketingStrategy.preferredImplementationType
) {
  pass("Blueprint preferred asset type comes from marketing strategy");
} else {
  fail("Blueprint asset type not aligned to marketing strategy");
}

const { marketingStrategy: _previous, ...executiveStrategyBase } = strategy;
const refreshCandidate = buildExecutiveMarketingStrategy({
  executiveStrategyBase,
  executiveUnderstanding: understanding,
});
const refreshed = applyMarketingStrategyRefresh({
  candidate: refreshCandidate,
  previous: strategy.marketingStrategy,
  understanding,
});
if (refreshed.refreshGuidance.preserveStrategy) {
  pass("Refresh preserves strategy when recommendation remains strongest");
} else {
  fail("Refresh should preserve strategy for unchanged fingerprint");
}

const promptBlock = formatExecutiveMarketingStrategyForPrompt(strategy);
const recommendationBlock = formatMarketingRecommendationForPrompt({
  primaryIntent: strategy.marketingStrategy.primaryIntent,
  supportingIntent: strategy.marketingStrategy.supportingIntent,
  primaryDeliverable: strategy.marketingStrategy.recommendedPrimaryDeliverable,
  supportingDeliverable: strategy.marketingStrategy.recommendedSupportingDeliverable,
});
if (
  promptBlock.includes("EXECUTIVE MARKETING STRATEGY") &&
  recommendationBlock.includes("EXECUTIVE MARKETING RECOMMENDATION")
) {
  pass("Marketing strategy and recommendation blocks formatted for prompts");
} else {
  fail("Prompt formatting blocks incomplete");
}

if (Object.keys(DELIVERABLE_IMPLEMENTATION).length >= 16) {
  pass("Deliverable implementation map covers marketing recommendations");
} else {
  fail("Deliverable implementation map incomplete");
}

if (
  coherenceServiceSource.includes("buildExecutiveMarketingStrategy") &&
  coherenceServiceSource.includes("formatMarketingRecommendationForPrompt")
) {
  pass("Coherence service exports marketing helpers");
} else {
  fail("Coherence service missing marketing exports");
}

console.log(`\nValidation complete. Failures: ${failures}`);

if (failures > 0) {
  process.exit(1);
}

console.log("\nAll Executive Marketing Strategy checks passed.");
