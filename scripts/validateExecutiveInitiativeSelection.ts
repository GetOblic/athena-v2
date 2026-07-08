/**
 * Validation for Athena Executive Initiative Selection Engine (Sprint 14).
 * Run: npx tsx scripts/validateExecutiveInitiativeSelection.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildStrategicBlueprintProductionContext } from "@/services/assetBlueprints/strategicBlueprintProductionSpecs";
import { buildExecutiveStrategyFromUnderstanding } from "@/services/brain/executiveCoherence/executiveStrategyBuilder";
import {
  buildSampleExecutiveInitiativeSelection,
  EXECUTIVE_INITIATIVE_LIBRARY,
  EXECUTIVE_INITIATIVE_SELECTION_VERSION,
  syncIntelligenceWithInitiativeSelection,
} from "@/services/brain/executiveInitiativeSelectionHelpers";
import { buildSampleExecutiveIntelligencePipeline } from "@/services/brain/executiveIntelligenceHelpers";
import { EXECUTIVE_REASONING_VERSION } from "@/services/brain/executiveReasoningTypes";
import { EXECUTIVE_UNDERSTANDING_VERSION } from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";

const initiativePath = join(
  process.cwd(),
  "services/brain/executiveInitiativeSelectionHelpers.ts",
);
const understandingBuilderPath = join(
  process.cwd(),
  "services/brain/executiveUnderstanding/executiveUnderstandingBuilder.ts",
);
const blueprintPath = join(
  process.cwd(),
  "services/assetBlueprints/strategicBlueprintProductionSpecs.ts",
);
const learningPath = join(process.cwd(), "services/brain/learningService.ts");
const workflowPath = join(process.cwd(), "services/workflows/discussionWorkflow.ts");
const contractPath = join(
  process.cwd(),
  "services/brain/generationContracts/contractHelpers.ts",
);

const initiativeSource = readFileSync(initiativePath, "utf8");
const understandingSource = readFileSync(understandingBuilderPath, "utf8");
const blueprintSource = readFileSync(blueprintPath, "utf8");
const learningSource = readFileSync(learningPath, "utf8");
const workflowSource = readFileSync(workflowPath, "utf8");
const contractSource = readFileSync(contractPath, "utf8");

let failures = 0;

function pass(message: string) {
  console.log(`✓ ${message}`);
}

function fail(message: string) {
  failures += 1;
  console.error(`✗ ${message}`);
}

console.log("Executive Initiative Selection Engine Validation\n");

if (initiativeSource.includes("buildExecutiveInitiativeSelection")) {
  pass("Initiative selection builder present");
} else {
  fail("Initiative selection builder missing");
}

if (understandingSource.includes("buildExecutiveInitiativeSelection")) {
  pass("Executive Understanding integrates initiative selection after understanding");
} else {
  fail("Understanding builder missing initiative integration");
}

if (understandingSource.includes("syncIntelligenceWithInitiativeSelection")) {
  pass("Intelligence synced from selected initiative");
} else {
  fail("Intelligence sync missing");
}

if (EXECUTIVE_INITIATIVE_LIBRARY.length >= 15) {
  pass(`Executive initiative library has ${EXECUTIVE_INITIATIVE_LIBRARY.length} archetypes`);
} else {
  fail("Initiative library too small");
}

if (initiativeSource.includes("WEBINAR_BIAS_PENALTY")) {
  pass("Webinar bias penalty implemented");
} else {
  fail("Webinar bias penalty missing");
}

if (initiativeSource.includes("buildBusinessBeforeContentAssessment")) {
  pass("Business-before-content gate implemented");
} else {
  fail("Business-before-content gate missing");
}

if (blueprintSource.includes("StrategyFirstBlueprintSpecification")) {
  pass("Strategic blueprint leads with strategy specification");
} else {
  fail("Strategy-first blueprint missing");
}

if (learningSource.includes("executiveInitiativeSelection")) {
  pass("Learning captures executive initiative selection");
} else {
  fail("Learning missing initiative metadata");
}

if (workflowSource.includes("executiveInitiativeSelection")) {
  pass("Opportunity creation consumes executive initiative");
} else {
  fail("Workflow missing initiative for opportunity title");
}

if (contractSource.includes("Executive Initiative Selection")) {
  pass("Generation contracts bind to executive initiative");
} else {
  fail("Contracts missing initiative binding");
}

const sample = buildSampleExecutiveInitiativeSelection();

if (sample.selectedInitiative.initiativeLabel) {
  pass("Sample includes selected executive initiative");
} else {
  fail("Sample missing selected initiative");
}

if (sample.eliminated.length > 0) {
  pass("Sample includes rejected initiatives");
} else {
  fail("Sample missing rejected initiatives");
}

if (sample.candidatesGenerated >= 8) {
  pass("Multi-candidate initiative evaluation demonstrated");
} else {
  fail("Insufficient initiative candidates in sample");
}

if (sample.decisionTrace.webinarBiasChecked) {
  pass("Decision trace records webinar bias check");
} else {
  fail("Webinar bias check not recorded");
}

if (sample.implementationStrategy.implementationDeliverable) {
  pass("Implementation strategy derived from initiative");
} else {
  fail("Implementation strategy missing");
}

const synced = syncIntelligenceWithInitiativeSelection({
  intelligence: buildSampleExecutiveIntelligencePipeline(),
  initiativeSelection: sample,
  organizationId: "org-initiative-test",
});

if (synced.suggestedOpportunityTitle === sample.selectedInitiative.initiativeLabel) {
  pass("Synced intelligence uses initiative as opportunity title");
} else {
  fail("Intelligence sync did not update opportunity title");
}

if (
  synced.executiveDecisionSynthesis.selectedDecision.chosenStrategyLabel ===
  sample.selectedInitiative.initiativeLabel
) {
  pass("Decision synthesis inherits initiative label");
} else {
  fail("Decision synthesis not synced to initiative");
}

if (EXECUTIVE_UNDERSTANDING_VERSION.includes("initiative_selection")) {
  pass("Understanding version reflects initiative selection");
} else {
  fail("Understanding version mismatch");
}

if (EXECUTIVE_REASONING_VERSION.includes("initiative_selection")) {
  pass("Reasoning version reflects initiative selection");
} else {
  fail("Reasoning version mismatch");
}

if (buildSampleExecutiveInitiativeSelection().selectionVersion === EXECUTIVE_INITIATIVE_SELECTION_VERSION) {
  pass("Initiative selection version constant valid");
} else {
  fail("Initiative selection version mismatch");
}

const sampleUnderstanding = {
  metadata: {
    generatedAt: new Date().toISOString(),
    organizationId: "org-init-a",
    discussionId: "disc-init-a",
    understandingVersion: EXECUTIVE_UNDERSTANDING_VERSION,
    reasoningVersion: EXECUTIVE_REASONING_VERSION,
    memoryEnriched: false,
    learningEnriched: false,
    degradationMode: "identity_and_current_only" as const,
    understandingFingerprint: "init-test",
  },
  executiveSummary: {
    headline: "Career Readiness Assessment",
    narrative: "Buyers fear business failure after training.",
    primaryObjective: "Launch readiness diagnostic",
    discussionId: "disc-init-a",
    scope: "discussion" as const,
  },
  businessUnderstanding: {
    positioning: "PMU educator",
    voice: "Credible",
    expertise: "Permanent makeup training",
    website: null,
    homepageUnderstanding: null,
    businessConstraints: [],
    knowledgeCompleteness: 75,
    isBrainTrained: true,
    summary: "PMU training provider",
  },
  marketUnderstanding: {
    buyerStage: "consideration",
    painPoints: ["Business readiness fear"],
    marketSignals: ["Program adequacy questions"],
    recurringTerminology: ["PMU", "career"],
    competitors: [],
    emergingThemes: [],
    discussionRelevance: "High",
    domainRelevance: "PMU education",
    evidenceStrength: "moderate" as const,
    historicalEnrichmentAvailable: false,
  },
  strategicUnderstanding: {
    recommendedPositioning: "Outcome-focused educator",
    recommendedDirection: "consultative" as const,
    secondaryDirection: null,
    recommendedExecutiveAction: "Launch diagnostic",
    recommendedDeploymentDirection: "Assessment-first",
    primaryExecutiveObjective: "Address business readiness fear",
    rationale: ["Buyers need readiness proof"],
  },
  opportunityUnderstanding: {
    businessOpportunity: "Career Readiness Assessment",
    businessAlignment: "high",
    executiveAlignment: "aligned",
    importance: "high_intent",
    supportingEvidence: ["Discussion signals"],
    historicalEvidence: [],
    historicalEvidenceAvailable: false,
  },
  riskUnderstanding: {
    overallRisk: "low" as const,
    signals: [],
    missingInformation: [],
    sparseHistory: true,
  },
  priorityUnderstanding: {
    level: "high_intent",
    rationale: ["Strong buyer signals"],
  },
  supportingEvidence: { entries: [], totalCount: 0, historicalCount: 0 },
  executiveIntelligence: synced,
  executiveInitiativeSelection: sample,
};

const strategy = buildExecutiveStrategyFromUnderstanding({
  organizationId: "org-init-a",
  executiveUnderstanding: sampleUnderstanding,
});

if (
  strategy.marketingStrategy.recommendedPrimaryDeliverable ===
  sample.implementationStrategy.implementationDeliverable
) {
  pass("Marketing strategy inherits initiative implementation deliverable");
} else {
  fail("Marketing strategy not aligned to initiative implementation");
}

const blueprintContext = buildStrategicBlueprintProductionContext(
  sampleUnderstanding,
  strategy,
);

if (blueprintContext.strategyFirst.executiveInitiative === sample.selectedInitiative.initiativeLabel) {
  pass("Blueprint strategy-first section uses selected initiative");
} else {
  fail("Blueprint missing initiative in strategy-first section");
}

if (!blueprintContext.strategyFirst.implementationRoadmap.length) {
  fail("Blueprint missing implementation roadmap");
} else {
  pass("Blueprint includes implementation roadmap");
}

console.log(`\nValidation complete. Failures: ${failures}\n`);

if (failures > 0) {
  process.exit(1);
}

console.log("All Executive Initiative Selection Engine checks passed.");
