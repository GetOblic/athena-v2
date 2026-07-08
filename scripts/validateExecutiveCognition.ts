/**
 * Validation for Athena Executive Cognition Engine (Sprint 12).
 * Run: npx tsx scripts/validateExecutiveCognition.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildSampleExecutiveIntelligencePipeline,
  EXECUTIVE_INTELLIGENCE_VERSION,
} from "../services/brain/executiveIntelligenceHelpers";
import { EXECUTIVE_COGNITION_VERSION } from "../services/brain/executiveCognitionHelpers";
import { EXECUTIVE_REASONING_VERSION } from "../services/brain/executiveReasoningTypes";

const cognitionPath = join(process.cwd(), "services/brain/executiveCognitionHelpers.ts");
const intelligencePath = join(process.cwd(), "services/brain/executiveIntelligenceHelpers.ts");
const reasoningTypesPath = join(process.cwd(), "services/brain/executiveReasoningTypes.ts");
const reasoningBuilderPath = join(
  process.cwd(),
  "services/brain/executiveReasoningBuilder.ts",
);
const contractPath = join(
  process.cwd(),
  "services/brain/generationContracts/contractHelpers.ts",
);

const cognitionSource = readFileSync(cognitionPath, "utf8");
const intelligenceSource = readFileSync(intelligencePath, "utf8");
const typesSource = readFileSync(reasoningTypesPath, "utf8");
const builderSource = readFileSync(reasoningBuilderPath, "utf8");
const contractSource = readFileSync(contractPath, "utf8");

const cognitionLayers = [
  "executiveReflection",
  "executiveMemoryComparison",
  "marketPatternClassification",
  "strategicCritic",
  "generationObjectives",
  "reusabilityAssessment",
  "executiveDecisionDocument",
];

const cognitionTypes = [
  "ExecutiveCognitionLayers",
  "ExecutiveReflection",
  "ExecutiveMemoryComparison",
  "MarketPatternClassification",
  "StrategicCriticAssessment",
  "ContentGenerationObjectives",
  "ReusabilityAssessment",
  "ExecutiveDecisionDocument",
];

function runValidation() {
  if (!typesSource.includes(EXECUTIVE_REASONING_VERSION)) {
    throw new Error("Reasoning version must reflect cognition upgrade.");
  }

  if (EXECUTIVE_INTELLIGENCE_VERSION !== "executive_cognition_v1") {
    throw new Error("Intelligence pipeline version must be executive_cognition_v1.");
  }

  for (const typeName of cognitionTypes) {
    if (!typesSource.includes(`export type ${typeName}`)) {
      throw new Error(`Missing cognition type: ${typeName}`);
    }
  }

  if (!typesSource.includes("executiveCognition:")) {
    throw new Error("ExecutiveIntelligencePipeline must include executiveCognition.");
  }

  for (const fn of [
    "buildExecutiveReflection",
    "buildExecutiveMemoryComparison",
    "buildMarketPatternClassification",
    "applyStrategicCritic",
    "buildExecutiveDecisionDocument",
    "buildExecutiveCognitionLayers",
    "formatExecutiveCognitionForPrompt",
  ]) {
    if (!cognitionSource.includes(`export function ${fn}`)) {
      throw new Error(`Missing cognition function: ${fn}`);
    }
  }

  if (!intelligenceSource.includes("buildExecutiveCognitionLayers")) {
    throw new Error("Intelligence pipeline must integrate cognition layers.");
  }

  if (!builderSource.includes("buildExecutiveIntelligencePipeline")) {
    throw new Error("Reasoning builder must run cognition via intelligence pipeline.");
  }

  if (!contractSource.includes("Executive Decision Document")) {
    throw new Error("Generation contracts must require objective-first generation.");
  }

  const sample = buildSampleExecutiveIntelligencePipeline();
  for (const layer of cognitionLayers) {
    if (!(layer in sample.executiveCognition)) {
      throw new Error(`Sample missing cognition layer: ${layer}`);
    }
  }

  if (sample.executiveCognition.cognitionVersion !== EXECUTIVE_COGNITION_VERSION) {
    throw new Error("Sample cognition version mismatch.");
  }

  if (!sample.executiveCognition.executiveDecisionDocument.recommendedAssetType) {
    throw new Error("Executive Decision Document must specify recommended asset.");
  }

  console.log("Executive Cognition Engine validation passed.");
}

runValidation();
