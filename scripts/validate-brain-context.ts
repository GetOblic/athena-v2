/**
 * Structural validation for the Brain Context Builder.
 * Run: npx tsx scripts/validate-brain-context.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const builderPath = join(
  process.cwd(),
  "services/brain/brainContextBuilder.ts",
);
const typesPath = join(process.cwd(), "services/brain/brainContextTypes.ts");
const servicePath = join(process.cwd(), "services/brain/brainContextService.ts");

const builderSource = readFileSync(builderPath, "utf8");
const typesSource = readFileSync(typesPath, "utf8");
const serviceSource = readFileSync(servicePath, "utf8");

const requiredExports = [
  "buildBrainContextForOrganization",
  "buildBrainContextForDiscussion",
  "buildBrainContextForOpportunity",
  "buildBrainContextForBriefing",
  "assertOrganizationId",
  "BrainContextNotFoundError",
  "BrainContextOrganizationRequiredError",
];

const requiredTypes = [
  "BrainEngineContext",
  "BusinessMemory",
  "DomainMemory",
  "DiscussionMemory",
  "OpportunityMemory",
  "BriefingMemory",
  "AssetMemory",
  "KnowledgeMemory",
  "FeedbackSignals",
  "ContextSummary",
];

function runStaticValidation() {
  for (const exportName of requiredExports) {
    const hasExport =
      builderSource.includes(`export async function ${exportName}`) ||
      builderSource.includes(`export function ${exportName}`) ||
      builderSource.includes(`export class ${exportName}`) ||
      (exportName === "assertOrganizationId" &&
        builderSource.includes("function assertOrganizationId")) ||
      (exportName === "BRAIN_CONTEXT_LIMITS" &&
        builderSource.includes("BRAIN_CONTEXT_LIMITS"));

    if (!hasExport) {
      throw new Error(`Missing export: ${exportName}`);
    }
  }

  for (const typeName of requiredTypes) {
    if (!typesSource.includes(`export type ${typeName}`)) {
      throw new Error(`Missing type export: ${typeName}`);
    }
  }

  for (const exportName of [
    "buildBrainContextForOrganization",
    "buildBrainContextForDiscussion",
    "buildBrainContextForOpportunity",
    "buildBrainContextForBriefing",
  ]) {
    if (!serviceSource.includes(exportName)) {
      throw new Error(`brainContextService.ts must re-export ${exportName}`);
    }
  }

  if (!builderSource.includes('assertOrganizationId(organizationId)')) {
    throw new Error("Builders must validate organizationId via assertOrganizationId.");
  }

  if (!builderSource.includes('.eq("organization_id", organizationId)')) {
    throw new Error(
      "Brain context builder must filter direct queries by organization_id.",
    );
  }

  if (builderSource.includes("LIANA_DEMO_ORGANIZATION_ID")) {
    throw new Error(
      "Brain context builder must not reference demo organization fallbacks.",
    );
  }

  if (!builderSource.includes("belongsToOrganization")) {
    throw new Error(
      "Entity-specific builders must verify tenant ownership with belongsToOrganization.",
    );
  }

  console.log(
    "Static validation passed. Set ATHENA_VALIDATE_ORGANIZATION_ID for optional live DB check.",
  );
}

async function runLiveValidation(organizationId: string) {
  const {
    buildBrainContextForOrganization,
  } = await import("../services/brain/brainContextBuilder");

  const context = await buildBrainContextForOrganization(organizationId);

  if (!context) {
    throw new Error(
      `buildBrainContextForOrganization returned null for ${organizationId}.`,
    );
  }

  if (context.organization.id !== organizationId) {
    throw new Error(
      "Organization slice does not match requested organizationId.",
    );
  }

  if (
    !context.contextSummary ||
    !Array.isArray(context.contextSummary.warnings)
  ) {
    throw new Error("Context summary is missing or malformed.");
  }

  console.log(
    `Live structural check passed for organization ${organizationId}.`,
  );
  console.log(
    JSON.stringify(
      {
        scope: context.scope,
        domains: context.domainMemory.totalDomains,
        discussions: context.discussionMemory.recentDiscussions.length,
        opportunities: context.opportunityMemory.recentOpportunities.length,
        briefings: context.briefingMemory.recentBriefings.length,
        knowledgeAssets: context.knowledgeMemory.assets.length,
        warnings: context.contextSummary.warnings,
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

  console.log("Brain Context Builder validation succeeded.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
