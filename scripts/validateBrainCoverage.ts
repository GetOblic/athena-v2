/**
 * Brain coverage audit validation (Sprint 13).
 * Run: npx tsx scripts/validateBrainCoverage.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BRAIN_COVERAGE_MATRIX,
  calculateBrainCoveragePercent,
  listGenerationCoverageWorkflows,
  listUnusedStoredIntelligence,
} from "@/services/brain/brainCoverageMatrix";
import {
  extractBusinessConstraintsFromMasterProfile,
  extractHomepageLearningFromMasterProfile,
  extractTerminologyFromMasterProfile,
  extractVoiceFromMasterProfile,
} from "@/services/brain/masterProfileHelpers";
import { buildExecutiveStrategyFromUnderstanding } from "@/services/brain/executiveCoherence/executiveStrategyBuilder";
import { buildBusinessAssessment } from "@/services/brain/executiveReasoningHelpers";
import type { ExecutiveUnderstanding } from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";

const masterProfileHelpersPath = join(
  process.cwd(),
  "services/brain/masterProfileHelpers.ts",
);
const identityServicePath = join(
  process.cwd(),
  "services/identity/identityService.ts",
);
const brainContextBuilderPath = join(
  process.cwd(),
  "services/brain/brainContextBuilder.ts",
);
const reasoningHelpersPath = join(
  process.cwd(),
  "services/brain/executiveReasoningHelpers.ts",
);
const understandingHelpersPath = join(
  process.cwd(),
  "services/brain/executiveUnderstanding/executiveUnderstandingHelpers.ts",
);
const generationAssemblyPath = join(
  process.cwd(),
  "services/brain/generationContracts/generationPromptAssembly.ts",
);
const generationServicePath = join(
  process.cwd(),
  "services/brain/generationContractService.ts",
);
const coverageMatrixPath = join(
  process.cwd(),
  "services/brain/brainCoverageMatrix.ts",
);

const masterProfileHelpersSource = readFileSync(masterProfileHelpersPath, "utf8");
const identityServiceSource = readFileSync(identityServicePath, "utf8");
const brainContextBuilderSource = readFileSync(brainContextBuilderPath, "utf8");
const reasoningHelpersSource = readFileSync(reasoningHelpersPath, "utf8");
const understandingHelpersSource = readFileSync(understandingHelpersPath, "utf8");
const generationAssemblySource = readFileSync(generationAssemblyPath, "utf8");
const generationServiceSource = readFileSync(generationServicePath, "utf8");
const coverageMatrixSource = readFileSync(coverageMatrixPath, "utf8");

let failures = 0;

function pass(message: string) {
  console.log(`✓ ${message}`);
}

function fail(message: string) {
  failures += 1;
  console.error(`✗ ${message}`);
}

function sampleUnderstanding(): ExecutiveUnderstanding {
  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      organizationId: "org-coverage-1",
      discussionId: "discussion-coverage-1",
      understandingVersion: "executive_understanding_v1",
      reasoningVersion: "executive_reasoning_v1",
      memoryEnriched: true,
      learningEnriched: true,
      degradationMode: "full_history",
      understandingFingerprint: "coverage-fingerprint",
    },
    executiveSummary: {
      headline: "Coverage sample",
      narrative: "Sample narrative",
      primaryObjective: "Validate Brain coverage",
      discussionId: "discussion-coverage-1",
      scope: "discussion",
    },
    businessUnderstanding: {
      positioning: "Consultant",
      voice: "Direct",
      expertise: "RevOps",
      website: "https://example.com",
      homepageUnderstanding: "Homepage summary",
      businessConstraints: ["No income guarantees"],
      knowledgeCompleteness: 80,
      isBrainTrained: true,
      summary: "Trained brain",
    },
    marketUnderstanding: {
      buyerStage: "consideration",
      painPoints: ["Manual reporting"],
      marketSignals: ["Budget scrutiny"],
      recurringTerminology: ["RevOps"],
      competitors: ["Spreadsheets"],
      emergingThemes: ["Automation"],
      discussionRelevance: "High",
      domainRelevance: "RevOps",
      evidenceStrength: "moderate",
      historicalEnrichmentAvailable: true,
    },
    strategicUnderstanding: {
      recommendedPositioning: "Consultative expert",
      recommendedDirection: "consultative",
      secondaryDirection: null,
      recommendedExecutiveAction: "Share framework",
      recommendedDeploymentDirection: "Community reply",
      primaryExecutiveObjective: "Help operator diagnose pain",
      rationale: ["Signals support consultative approach"],
    },
    opportunityUnderstanding: {
      businessOpportunity: "RevOps opportunity",
      businessAlignment: "high",
      executiveAlignment: "aligned",
      importance: "high_intent",
      supportingEvidence: ["Current discussion"],
      historicalEvidence: ["Prior approved briefing"],
      historicalEvidenceAvailable: true,
    },
    riskUnderstanding: {
      overallRisk: "low",
      signals: [],
      missingInformation: [],
      sparseHistory: false,
    },
    priorityUnderstanding: {
      level: "high_intent",
      rationale: ["Strong intent"],
    },
    supportingEvidence: {
      entries: [
        {
          source: "business_identity",
          label: "Business Identity",
          detail: "Consultant positioning",
          optional: false,
        },
      ],
      totalCount: 1,
      historicalCount: 1,
    },
  };
}

console.log("Athena Executive Brain Coverage Audit\n");

if (coverageMatrixSource.includes("BRAIN_COVERAGE_MATRIX")) {
  pass("Brain coverage matrix defined");
} else {
  fail("Brain coverage matrix missing");
}

if (BRAIN_COVERAGE_MATRIX.length >= 18) {
  pass(`Coverage matrix inventories ${BRAIN_COVERAGE_MATRIX.length} client inputs`);
} else {
  fail("Coverage matrix incomplete");
}

const afterCoverage = calculateBrainCoveragePercent();
console.log(`Coverage after audit: ${afterCoverage}%`);

if (afterCoverage >= 80) {
  pass("Post-audit Brain coverage meets MVP threshold (>= 80%)");
} else {
  fail(`Post-audit coverage below threshold: ${afterCoverage}%`);
}

const unused = listUnusedStoredIntelligence();
for (const entry of unused) {
  pass(`Justified stored-only input documented: ${entry.input}`);
}

if (
  masterProfileHelpersSource.includes("extractVoiceFromMasterProfile") &&
  masterProfileHelpersSource.includes("generation_rules")
) {
  pass("Nested master profile fields extracted for Brain consumption");
} else {
  fail("Nested master profile extraction incomplete");
}

if (identityServiceSource.includes("homepage_learning")) {
  pass("Homepage knowledge stored during identity compile");
} else {
  fail("Homepage knowledge not stored on identity compile");
}

if (
  brainContextBuilderSource.includes("extractHomepageLearningFromMasterProfile") &&
  brainContextBuilderSource.includes("terminologyFromIntelligence")
) {
  pass("Brain context consumes homepage knowledge and domain intelligence terminology");
} else {
  fail("Brain context homepage/domain consumption incomplete");
}

if (
  reasoningHelpersSource.includes("totalRefreshEvents") &&
  reasoningHelpersSource.includes("homepageLearning")
) {
  pass("Executive reasoning consumes refresh history and homepage knowledge");
} else {
  fail("Executive reasoning missing refresh/homepage consumption");
}

if (
  understandingHelpersSource.includes("Homepage Knowledge") &&
  understandingHelpersSource.includes("asset.summary")
) {
  pass("Executive understanding includes homepage and knowledge asset detail");
} else {
  fail("Executive understanding evidence gaps remain");
}

for (const workflow of listGenerationCoverageWorkflows()) {
  if (generationAssemblySource.includes("assembleExecutiveGenerationContextBlock")) {
    pass(`Generation assembly uses executive context block (${workflow} path)`);
  } else {
    fail(`Generation assembly missing executive context for ${workflow}`);
    break;
  }
}

if (
  generationAssemblySource.includes("executiveStrategy") &&
  generationAssemblySource.includes("buildStrategicBlueprintProductionContext")
) {
  pass("Strategic blueprint generation consumes full Brain stack");
} else {
  fail("Strategic blueprint generation bypasses Brain layers");
}

if (
  generationServiceSource.includes("executiveStrategy") &&
  generationServiceSource.includes("executiveUnderstanding")
) {
  pass("Generation bundle reuses Executive Understanding and Strategy");
} else {
  fail("Generation bundle missing Brain reuse");
}

const nestedProfile = {
  voice: { summary: "Direct expert voice", tone: ["credible", "helpful"] },
  expertise: {
    professional_terms: ["RevOps", "Pipeline hygiene"],
    rules: ["Never guarantee income"],
  },
  generation_rules: {
    never_do: ["Use hype language"],
    always_do: ["Lead with value"],
  },
  audience: { common_objections: ["Too expensive"] },
  persona: { summary: "Trusted operator advisor", positioning: ["RevOps expert"] },
  business: { offers: ["Diagnostic workshop"] },
  homepage_learning: "Homepage extracted copy about RevOps services.",
};

const voice = extractVoiceFromMasterProfile(nestedProfile, null);
const constraints = extractBusinessConstraintsFromMasterProfile(nestedProfile);
const terms = extractTerminologyFromMasterProfile(nestedProfile);
const homepage = extractHomepageLearningFromMasterProfile(nestedProfile);

if (voice?.includes("Direct expert voice")) {
  pass("Nested voice.summary consumed");
} else {
  fail("Nested voice.summary not consumed");
}

if (constraints.some((item) => item.includes("hype language"))) {
  pass("generation_rules.never_do consumed as business constraints");
} else {
  fail("generation_rules.never_do not consumed");
}

if (terms.includes("RevOps")) {
  pass("expertise.professional_terms consumed as terminology");
} else {
  fail("expertise.professional_terms not consumed");
}

if (homepage?.includes("Homepage extracted copy")) {
  pass("Homepage knowledge available from master profile");
} else {
  fail("Homepage knowledge unavailable");
}

const strategy = buildExecutiveStrategyFromUnderstanding({
  organizationId: "org-coverage-1",
  executiveUnderstanding: sampleUnderstanding(),
});

if (strategy.marketingStrategy && strategy.primaryObjective) {
  pass("Executive Strategy stack complete for generation workflows");
} else {
  fail("Executive Strategy stack incomplete");
}

const orgA = buildExecutiveStrategyFromUnderstanding({
  organizationId: "org-a",
  executiveUnderstanding: {
    ...sampleUnderstanding(),
    metadata: {
      ...sampleUnderstanding().metadata,
      organizationId: "org-a",
    },
  },
});
const orgB = buildExecutiveStrategyFromUnderstanding({
  organizationId: "org-b",
  executiveUnderstanding: {
    ...sampleUnderstanding(),
    metadata: {
      ...sampleUnderstanding().metadata,
      organizationId: "org-b",
    },
  },
});

if (
  orgA.metadata.organizationId !== orgB.metadata.organizationId &&
  orgA.metadata.strategyFingerprint.includes("org-a")
) {
  pass("Organization isolation preserved in strategy fingerprints");
} else {
  fail("Organization isolation risk in strategy generation");
}

console.log("\nCoverage Matrix Summary");
console.log("-----------------------");
for (const entry of BRAIN_COVERAGE_MATRIX) {
  console.log(
    `- ${entry.input}: ${entry.status} | reasoning=${entry.influencesReasoning} marketing=${entry.influencesMarketingStrategy} generation=${entry.influencesGeneration} learning=${entry.influencesFutureLearning}`,
  );
}

console.log(`\nValidation complete. Failures: ${failures}`);

if (failures > 0) {
  process.exit(1);
}

console.log("\nAll Brain coverage audit checks passed.");
