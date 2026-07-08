/**
 * Structural validation for the Brain Context Builder.
 * Run: npx tsx scripts/validate-brain-context.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertOrganizationId,
  BrainContextOrganizationRequiredError,
  buildBrainContextForBriefing,
  buildBrainContextForDiscussion,
  buildBrainContextForOpportunity,
  buildBrainContextForOrganization,
  BRAIN_CONTEXT_LIMITS,
} from "../services/brain/brainContextBuilder";

const builderPath = join(
  process.cwd(),
  "services/brain/brainContextBuilder.ts",
);
const builderSource = readFileSync(builderPath, "utf8");

const requiredExports = [
  "buildBrainContextForOrganization",
  "buildBrainContextForDiscussion",
  "buildBrainContextForOpportunity",
  "buildBrainContextForBriefing",
  "assertOrganizationId",
  "BrainContextNotFoundError",
  "BrainContextOrganizationRequiredError",
];

for (const exportName of requiredExports) {
  if (!builderSource.includes(`export async function ${exportName}`) &&
      !builderSource.includes(`export function ${exportName}`) &&
      !builderSource.includes(`export class ${exportName}`)) {
    throw new Error(`Missing export: ${exportName}`);
  }
}

if (typeof buildBrainContextForOrganization !== "function") {
  throw new Error("buildBrainContextForOrganization is not a function.");
}

if (typeof buildBrainContextForDiscussion !== "function") {
  throw new Error("buildBrainContextForDiscussion is not a function.");
}

if (typeof buildBrainContextForOpportunity !== "function") {
  throw new Error("buildBrainContextForOpportunity is not a function.");
}

if (typeof buildBrainContextForBriefing !== "function") {
  throw new Error("buildBrainContextForBriefing is not a function.");
}

try {
  assertOrganizationId("");
  throw new Error("assertOrganizationId should reject empty organizationId.");
} catch (error) {
  if (!(error instanceof BrainContextOrganizationRequiredError)) {
    throw error;
  }
}

if (!BRAIN_CONTEXT_LIMITS.discussions || !BRAIN_CONTEXT_LIMITS.knowledgeAssets) {
  throw new Error("BRAIN_CONTEXT_LIMITS is incomplete.");
}

if (!builderSource.includes(".eq(\"organization_id\", organizationId)")) {
  throw new Error(
    "Brain context builder must filter direct queries by organization_id.",
  );
}

if (builderSource.includes("LIANA_DEMO_ORGANIZATION_ID")) {
  throw new Error("Brain context builder must not reference demo organization fallbacks.");
}

const organizationId = process.env.ATHENA_VALIDATE_ORGANIZATION_ID?.trim();

if (organizationId) {
  const context = await buildBrainContextForOrganization(organizationId);

  if (!context) {
    throw new Error(
      `buildBrainContextForOrganization returned null for ${organizationId}.`,
    );
  }

  if (context.organization.id !== organizationId) {
    throw new Error("Organization slice does not match requested organizationId.");
  }

  if (!context.contextSummary || !Array.isArray(context.contextSummary.warnings)) {
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
} else {
  console.log(
    "Static validation passed. Set ATHENA_VALIDATE_ORGANIZATION_ID for optional live DB check.",
  );
}

console.log("Brain Context Builder validation succeeded.");
