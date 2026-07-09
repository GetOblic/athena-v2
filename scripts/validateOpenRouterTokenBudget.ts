/**
 * Run: npx tsx scripts/validateOpenRouterTokenBudget.ts
 */

import {
  buildTokenBudgetSchedule,
  capMaxTokensForRetry,
  DEFAULT_OPENROUTER_MAX_TOKENS,
  isTokenBudgetError,
  parseAvailableTokensFromError,
  resolveDefaultMaxTokens,
} from "@/lib/openrouterTokenBudget";

import { readFileSync } from "node:fs";
import { join } from "node:path";

let failures = 0;

function pass(message: string) {
  console.log(`✓ ${message}`);
}

function fail(message: string) {
  failures += 1;
  console.error(`✗ ${message}`);
}

console.log("OpenRouter Token Budget Validation\n");

const schedule = buildTokenBudgetSchedule(DEFAULT_OPENROUTER_MAX_TOKENS);
if (
  schedule.length === 3 &&
  schedule[0] === 64000 &&
  schedule[1] === 48000 &&
  schedule[2] === 32000
) {
  pass("Default schedule is 64000 → 48000 → 32000");
} else {
  fail(`Unexpected default schedule: ${schedule.join(", ")}`);
}

const sampleError = `This request requires more credits,
or fewer max_tokens.

Requested:
64000 tokens

Available:
56956 tokens`;

if (parseAvailableTokensFromError(sampleError) === 56956) {
  pass("Parses Available tokens from OpenRouter 402 body");
} else {
  fail("Failed to parse Available tokens from sample 402 body");
}

const capped = capMaxTokensForRetry(48000, sampleError);
if (capped === 48000) {
  pass("Caps retry max_tokens without exceeding scheduled budget");
} else {
  fail(`Expected capped retry to stay at scheduled 48000, got ${capped}`);
}

const tightError = `${sampleError.replace("56956", "45000")}`;
const tightCapped = capMaxTokensForRetry(48000, tightError);
if (tightCapped === Math.floor(45000 * 0.95)) {
  pass("Dynamically caps retry below Available credits when needed");
} else {
  fail(
    `Expected dynamic cap near ${Math.floor(45000 * 0.95)}, got ${tightCapped}`,
  );
}

if (isTokenBudgetError(402, sampleError)) {
  pass("Detects token budget 402 errors");
} else {
  fail("Failed to detect token budget 402 errors");
}

if (!isTokenBudgetError(500, "internal server error")) {
  pass("Ignores unrelated 500 errors");
} else {
  fail("Incorrectly classified unrelated 500 as token budget");
}

if (resolveDefaultMaxTokens() === DEFAULT_OPENROUTER_MAX_TOKENS) {
  pass("Default max_tokens resolves to 64000");
} else {
  fail("Default max_tokens resolution failed");
}

const openrouterSource = readFileSync(
  join(process.cwd(), "lib/openrouter.ts"),
  "utf8",
);

for (const phrase of [
  "buildTokenBudgetSchedule",
  "capMaxTokensForRetry",
  "isTokenBudgetError",
  "max_tokens:",
  "Succeeded on attempt",
  "All retry attempts exhausted",
]) {
  if (openrouterSource.includes(phrase)) {
    pass(`openrouter.ts includes "${phrase}"`);
  } else {
    fail(`openrouter.ts missing "${phrase}"`);
  }
}

console.log("");
if (failures === 0) {
  console.log("All OpenRouter token budget checks passed.");
  process.exit(0);
}

console.error(`\n${failures} check(s) failed.`);
process.exit(1);
