/**
 * Validation for Executive Output Coherence (Sprint 10).
 * Run: npx tsx scripts/validateExecutiveOutputCoherence.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildExecutiveStrategyFromUnderstanding } from "@/services/brain/executiveCoherence/executiveStrategyBuilder";
import {
  formatOutputResponsibilityForPrompt,
  getOutputResponsibilityForWorkflow,
  listAllOutputResponsibilities,
} from "@/services/brain/executiveCoherence/outputResponsibilityContracts";
import {
  validateExecutiveOutputCoherence,
  validateOutputDiversity,
  validateStrategyAlignment,
} from "@/services/brain/executiveCoherenceService";
import type { ExecutiveUnderstanding } from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";

const coherenceServicePath = join(
  process.cwd(),
  "services/brain/executiveCoherenceService.ts",
);
const strategyBuilderPath = join(
  process.cwd(),
  "services/brain/executiveCoherence/executiveStrategyBuilder.ts",
);
const responsibilityPath = join(
  process.cwd(),
  "services/brain/executiveCoherence/outputResponsibilityContracts.ts",
);
const diversityPath = join(
  process.cwd(),
  "services/brain/executiveCoherence/outputDiversityGuardrails.ts",
);
const promptFormattingPath = join(
  process.cwd(),
  "services/brain/generationContracts/contractPromptFormatting.ts",
);
const generationTypesPath = join(
  process.cwd(),
  "services/brain/generationContracts/generationContractTypes.ts",
);
const understandingServicePath = join(
  process.cwd(),
  "services/brain/executiveUnderstandingService.ts",
);
const generationServicePath = join(
  process.cwd(),
  "services/brain/generationContractService.ts",
);

const coherenceServiceSource = readFileSync(coherenceServicePath, "utf8");
const strategyBuilderSource = readFileSync(strategyBuilderPath, "utf8");
const responsibilitySource = readFileSync(responsibilityPath, "utf8");
const diversitySource = readFileSync(diversityPath, "utf8");
const promptFormattingSource = readFileSync(promptFormattingPath, "utf8");
const generationTypesSource = readFileSync(generationTypesPath, "utf8");
const understandingServiceSource = readFileSync(understandingServicePath, "utf8");
const generationServiceSource = readFileSync(generationServicePath, "utf8");

let failures = 0;

function pass(message: string) {
  console.log(`✓ ${message}`);
}

function fail(message: string) {
  failures += 1;
  console.error(`✗ ${message}`);
}

function sampleUnderstanding(
  direction: ExecutiveUnderstanding["strategicUnderstanding"]["recommendedDirection"],
): ExecutiveUnderstanding {
  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      organizationId: "org-1",
      discussionId: "discussion-1",
      understandingVersion: "executive_understanding_v1",
      reasoningVersion: "executive_reasoning_v1",
      memoryEnriched: false,
      learningEnriched: false,
      degradationMode: "identity_and_current_only",
      understandingFingerprint: `fp-${direction}`,
    },
    executiveSummary: {
      headline: "Sample",
      narrative: "Operators struggle with manual reporting.",
      primaryObjective: "Educate on reporting automation",
      discussionId: "discussion-1",
      scope: "discussion",
    },
    businessUnderstanding: {
      positioning: "RevOps consultant",
      voice: "Direct and credible",
      expertise: "Pipeline operations",
      website: "https://example.com",
      homepageUnderstanding: null,
      businessConstraints: [],
      knowledgeCompleteness: 70,
      isBrainTrained: true,
      summary: "RevOps expert",
    },
    marketUnderstanding: {
      buyerStage: "consideration",
      painPoints: ["Manual reporting"],
      marketSignals: ["Budget scrutiny"],
      recurringTerminology: ["RevOps"],
      competitors: [],
      emergingThemes: [],
      discussionRelevance: "High",
      domainRelevance: "RevOps",
      evidenceStrength: "moderate",
      historicalEnrichmentAvailable: false,
    },
    strategicUnderstanding: {
      recommendedPositioning: "Consultative expert",
      recommendedDirection: direction,
      secondaryDirection: null,
      recommendedExecutiveAction: "Share educational framework",
      recommendedDeploymentDirection: "Educational community reply",
      primaryExecutiveObjective: "Educate on automation",
      rationale: ["Educational approach fits buyer stage"],
    },
    opportunityUnderstanding: {
      businessOpportunity: "Reporting automation",
      businessAlignment: "high",
      executiveAlignment: "aligned",
      importance: "high_intent",
      supportingEvidence: ["Manual reporting pain"],
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
      level: "high_intent",
      rationale: ["Strong signals"],
    },
    supportingEvidence: {
      entries: [
        {
          source: "current_discussion",
          label: "Discussion",
          detail: "Reporting pain mentioned",
          optional: false,
        },
      ],
      totalCount: 1,
      historicalCount: 0,
    },
  };
}

console.log("Executive Output Coherence Validation\n");

if (strategyBuilderSource.includes("buildExecutiveStrategy")) {
  pass("Executive Strategy builder present");
} else {
  fail("Executive Strategy builder missing");
}

if (generationTypesSource.includes("executiveStrategy: ExecutiveStrategy")) {
  pass("Generation bundle includes Executive Strategy");
} else {
  fail("Generation bundle missing Executive Strategy");
}

if (
  understandingServiceSource.includes("buildExecutiveStrategyFromUnderstanding") &&
  understandingServiceSource.includes("executiveStrategy")
) {
  pass("Executive Strategy built once in understanding bundle");
} else {
  fail("Executive Strategy not built in understanding bundle");
}

if (
  promptFormattingSource.includes("formatExecutiveStrategyForPrompt") &&
  promptFormattingSource.includes("formatOutputResponsibilityForPrompt") &&
  !promptFormattingSource.includes("formatExecutiveUnderstandingForPrompt")
) {
  pass("Prompt assembly uses shared strategy and output responsibilities");
} else {
  fail("Prompt assembly must use strategy and responsibilities");
}

const responsibilities = listAllOutputResponsibilities();
const verbs = new Set(responsibilities.map((item) => item.verb));
for (const verb of ["Understand", "Recommend", "Advise", "Design", "Execute"]) {
  if (verbs.has(verb as never)) {
    pass(`Output responsibility verb ${verb} defined`);
  } else {
    fail(`Missing output responsibility verb ${verb}`);
  }
}

const strategyA = buildExecutiveStrategyFromUnderstanding({
  organizationId: "org-1",
  executiveUnderstanding: sampleUnderstanding("educational"),
});
const strategyB = buildExecutiveStrategyFromUnderstanding({
  organizationId: "org-1",
  executiveUnderstanding: sampleUnderstanding("educational"),
});
if (strategyA.metadata.strategyFingerprint === strategyB.metadata.strategyFingerprint) {
  pass("Executive Strategy is deterministic for same understanding");
} else {
  fail("Executive Strategy fingerprint not deterministic");
}

const diversity = validateOutputDiversity({
  outputs: [
    {
      type: "discussion_analysis",
      text: "Summary: users discussed manual reporting pain points and buyer stage consideration.",
    },
    {
      type: "deployment_asset",
      text: "COMMUNITY_REPLY: Here is a paste-ready helpful reply for the community.",
    },
  ],
});
if (diversity.valid) {
  pass("Distinct deliverable samples pass diversity guardrails");
} else {
  fail("Distinct deliverable samples should pass diversity guardrails");
}

const duplicate = validateOutputDiversity({
  outputs: [
    {
      type: "executive_briefing",
      text: "Executive summary with strategic recommendation for leadership review and next steps.",
    },
    {
      type: "opportunity",
      text: "Executive summary with strategic recommendation for leadership review and next steps.",
    },
  ],
});
if (!duplicate.valid) {
  pass("Duplicate deliverable wording flagged by diversity guardrails");
} else {
  fail("Duplicate deliverable wording should fail diversity guardrails");
}

const deploymentViolation = validateStrategyAlignment({
  strategy: strategyA,
  workflowType: "deployment_asset",
  outputText: "COMMUNITY_REPLY: Hello\nExecutive reasoning summary included here.",
});
if (!deploymentViolation.aligned) {
  pass("Deployment output with executive reasoning flagged");
} else {
  fail("Deployment output with executive reasoning should fail alignment");
}

const coherence = validateExecutiveOutputCoherence({
  strategies: [strategyA, strategyB],
  outputs: [
    { type: "discussion_analysis", text: "Analysis of discussion signals and patterns." },
    { type: "strategic_blueprint", text: "Blueprint with section hierarchy and layout expectations." },
  ],
});
if (coherence.strategyConsistent && coherence.diversityValid) {
  pass("Executive output coherence validation utility works");
} else {
  fail("Executive output coherence validation utility failed");
}

if (
  !coherenceServiceSource.includes(".from(") &&
  !coherenceServiceSource.includes("supabaseAdmin")
) {
  pass("Coherence service has no additional database queries");
} else {
  fail("Coherence service must not add database queries");
}

if (generationServiceSource.includes("executiveStrategy")) {
  pass("Generation pipeline reuses shared Executive Strategy");
} else {
  fail("Generation pipeline missing Executive Strategy reuse");
}

for (const workflow of [
  "discussion_analysis",
  "opportunity",
  "executive_briefing",
  "strategic_blueprint",
  "deployment_asset",
]) {
  const block = formatOutputResponsibilityForPrompt(
    workflow as Parameters<typeof formatOutputResponsibilityForPrompt>[0],
  );
  const responsibility = getOutputResponsibilityForWorkflow(
    workflow as Parameters<typeof getOutputResponsibilityForWorkflow>[0],
  );
  if (block.includes(responsibility.verb) && block.includes("YOU MUST AVOID")) {
    pass(`Responsibility contract formatted for ${workflow}`);
  } else {
    fail(`Responsibility contract incomplete for ${workflow}`);
  }
}

console.log(`\nValidation complete. Failures: ${failures}`);

if (failures > 0) {
  process.exit(1);
}

console.log("\nAll executive output coherence checks passed.");
