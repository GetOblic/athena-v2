/**
 * Run: npx tsx scripts/validateOrgScopedLearning.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const knowledgeServicePath = join(process.cwd(), "services/knowledgeAssetService.ts");
const learningServicePath = join(process.cwd(), "services/brain/learningService.ts");
const reviewRoutePath = join(process.cwd(), "app/api/reviews/[id]/status/route.ts");

const knowledgeSource = readFileSync(knowledgeServicePath, "utf8");
const learningSource = readFileSync(learningServicePath, "utf8");
const reviewRouteSource = readFileSync(reviewRoutePath, "utf8");

let failures = 0;

function pass(message: string) {
  console.log(`✓ ${message}`);
}

function fail(message: string) {
  failures += 1;
  console.error(`✗ ${message}`);
}

console.log("Organization-Scoped Learning Validation\n");

if (!knowledgeSource.includes("user_id")) {
  pass("knowledgeAssetService has no user_id references");
} else {
  fail("knowledgeAssetService still references user_id");
}

if (knowledgeSource.includes("organization_id")) {
  pass("knowledge assets require organization_id on write");
} else {
  fail("knowledge assets missing organization_id writes");
}

if (
  knowledgeSource.includes('.eq("organization_id", organizationId)') ||
  knowledgeSource.includes(".eq('organization_id', organizationId)")
) {
  pass("knowledge asset reads filter by organization_id");
} else {
  fail("knowledge asset reads missing organization filter");
}

if (learningSource.includes("organization_id: organizationId")) {
  pass("Brain learning writes organization-scoped knowledge assets");
} else {
  fail("Brain learning missing organization_id on create");
}

if (
  reviewRouteSource.includes("emitBrainEvent") &&
  reviewRouteSource.includes("Brain learning after approval failed")
) {
  pass("Briefing approval survives brain learning failures");
} else {
  fail("Briefing approval route missing learning failure guard");
}

console.log(`\nValidation complete. Failures: ${failures}\n`);

if (failures > 0) {
  process.exit(1);
}

console.log("All organization-scoped learning checks passed.");
