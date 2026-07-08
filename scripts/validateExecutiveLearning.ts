/**
 * Validation for the Athena Executive Learning Engine.
 * Run: npx tsx scripts/validateExecutiveLearning.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const builderPath = join(
  process.cwd(),
  "services/brain/executiveLearningBuilder.ts",
);
const servicePath = join(
  process.cwd(),
  "services/brain/executiveLearningService.ts",
);
const helpersPath = join(
  process.cwd(),
  "services/brain/executiveLearningHelpers.ts",
);
const typesPath = join(
  process.cwd(),
  "services/brain/executiveLearningTypes.ts",
);
const contextTypesPath = join(
  process.cwd(),
  "services/brain/brainContextTypes.ts",
);
const memoryTypesPath = join(
  process.cwd(),
  "services/brain/executiveMemoryTypes.ts",
);
const contextBuilderPath = join(
  process.cwd(),
  "services/brain/executiveContextBuilder.ts",
);

const builderSource = readFileSync(builderPath, "utf8");
const serviceSource = readFileSync(servicePath, "utf8");
const helpersSource = readFileSync(helpersPath, "utf8");
const typesSource = readFileSync(typesPath, "utf8");
const contextTypesSource = readFileSync(contextTypesPath, "utf8");
const memoryTypesSource = readFileSync(memoryTypesPath, "utf8");
const contextBuilderSource = readFileSync(contextBuilderPath, "utf8");

const requiredExports = [
  "buildExecutiveLearning",
  "getExecutiveLearning",
  "clearExecutiveLearningCache",
];

const requiredTypes = [
  "ExecutiveLearningSummary",
  "ExecutiveLearningEvent",
  "DecisionLearning",
  "DiscussionLearning",
  "BriefingLearning",
  "SalesLearning",
  "MarketLearning",
  "MarketEvidenceEntry",
  "RefreshLearning",
  "PatternLearning",
  "PromotionCandidate",
  "LearningMetadata",
];

const requiredSections = [
  "metadata",
  "decisionLearning",
  "discussionLearning",
  "briefingLearning",
  "salesLearning",
  "marketLearning",
  "refreshLearning",
  "patternLearning",
  "promotionCandidates",
];

function runStaticValidation() {
  for (const exportName of requiredExports) {
    const hasExport =
      builderSource.includes(`export async function ${exportName}`) ||
      serviceSource.includes(`export async function ${exportName}`) ||
      serviceSource.includes(`export function ${exportName}`);

    if (!hasExport) {
      throw new Error(`Missing export: ${exportName}`);
    }
  }

  for (const typeName of requiredTypes) {
    if (!typesSource.includes(`export type ${typeName}`)) {
      throw new Error(`Missing type export: ${typeName}`);
    }
  }

  for (const section of requiredSections) {
    if (!typesSource.includes(section)) {
      throw new Error(`ExecutiveLearningSummary must include section: ${section}`);
    }
  }

  if (!contextTypesSource.includes("executiveLearning:")) {
    throw new Error("AthenaBrainContext must expose executiveLearning.");
  }

  if (!contextTypesSource.includes("marketEvidence:")) {
    throw new Error("AthenaBrainContext must expose marketEvidence.");
  }

  if (!contextTypesSource.includes("promotionCandidates:")) {
    throw new Error("AthenaBrainContext must expose promotionCandidates.");
  }

  if (!memoryTypesSource.includes("executiveLearning:")) {
    throw new Error("ExecutiveMemory must expose executiveLearning.");
  }

  if (!memoryTypesSource.includes("promotionCandidates:")) {
    throw new Error("ExecutiveMemory must expose promotionCandidates.");
  }

  if (!contextBuilderSource.includes("getExecutiveLearning")) {
    throw new Error("Brain context builder must attach executiveLearning.");
  }

  if (!helpersSource.includes("computePromotionReadiness")) {
    throw new Error("Promotion readiness must be deterministic.");
  }

  if (!builderSource.includes('.eq("organization_id", organizationId)')) {
    throw new Error(
      "Executive learning builder must filter direct queries by organization_id.",
    );
  }

  if (!builderSource.includes("belongsToOrganization")) {
    throw new Error(
      "Executive learning builder must verify optional entity ownership.",
    );
  }

  if (!serviceSource.includes("learningCache")) {
    throw new Error("Executive learning service must provide request caching.");
  }

  console.log(
    "Static validation passed. Set ATHENA_VALIDATE_ORGANIZATION_ID for optional live DB check.",
  );
}

async function runLiveValidation(organizationId: string) {
  const { getExecutiveLearning } = await import(
    "../services/brain/executiveLearningService"
  );
  const { ExecutiveLearningOrganizationRequiredError } = await import(
    "../services/brain/executiveLearningBuilder"
  );

  try {
    await getExecutiveLearning({ organizationId: "  " });
    throw new Error("Expected organizationId validation to throw.");
  } catch (error) {
    if (!(error instanceof ExecutiveLearningOrganizationRequiredError)) {
      throw error;
    }
  }

  const learning = await getExecutiveLearning({ organizationId });

  if (learning.metadata.organizationId !== organizationId) {
    throw new Error("Learning metadata organizationId mismatch.");
  }

  for (const section of requiredSections) {
    if (!(section in learning)) {
      throw new Error(`Executive learning section missing at runtime: ${section}`);
    }
  }

  if (!Array.isArray(learning.marketLearning.evidence)) {
    throw new Error("marketLearning.evidence must initialize as an array.");
  }

  if (!Array.isArray(learning.promotionCandidates)) {
    throw new Error("promotionCandidates must initialize as an array.");
  }

  for (const candidate of learning.promotionCandidates) {
    if (!["low", "medium", "high"].includes(candidate.promotionReadiness)) {
      throw new Error("Promotion candidates must use deterministic readiness levels.");
    }
  }

  console.log(`Live structural check passed for organization ${organizationId}.`);
  console.log(
    JSON.stringify(
      {
        learningVersion: learning.metadata.learningVersion,
        decisionEvents: learning.decisionLearning.events.length,
        marketEvidence: learning.marketLearning.evidence.length,
        promotionCandidates: learning.promotionCandidates.length,
        refreshEvents: learning.metadata.refreshEvents,
      },
      null,
      2,
    ),
  );
}

async function main() {
  runStaticValidation();

  const organizationId = process.env.ATHENA_VALIDATE_ORGANIZATION_ID?.trim();
  if (organizationId) {
    await runLiveValidation(organizationId);
  }

  console.log("Executive Learning Engine validation succeeded.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
