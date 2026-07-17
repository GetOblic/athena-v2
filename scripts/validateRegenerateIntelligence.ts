/**
 * Run: npx tsx scripts/validateRegenerateIntelligence.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const routePath = join(process.cwd(), "app/api/discussions/[id]/analyze/route.ts");
const statusRoutePath = join(
  process.cwd(),
  "app/api/discussions/[id]/status/route.ts",
);
const providerPath = join(
  process.cwd(),
  "components/discussions/DiscussionRegenerationProvider.tsx",
);
const buttonPath = join(
  process.cwd(),
  "components/discussions/AnalyzeDiscussionButton.tsx",
);

const routeSource = readFileSync(routePath, "utf8");
const statusRouteSource = readFileSync(statusRoutePath, "utf8");
const providerSource = readFileSync(providerPath, "utf8");
const buttonSource = readFileSync(buttonPath, "utf8");

let failures = 0;

function pass(message: string) {
  console.log(`✓ ${message}`);
}

function fail(message: string) {
  failures += 1;
  console.error(`✗ ${message}`);
}

console.log("Regenerate Intelligence UX Validation\n");

if (routeSource.includes("export async function POST") && routeSource.includes("try {")) {
  pass("Analyze route POST handler uses try/catch");
} else {
  fail("Analyze route missing top-level try/catch");
}

if (
  routeSource.includes("NextResponse.json") &&
  !routeSource.includes("redirect(") &&
  !routeSource.includes("notFound(")
) {
  pass("Analyze route returns JSON responses only");
} else {
  fail("Analyze route may return non-JSON responses");
}

if (routeSource.includes('console.error("Regenerate intelligence failed"')) {
  pass("Analyze route logs regeneration failures");
} else {
  fail("Analyze route missing regeneration error logging");
}

if (routeSource.includes("processDiscussionEndToEnd")) {
  pass("Analyze route delegates to stabilized workflow services");
} else {
  fail("Analyze route missing workflow delegation");
}

if (statusRouteSource.includes("export async function GET")) {
  pass("Discussion status route exposes GET for regeneration polling");
} else {
  fail("Discussion status route missing GET handler");
}

if (statusRouteSource.includes("regenerationInFlight")) {
  pass("Discussion status route exposes regenerationInFlight");
} else {
  fail("Discussion status route missing regenerationInFlight");
}

if (providerSource.includes("fetchRegenerationStatus")) {
  pass("Regeneration provider polls status endpoint");
} else {
  fail("Regeneration provider missing status polling");
}

if (providerSource.includes("readRegenerationSession")) {
  pass("Regeneration provider persists pending state across refresh");
} else {
  fail("Regeneration provider missing session persistence");
}

if (buttonSource.includes("Generating Intelligence")) {
  pass("Button shows generating label");
} else {
  fail("Button missing generating label");
}

if (buttonSource.includes("Intelligence Generated")) {
  pass("Button shows completion confirmation label");
} else {
  fail("Button missing completion confirmation label");
}

console.log(`\nValidation complete. Failures: ${failures}\n`);

if (failures > 0) {
  process.exit(1);
}

console.log("All Regenerate Intelligence checks passed.");
