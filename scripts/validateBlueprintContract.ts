/**
 * Run: npx tsx scripts/validateBlueprintContract.ts
 */

import {
  normalizeStrategicBlueprintArtifact,
  validateStrategicBlueprintArtifact,
} from "@/services/assetBlueprints/strategicBlueprintArtifactContract";
import { buildStrategicBlueprintProductionContext } from "@/services/assetBlueprints/strategicBlueprintProductionSpecs";
import { buildExecutiveStrategyFromUnderstanding } from "@/services/brain/executiveCoherence/executiveStrategyBuilder";
import { buildSampleExecutiveInitiativeSelection } from "@/services/brain/executiveInitiativeSelectionHelpers";
import { buildSampleExecutiveIntelligencePipeline } from "@/services/brain/executiveIntelligenceHelpers";
import { ensureExecutiveRecommendation } from "@/services/brain/executiveCoherence/executiveRecommendationContracts";
import { EXECUTIVE_UNDERSTANDING_VERSION } from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";

let failures = 0;

function pass(message: string) {
  console.log(`✓ ${message}`);
}

function fail(message: string) {
  failures += 1;
  console.error(`✗ ${message}`);
}

console.log("Strategic Blueprint Contract Validation\n");

const normalized = normalizeStrategicBlueprintArtifact({
  asset_title: "Readiness Assessment",
  asset_type: "diagnostic_checklist",
  business_goal: "Increase qualified replies",
  target_audience: "High-intent buyers",
  notes: { whyThisAsset: "Buyers need proof before committing." },
  pdf_prompt: "Generate a 2-page diagnostic.",
});

if (normalized.asset_title && normalized.notes.includes("Why this asset")) {
  pass("Blueprint normalizer handles notes.whyThisAsset object shape");
} else {
  fail("Blueprint normalizer failed notes.whyThisAsset handling");
}

const invalid = validateStrategicBlueprintArtifact({});
if (!invalid.valid && invalid.errors.length > 0) {
  pass("Invalid blueprint returns validation failure instead of throwing");
} else {
  fail("Invalid blueprint should fail validation");
}

const recommendation = ensureExecutiveRecommendation(undefined, {
  initiativeLabel: "Proof-led diagnostic",
  rationale: "Addresses stated objection with evidence.",
  assetType: "diagnostic_checklist",
});

if (recommendation.whyThisAsset.trim()) {
  pass("whyThisAsset fallback-safe via ensureExecutiveRecommendation");
} else {
  fail("whyThisAsset fallback missing");
}

const sampleUnderstanding = {
  metadata: {
    organizationId: "org-test",
    discussionId: "discussion-test",
    understandingFingerprint: "fp-test",
    understandingVersion: EXECUTIVE_UNDERSTANDING_VERSION,
    generatedAt: new Date().toISOString(),
    learningEnriched: false,
  },
  executiveSummary: {
    headline: "Proof-led diagnostic",
    primaryObjective: "Increase qualified replies",
    keySignals: ["High intent"],
    confidence: 80,
  },
  businessUnderstanding: {
    voice: "Professional",
    positioning: "Operator-led",
    isBrainTrained: true,
  },
  marketUnderstanding: {
    buyerStage: "consideration",
    painPoints: ["Uncertainty"],
    recurringTerminology: ["ROI"],
    discussionMaturity: "active",
  },
  strategicUnderstanding: {
    recommendedDirection: "consultative",
    recommendedExecutiveAction: "Publish proof asset",
    recommendedDeploymentDirection: "community",
    primaryExecutiveObjective: "Win this opportunity",
  },
  opportunityUnderstanding: {
    businessOpportunity: "Qualified demand",
    opportunityReason: "Active evaluation",
    urgency: "high",
  },
  priorityUnderstanding: {
    level: "high_intent",
    rationale: ["Buyer asked directly"],
  },
  riskUnderstanding: {
    level: "medium",
    reasons: ["Missing budget signal"],
  },
  supportingEvidence: { entries: [], totalCount: 0 },
  executiveIntelligence: buildSampleExecutiveIntelligencePipeline(),
  executiveInitiativeSelection: buildSampleExecutiveInitiativeSelection(),
} as const;

const strategy = buildExecutiveStrategyFromUnderstanding({
  organizationId: "org-test",
  discussionId: "discussion-test",
  executiveUnderstanding: sampleUnderstanding,
});

try {
  const context = buildStrategicBlueprintProductionContext(
    sampleUnderstanding,
    strategy,
  );
  if (context.executiveSpecification.assetSelectionReason) {
    pass("Production context builds without whyThisAsset TypeError");
  } else {
    fail("Production context missing asset selection reason");
  }
} catch (error) {
  fail(`Production context threw: ${error instanceof Error ? error.message : String(error)}`);
}

console.log(`\nValidation complete. Failures: ${failures}\n`);

if (failures > 0) {
  process.exit(1);
}

console.log("All Strategic Blueprint contract checks passed.");
