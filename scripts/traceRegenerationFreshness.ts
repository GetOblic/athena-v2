/**
 * Compare the two most recent regeneration outputs for one discussion.
 * Run: npx tsx scripts/traceRegenerationFreshness.ts [discussionId] [organizationId]
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvLocal() {
  try {
    const envPath = join(process.cwd(), ".env.local");
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // optional
  }
}

function hash(value: string | null | undefined): string {
  return createHash("sha256")
    .update(value ?? "")
    .digest("hex")
    .slice(0, 16);
}

function blueprintBodyHash(input: {
  asset_title?: string | null;
  pdf_prompt?: string | null;
  image_prompt?: string | null;
  social_prompt?: string | null;
}): string {
  return hash(
    [
      input.asset_title,
      input.pdf_prompt,
      input.image_prompt,
      input.social_prompt,
    ].join("|"),
  );
}

async function main() {
  loadEnvLocal();

  const discussionId =
    process.argv[2] ?? "4516501b-fa73-4b97-b68f-d06ea0230e4d";
  const organizationId =
    process.argv[3] ?? "6273d775-2b2d-47aa-a7e5-7688e4ffe0bc";

  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");

  const { data: analyses, error: analysisError } = await supabaseAdmin
    .from("athena_discussion_analysis")
    .select("id, created_at, summary, suggested_cta, raw_json")
    .eq("discussion_id", discussionId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(2);

  if (analysisError) {
    console.error("Failed to load analyses:", analysisError.message);
    process.exit(1);
  }

  const { data: blueprints, error: blueprintError } = await supabaseAdmin
    .from("athena_asset_blueprints")
    .select(
      "id, created_at, updated_at, asset_title, pdf_prompt, image_prompt, social_prompt, raw_json",
    )
    .eq("discussion_id", discussionId)
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(2);

  if (blueprintError) {
    console.error("Failed to load blueprints:", blueprintError.message);
    process.exit(1);
  }

  console.log(`Discussion: ${discussionId}`);
  console.log(`Organization: ${organizationId}`);
  console.log("");

  if (!analyses || analyses.length === 0) {
    console.log("No analysis rows found.");
    process.exit(0);
  }

  for (const [index, row] of analyses.entries()) {
    const rawJson = row.raw_json as Record<string, unknown> | null;
    console.log(`Analysis #${index + 1}`);
    console.log(`  id: ${row.id}`);
    console.log(`  created_at: ${row.created_at}`);
    console.log(
      `  regenerationRunId: ${String(rawJson?.regeneration_run_id ?? "—")}`,
    );
    console.log(`  summaryHash: ${hash(row.summary)}`);
    console.log(`  deploymentAssetsHash: ${hash(row.suggested_cta)}`);
    console.log("");
  }

  if (analyses.length >= 2) {
    const latest = analyses[0];
    const previous = analyses[1];
    console.log("Analysis freshness");
    console.log(
      `  summary differs: ${hash(latest.summary) !== hash(previous.summary)}`,
    );
    console.log(
      `  deployment assets differ: ${hash(latest.suggested_cta) !== hash(previous.suggested_cta)}`,
    );
    console.log("");
  }

  if (!blueprints || blueprints.length === 0) {
    console.log("No blueprint rows found.");
    process.exit(0);
  }

  for (const [index, row] of blueprints.entries()) {
    const rawJson = row.raw_json as Record<string, unknown> | null;
    console.log(`Blueprint #${index + 1}`);
    console.log(`  id: ${row.id}`);
    console.log(`  created_at: ${row.created_at}`);
    console.log(`  updated_at: ${row.updated_at}`);
    console.log(
      `  regenerationRunId: ${String(rawJson?.regeneration_run_id ?? "—")}`,
    );
    console.log(`  title: ${row.asset_title ?? "—"}`);
    console.log(`  bodyHash: ${blueprintBodyHash(row)}`);
    console.log("");
  }

  if (blueprints.length >= 2) {
    const latest = blueprints[0];
    const previous = blueprints[1];
    console.log("Blueprint freshness");
    console.log(
      `  body differs: ${blueprintBodyHash(latest) !== blueprintBodyHash(previous)}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
