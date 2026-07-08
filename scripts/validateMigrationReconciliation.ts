/**
 * Migration reconciliation validation.
 * Run: npx tsx scripts/validateMigrationReconciliation.ts
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const manifestPath = join(process.cwd(), "supabase/migration-manifest.json");
const saasMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260710000001_saas_tenant_provisioning.sql",
);

const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  migrations: Array<{ version: string; file: string }>;
};
const saasSource = readFileSync(saasMigrationPath, "utf8");

let failures = 0;

function pass(message: string) {
  console.log(`✓ ${message}`);
}

function fail(message: string) {
  failures += 1;
  console.error(`✗ ${message}`);
}

function extractVersion(filename: string): string {
  const match = filename.match(/^(\d+)/);
  return match?.[1] ?? filename;
}

console.log("Supabase Migration Reconciliation Validation\n");

if (migrationFiles.length === manifest.migrations.length) {
  pass(`Migration file count matches manifest (${migrationFiles.length})`);
} else {
  fail(
    `Migration count mismatch: files=${migrationFiles.length}, manifest=${manifest.migrations.length}`,
  );
}

const versions = migrationFiles.map(extractVersion);
const uniqueVersions = new Set(versions);
if (uniqueVersions.size === versions.length) {
  pass("All migration versions are unique");
} else {
  fail("Duplicate migration versions detected");
}

const duplicateDateOnly = versions.filter((version) => version.length === 8);
if (duplicateDateOnly.length === 0) {
  pass("No ambiguous 8-digit date-only migration versions");
} else {
  fail(`Ambiguous date-only versions remain: ${duplicateDateOnly.join(", ")}`);
}

for (const entry of manifest.migrations) {
  if (migrationFiles.includes(entry.file)) {
    pass(`Manifest entry present: ${entry.file}`);
  } else {
    fail(`Manifest entry missing on disk: ${entry.file}`);
  }
}

if (migrationFiles[0]?.startsWith("20260705000001")) {
  pass("Baseline core tables migration executes first");
} else {
  fail("Baseline migration is not first");
}

if (migrationFiles.at(-1)?.startsWith("20260710000001")) {
  pass("SaaS tenant provisioning migration executes last");
} else {
  fail("SaaS provisioning migration is not last");
}

if (!saasSource.includes("athena_backfill_tenant_table_by_user_id('athena_discussion_updates')")) {
  pass("20260710000001 does not backfill athena_discussion_updates by user_id");
} else {
  fail("20260710000001 incorrectly backfills athena_discussion_updates");
}

const tablesWithUserIdBackfill = [
  "discussions",
  "athena_discussion_analysis",
  "opportunities",
  "athena_reviews",
  "knowledge_assets",
  "athena_identity",
];

for (const table of tablesWithUserIdBackfill) {
  if (saasSource.includes(`athena_backfill_tenant_table_by_user_id('${table}')`)) {
    pass(`User-id backfill retained for ${table}`);
  } else {
    fail(`Missing user-id backfill for ${table}`);
  }
}

if (saasSource.includes("update athena_discussion_updates u")) {
  pass("Discussion updates receive organization_id via relationship propagation");
} else {
  fail("Missing relationship propagation for athena_discussion_updates");
}

for (const file of migrationFiles) {
  const source = readFileSync(join(migrationsDir, file), "utf8");
  const idempotent =
    source.includes("if not exists") ||
    source.includes("create or replace") ||
    source.includes("on conflict") ||
    source.includes("drop constraint if exists") ||
    source.includes("drop function if exists");
  if (idempotent) {
    pass(`Idempotent patterns present: ${file}`);
  } else {
    fail(`Idempotent patterns missing: ${file}`);
  }
}

const baselineSource = readFileSync(
  join(migrationsDir, "20260705000001_create_athena_core_tables.sql"),
  "utf8",
);
for (const table of [
  "communities",
  "discussions",
  "athena_discussion_analysis",
  "opportunities",
  "athena_reviews",
  "athena_community_intelligence",
  "athena_production_intelligence",
]) {
  if (baselineSource.includes(`create table if not exists ${table}`)) {
    pass(`Baseline creates ${table}`);
  } else {
    fail(`Baseline missing ${table}`);
  }
}

const identitySource = readFileSync(
  join(migrationsDir, "20260707000001_create_athena_identity.sql"),
  "utf8",
);
if (identitySource.includes("greeting_name")) {
  pass("Identity migration includes greeting_name column");
} else {
  fail("Identity migration missing greeting_name");
}

console.log(`\nValidation complete. Failures: ${failures}`);

if (failures > 0) {
  process.exit(1);
}

console.log("\nMigration reconciliation checks passed.");
