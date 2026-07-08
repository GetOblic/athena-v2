/**
 * Validation for the Athena Executive Reasoning Engine.
 * Run: npx tsx scripts/validateExecutiveReasoning.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const builderPath = join(
  process.cwd(),
  "services/brain/executiveReasoningBuilder.ts",
);
const servicePath = join(
  process.cwd(),
  "services/brain/executiveReasoningService.ts",
);
const helpersPath = join(
  process.cwd(),
  "services/brain/executiveReasoningHelpers.ts",
);
const typesPath = join(
  process.cwd(),
  "services/brain/executiveReasoningTypes.ts",
);
const contextTypesPath = join(
  process.cwd(),
  "services/brain/brainContextTypes.ts",
);
const contextBuilderPath = join(
  process.cwd(),
  "services/brain/executiveContextBuilder.ts",
);
const workflowPath = join(
  process.cwd(),
  "services/workflows/discussionWorkflow.ts",
);

const builderSource = readFileSync(builderPath, "utf8");
const serviceSource = readFileSync(servicePath, "utf8");
const helpersSource = readFileSync(helpersPath, "utf8");
const typesSource = readFileSync(typesPath, "utf8");
const contextTypesSource = readFileSync(contextTypesPath, "utf8");
const contextBuilderSource = readFileSync(contextBuilderPath, "utf8");
const workflowSource = readFileSync(workflowPath, "utf8");

const requiredExports = [
  "buildExecutiveReasoning",
  "getExecutiveReasoning",
  "clearExecutiveReasoningCache",
  "buildDiscussionAnalysisBrainPrompt",
];

const requiredTypes = [
  "ExecutiveReasoning",
  "StrategicAssessment",
  "BusinessAssessment",
  "MarketAssessment",
  "OpportunityAssessment",
  "PriorityAssessment",
  "RiskAssessment",
  "RecommendedDirection",
  "ReasoningMetadata",
];

const requiredSections = [
  "metadata",
  "strategicAssessment",
  "businessAssessment",
  "marketAssessment",
  "opportunityAssessment",
  "priorityAssessment",
  "riskAssessment",
  "recommendedDirection",
];

function runStaticValidation() {
  for (const exportName of requiredExports) {
    const hasExport =
      builderSource.includes(`export async function ${exportName}`) ||
      serviceSource.includes(`export async function ${exportName}`) ||
      serviceSource.includes(`export function ${exportName}`) ||
      helpersSource.includes(`export function ${exportName}`);

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
      throw new Error(`ExecutiveReasoning must include section: ${section}`);
    }
  }

  if (!typesSource.includes("REASONING_PRIORITY_THRESHOLDS")) {
    throw new Error("Priority thresholds must be documented in types.");
  }

  if (!contextTypesSource.includes("executiveReasoning:")) {
    throw new Error("AthenaBrainContext must expose executiveReasoning.");
  }

  if (!contextBuilderSource.includes("buildExecutiveReasoning")) {
    throw new Error("Brain context builder must attach executiveReasoning.");
  }

  if (!workflowSource.includes("buildBrainContext")) {
    throw new Error("Discussion workflow pilot must consume Brain Context.");
  }

  if (!workflowSource.includes("buildDiscussionAnalysisBrainPrompt")) {
    throw new Error("Discussion workflow pilot must consume Executive Reasoning.");
  }

  if (!builderSource.includes("belongsToOrganization")) {
    throw new Error("Reasoning builder must verify optional entity ownership.");
  }

  if (!serviceSource.includes("reasoningCache")) {
    throw new Error("Reasoning service must provide request caching.");
  }

  console.log(
    "Static validation passed. Set ATHENA_VALIDATE_ORGANIZATION_ID for optional live DB check.",
  );
}

async function runLiveValidation(organizationId: string) {
  const { getExecutiveReasoning } = await import(
    "../services/brain/executiveReasoningService"
  );
  const { ExecutiveReasoningOrganizationRequiredError } = await import(
    "../services/brain/executiveReasoningBuilder"
  );

  try {
    await getExecutiveReasoning({ organizationId: "  " });
    throw new Error("Expected organizationId validation to throw.");
  } catch (error) {
    if (!(error instanceof ExecutiveReasoningOrganizationRequiredError)) {
      throw error;
    }
  }

  const reasoning = await getExecutiveReasoning({ organizationId });

  if (reasoning.metadata.organizationId !== organizationId) {
    throw new Error("Reasoning metadata organizationId mismatch.");
  }

  for (const section of requiredSections) {
    if (!(section in reasoning)) {
      throw new Error(`Executive reasoning section missing at runtime: ${section}`);
    }
  }

  if (
    !["immediate_action", "high_intent", "monitor", "low_priority"].includes(
      reasoning.priorityAssessment.level,
    )
  ) {
    throw new Error("Priority assessment must use deterministic priority keys.");
  }

  console.log(`Live structural check passed for organization ${organizationId}.`);
  console.log(
    JSON.stringify(
      {
        reasoningVersion: reasoning.metadata.reasoningVersion,
        priority: reasoning.priorityAssessment.level,
        direction: reasoning.recommendedDirection.primary,
        risk: reasoning.riskAssessment.overallRisk,
        thresholds: reasoning.priorityAssessment.thresholdsApplied,
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

  console.log("Executive Reasoning Engine validation succeeded.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
