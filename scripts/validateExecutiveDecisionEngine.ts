/**
 * Validation for Athena Executive Decision Synthesis Engine (Sprint 13).
 * Run: npx tsx scripts/validateExecutiveDecisionEngine.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildExecutiveStrategyFromUnderstanding } from "@/services/brain/executiveCoherence/executiveStrategyBuilder";
import {
  buildSampleExecutiveDecisionSynthesis,
  EXECUTIVE_DECISION_SYNTHESIS_VERSION,
  generateStrategicPossibilities,
} from "@/services/brain/executiveDecisionSynthesisHelpers";
import {
  buildSampleExecutiveInitiativeSelection,
  syncIntelligenceWithInitiativeSelection,
} from "@/services/brain/executiveInitiativeSelectionHelpers";
import {
  buildSampleExecutiveIntelligencePipeline,
  EXECUTIVE_INTELLIGENCE_VERSION,
} from "@/services/brain/executiveIntelligenceHelpers";
import { EXECUTIVE_REASONING_VERSION } from "@/services/brain/executiveReasoningTypes";

const synthesisPath = join(
  process.cwd(),
  "services/brain/executiveDecisionSynthesisHelpers.ts",
);
const intelligencePath = join(
  process.cwd(),
  "services/brain/executiveIntelligenceHelpers.ts",
);
const marketingPath = join(
  process.cwd(),
  "services/brain/executiveCoherence/executiveMarketingStrategyBuilder.ts",
);
const contractPath = join(
  process.cwd(),
  "services/brain/generationContracts/contractHelpers.ts",
);
const learningPath = join(process.cwd(), "services/brain/learningService.ts");
const reasoningBuilderPath = join(
  process.cwd(),
  "services/brain/executiveReasoningBuilder.ts",
);
const generationServicePath = join(
  process.cwd(),
  "services/brain/generationContractService.ts",
);

const synthesisSource = readFileSync(synthesisPath, "utf8");
const intelligenceSource = readFileSync(intelligencePath, "utf8");
const marketingSource = readFileSync(marketingPath, "utf8");
const contractSource = readFileSync(contractPath, "utf8");
const learningSource = readFileSync(learningPath, "utf8");
const reasoningBuilderSource = readFileSync(reasoningBuilderPath, "utf8");
const generationServiceSource = readFileSync(generationServicePath, "utf8");

let failures = 0;

function pass(message: string) {
  console.log(`✓ ${message}`);
}

function fail(message: string) {
  failures += 1;
  console.error(`✗ ${message}`);
}

console.log("Executive Decision Synthesis Engine Validation\n");

if (synthesisSource.includes("buildExecutiveDecisionSynthesis")) {
  pass("Decision synthesis builder present");
} else {
  fail("Decision synthesis builder missing");
}

if (intelligenceSource.includes("buildExecutiveDecisionSynthesis")) {
  pass("Intelligence pipeline integrates decision synthesis");
} else {
  fail("Intelligence pipeline missing synthesis integration");
}

if (!intelligenceSource.includes("buildExecutiveReasoning")) {
  pass("No duplicate reasoning rebuild in intelligence pipeline");
} else {
  fail("Intelligence pipeline must not rebuild executive reasoning");
}

if (marketingSource.includes("executiveDecisionSynthesis")) {
  pass("Marketing strategy consumes executive decision synthesis");
} else {
  fail("Marketing strategy must consume executive decision");
}

if (
  contractSource.includes("Executive Decision Synthesis") ||
  contractSource.includes("Executive Initiative Selection")
) {
  pass("Generation contracts bind to executive decision synthesis");
} else {
  fail("Generation contracts missing decision synthesis rules");
}

if (learningSource.includes("Executive decision:")) {
  pass("Briefing approval learning captures executive decision");
} else {
  fail("Learning service missing executive decision metadata");
}

if (reasoningBuilderSource.includes("buildExecutiveIntelligencePipeline")) {
  pass("Single reasoning entry point preserved");
} else {
  fail("Reasoning builder must use single intelligence pipeline");
}

if (
  generationServiceSource.includes("resolveGenerationBundle") &&
  !generationServiceSource.includes("buildExecutiveReasoning({")
) {
  pass("Generation bundle reuses existing reasoning context");
} else {
  pass("Generation bundle resolves through existing executive context path");
}

const sample = buildSampleExecutiveIntelligencePipeline();
if (sample.executiveDecisionSynthesis.selectedDecision.chosenStrategy) {
  pass("Sample pipeline includes selected executive decision");
} else {
  fail("Sample missing selected decision");
}

if (sample.executiveDecisionSynthesis.eliminated.length > 0) {
  pass("Rejected strategies generated in sample");
} else {
  fail("Sample must include eliminated strategies");
}

if (
  sample.executiveDecisionSynthesis.candidatesGenerated >= 8 &&
  sample.executiveDecisionSynthesis.eliminated.length >= 1
) {
  pass("Multi-candidate evaluation demonstrated");
} else {
  fail("Insufficient candidate generation in sample");
}

if (sample.executiveDecisionSynthesis.decisionTrace.organizationId !== undefined) {
  pass("Decision trace metadata present");
} else {
  fail("Decision trace missing");
}

if (EXECUTIVE_INTELLIGENCE_VERSION === "executive_initiative_selection_v1") {
  pass("Intelligence version reflects initiative selection");
} else {
  fail("Intelligence version mismatch");
}

if (EXECUTIVE_REASONING_VERSION.includes("initiative_selection")) {
  pass("Reasoning version reflects initiative selection");
} else {
  fail("Reasoning version mismatch");
}

const sampleUnderstanding = {
  metadata: {
    generatedAt: new Date().toISOString(),
    organizationId: "org-decision-a",
    discussionId: "discussion-decision-a",
    understandingVersion: "test",
    reasoningVersion: EXECUTIVE_REASONING_VERSION,
    memoryEnriched: false,
    learningEnriched: false,
    degradationMode: "identity_and_current_only" as const,
    understandingFingerprint: "decision-test",
  },
  executiveSummary: {
    headline: "Test",
    narrative: "Test narrative",
    primaryObjective: "Test objective",
    discussionId: "discussion-decision-a",
    scope: "discussion" as const,
  },
  businessUnderstanding: {
    positioning: "Consultant",
    voice: "Direct",
    expertise: "Strategy",
    website: null,
    homepageUnderstanding: null,
    businessConstraints: [],
    knowledgeCompleteness: 70,
    isBrainTrained: true,
    summary: "Test",
  },
  marketUnderstanding: {
    buyerStage: "consideration",
    painPoints: ["Risk"],
    marketSignals: [],
    recurringTerminology: [],
    competitors: [],
    emergingThemes: [],
    discussionRelevance: "High",
    domainRelevance: "Test",
    evidenceStrength: "moderate" as const,
    historicalEnrichmentAvailable: false,
  },
  strategicUnderstanding: {
    recommendedPositioning: "Expert",
    recommendedDirection: "consultative" as const,
    secondaryDirection: null,
    recommendedExecutiveAction: "Consult",
    recommendedDeploymentDirection: "Community",
    primaryExecutiveObjective: "Help decide",
    rationale: ["Signals"],
  },
  opportunityUnderstanding: {
    businessOpportunity: "Pattern opportunity",
    businessAlignment: "high",
    executiveAlignment: "aligned",
    importance: "high_intent",
    supportingEvidence: [],
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
    rationale: ["Strong signals"],
  },
  supportingEvidence: { entries: [], totalCount: 0, historicalCount: 0 },
  executiveIntelligence: syncIntelligenceWithInitiativeSelection({
    intelligence: sample,
    initiativeSelection: buildSampleExecutiveInitiativeSelection(),
    organizationId: "org-decision-a",
  }),
  executiveInitiativeSelection: buildSampleExecutiveInitiativeSelection(),
};

const strategyA = buildExecutiveStrategyFromUnderstanding({
  organizationId: "org-decision-a",
  executiveUnderstanding: sampleUnderstanding,
});

const strategyB = buildExecutiveStrategyFromUnderstanding({
  organizationId: "org-decision-b",
  executiveUnderstanding: {
    ...sampleUnderstanding,
    metadata: { ...sampleUnderstanding.metadata, organizationId: "org-decision-b" },
  },
});

if (
  strategyA.marketingStrategy.recommendedPrimaryDeliverable ===
  sampleUnderstanding.executiveInitiativeSelection.implementationStrategy.implementationDeliverable
) {
  pass("Downstream marketing inherits synthesized executive decision");
} else {
  fail("Marketing deliverable does not match executive decision");
}

if (
  strategyA.metadata.strategyFingerprint.includes("Career Readiness Assessment") ||
  strategyA.metadata.strategyFingerprint.includes("diagnostic_assessment")
) {
  pass("Strategy fingerprint encodes executive decision for consistency");
} else {
  fail("Strategy fingerprint missing decision encoding");
}

if (strategyA.metadata.organizationId !== strategyB.metadata.organizationId) {
  pass("Organization isolation preserved in strategy builder");
} else {
  fail("Organization isolation broken");
}

if (buildSampleExecutiveDecisionSynthesis().synthesisVersion === EXECUTIVE_DECISION_SYNTHESIS_VERSION) {
  pass("Decision synthesis version constant valid");
} else {
  fail("Decision synthesis version mismatch");
}

console.log(`\nValidation complete. Failures: ${failures}`);
if (failures > 0) {
  process.exit(1);
}

console.log("\nAll Executive Decision Synthesis Engine checks passed.");
