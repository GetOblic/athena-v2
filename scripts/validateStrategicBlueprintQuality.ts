/**
 * Validation for Strategic Asset Blueprint quality improvements.
 * Run: npx tsx scripts/validateStrategicBlueprintQuality.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildStrategicBlueprintProductionContext,
  formatStrategicBlueprintProductionSpecsForPrompt,
  resolveSophisticationLevel,
  resolveStrategicAngle,
} from "@/services/assetBlueprints/strategicBlueprintProductionSpecs";
import type { ExecutiveUnderstanding } from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";

const promptPath = join(
  process.cwd(),
  "services/assetBlueprints/prompts/assetBlueprintPrompt.ts",
);
const specsPath = join(
  process.cwd(),
  "services/assetBlueprints/strategicBlueprintProductionSpecs.ts",
);
const assemblyPath = join(
  process.cwd(),
  "services/brain/generationContracts/generationPromptAssembly.ts",
);
const contractPath = join(
  process.cwd(),
  "services/brain/generationContracts/contractHelpers.ts",
);

const promptSource = readFileSync(promptPath, "utf8");
const specsSource = readFileSync(specsPath, "utf8");
const assemblySource = readFileSync(assemblyPath, "utf8");
const contractSource = readFileSync(contractPath, "utf8");

let failures = 0;

function pass(message: string) {
  console.log(`✓ ${message}`);
}

function fail(message: string) {
  failures += 1;
  console.error(`✗ ${message}`);
}

function buildSampleUnderstanding(
  overrides: Partial<{
    direction: ExecutiveUnderstanding["strategicUnderstanding"]["recommendedDirection"];
    buyerStage: string | null;
    priority: string;
    fingerprint: string;
  }> = {},
): ExecutiveUnderstanding {
  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      organizationId: "org-sample",
      discussionId: "discussion-sample",
      understandingVersion: "executive_understanding_v1",
      reasoningVersion: "executive_reasoning_v1",
      memoryEnriched: false,
      learningEnriched: false,
      degradationMode: "identity_and_current_only",
      understandingFingerprint: overrides.fingerprint ?? "sample-fingerprint-a",
    },
    executiveSummary: {
      headline: "Sample opportunity",
      narrative: "Sample narrative",
      primaryObjective: "Educate and convert",
      discussionId: "discussion-sample",
      scope: "discussion",
    },
    businessUnderstanding: {
      positioning: "B2B SaaS consultant",
      voice: "Direct, credible, helpful",
      expertise: "Revenue operations",
      website: "https://example.com",
      homepageUnderstanding: "Helps operators scale pipeline",
      businessConstraints: ["No income guarantees"],
      knowledgeCompleteness: 60,
      isBrainTrained: true,
      summary: "Operator with strong RevOps positioning",
    },
    marketUnderstanding: {
      buyerStage: overrides.buyerStage ?? "consideration",
      painPoints: ["Manual reporting", "Pipeline visibility"],
      marketSignals: ["Budget scrutiny increasing"],
      recurringTerminology: ["RevOps", "pipeline hygiene"],
      competitors: ["Spreadsheets"],
      emergingThemes: ["AI-assisted forecasting"],
      discussionRelevance: "High relevance to current thread",
      domainRelevance: "RevOps domain",
      evidenceStrength: "moderate",
      historicalEnrichmentAvailable: false,
    },
    strategicUnderstanding: {
      recommendedPositioning: "Consultative RevOps expert",
      recommendedDirection: overrides.direction ?? "consultative",
      secondaryDirection: null,
      recommendedExecutiveAction: "Share a diagnostic framework",
      recommendedDeploymentDirection: "Consultative community reply with follow-up asset",
      primaryExecutiveObjective: "Help operator diagnose reporting pain",
      rationale: ["Priority signals support consultative approach"],
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
  };
}

console.log("Strategic Asset Blueprint Quality Validation\n");

if (promptSource.includes("asset_blueprint_v2_production_specs")) {
  pass("Blueprint prompt version upgraded");
} else {
  fail("Blueprint prompt version not upgraded");
}

if (
  promptSource.includes("production_specs") &&
  promptSource.includes("sophistication_level") &&
  promptSource.includes("strategic_angle")
) {
  pass("Blueprint JSON schema includes production structure");
} else {
  fail("Blueprint JSON schema missing production structure");
}

if (
  contractSource.includes("production_specs") &&
  contractSource.includes("executive_rationale")
) {
  pass("Strategic blueprint contract expanded");
} else {
  fail("Strategic blueprint contract not expanded");
}

if (
  assemblySource.includes("buildStrategicBlueprintProductionContext") &&
  assemblySource.includes("formatStrategicBlueprintProductionSpecsForPrompt")
) {
  pass("Prompt assembly includes production specifications layer");
} else {
  fail("Prompt assembly missing production specifications layer");
}

if (
  specsSource.includes("resolveStrategicAngle") &&
  specsSource.includes("resolveSophisticationLevel")
) {
  pass("Deterministic variation helpers present");
} else {
  fail("Deterministic variation helpers missing");
}

const educational = buildStrategicBlueprintProductionContext(
  buildSampleUnderstanding({
    direction: "educational",
    buyerStage: "aware",
    priority: "monitor",
    fingerprint: "sample-educational",
  }),
);
const executive = buildStrategicBlueprintProductionContext(
  buildSampleUnderstanding({
    direction: "sales_first",
    buyerStage: "decision",
    priority: "immediate_action",
    fingerprint: "sample-executive",
  }),
);

if (educational.strategicAngle !== executive.strategicAngle) {
  pass("Representative blueprint types produce different strategic angles");
} else {
  fail("Strategic angles should differ across contexts");
}

if (educational.sophisticationLevel !== executive.sophisticationLevel) {
  pass("Sophistication levels vary by buyer stage and priority");
} else {
  fail("Sophistication levels should vary by context");
}

const assetTypes = new Set([
  educational.preferredAssetType,
  executive.preferredAssetType,
  buildStrategicBlueprintProductionContext(
    buildSampleUnderstanding({
      direction: "relationship_first",
      fingerprint: "sample-relationship",
    }),
  ).preferredAssetType,
]);

if (assetTypes.size >= 2) {
  pass("Asset type recommendations differ across strategic directions");
} else {
  fail("Asset type recommendations should differ across directions");
}

const educationalPrompt = formatStrategicBlueprintProductionSpecsForPrompt(educational);
const executivePrompt = formatStrategicBlueprintProductionSpecsForPrompt(executive);

for (const label of [
  "Lead Magnet",
  "PDF Guide",
  "Carousel",
  "Landing Page",
  "Email Sequence",
  "Video",
  "Checklist",
  "Framework",
]) {
  if (
    promptSource.toLowerCase().includes(label.toLowerCase().replace(" ", "_")) ||
    promptSource.toLowerCase().includes(label.toLowerCase())
  ) {
    pass(`Blueprint prompt supports ${label} asset class`);
  } else {
    fail(`Blueprint prompt missing ${label} asset class support`);
  }
}

if (
  educationalPrompt.includes("AI GENERATION INSTRUCTIONS") &&
  executivePrompt.includes("PRODUCTION SPECIFICATIONS")
) {
  pass("Production spec prompt blocks are generation-ready");
} else {
  fail("Production spec prompt blocks incomplete");
}

console.log(`\nValidation complete. Failures: ${failures}`);

if (failures > 0) {
  process.exit(1);
}

console.log("\nStrategic Asset Blueprint quality checks passed.");
