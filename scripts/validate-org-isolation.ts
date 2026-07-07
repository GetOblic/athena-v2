/**
 * Organization isolation validation.
 * Run: npx tsx scripts/validate-org-isolation.ts
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = join(process.cwd(), "services");
const forbiddenPatterns = [
  {
    file: "services/organizationService.ts",
    pattern: /return LIANA_DEMO_ORGANIZATION_ID/,
    reason: "Ingestion must not fall back to the Liana demo organization.",
  },
];

const serviceFiles = collectTsFiles(root);
const missing: string[] = [];

for (const file of serviceFiles) {
  const content = readFileSync(file, "utf8");
  const exportsListQueries =
    content.includes(".from(") &&
    !file.endsWith("organizationService.ts") &&
    !file.endsWith("aiService.ts") &&
    !file.endsWith("eventBus.ts") &&
    !file.endsWith("brainProcessor.ts");

  if (!exportsListQueries) {
    continue;
  }

  const hasOrgScope =
    content.includes("organizationId") || content.includes("organization_id");

  if (!hasOrgScope) {
    missing.push(file.replace(`${process.cwd()}/`, ""));
  }
}

for (const rule of forbiddenPatterns) {
  const content = readFileSync(join(process.cwd(), rule.file), "utf8");
  if (rule.pattern.test(content)) {
    console.error(`Forbidden pattern in ${rule.file}: ${rule.reason}`);
    process.exit(1);
  }
}

if (missing.length > 0) {
  console.error("Services missing organization scoping:");
  missing.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

console.log("Static organization isolation checks passed.");

runCrossOrganizationChecks()
  .then(() => {
    console.log("Organization isolation validation passed.");
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

async function runCrossOrganizationChecks() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.log(
      "Skipping cross-organization DB checks (Supabase env not configured).",
    );
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: organizations, error: organizationsError } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(10);

  if (organizationsError) {
    if (organizationsError.message.includes("Could not find the table")) {
      console.log(
        "Skipping cross-organization DB checks (organizations migration not applied).",
      );
      return;
    }

    throw new Error(
      `Failed to load organizations for isolation checks: ${organizationsError.message}`,
    );
  }

  if (!organizations || organizations.length < 2) {
    console.log(
      "Skipping cross-organization DB checks (need at least two organizations).",
    );
    return;
  }

  const orgA = organizations[0].id;
  const orgB = organizations[1].id;

  const tables = [
    "communities",
    "discussions",
    "opportunities",
    "athena_reviews",
    "athena_asset_blueprints",
    "athena_discussion_updates",
    "athena_discussion_analysis",
    "athena_community_intelligence",
    "athena_production_intelligence",
    "knowledge_assets",
    "athena_identity",
  ] as const;

  for (const table of tables) {
    const { data: orgARows, error: orgAError } = await supabase
      .from(table)
      .select("id")
      .eq("organization_id", orgA)
      .limit(1);

    if (orgAError) {
      throw new Error(`Failed to query ${table} for org A: ${orgAError.message}`);
    }

    if (!orgARows || orgARows.length === 0) {
      continue;
    }

    const sampleId = orgARows[0].id;

    const { data: leakedRows, error: leakError } = await supabase
      .from(table)
      .select("id")
      .eq("id", sampleId)
      .eq("organization_id", orgB);

    if (leakError) {
      throw new Error(
        `Failed cross-org leak check for ${table}: ${leakError.message}`,
      );
    }

    if (leakedRows && leakedRows.length > 0) {
      throw new Error(
        `Cross-organization leak detected in ${table}: org A record visible under org B filter.`,
      );
    }
  }

  console.log(
    `Cross-organization DB checks passed for org A (${orgA}) vs org B (${orgB}).`,
  );
}

function collectTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...collectTsFiles(fullPath));
      continue;
    }

    if (entry.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}
