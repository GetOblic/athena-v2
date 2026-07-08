/**
 * Validation for Executive Intelligence Refinement — Phase 1.
 * Run: npx tsx scripts/validateExecutiveIntelligence.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildSampleExecutiveIntelligencePipeline,
  EXECUTIVE_INTELLIGENCE_VERSION,
  formatExecutiveIntelligenceForPrompt,
  normalizeDiscussionPlatform,
} from "../services/brain/executiveIntelligenceHelpers";
import { EXECUTIVE_REASONING_VERSION } from "../services/brain/executiveReasoningTypes";
import { STRATEGIC_BLUEPRINT_SPECS_VERSION } from "../services/assetBlueprints/strategicBlueprintProductionSpecs";

const intelligencePath = join(
  process.cwd(),
  "services/brain/executiveIntelligenceHelpers.ts",
);
const reasoningTypesPath = join(
  process.cwd(),
  "services/brain/executiveReasoningTypes.ts",
);
const reasoningBuilderPath = join(
  process.cwd(),
  "services/brain/executiveReasoningBuilder.ts",
);
const marketingBuilderPath = join(
  process.cwd(),
  "services/brain/executiveCoherence/executiveMarketingStrategyBuilder.ts",
);
const workflowPath = join(process.cwd(), "services/workflows/discussionWorkflow.ts");
const learningPath = join(process.cwd(), "services/brain/learningService.ts");
const specsPath = join(
  process.cwd(),
  "services/assetBlueprints/strategicBlueprintProductionSpecs.ts",
);

const intelligenceSource = readFileSync(intelligencePath, "utf8");
const reasoningTypesSource = readFileSync(reasoningTypesPath, "utf8");
const reasoningBuilderSource = readFileSync(reasoningBuilderPath, "utf8");
const marketingBuilderSource = readFileSync(marketingBuilderPath, "utf8");
const workflowSource = readFileSync(workflowPath, "utf8");
const learningSource = readFileSync(learningPath, "utf8");
const specsSource = readFileSync(specsPath, "utf8");

const requiredPipelineStages = [
  "marketUnderstanding",
  "hiddenProblem",
  "buyerPsychology",
  "strategicDifferentiation",
  "contrarianThinking",
  "assetStrategy",
  "executiveRecommendation",
  "opportunityQuality",
  "suggestedOpportunityTitle",
];

const requiredTypes = [
  "ExecutiveIntelligencePipeline",
  "HiddenProblemAssessment",
  "BuyerPsychologyAssessment",
  "ContrarianThinkingAssessment",
  "AssetStrategyAssessment",
  "OpportunityQualityDimensions",
];

function runStaticValidation() {
  if (!reasoningTypesSource.includes(EXECUTIVE_REASONING_VERSION)) {
    throw new Error("Executive reasoning version must reflect intelligence upgrade.");
  }

  for (const typeName of requiredTypes) {
    if (!reasoningTypesSource.includes(`export type ${typeName}`)) {
      throw new Error(`Missing type: ${typeName}`);
    }
  }

  if (!reasoningTypesSource.includes("executiveIntelligence:")) {
    throw new Error("ExecutiveReasoning must include executiveIntelligence.");
  }

  for (const stage of requiredPipelineStages) {
    if (!intelligenceSource.includes(stage)) {
      throw new Error(`Executive intelligence pipeline missing stage: ${stage}`);
    }
  }

  if (!reasoningBuilderSource.includes("buildExecutiveIntelligencePipeline")) {
    throw new Error("Reasoning builder must run executive intelligence pipeline.");
  }

  if (!marketingBuilderSource.includes("preferredDeliverable")) {
    throw new Error("Marketing strategy must consume asset strategy from intelligence.");
  }

  if (!marketingBuilderSource.includes("executiveRecommendation")) {
    throw new Error("Marketing strategy must expose executive recommendation layer.");
  }

  if (!workflowSource.includes("computeCompositeOpportunityScoreFromAnalysis")) {
    throw new Error("Workflow must use composite opportunity scoring.");
  }

  if (!learningSource.includes("buildExecutiveLearningNotes")) {
    throw new Error("Learning service must capture executive intelligence on approval.");
  }

  if (!specsSource.includes("ExecutiveBlueprintSpecification")) {
    throw new Error("Blueprint specs must include executive specification fields.");
  }

  if (!specsSource.includes(STRATEGIC_BLUEPRINT_SPECS_VERSION)) {
    throw new Error("Blueprint specs version must reflect executive upgrade.");
  }

  if (!intelligenceSource.includes("buildExecutiveDecisionSynthesis")) {
    throw new Error("Intelligence pipeline must integrate decision synthesis.");
  }

  if (!intelligenceSource.includes("executiveDecisionSynthesis")) {
    throw new Error("Executive intelligence must include decision synthesis.");
  }

  const sample = buildSampleExecutiveIntelligencePipeline();
  if (!sample.executiveDecisionSynthesis?.selectedDecision) {
    throw new Error("Sample pipeline must include Executive Decision Synthesis.");
  }

  for (const stage of requiredPipelineStages) {
    if (!(stage in sample)) {
      throw new Error(`Sample pipeline missing stage: ${stage}`);
    }
  }

  const prompt = formatExecutiveIntelligenceForPrompt(sample);
  if (!prompt.includes("EXECUTIVE DECISION SYNTHESIS")) {
    throw new Error("Executive intelligence prompt must include decision synthesis.");
  }

  if (normalizeDiscussionPlatform("Facebook Groups") !== "facebook") {
    throw new Error("Platform normalization failed for Facebook.");
  }

  if (sample.pipelineVersion !== EXECUTIVE_INTELLIGENCE_VERSION) {
    throw new Error("Sample pipeline version mismatch.");
  }

  console.log("Executive Intelligence Phase 1 static validation passed.");
}

runStaticValidation();
