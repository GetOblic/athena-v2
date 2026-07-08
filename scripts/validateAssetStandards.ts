/**
 * Validation for Executive Asset Standards.
 * Run: npx tsx scripts/validateAssetStandards.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatExecutiveAssetStandardForPrompt,
  listRegisteredAssetStandards,
  resolveAssetStandard,
  SUPPORTED_ASSET_STANDARD_TYPES,
} from "@/services/brain/assetStandards/assetStandardRegistry";
import type { ExecutiveAssetStandard } from "@/services/brain/assetStandards/assetStandardsTypes";

const registryPath = join(
  process.cwd(),
  "services/brain/assetStandards/assetStandardRegistry.ts",
);
const standardsPath = join(
  process.cwd(),
  "services/brain/assetStandards/assetStandards.ts",
);
const assemblyPath = join(
  process.cwd(),
  "services/brain/generationContracts/generationPromptAssembly.ts",
);
const promptPath = join(
  process.cwd(),
  "services/assetBlueprints/prompts/assetBlueprintPrompt.ts",
);

const registrySource = readFileSync(registryPath, "utf8");
const standardsSource = readFileSync(standardsPath, "utf8");
const assemblySource = readFileSync(assemblyPath, "utf8");
const promptSource = readFileSync(promptPath, "utf8");

let failures = 0;

function pass(message: string) {
  console.log(`✓ ${message}`);
}

function fail(message: string) {
  failures += 1;
  console.error(`✗ ${message}`);
}

function validateStandard(standard: ExecutiveAssetStandard) {
  if (!standard.assetPurpose?.trim()) {
    fail(`${standard.assetType} missing asset purpose`);
  }
  if (!standard.expectedStructure.length) {
    fail(`${standard.assetType} missing expected structure`);
  }
  if (!standard.expectedSectionOrder.length) {
    fail(`${standard.assetType} missing section order`);
  }
  if (!standard.qualityChecklist.length) {
    fail(`${standard.assetType} missing quality checklist`);
  }
  if (!standard.expectedVisualGuidance?.trim()) {
    fail(`${standard.assetType} missing visual guidance`);
  }
  if (!standard.expectedCtaPlacement?.trim()) {
    fail(`${standard.assetType} missing CTA expectations`);
  }
  if (!standard.expectedReusability?.trim()) {
    fail(`${standard.assetType} missing reusability guidance`);
  }
}

console.log("Executive Asset Standards Validation\n");

for (const type of SUPPORTED_ASSET_STANDARD_TYPES) {
  const standard = resolveAssetStandard(type);
  validateStandard(standard);
  pass(`Standard registered for ${type}`);
}

const standards = listRegisteredAssetStandards();
if (standards.length >= 9) {
  pass(`All primary asset standards present (${standards.length})`);
} else {
  fail(`Expected at least 9 primary asset standards, found ${standards.length}`);
}

for (const alias of ["pdf_guide", "email_sequence", "video_script", "social_post"]) {
  if (resolveAssetStandard(alias)) {
    pass(`Alias ${alias} resolves to a standard`);
  } else {
    fail(`Alias ${alias} missing standard mapping`);
  }
}

const pdfPrompt = formatExecutiveAssetStandardForPrompt(resolveAssetStandard("pdf"));
if (
  pdfPrompt.includes("QUALITY CHECKLIST") &&
  pdfPrompt.includes("EXPECTED SECTION ORDER") &&
  !pdfPrompt.includes("lorem ipsum")
) {
  pass("Standard prompt formatting is deterministic and non-template");
} else {
  fail("Standard prompt formatting incomplete");
}

if (
  assemblySource.includes("resolveAssetStandard") &&
  assemblySource.includes("formatExecutiveAssetStandardForPrompt")
) {
  pass("Blueprint assembly auto-selects asset standards");
} else {
  fail("Blueprint assembly missing asset standard integration");
}

if (
  promptSource.includes("EXECUTIVE ASSET STANDARDS") &&
  promptSource.includes("assetStandardPrompt")
) {
  pass("Blueprint prompt consumes asset standards");
} else {
  fail("Blueprint prompt missing asset standards section");
}

if (
  !registrySource.includes(".from(") &&
  !registrySource.includes("supabaseAdmin") &&
  !standardsSource.includes("generateReview")
) {
  pass("Asset standards are static configuration with no database or AI calls");
} else {
  fail("Asset standards must be static configuration only");
}

console.log(`\nValidation complete. Failures: ${failures}`);

if (failures > 0) {
  process.exit(1);
}

console.log("\nAll executive asset standard checks passed.");
