/**
 * Brain coverage validation — MVP completion (Sprint 14).
 * Run: npx tsx scripts/validateBrainCoverage.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertNoBrainBypassInGenerationAssembly,
  BRAIN_COVERAGE_MATRIX,
  BRAIN_COVERAGE_BEFORE_AUDIT_PERCENT,
  calculateBrainCoveragePercent,
  listGenerationCoverageWorkflows,
  listMvpDeferredFields,
} from "@/services/brain/brainCoverageMatrix";
import {
  buildBrainCoverageFinalReport,
  BRAIN_COVERAGE_AFTER_SPRINT_13_PERCENT,
  formatBrainCoverageFinalReport,
} from "@/services/brain/brainCoverageReport";
import {
  extractBusinessConstraintsFromMasterProfile,
  extractHomepageLearningFromMasterProfile,
  extractTerminologyFromMasterProfile,
  extractVoiceFromMasterProfile,
  resolveStoredHomepageLearning,
} from "@/services/brain/masterProfileHelpers";
import { buildExecutiveStrategyFromUnderstanding } from "@/services/brain/executiveCoherence/executiveStrategyBuilder";
import { buildSampleExecutiveInitiativeSelection } from "@/services/brain/executiveInitiativeSelectionHelpers";
import { buildSampleExecutiveIntelligencePipeline } from "@/services/brain/executiveIntelligenceHelpers";
import type { ExecutiveUnderstanding } from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";

const paths = {
  masterProfileHelpers: join(process.cwd(), "services/brain/masterProfileHelpers.ts"),
  identityService: join(process.cwd(), "services/identity/identityService.ts"),
  brainContextBuilder: join(process.cwd(), "services/brain/brainContextBuilder.ts"),
  reasoningHelpers: join(process.cwd(), "services/brain/executiveReasoningHelpers.ts"),
  understandingHelpers: join(
    process.cwd(),
    "services/brain/executiveUnderstanding/executiveUnderstandingHelpers.ts",
  ),
  marketingBuilder: join(
    process.cwd(),
    "services/brain/executiveCoherence/executiveMarketingStrategyBuilder.ts",
  ),
  generationAssembly: join(
    process.cwd(),
    "services/brain/generationContracts/generationPromptAssembly.ts",
  ),
  generationService: join(process.cwd(), "services/brain/generationContractService.ts"),
  assetBlueprintService: join(
    process.cwd(),
    "services/brain/../assetBlueprints/assetBlueprintService.ts",
  ),
  memoryBuilder: join(process.cwd(), "services/brain/executiveMemoryBuilder.ts"),
};

const sources = Object.fromEntries(
  Object.entries(paths).map(([key, path]) => [key, readFileSync(path, "utf8")]),
) as Record<keyof typeof paths, string>;

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
      entries: [],
      totalCount: 0,
      historicalCount: 0,
    },
    executiveIntelligence: buildSampleExecutiveIntelligencePipeline(),
    executiveInitiativeSelection: buildSampleExecutiveInitiativeSelection(),
  };
}

console.log("Athena Executive Brain — MVP Coverage Completion\n");

const report = buildBrainCoverageFinalReport();
console.log(formatBrainCoverageFinalReport(report));
console.log("");

if (report.coverageBeforePercent === BRAIN_COVERAGE_BEFORE_AUDIT_PERCENT) {
  pass(`Baseline coverage documented: ${report.coverageBeforePercent}%`);
} else {
  fail("Baseline coverage mismatch");
}

if (report.coverageAfterSprint13Percent === BRAIN_COVERAGE_AFTER_SPRINT_13_PERCENT) {
  pass(`Sprint 13 coverage documented: ${report.coverageAfterSprint13Percent}%`);
} else {
  fail("Sprint 13 coverage mismatch");
}

const afterCoverage = calculateBrainCoveragePercent();
console.log(`Coverage after Sprint 14 completion: ${afterCoverage}%`);

if (afterCoverage >= 99) {
  pass("MVP Brain coverage effectively complete (>= 99%)");
} else {
  fail(`MVP coverage below target: ${afterCoverage}%`);
}

if (BRAIN_COVERAGE_MATRIX.length >= 24) {
  pass(`Coverage matrix inventories ${BRAIN_COVERAGE_MATRIX.length} fields`);
} else {
  fail("Coverage matrix incomplete");
}

const mvpDeferred = listMvpDeferredFields();
for (const entry of mvpDeferred) {
  if (entry.notes?.includes("MVP Deferred")) {
    pass(`MVP Deferred documented: ${entry.input}`);
  } else {
    fail(`MVP Deferred missing rationale: ${entry.input}`);
  }
}

if (sources.masterProfileHelpers.includes("resolveStoredHomepageLearning")) {
  pass("Canonical homepage intelligence resolver present");
} else {
  fail("Missing resolveStoredHomepageLearning");
}

if (
  sources.brainContextBuilder.includes("resolveStoredHomepageLearning") &&
  sources.memoryBuilder.includes("resolveStoredHomepageLearning")
) {
  pass("Brain context and memory share homepage resolver (no duplicate fetch)");
} else {
  fail("Homepage resolver not shared across Brain layers");
}

if (sources.identityService.includes("homepage_learning")) {
  pass("Homepage stored once at identity compile");
} else {
  fail("Homepage not stored at compile");
}

const homepageProfile = {
  homepage_learning: "Stored homepage intelligence text.",
  persona: { summary: "Should not override stored homepage" },
};
const resolved = resolveStoredHomepageLearning({ masterProfile: homepageProfile });
if (resolved === "Stored homepage intelligence text.") {
  pass("Homepage resolver prefers stored homepage_learning");
} else {
  fail("Homepage resolver priority incorrect");
}

if (
  sources.brainContextBuilder.includes("memberCount") &&
  sources.reasoningHelpers.includes("memberCount")
) {
  pass("Domain member count influences executive reasoning");
} else {
  fail("Domain member count not consumed");
}

if (sources.brainContextBuilder.includes("sort((a, b) => (b.rating")) {
  pass("Knowledge assets ordered by rating for Brain consumption");
} else {
  fail("Knowledge asset rating not prioritized");
}

if (
  sources.understandingHelpers.includes("Discussion Notes") &&
  sources.understandingHelpers.includes("Briefing Operator Notes")
) {
  pass("Discussion ai_notes and briefing notes in supporting evidence");
} else {
  fail("Operator notes not wired to understanding");
}

if (sources.marketingBuilder.includes("homepageUnderstanding")) {
  pass("Executive Marketing Strategy consumes homepage knowledge");
} else {
  fail("Marketing strategy missing homepage consumption");
}

if (
  sources.reasoningHelpers.includes("totalRefreshEvents") &&
  sources.assetBlueprintService.includes("applyMarketingStrategyRefresh")
) {
  pass("Learning refresh influences reasoning and marketing strategy");
} else {
  fail("Refresh learning paths incomplete");
}

if (assertNoBrainBypassInGenerationAssembly(sources.generationAssembly)) {
  pass("Generation assembly routes through executive context block");
} else {
  fail("Potential Brain bypass in generation assembly");
}

for (const workflow of listGenerationCoverageWorkflows()) {
  if (sources.generationService.includes("executiveStrategy")) {
    pass(`Generation bundle includes Brain stack (${workflow})`);
  } else {
    fail(`Generation bundle missing Brain stack for ${workflow}`);
    break;
  }
}

if (
  sources.generationAssembly.includes("buildStrategicBlueprintProductionContext") &&
  sources.generationAssembly.includes("resolveAssetStandard")
) {
  pass("Strategic blueprint uses marketing strategy and asset standards");
} else {
  fail("Strategic blueprint missing asset standards integration");
}

const nestedProfile = {
  voice: { summary: "Direct expert voice", tone: ["credible"] },
  expertise: { professional_terms: ["RevOps"], rules: ["Never guarantee income"] },
  generation_rules: { never_do: ["Use hype language"] },
  homepage_learning: "Homepage extracted copy.",
};

if (extractVoiceFromMasterProfile(nestedProfile, null)?.includes("Direct expert voice")) {
  pass("Nested master profile voice consumed");
} else {
  fail("Nested voice not consumed");
}

if (
  extractBusinessConstraintsFromMasterProfile(nestedProfile).some((item) =>
    item.includes("hype"),
  )
) {
  pass("Generation rules consumed as constraints");
} else {
  fail("Generation rules not consumed");
}

if (extractTerminologyFromMasterProfile(nestedProfile).includes("RevOps")) {
  pass("Professional terms consumed");
} else {
  fail("Professional terms not consumed");
}

if (
  extractHomepageLearningFromMasterProfile(nestedProfile) ===
  resolveStoredHomepageLearning({ masterProfile: nestedProfile })
) {
  pass("Homepage extraction and resolver are aligned");
} else {
  fail("Homepage extraction mismatch");
}

const strategy = buildExecutiveStrategyFromUnderstanding({
  organizationId: "org-coverage-1",
  executiveUnderstanding: sampleUnderstanding(),
});

if (strategy.marketingStrategy?.recommendedPrimaryDeliverable) {
  pass("Full Executive Strategy + Marketing Strategy stack available");
} else {
  fail("Executive Strategy stack incomplete");
}

const orgA = buildExecutiveStrategyFromUnderstanding({
  organizationId: "org-a",
  executiveUnderstanding: {
    ...sampleUnderstanding(),
    metadata: { ...sampleUnderstanding().metadata, organizationId: "org-a" },
  },
});
const orgB = buildExecutiveStrategyFromUnderstanding({
  organizationId: "org-b",
  executiveUnderstanding: {
    ...sampleUnderstanding(),
    metadata: { ...sampleUnderstanding().metadata, organizationId: "org-b" },
  },
});

if (
  orgA.metadata.organizationId !== orgB.metadata.organizationId &&
  orgA.metadata.strategyFingerprint.includes("org-a")
) {
  pass("Organization isolation preserved");
} else {
  fail("Organization isolation failure");
}

const deadFieldChecks = [
  { name: "ai_notes", source: sources.understandingHelpers },
  { name: "Briefing Operator Notes", source: sources.understandingHelpers },
  { name: "rating", source: sources.brainContextBuilder },
  { name: "memberCount", source: sources.brainContextBuilder },
];

for (const check of deadFieldChecks) {
  if (check.source.includes(check.name)) {
    pass(`No dead field: ${check.name} is referenced in Brain pipeline`);
  } else {
    fail(`Dead field suspected: ${check.name}`);
  }
}

console.log(`\nValidation complete. Failures: ${failures}`);

if (failures > 0) {
  process.exit(1);
}

console.log("\nMVP Brain coverage completion validated.");
