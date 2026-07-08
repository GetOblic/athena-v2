/**
 * Validation for the Athena Executive Memory Engine.
 * Run: npx tsx scripts/validateExecutiveMemory.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const builderPath = join(
  process.cwd(),
  "services/brain/executiveMemoryBuilder.ts",
);
const servicePath = join(
  process.cwd(),
  "services/brain/executiveMemoryService.ts",
);
const helpersPath = join(
  process.cwd(),
  "services/brain/executiveMemoryHelpers.ts",
);
const typesPath = join(
  process.cwd(),
  "services/brain/executiveMemoryTypes.ts",
);
const contextTypesPath = join(
  process.cwd(),
  "services/brain/brainContextTypes.ts",
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
const contextBuilderSource = readFileSync(contextBuilderPath, "utf8");

const requiredExports = [
  "buildExecutiveMemory",
  "getExecutiveMemory",
  "clearExecutiveMemoryCache",
];

const requiredTypes = [
  "ExecutiveMemory",
  "BusinessKnowledge",
  "MarketKnowledge",
  "AudienceKnowledge",
  "PainPointKnowledgeEntry",
  "BuyingSignalKnowledgeEntry",
  "TerminologyKnowledgeEntry",
  "CompetitorKnowledgeEntry",
  "DecisionKnowledge",
  "ContentKnowledge",
  "PatternKnowledge",
  "PerformanceKnowledge",
  "MemoryMetadata",
];

const requiredSections = [
  "businessKnowledge",
  "marketKnowledge",
  "audienceKnowledge",
  "terminologyKnowledge",
  "competitorKnowledge",
  "painPointKnowledge",
  "buyingSignalKnowledge",
  "decisionKnowledge",
  "contentKnowledge",
  "patternKnowledge",
  "performanceKnowledge",
  "metadata",
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
      throw new Error(`ExecutiveMemory must include section: ${section}`);
    }
  }

  if (!contextTypesSource.includes("executiveMemory:")) {
    throw new Error("AthenaBrainContext must expose executiveMemory.");
  }

  if (!contextBuilderSource.includes("getExecutiveMemory")) {
    throw new Error("Brain context builder must attach executiveMemory.");
  }

  if (!builderSource.includes('.eq("organization_id", organizationId)')) {
    throw new Error(
      "Executive memory builder must filter direct queries by organization_id.",
    );
  }

  if (!builderSource.includes("belongsToOrganization")) {
    throw new Error(
      "Executive memory builder must verify optional discussion ownership.",
    );
  }

  if (!helpersSource.includes("splitMemoryPhrases")) {
    throw new Error("Executive memory helpers must provide phrase aggregation.");
  }

  if (!serviceSource.includes("memoryCache")) {
    throw new Error("Executive memory service must provide request-scoped caching.");
  }

  console.log(
    "Static validation passed. Set ATHENA_VALIDATE_ORGANIZATION_ID for optional live DB check.",
  );
}

async function runLiveValidation(organizationId: string) {
  const { getExecutiveMemory } = await import(
    "../services/brain/executiveMemoryService"
  );
  const { ExecutiveMemoryOrganizationRequiredError } = await import(
    "../services/brain/executiveMemoryBuilder"
  );

  try {
    await getExecutiveMemory({ organizationId: "  " });
    throw new Error("Expected organizationId validation to throw.");
  } catch (error) {
    if (!(error instanceof ExecutiveMemoryOrganizationRequiredError)) {
      throw error;
    }
  }

  const memory = await getExecutiveMemory({ organizationId });

  if (memory.metadata.organizationId !== organizationId) {
    throw new Error("Memory metadata organizationId mismatch.");
  }

  for (const section of requiredSections) {
    if (!(section in memory)) {
      throw new Error(`Executive memory section missing at runtime: ${section}`);
    }
  }

  if (!Array.isArray(memory.painPointKnowledge)) {
    throw new Error("painPointKnowledge must be initialized as an array.");
  }

  console.log(`Live structural check passed for organization ${organizationId}.`);
  console.log(
    JSON.stringify(
      {
        memoryVersion: memory.metadata.memoryVersion,
        discussions: memory.metadata.discussionCount,
        analyses: memory.metadata.analysisCount,
        painPoints: memory.painPointKnowledge.length,
        buyingSignals: memory.buyingSignalKnowledge.length,
        terminology: memory.terminologyKnowledge.length,
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

  console.log("Executive Memory Engine validation succeeded.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
