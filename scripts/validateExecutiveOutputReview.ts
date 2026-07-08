/**
 * Validation for Athena Executive Output Review Engine (Phase 13).
 * Run: npx tsx scripts/validateExecutiveOutputReview.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildStrategicBlueprintProductionContext } from "@/services/assetBlueprints/strategicBlueprintProductionSpecs";
import { buildExecutiveStrategyFromUnderstanding } from "@/services/brain/executiveCoherence/executiveStrategyBuilder";
import { buildSampleExecutiveInitiativeSelection } from "@/services/brain/executiveInitiativeSelectionHelpers";
import { buildSampleExecutiveIntelligencePipeline } from "@/services/brain/executiveIntelligenceHelpers";
import {
  buildExecutiveCampaignNarrative,
  buildSampleExecutiveOutputReview,
  EXECUTIVE_OUTPUT_REVIEW_VERSION,
  EXECUTIVE_QUALITY_MAX_REFINEMENT_PASSES,
  EXECUTIVE_QUALITY_MINIMUM_THRESHOLD,
  reviewGeneratedArtifact,
  runExecutiveOutputQualityGate,
} from "@/services/brain/executiveOutputReviewHelpers";
import { EXECUTIVE_UNDERSTANDING_VERSION } from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";

const reviewPath = join(process.cwd(), "services/brain/executiveOutputReviewHelpers.ts");
const understandingServicePath = join(
  process.cwd(),
  "services/brain/executiveUnderstandingService.ts",
);
const workflowPath = join(process.cwd(), "services/workflows/discussionWorkflow.ts");
const blueprintServicePath = join(
  process.cwd(),
  "services/assetBlueprints/assetBlueprintService.ts",
);

const reviewSource = readFileSync(reviewPath, "utf8");
const understandingServiceSource = readFileSync(understandingServicePath, "utf8");
const workflowSource = readFileSync(workflowPath, "utf8");
const blueprintServiceSource = readFileSync(blueprintServicePath, "utf8");

let failures = 0;

function pass(message: string) {
  console.log(`✓ ${message}`);
}

function fail(message: string) {
  failures += 1;
  console.error(`✗ ${message}`);
}

console.log("Executive Output Review Engine Validation\n");

if (reviewSource.includes("runExecutiveOutputQualityGate")) {
  pass("Executive output quality gate present");
} else {
  fail("Quality gate missing");
}

if (!understandingServiceSource.includes("runExecutiveOutputQualityGate")) {
  pass("Understanding bundle bypasses legacy executive output quality gate");
} else {
  fail("Understanding service still runs legacy executive output quality gate");
}

if (workflowSource.includes("runSimplifiedQualityGateLoop")) {
  pass("Workflow applies simplified quality gate before persistence");
} else {
  fail("Workflow missing simplified quality gate");
}

if (blueprintServiceSource.includes("generateBlueprintWithQualityGate")) {
  pass("Blueprint service applies quality gate before save");
} else {
  fail("Blueprint service missing quality gate");
}

if (reviewSource.includes("buildExecutiveCampaignNarrative")) {
  pass("Campaign narrative builder present");
} else {
  fail("Campaign narrative missing");
}

if (reviewSource.includes("WEBINAR") || reviewSource.includes("GENERIC_REJECTION_PATTERNS")) {
  pass("Generic pattern rejection implemented");
} else {
  fail("Generic rejection missing");
}

if (EXECUTIVE_QUALITY_MINIMUM_THRESHOLD === 9) {
  pass("Minimum acceptance threshold is 9");
} else {
  fail("Threshold mismatch");
}

if (EXECUTIVE_QUALITY_MAX_REFINEMENT_PASSES === 3) {
  pass("Maximum three refinement passes configured");
} else {
  fail("Refinement pass limit incorrect");
}

const sampleUnderstanding = {
  metadata: {
    generatedAt: new Date().toISOString(),
    organizationId: "org-review-1",
    discussionId: "disc-review-1",
    understandingVersion: EXECUTIVE_UNDERSTANDING_VERSION,
    reasoningVersion: "test",
    memoryEnriched: true,
    learningEnriched: false,
    degradationMode: "full" as const,
    understandingFingerprint: "review-test",
  },
  executiveSummary: {
    headline: "Career Readiness Assessment",
    narrative: "Buyers fear business failure after training.",
    primaryObjective: "Launch readiness diagnostic",
    discussionId: "disc-review-1",
    scope: "discussion" as const,
  },
  businessUnderstanding: {
    positioning: "PMU educator",
    voice: "Direct",
    expertise: "Training",
    website: null,
    homepageUnderstanding: null,
    businessConstraints: [],
    knowledgeCompleteness: 80,
    isBrainTrained: true,
    summary: "Trained",
  },
  marketUnderstanding: {
    buyerStage: "consideration",
    painPoints: ["Business readiness fear", "Program adequacy"],
    marketSignals: ["Buyer uncertainty"],
    recurringTerminology: ["PMU"],
    competitors: [],
    emergingThemes: [],
    discussionRelevance: "High",
    domainRelevance: "PMU",
    evidenceStrength: "moderate" as const,
    historicalEnrichmentAvailable: true,
  },
  strategicUnderstanding: {
    recommendedPositioning: "Outcome-focused",
    recommendedDirection: "consultative" as const,
    secondaryDirection: null,
    recommendedExecutiveAction: "Diagnostic first",
    recommendedDeploymentDirection: "Assessment-led",
    primaryExecutiveObjective: "Address readiness fear",
    rationale: ["Strong signals"],
  },
  opportunityUnderstanding: {
    businessOpportunity: "Career Readiness Assessment",
    businessAlignment: "high",
    executiveAlignment: "aligned",
    importance: "high_intent",
    supportingEvidence: ["Discussion"],
    historicalEvidence: [],
    historicalEvidenceAvailable: false,
  },
  riskUnderstanding: {
    overallRisk: "low" as const,
    signals: [],
    missingInformation: [],
    sparseHistory: false,
  },
  priorityUnderstanding: {
    level: "high_intent",
    rationale: ["Strong buyer signals"],
  },
  supportingEvidence: {
    entries: [{ source: "current_discussion", label: "Discussion", detail: "Pain", optional: false }],
    totalCount: 1,
    historicalCount: 0,
  },
  executiveIntelligence: buildSampleExecutiveIntelligencePipeline(),
  executiveInitiativeSelection: buildSampleExecutiveInitiativeSelection(),
};

const campaign = buildExecutiveCampaignNarrative(sampleUnderstanding);
const strategy = buildExecutiveStrategyFromUnderstanding({
  organizationId: "org-review-1",
  executiveUnderstanding: { ...sampleUnderstanding, executiveCampaignNarrative: campaign },
});

const gated = runExecutiveOutputQualityGate({
  brainContext: {
    organization: { id: "org-review-1", name: "Test" },
    scope: "discussion",
  } as never,
  executiveReasoning: { metadata: { reasoningVersion: "test" } } as never,
  executiveUnderstanding: sampleUnderstanding,
  executiveStrategy: strategy,
});

if (gated.executiveUnderstanding.executiveOutputReview) {
  pass("Quality gate attaches executive output review");
} else {
  fail("Missing output review on gated bundle");
}

if (gated.executiveUnderstanding.executiveCampaignNarrative?.coreInsight) {
  pass("Campaign narrative attached after quality gate");
} else {
  fail("Missing campaign narrative");
}

const genericReview = reviewGeneratedArtifact({
  bundle: gated,
  text: "Create a webinar and write a comprehensive guide for social media.",
  artifactType: "deployment_asset",
});

if (!genericReview.accepted && genericReview.rejections.length > 0) {
  pass("Generic deployment asset rejected");
} else {
  fail("Generic asset should be rejected");
}

const strongReview = reviewGeneratedArtifact({
  bundle: gated,
  text: [
    "The buying signal indicates technical uncertainty rather than educational need.",
    "Replace educational content with a production architecture teardown.",
    "Career Readiness Assessment converts uncertainty into qualified demand.",
    sampleUnderstanding.executiveIntelligence.hiddenProblem.hiddenMarketProblem,
  ].join(" "),
  artifactType: "strategic_blueprint",
  refinementPass: 2,
});

if (strongReview.categories.strategicBlueprint >= 8) {
  pass("Strong strategic output scores highly");
} else {
  fail("Strong output scoring too low");
}

const blueprintContext = buildStrategicBlueprintProductionContext(
  gated.executiveUnderstanding,
  gated.executiveStrategy,
);

if (blueprintContext.strategyFirst.highestProbabilityAction) {
  pass("Blueprint includes highest-probability action");
} else {
  fail("Blueprint missing highest-probability action");
}

if (buildSampleExecutiveOutputReview().reviewVersion === EXECUTIVE_OUTPUT_REVIEW_VERSION) {
  pass("Output review version constant valid");
} else {
  fail("Version constant mismatch");
}

if (EXECUTIVE_UNDERSTANDING_VERSION.includes("output_quality_gate")) {
  pass("Understanding version reflects quality gate");
} else {
  fail("Understanding version mismatch");
}

console.log(`\nValidation complete. Failures: ${failures}\n`);

if (failures > 0) {
  process.exit(1);
}

console.log("All Executive Output Review Engine checks passed.");
