/**
 * Non-production Breakthrough evaluation harness — isolation + integrity.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, before } from "node:test";

const ROOT = process.cwd();

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Breakthrough evaluation harness", () => {
  let appendBreakthroughDoctrine: typeof import("../../scripts/evaluation/breakthrough/src/doctrine").appendBreakthroughDoctrine;
  let loadFrozenDoctrine: typeof import("../../scripts/evaluation/breakthrough/src/doctrine").loadFrozenDoctrine;
  let resetDoctrineCacheForTests: typeof import("../../scripts/evaluation/breakthrough/src/doctrine").resetDoctrineCacheForTests;
  let verifyBreakthroughAppendIntegrity: typeof import("../../scripts/evaluation/breakthrough/src/integrity").verifyBreakthroughAppendIntegrity;
  let loadProspectFixtures: typeof import("../../scripts/evaluation/breakthrough/src/fixtures").loadProspectFixtures;
  let assembleDeploymentStagePrompts: typeof import("../../scripts/evaluation/breakthrough/src/assemble").assembleDeploymentStagePrompts;
  let assembleStrategicStagePrompts: typeof import("../../scripts/evaluation/breakthrough/src/assemble").assembleStrategicStagePrompts;
  let buildSyntheticContextFromFixture: typeof import("../../scripts/evaluation/breakthrough/src/syntheticContext").buildSyntheticContextFromFixture;
  let PILOT_ASSET_KEYS: typeof import("../../scripts/evaluation/breakthrough/src/constants").PILOT_ASSET_KEYS;
  let sha256Text: typeof import("../../scripts/evaluation/breakthrough/src/hash").sha256Text;

  before(async () => {
    const doctrine = await import(
      "../../scripts/evaluation/breakthrough/src/doctrine"
    );
    const integrity = await import(
      "../../scripts/evaluation/breakthrough/src/integrity"
    );
    const fixtures = await import(
      "../../scripts/evaluation/breakthrough/src/fixtures"
    );
    const assemble = await import(
      "../../scripts/evaluation/breakthrough/src/assemble"
    );
    const synthetic = await import(
      "../../scripts/evaluation/breakthrough/src/syntheticContext"
    );
    const constants = await import(
      "../../scripts/evaluation/breakthrough/src/constants"
    );
    const hash = await import("../../scripts/evaluation/breakthrough/src/hash");

    appendBreakthroughDoctrine = doctrine.appendBreakthroughDoctrine;
    loadFrozenDoctrine = doctrine.loadFrozenDoctrine;
    resetDoctrineCacheForTests = doctrine.resetDoctrineCacheForTests;
    verifyBreakthroughAppendIntegrity =
      integrity.verifyBreakthroughAppendIntegrity;
    loadProspectFixtures = fixtures.loadProspectFixtures;
    assembleDeploymentStagePrompts = assemble.assembleDeploymentStagePrompts;
    assembleStrategicStagePrompts = assemble.assembleStrategicStagePrompts;
    buildSyntheticContextFromFixture =
      synthetic.buildSyntheticContextFromFixture;
    PILOT_ASSET_KEYS = constants.PILOT_ASSET_KEYS;
    sha256Text = hash.sha256Text;
  });

  it("loads 8 synthetic fixtures and 10 pilot assets", () => {
    const fixtures = loadProspectFixtures();
    assert.equal(fixtures.length, 8);
    assert.equal(PILOT_ASSET_KEYS.length, 10);
    assert.ok(fixtures.every((fixture) => fixture.notes.includes("Synthetic")));
  });

  it("appends doctrine once and keeps Standard clean", () => {
    resetDoctrineCacheForTests();
    const doctrine = loadFrozenDoctrine();
    const standard = "STANDARD_PROMPT_BODY\n=== REQUIRED OUTPUT ===\n";
    const breakthrough = appendBreakthroughDoctrine(standard, doctrine);
    const integrity = verifyBreakthroughAppendIntegrity({
      standardPrompt: standard,
      breakthroughPrompt: breakthrough,
      doctrineText: doctrine,
      doctrineHash: sha256Text(doctrine),
    });
    assert.equal(integrity.ok, true);
    assert.doesNotMatch(standard, /ATHENA BREAKTHROUGH DOCTRINE/);
    assert.match(breakthrough, /ATHENA BREAKTHROUGH DOCTRINE/);
    assert.equal(
      breakthrough.split("=== ATHENA BREAKTHROUGH DOCTRINE ===").length - 1,
      1,
    );
  });

  it("assembles Standard via production assemblers and Breakthrough via append-only", () => {
    resetDoctrineCacheForTests();
    const fixture = loadProspectFixtures()[0];
    assert.ok(fixture);
    const context = buildSyntheticContextFromFixture(fixture);
    const deployment = assembleDeploymentStagePrompts(context);
    const strategic = assembleStrategicStagePrompts(context);

    assert.equal(
      deployment.integrityOk,
      true,
      deployment.integrityErrors.join("; "),
    );
    assert.equal(
      strategic.integrityOk,
      true,
      strategic.integrityErrors.join("; "),
    );
    assert.doesNotMatch(
      deployment.standardPrompt,
      /ATHENA BREAKTHROUGH DOCTRINE/,
    );
    assert.match(deployment.breakthroughPrompt, /ATHENA BREAKTHROUGH DOCTRINE/);
    assert.match(deployment.standardPrompt, /PERSONALIZED_OUTREACH_EMAIL/);
    assert.ok(deployment.resolvedModel.length > 0);
    assert.ok(strategic.resolvedModel.length > 0);
  });

  it("refuses double-append", () => {
    resetDoctrineCacheForTests();
    const doctrine = loadFrozenDoctrine();
    const once = appendBreakthroughDoctrine("BASE\n", doctrine);
    assert.throws(() => appendBreakthroughDoctrine(once, doctrine));
  });

  it("remains isolated from production entrypoints", () => {
    const marker = "scripts/evaluation/breakthrough";
    for (const root of ["app", "workers", "components", "services"]) {
      const hit = grepPathForMarker(join(ROOT, root), marker);
      assert.equal(
        hit,
        null,
        `Production tree ${root} must not import harness (${hit ?? ""})`,
      );
    }
    assert.doesNotMatch(
      read("scripts/buildAthenaWorker.mjs"),
      /evaluation\/breakthrough/,
    );
  });

  it("does not modify production prompt constraint modules", () => {
    const deploymentAssembly = read(
      "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
    );
    assert.doesNotMatch(
      deploymentAssembly,
      /BREAKTHROUGH DOCTRINE|generationMode/,
    );
  });
});

function grepPathForMarker(dir: string, marker: string): string | null {
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) break;
    let entries: string[] = [];
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (
        entry === "node_modules" ||
        entry === ".git" ||
        entry === "dist" ||
        entry.startsWith(".")
      ) {
        continue;
      }
      const full = join(current, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          stack.push(full);
          continue;
        }
        if (!stat.isFile()) continue;
        if (!/\.(ts|tsx|js|mjs|cjs)$/.test(entry)) continue;
        if (readFileSync(full, "utf8").includes(marker)) {
          return full;
        }
      } catch {
        // ignore
      }
    }
  }
  return null;
}
