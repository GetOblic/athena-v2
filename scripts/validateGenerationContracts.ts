/**
 * Validation for the Athena Generation Contract Engine.
 * Run: npx tsx scripts/validateGenerationContracts.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const typesPath = join(
  process.cwd(),
  "services/brain/generationContracts/generationContractTypes.ts",
);
const builderPath = join(
  process.cwd(),
  "services/brain/generationContracts/contractBuilder.ts",
);
const helpersPath = join(
  process.cwd(),
  "services/brain/generationContracts/contractHelpers.ts",
);
const validationPath = join(
  process.cwd(),
  "services/brain/generationContracts/contractValidation.ts",
);
const promptAssemblyPath = join(
  process.cwd(),
  "services/brain/generationContracts/generationPromptAssembly.ts",
);
const servicePath = join(process.cwd(), "services/brain/generationContractService.ts");
const workflowPath = join(process.cwd(), "services/workflows/discussionWorkflow.ts");
const reviewRoutePath = join(
  process.cwd(),
  "app/api/opportunities/[id]/review/route.ts",
);
const blueprintServicePath = join(
  process.cwd(),
  "services/assetBlueprints/assetBlueprintService.ts",
);

const typesSource = readFileSync(typesPath, "utf8");
const builderSource = readFileSync(builderPath, "utf8");
const helpersSource = readFileSync(helpersPath, "utf8");
const validationSource = readFileSync(validationPath, "utf8");
const promptAssemblySource = readFileSync(promptAssemblyPath, "utf8");
const serviceSource = readFileSync(servicePath, "utf8");
const workflowSource = readFileSync(workflowPath, "utf8");
const reviewRouteSource = readFileSync(reviewRoutePath, "utf8");
const blueprintServiceSource = readFileSync(blueprintServicePath, "utf8");

const requiredTypes = [
  "GenerationContract",
  "GenerationPurpose",
  "RequiredSections",
  "EvidenceRequirements",
  "OutputRequirements",
  "QualityRequirements",
  "ToneRequirements",
  "ForbiddenBehaviors",
  "ValidationRules",
  "ContractMetadata",
  "GenerationWorkflowType",
  "GenerationBundle",
];

const requiredExports = [
  "buildGenerationContract",
  "resolveGenerationBundle",
  "clearGenerationContractCache",
  "validateGenerationContract",
  "assembleDiscussionAnalysisPrompt",
  "assembleExecutiveBriefingPrompt",
  "assembleStrategicBlueprintPrompt",
];

const workflowContracts = [
  "discussionContract.ts",
  "opportunityContract.ts",
  "briefingContract.ts",
  "deploymentAssetContract.ts",
  "strategicBlueprintContract.ts",
];

const workflowMappings = [
  "discussion_analysis",
  "opportunity",
  "executive_briefing",
  "deployment_asset",
  "strategic_blueprint",
];

let failures = 0;

function pass(message: string) {
  console.log(`✓ ${message}`);
}

function fail(message: string) {
  failures += 1;
  console.error(`✗ ${message}`);
}

console.log("Athena Generation Contract Engine Validation\n");

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
  const sources = [
    builderSource,
    serviceSource,
    validationSource,
    promptAssemblySource,
  ];
  if (sources.some((source) => exportPattern.test(source))) {
    pass(`Export ${exportName} available`);
  } else {
    fail(`Missing export ${exportName}`);
  }
}

for (const contractFile of workflowContracts) {
  const contractPath = join(
    process.cwd(),
    "services/brain/generationContracts",
    contractFile,
  );
  try {
    readFileSync(contractPath, "utf8");
    pass(`Workflow contract file ${contractFile} exists`);
  } catch {
    fail(`Missing workflow contract file ${contractFile}`);
  }
}

for (const workflowType of workflowMappings) {
  if (builderSource.includes(`case "${workflowType}"`)) {
    pass(`Workflow mapping for ${workflowType}`);
  } else {
    fail(`Missing workflow mapping for ${workflowType}`);
  }
}

if (helpersSource.includes("requireExecutiveReasoning: true")) {
  pass("Contracts require executive reasoning");
} else {
  fail("Contracts must require executive reasoning");
}

if (validationSource.includes("organizationId")) {
  pass("Organization validation present");
} else {
  fail("Organization validation missing");
}

if (
  validationSource.includes("requiredSections.sections.length") &&
  validationSource.includes("validationRules.requiredChecks")
) {
  pass("Required sections and validation rules initialize");
} else {
  fail("Required sections or validation rules checks missing");
}

if (
  !serviceSource.includes(".from(") &&
  !serviceSource.includes("supabaseAdmin") &&
  !serviceSource.includes(".insert(") &&
  !serviceSource.includes(".update(") &&
  !serviceSource.includes(".upsert(")
) {
  pass("Generation contract service has no destructive writes");
} else {
  fail("Generation contract service must not perform destructive writes");
}

if (
  workflowSource.includes("resolveGenerationBundle") &&
  workflowSource.includes("assembleDiscussionAnalysisPrompt") &&
  workflowSource.includes("assembleExecutiveBriefingPrompt")
) {
  pass("Discussion workflow consumes contract pipeline");
} else {
  fail("Discussion workflow missing contract pipeline");
}

if (
  reviewRouteSource.includes("resolveGenerationBundle") &&
  reviewRouteSource.includes("assembleExecutiveBriefingPrompt")
) {
  pass("Opportunity review API consumes contract pipeline");
} else {
  fail("Opportunity review API missing contract pipeline");
}

if (
  blueprintServiceSource.includes("assembleStrategicBlueprintPrompt") &&
  blueprintServiceSource.includes("generationBundle")
) {
  pass("Asset blueprint service consumes contract pipeline");
} else {
  fail("Asset blueprint service missing contract pipeline");
}

if (
  promptAssemblySource.includes("assembleExecutiveGenerationContextBlock") &&
  !promptAssemblySource.includes("buildExecutiveReasoning")
) {
  pass("Prompt assembly does not rebuild reasoning");
} else {
  fail("Prompt assembly must not rebuild reasoning");
}

if (serviceSource.includes("buildBrainContext")) {
  pass("Generation bundle reuses buildBrainContext");
} else {
  fail("Generation bundle must reuse buildBrainContext");
}

if (serviceSource.includes("REQUEST_CACHE_TTL_MS")) {
  pass("Request-scoped caching preserved");
} else {
  fail("Request-scoped caching missing");
}

if (validationSource.includes("organization does not match")) {
  pass("Cross-organization leakage checks present");
} else {
  fail("Cross-organization leakage checks missing");
}

console.log(`\nValidation complete. Failures: ${failures}`);

if (failures > 0) {
  process.exit(1);
}

console.log("\nAll generation contract checks passed.");
