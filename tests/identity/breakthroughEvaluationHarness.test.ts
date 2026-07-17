/**
 * Non-production Breakthrough evaluation harness — isolation + integrity.
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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
  let assertDoctrineFilePinned: typeof import("../../scripts/evaluation/breakthrough/src/doctrine").assertDoctrineFilePinned;
  let verifyBreakthroughAppendIntegrity: typeof import("../../scripts/evaluation/breakthrough/src/integrity").verifyBreakthroughAppendIntegrity;
  let loadProspectFixtures: typeof import("../../scripts/evaluation/breakthrough/src/fixtures").loadProspectFixtures;
  let assembleDeploymentStagePrompts: typeof import("../../scripts/evaluation/breakthrough/src/assemble").assembleDeploymentStagePrompts;
  let assembleStrategicStagePrompts: typeof import("../../scripts/evaluation/breakthrough/src/assemble").assembleStrategicStagePrompts;
  let buildSyntheticContextFromFixture: typeof import("../../scripts/evaluation/breakthrough/src/syntheticContext").buildSyntheticContextFromFixture;
  let PILOT_ASSET_KEYS: typeof import("../../scripts/evaluation/breakthrough/src/constants").PILOT_ASSET_KEYS;
  let PINNED_DOCTRINE_V1_SHA256: typeof import("../../scripts/evaluation/breakthrough/src/constants").PINNED_DOCTRINE_V1_SHA256;
  let PINNED_DOCTRINE_V2_SHA256: typeof import("../../scripts/evaluation/breakthrough/src/constants").PINNED_DOCTRINE_V2_SHA256;
  let FOCUSED_BASELINE_RUN_ID: typeof import("../../scripts/evaluation/breakthrough/src/constants").FOCUSED_BASELINE_RUN_ID;
  let sha256Text: typeof import("../../scripts/evaluation/breakthrough/src/hash").sha256Text;
  let sha256FileBytes: typeof import("../../scripts/evaluation/breakthrough/src/hash").sha256FileBytes;
  let getFocusedV2Pairs: typeof import("../../scripts/evaluation/breakthrough/src/focusedPairs").getFocusedV2Pairs;
  let FOCUSED_V2_PAIR_IDS: typeof import("../../scripts/evaluation/breakthrough/src/focusedPairs").FOCUSED_V2_PAIR_IDS;
  let loadAllFocusedStandardBaselines: typeof import("../../scripts/evaluation/breakthrough/src/baselines").loadAllFocusedStandardBaselines;

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
    const focused = await import(
      "../../scripts/evaluation/breakthrough/src/focusedPairs"
    );
    const baselines = await import(
      "../../scripts/evaluation/breakthrough/src/baselines"
    );

    appendBreakthroughDoctrine = doctrine.appendBreakthroughDoctrine;
    loadFrozenDoctrine = doctrine.loadFrozenDoctrine;
    resetDoctrineCacheForTests = doctrine.resetDoctrineCacheForTests;
    assertDoctrineFilePinned = doctrine.assertDoctrineFilePinned;
    verifyBreakthroughAppendIntegrity =
      integrity.verifyBreakthroughAppendIntegrity;
    loadProspectFixtures = fixtures.loadProspectFixtures;
    assembleDeploymentStagePrompts = assemble.assembleDeploymentStagePrompts;
    assembleStrategicStagePrompts = assemble.assembleStrategicStagePrompts;
    buildSyntheticContextFromFixture =
      synthetic.buildSyntheticContextFromFixture;
    PILOT_ASSET_KEYS = constants.PILOT_ASSET_KEYS;
    PINNED_DOCTRINE_V1_SHA256 = constants.PINNED_DOCTRINE_V1_SHA256;
    PINNED_DOCTRINE_V2_SHA256 = constants.PINNED_DOCTRINE_V2_SHA256;
    FOCUSED_BASELINE_RUN_ID = constants.FOCUSED_BASELINE_RUN_ID;
    sha256Text = hash.sha256Text;
    sha256FileBytes = hash.sha256FileBytes;
    getFocusedV2Pairs = focused.getFocusedV2Pairs;
    FOCUSED_V2_PAIR_IDS = focused.FOCUSED_V2_PAIR_IDS;
    loadAllFocusedStandardBaselines = baselines.loadAllFocusedStandardBaselines;
  });

  it("loads 8 synthetic fixtures and 10 pilot assets", () => {
    const fixtures = loadProspectFixtures();
    assert.equal(fixtures.length, 8);
    assert.equal(PILOT_ASSET_KEYS.length, 10);
    assert.ok(fixtures.every((fixture) => fixture.notes.includes("Synthetic")));
  });

  it("preserves K v1 and pins distinct non-empty K v2", () => {
    const v1Path = join(
      ROOT,
      "scripts/evaluation/breakthrough/doctrine/breakthrough_doctrine.v1.txt",
    );
    const v2Path = join(
      ROOT,
      "scripts/evaluation/breakthrough/doctrine/breakthrough_doctrine.v2.txt",
    );
    assert.ok(existsSync(v1Path));
    assert.ok(existsSync(v2Path));
    assert.ok(statSync(v2Path).size > 0);

    const v1Pinned = assertDoctrineFilePinned("v1");
    const v2Pinned = assertDoctrineFilePinned("v2");
    assert.equal(v1Pinned.sha256, PINNED_DOCTRINE_V1_SHA256);
    assert.equal(v2Pinned.sha256, PINNED_DOCTRINE_V2_SHA256);
    assert.equal(sha256FileBytes(v1Path), PINNED_DOCTRINE_V1_SHA256);
    assert.equal(sha256FileBytes(v2Path), PINNED_DOCTRINE_V2_SHA256);
    assert.notEqual(PINNED_DOCTRINE_V1_SHA256, PINNED_DOCTRINE_V2_SHA256);
    assert.notEqual(readFileSync(v1Path, "utf8"), readFileSync(v2Path, "utf8"));
  });

  it("appends doctrine once and keeps Standard clean", () => {
    resetDoctrineCacheForTests();
    const doctrine = loadFrozenDoctrine(ROOT, "v1");
    const standard = "STANDARD_PROMPT_BODY\n=== REQUIRED OUTPUT ===\n";
    const breakthrough = appendBreakthroughDoctrine(standard, doctrine, "v1");
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

  it("appends K v2 exactly once for Breakthrough and never to Standard", () => {
    resetDoctrineCacheForTests();
    const fixture = loadProspectFixtures()[0];
    assert.ok(fixture);
    const context = buildSyntheticContextFromFixture(fixture);
    const deployment = assembleDeploymentStagePrompts(context, "v2");
    assert.equal(deployment.doctrineVersion, "v2");
    assert.equal(deployment.doctrineHash, PINNED_DOCTRINE_V2_SHA256);
    assert.equal(deployment.integrityOk, true, deployment.integrityErrors.join("; "));
    assert.doesNotMatch(
      deployment.standardPrompt,
      /ATHENA BREAKTHROUGH DOCTRINE/,
    );
    assert.match(deployment.breakthroughPrompt, /Premise Test/);
    assert.match(deployment.breakthroughPrompt, /Zero-fabrication/);
    assert.equal(
      deployment.breakthroughPrompt.split("=== ATHENA BREAKTHROUGH DOCTRINE ===")
        .length - 1,
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
    const doctrine = loadFrozenDoctrine(ROOT, "v2");
    const once = appendBreakthroughDoctrine("BASE\n", doctrine, "v2");
    assert.throws(() => appendBreakthroughDoctrine(once, doctrine, "v2"));
  });

  it("focused selection is exactly 32 unique pairs with Standard baselines", () => {
    assert.equal(FOCUSED_V2_PAIR_IDS.length, 32);
    const pairs = getFocusedV2Pairs();
    assert.equal(pairs.length, 32);
    assert.equal(new Set(pairs.map((pair) => pair.pairId)).size, 32);

    const baselineRoot = join(
      ROOT,
      "scripts/evaluation/breakthrough/out",
      FOCUSED_BASELINE_RUN_ID,
    );
    assert.ok(
      existsSync(baselineRoot),
      `Frozen baseline run missing: ${FOCUSED_BASELINE_RUN_ID}`,
    );

    const baselines = loadAllFocusedStandardBaselines(pairs);
    assert.equal(baselines.length, 32);
    for (const baseline of baselines) {
      assert.ok(baseline.standardText.trim().length > 0);
      assert.equal(baseline.baselineRunId, FOCUSED_BASELINE_RUN_ID);
      assert.ok(baseline.resolvedModel.length > 0);
      assert.ok(baseline.standardPromptSha256.length === 64);
      assert.equal(baseline.integrityOk, true);
    }
  });

  it("focused mode source does not invoke Standard generation", () => {
    const runSource = read("scripts/evaluation/breakthrough/src/run.ts");
    assert.match(runSource, /--focused-v2/);
    assert.match(runSource, /focused-v2-validate/);
    assert.match(runSource, /standardRegenerated: false/);
    // Within focused path, Standard generateStageOutput mode must not be requested.
    const focusedFn = runSource.slice(
      runSource.indexOf("async function runFocusedV2"),
      runSource.indexOf("async function runClassic"),
    );
    assert.doesNotMatch(
      focusedFn,
      /generateStageOutput\(\{[\s\S]*mode:\s*"standard"/,
    );
    assert.match(focusedFn, /mode:\s*"breakthrough"/);
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
