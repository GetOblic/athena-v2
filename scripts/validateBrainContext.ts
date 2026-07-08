/**
 * Validation for the Athena Executive Context Builder.
 * Run: npx tsx scripts/validateBrainContext.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const builderPath = join(
  process.cwd(),
  "services/brain/brainContextBuilder.ts",
);
const executivePath = join(
  process.cwd(),
  "services/brain/executiveContextBuilder.ts",
);
const snapshotPath = join(process.cwd(), "services/brain/brainSnapshot.ts");
const helpersPath = join(process.cwd(), "services/brain/brainContextHelpers.ts");
const typesPath = join(process.cwd(), "services/brain/brainContextTypes.ts");
const servicePath = join(process.cwd(), "services/brain/brainContextService.ts");

const builderSource = readFileSync(builderPath, "utf8");
const executiveSource = readFileSync(executivePath, "utf8");
const snapshotSource = readFileSync(snapshotPath, "utf8");
const helpersSource = readFileSync(helpersPath, "utf8");
const typesSource = readFileSync(typesPath, "utf8");
const serviceSource = readFileSync(servicePath, "utf8");

const requiredExports = [
  "buildBrainContext",
  "buildBrainContextForOrganization",
  "buildBrainContextForDiscussion",
  "buildBrainContextForOpportunity",
  "buildBrainContextForBriefing",
  "buildBrainSnapshot",
  "assertOrganizationId",
  "BrainContextNotFoundError",
  "BrainContextOrganizationRequiredError",
];

const requiredTypes = [
  "AthenaBrainContext",
  "BrainEngineContext",
  "BusinessMemory",
  "IdentityMemory",
  "DomainMemory",
  "DiscussionMemory",
  "OpportunityMemory",
  "BriefingMemory",
  "BlueprintMemory",
  "KnowledgeMemory",
  "FeedbackMemory",
  "OperationalMemory",
  "ContextWarnings",
  "BrainSnapshot",
  "ContextSummary",
  "BuildBrainContextParams",
];

const requiredLimits = [
  "MAX_DISCUSSIONS_CONTEXT",
  "MAX_BRIEFINGS_CONTEXT",
  "MAX_OPPORTUNITIES_CONTEXT",
  "MAX_BLUEPRINTS_CONTEXT",
  "MAX_KNOWLEDGE_CONTEXT",
];

function runStaticValidation() {
  for (const exportName of requiredExports) {
    const hasExport =
      builderSource.includes(`export async function ${exportName}`) ||
      builderSource.includes(`export function ${exportName}`) ||
      builderSource.includes(`export class ${exportName}`) ||
      executiveSource.includes(`export async function ${exportName}`) ||
      snapshotSource.includes(`export function ${exportName}`) ||
      (exportName === "assertOrganizationId" &&
        (builderSource.includes("function assertOrganizationId") ||
          executiveSource.includes("assertOrganizationId")));

    if (!hasExport) {
      throw new Error(`Missing export: ${exportName}`);
    }
  }

  for (const typeName of requiredTypes) {
    if (!typesSource.includes(`export type ${typeName}`)) {
      throw new Error(`Missing type export: ${typeName}`);
    }
  }

  for (const limitName of requiredLimits) {
    if (!typesSource.includes(limitName)) {
      throw new Error(`Missing performance limit constant: ${limitName}`);
    }
  }

  if (!executiveSource.includes("buildBrainContext(")) {
    throw new Error("Executive builder must expose buildBrainContext().");
  }

  if (!snapshotSource.includes("buildBrainSnapshot")) {
    throw new Error("brainSnapshot.ts must expose buildBrainSnapshot().");
  }

  if (!helpersSource.includes("generateContextWarnings")) {
    throw new Error("brainContextHelpers.ts must generate context warnings.");
  }

  for (const exportName of ["buildBrainContext", "buildBrainSnapshot"]) {
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
  const { buildBrainContext } = await import(
    "../services/brain/executiveContextBuilder"
  );
  const { BrainContextOrganizationRequiredError } = await import(
    "../services/brain/brainContextBuilder"
  );

  try {
    await buildBrainContext({ organizationId: "  " });
    throw new Error("Expected organizationId validation to throw.");
  } catch (error) {
    if (!(error instanceof BrainContextOrganizationRequiredError)) {
      throw error;
    }
  }

  const context = await buildBrainContext({ organizationId });

  if (!context) {
    throw new Error(`buildBrainContext returned null for ${organizationId}.`);
  }

  if (context.organization.id !== organizationId) {
    throw new Error("Organization slice does not match requested organizationId.");
  }

  if (!context.snapshot || typeof context.snapshot.brainHealth !== "string") {
    throw new Error("Brain snapshot is missing or malformed.");
  }

  if (
    !context.contextWarnings ||
    !Array.isArray(context.contextWarnings.codes) ||
    !Array.isArray(context.contextWarnings.messages)
  ) {
    throw new Error("Context warnings are missing or malformed.");
  }

  if (!context.operationalMemory?.dashboard) {
    throw new Error("Operational memory is missing dashboard metrics.");
  }

  console.log(
    `Live structural check passed for organization ${organizationId}.`,
  );
  console.log(
    JSON.stringify(
      {
        scope: context.scope,
        brainHealth: context.snapshot.brainHealth,
        domains: context.domainMemory.totalDomains,
        discussions: context.discussionMemory.recentDiscussions.length,
        opportunities: context.opportunityMemory.recentOpportunities.length,
        briefings: context.briefingMemory.recentBriefings.length,
        knowledgeAssets: context.knowledgeMemory.assets.length,
        warningCodes: context.contextWarnings.codes,
        snapshotWarnings: context.snapshot.warnings.length,
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

  console.log("Executive Context Builder validation succeeded.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
