/**
 * Run: npx tsx scripts/validateRegenerateIntelligence.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const routePath = join(process.cwd(), "app/api/discussions/[id]/analyze/route.ts");
const buttonPath = join(
  process.cwd(),
  "components/discussions/AnalyzeDiscussionButton.tsx",
);

const routeSource = readFileSync(routePath, "utf8");
const buttonSource = readFileSync(buttonPath, "utf8");

let failures = 0;

function pass(message: string) {
  console.log(`✓ ${message}`);
}

function fail(message: string) {
  failures += 1;
  console.error(`✗ ${message}`);
}

console.log("Regenerate Intelligence API Validation\n");

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

if (buttonSource.includes("response.text()") && buttonSource.includes("JSON.parse")) {
  pass("Client safely parses analyze response text");
} else {
  fail("Client still blindly calls response.json()");
}

if (buttonSource.includes("Server returned a non-JSON error")) {
  pass("Client shows clean non-JSON error message");
} else {
  fail("Client missing non-JSON error handling");
}

if (routeSource.includes("processDiscussionEndToEnd")) {
  pass("Analyze route delegates to stabilized workflow services");
} else {
  fail("Analyze route missing workflow delegation");
}

console.log(`\nValidation complete. Failures: ${failures}\n`);

if (failures > 0) {
  process.exit(1);
}

console.log("All Regenerate Intelligence checks passed.");
