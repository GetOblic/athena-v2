/**
 * Validation for the Athena Executive Understanding Engine.
 * Run: npx tsx scripts/validateExecutiveUnderstanding.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const typesPath = join(
  process.cwd(),
  "services/brain/executiveUnderstanding/executiveUnderstandingTypes.ts",
);
const builderPath = join(
  process.cwd(),
  "services/brain/executiveUnderstanding/executiveUnderstandingBuilder.ts",
);
const helpersPath = join(
  process.cwd(),
  "services/brain/executiveUnderstanding/executiveUnderstandingHelpers.ts",
);
const servicePath = join(
  process.cwd(),
  "services/brain/executiveUnderstandingService.ts",
);
const generationServicePath = join(
  process.cwd(),
  "services/brain/generationContractService.ts",
);
const promptFormattingPath = join(
  process.cwd(),
  "services/brain/generationContracts/contractPromptFormatting.ts",
);
const promptAssemblyPath = join(
  process.cwd(),
  "services/brain/generationContracts/generationPromptAssembly.ts",
);
const generationTypesPath = join(
  process.cwd(),
  "services/brain/generationContracts/generationContractTypes.ts",
);
const workflowPath = join(process.cwd(), "services/workflows/discussionWorkflow.ts");

const typesSource = readFileSync(typesPath, "utf8");
const builderSource = readFileSync(builderPath, "utf8");
const helpersSource = readFileSync(helpersPath, "utf8");
const serviceSource = readFileSync(servicePath, "utf8");
const generationServiceSource = readFileSync(generationServicePath, "utf8");
const promptFormattingSource = readFileSync(promptFormattingPath, "utf8");
const promptAssemblySource = readFileSync(promptAssemblyPath, "utf8");
const generationTypesSource = readFileSync(generationTypesPath, "utf8");
const workflowSource = readFileSync(workflowPath, "utf8");

const requiredTypes = [
  "ExecutiveSummary",
  "BusinessUnderstanding",
  "MarketUnderstanding",
  "StrategicUnderstanding",
  "OpportunityUnderstanding",
  "RiskUnderstanding",
  "PriorityUnderstanding",
  "SupportingEvidence",
  "UnderstandingMetadata",
  "ExecutiveUnderstanding",
];

const requiredExports = [
  "buildExecutiveUnderstanding",
  "resolveExecutiveUnderstandingBundle",
  "getExecutiveUnderstanding",
  "clearExecutiveUnderstandingCache",
  "formatExecutiveUnderstandingForPrompt",
  "validateSharedExecutiveUnderstanding",
];

let failures = 0;

function pass(message: string) {
  console.log(`✓ ${message}`);
}

function fail(message: string) {
  failures += 1;
  console.error(`✗ ${message}`);
}

console.log("Athena Executive Understanding Engine Validation\n");

for (const typeName of requiredTypes) {
  if (typesSource.includes(`export type ${typeName}`)) {
    pass(`Type ${typeName} defined`);
  } else {
    fail(`Missing type ${typeName}`);
  }
}

for (const exportName of requiredExports) {
  const exportPattern = new RegExp(
    `export (async )?function ${exportName}|export \\{[^}]*\\b${exportName}\\b`,
  );
  const sources = [builderSource, serviceSource, helpersSource, generationServiceSource];
  if (sources.some((source) => exportPattern.test(source))) {
    pass(`Export ${exportName} available`);
  } else {
    fail(`Missing export ${exportName}`);
  }
}

if (builderSource.includes("buildBusinessUnderstanding") && !builderSource.includes("buildExecutiveReasoning")) {
  pass("Builder reuses Brain systems without duplicating reasoning");
} else {
  fail("Builder must not duplicate executive reasoning");
}

if (helpersSource.includes("historicalEnrichmentAvailable") && helpersSource.includes("optional: true")) {
  pass("Historical evidence is optional enrichment");
} else {
  fail("Historical evidence optional enrichment missing");
}

if (typesSource.includes('degradationMode: "full" | "identity_and_current_only"')) {
  pass("Graceful degradation modes defined");
} else {
  fail("Graceful degradation modes missing");
}

if (generationTypesSource.includes("executiveUnderstanding: ExecutiveUnderstanding")) {
  pass("Generation bundle includes Executive Understanding");
} else {
  fail("Generation bundle missing Executive Understanding");
}

if (
  generationServiceSource.includes("resolveExecutiveUnderstandingBundle") &&
  !generationServiceSource.includes("buildExecutiveReasoning")
) {
  pass("Generation pipeline reuses shared Executive Understanding");
} else {
  fail("Generation pipeline must reuse shared Executive Understanding");
}

if (
  promptFormattingSource.includes("formatExecutiveUnderstandingForPrompt") &&
  !promptFormattingSource.includes("formatExecutiveReasoningForPrompt")
) {
  pass("Prompt assembly consumes Executive Understanding instead of rebuilding interpretation");
} else {
  fail("Prompt assembly must consume Executive Understanding");
}

if (promptAssemblySource.includes("executiveUnderstanding: input.bundle.executiveUnderstanding")) {
  pass("Workflow prompt assembly passes shared Executive Understanding");
} else {
  fail("Workflow prompt assembly missing Executive Understanding");
}

if (helpersSource.includes("validateSharedExecutiveUnderstanding")) {
  pass("Consistency validation available");
} else {
  fail("Consistency validation missing");
}

if (serviceSource.includes("assertOrganizationId") || serviceSource.includes("organizationId?.trim()")) {
  pass("Organization required for Executive Understanding");
} else {
  fail("Organization requirement missing");
}

if (
  !serviceSource.includes(".from(") &&
  !serviceSource.includes("supabaseAdmin") &&
  !serviceSource.includes(".insert(") &&
  !serviceSource.includes(".update(") &&
  !serviceSource.includes(".upsert(")
) {
  pass("Executive Understanding service has no destructive writes");
} else {
  fail("Executive Understanding service must not perform destructive writes");
}

if (serviceSource.includes("REQUEST_CACHE_TTL_MS")) {
  pass("Request-scoped caching preserved");
} else {
  fail("Request-scoped caching missing");
}

if (workflowSource.includes("resolveGenerationBundle")) {
  pass("Discussion workflow consumes generation pipeline with Executive Understanding");
} else {
  fail("Discussion workflow missing generation pipeline integration");
}

console.log(`\nValidation complete. Failures: ${failures}`);

if (failures > 0) {
  process.exit(1);
}

console.log("\nAll executive understanding checks passed.");
