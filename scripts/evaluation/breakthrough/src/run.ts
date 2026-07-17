/**
 * Non-production Breakthrough evaluation harness CLI.
 *
 * Usage:
 *   node --import tsx scripts/evaluation/breakthrough/src/run.ts --assemble-only
 *   node --import tsx scripts/evaluation/breakthrough/src/run.ts --smoke
 *   node --import tsx scripts/evaluation/breakthrough/src/run.ts --full
 *   node --import tsx scripts/evaluation/breakthrough/src/run.ts --focused-v2-validate
 *   node --import tsx scripts/evaluation/breakthrough/src/run.ts --focused-v2
 *
 * Never imported by app/ or workers/. Never writes production tables.
 */

import "./loadEnv";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  FOCUSED_BASELINE_RUN_ID,
  HARNESS_VERSION,
  PILOT_ASSET_KEYS,
  PILOT_ASSET_META,
  PILOT_DEPLOYMENT_ASSET_KEYS,
  PILOT_STRATEGIC_ASSET_KEYS,
  PINNED_DOCTRINE_V2_SHA256,
} from "./constants";
import {
  assembleDeploymentStagePrompts,
  assembleStrategicStagePrompts,
} from "./assemble";
import {
  ensureArtifactDirs,
  writeBlindPair,
  writeRunReport,
  writeStagePrompts,
} from "./artifacts";
import { loadAllFocusedStandardBaselines } from "./baselines";
import { buildBlindPair } from "./blind";
import { assertDoctrineFilePinned, doctrineHash } from "./doctrine";
import {
  extractPilotDeploymentAssets,
  extractPilotStrategicAssets,
} from "./extract";
import {
  focusedStagesForProspect,
  getFocusedV2Pairs,
  uniqueFocusedProspectIds,
} from "./focusedPairs";
import { loadProspectFixtures } from "./fixtures";
import { generateStageOutput } from "./generate";
import { buildSyntheticContextFromFixture } from "./syntheticContext";

type Mode =
  | "assemble-only"
  | "smoke"
  | "full"
  | "focused-v2"
  | "focused-v2-validate";

function parseMode(argv: string[]): Mode {
  if (argv.includes("--focused-v2-validate")) return "focused-v2-validate";
  if (argv.includes("--focused-v2")) return "focused-v2";
  if (argv.includes("--full")) return "full";
  if (argv.includes("--smoke")) return "smoke";
  return "assemble-only";
}

async function runFocusedV2(mode: "focused-v2" | "focused-v2-validate") {
  const validateOnly = mode === "focused-v2-validate";
  const doctrineMeta = assertDoctrineFilePinned("v2");
  if (doctrineMeta.sha256 !== PINNED_DOCTRINE_V2_SHA256) {
    throw new Error("Doctrine v2 pin mismatch after load.");
  }

  const focusedPairs = getFocusedV2Pairs();
  const baselines = loadAllFocusedStandardBaselines(focusedPairs);
  const baselineByPairId = new Map(
    baselines.map((baseline) => [baseline.pairId, baseline]),
  );

  const runId = `run_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const runRoot = ensureArtifactDirs(runId);
  const fixtures = loadProspectFixtures();
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));

  const report: Record<string, unknown> = {
    harnessVersion: HARNESS_VERSION,
    runId,
    mode,
    doctrineVersion: "v2",
    doctrineHash: doctrineMeta.sha256,
    baselineRunId: FOCUSED_BASELINE_RUN_ID,
    standardRegenerated: false,
    startedAt: new Date().toISOString(),
    prospectCount: uniqueFocusedProspectIds().length,
    pairCount: focusedPairs.length,
    pairs: [] as unknown[],
    integrityFailures: [] as string[],
    generationErrors: [] as string[],
    baselineErrors: [] as string[],
    plannedStageGenerations: [] as unknown[],
  };

  console.log(`[breakthrough-eval] mode=${mode} runId=${runId}`);
  console.log(
    `[breakthrough-eval] focusedPairs=${focusedPairs.length} doctrine=v2 hash=${doctrineMeta.sha256}`,
  );
  console.log(
    `[breakthrough-eval] standardBaselines=${baselines.length} from ${FOCUSED_BASELINE_RUN_ID}`,
  );

  // Validate every focused pair has a baseline (already thrown if missing).
  for (const pair of focusedPairs) {
    const baseline = baselineByPairId.get(pair.pairId);
    if (!baseline) {
      throw new Error(`Internal error: missing baseline for ${pair.pairId}`);
    }
    if (baseline.prospectId !== pair.prospectId || baseline.assetKey !== pair.assetKey) {
      throw new Error(`Baseline identity mismatch for ${pair.pairId}`);
    }
  }

  const stagesNeeded: Array<{
    prospectId: string;
    stage: "deployment_assets" | "strategic_blueprint";
  }> = [];
  for (const prospectId of uniqueFocusedProspectIds()) {
    for (const stage of focusedStagesForProspect(prospectId)) {
      stagesNeeded.push({ prospectId, stage });
    }
  }
  report.plannedStageGenerations = stagesNeeded;

  if (validateOnly) {
    // Assemble Breakthrough prompts with K v2 for integrity checks; no LLM.
    for (const prospectId of uniqueFocusedProspectIds()) {
      const fixture = fixtureById.get(prospectId);
      if (!fixture) {
        throw new Error(`Missing fixture for focused prospect ${prospectId}`);
      }
      const context = buildSyntheticContextFromFixture(fixture);
      for (const stage of focusedStagesForProspect(prospectId)) {
        const pair =
          stage === "deployment_assets"
            ? assembleDeploymentStagePrompts(context, "v2")
            : assembleStrategicStagePrompts(context, "v2");
        writeStagePrompts({ runRoot, prospectId, pair });
        if (!pair.integrityOk) {
          const message = `${prospectId}/${stage}: ${pair.integrityErrors.join("; ")}`;
          (report.integrityFailures as string[]).push(message);
        }
        if (pair.standardPrompt.includes("ATHENA BREAKTHROUGH DOCTRINE")) {
          (report.integrityFailures as string[]).push(
            `${prospectId}/${stage}: Standard contaminated with doctrine`,
          );
        }
        if (pair.doctrineHash !== PINNED_DOCTRINE_V2_SHA256) {
          (report.integrityFailures as string[]).push(
            `${prospectId}/${stage}: wrong doctrine hash loaded`,
          );
        }
      }
    }

    for (const pair of focusedPairs) {
      const baseline = baselineByPairId.get(pair.pairId)!;
      (report.pairs as unknown[]).push({
        pairId: pair.pairId,
        prospectId: pair.prospectId,
        assetKey: pair.assetKey,
        stage: pair.stage,
        standardBaselineChars: baseline.standardText.length,
        baselineResolvedModel: baseline.resolvedModel,
        baselineIntegrityOk: baseline.integrityOk,
        standardPromptSha256: baseline.standardPromptSha256,
        generateStandard: false,
        generateBreakthrough: true,
        status: "validated-plan-only",
      });
    }

    report.finishedAt = new Date().toISOString();
    report.validationOnly = true;
    const reportPath = writeRunReport({ runId, report });
    console.log(`[breakthrough-eval] focused validation OK pairs=${focusedPairs.length}`);
    console.log(`[breakthrough-eval] report ${reportPath}`);
    console.log(`[breakthrough-eval] artifacts ${runRoot}`);
    if ((report.integrityFailures as string[]).length > 0) {
      process.exitCode = 2;
    }
    return;
  }

  // Live focused generation: Breakthrough only (Standard from baselines).
  const btRawByProspectStage = new Map<string, string>();

  for (const prospectId of uniqueFocusedProspectIds()) {
    const fixture = fixtureById.get(prospectId);
    if (!fixture) {
      throw new Error(`Missing fixture for focused prospect ${prospectId}`);
    }
    const context = buildSyntheticContextFromFixture(fixture);

    for (const stage of focusedStagesForProspect(prospectId)) {
      const assembled =
        stage === "deployment_assets"
          ? assembleDeploymentStagePrompts(context, "v2")
          : assembleStrategicStagePrompts(context, "v2");
      writeStagePrompts({ runRoot, prospectId, pair: assembled });

      if (!assembled.integrityOk) {
        const message = `${prospectId}/${stage}: ${assembled.integrityErrors.join("; ")}`;
        (report.integrityFailures as string[]).push(message);
        console.error(`[breakthrough-eval] INTEGRITY FAIL ${message}`);
      }

      const generated = await generateStageOutput({
        stage,
        mode: "breakthrough",
        prompt: assembled.breakthroughPrompt,
        discussionId: context.discussion.id,
      });
      if (generated.error) {
        (report.generationErrors as string[]).push(
          `${prospectId}/${stage}/breakthrough: ${generated.error}`,
        );
      }
      const key = `${prospectId}::${stage}`;
      btRawByProspectStage.set(key, generated.rawResponse);
      writeFileSync(
        join(
          runRoot,
          "raw",
          stage === "deployment_assets"
            ? `${prospectId}.deployment.breakthrough.txt`
            : `${prospectId}.strategic.breakthrough.txt`,
        ),
        generated.rawResponse,
        "utf8",
      );
    }

    console.log(`[breakthrough-eval] completed fixture ${prospectId}`);
  }

  for (const pair of focusedPairs) {
    const baseline = baselineByPairId.get(pair.pairId)!;
    const rawKey = `${pair.prospectId}::${pair.stage}`;
    const btRaw = btRawByProspectStage.get(rawKey) ?? "";
    const extracted =
      pair.stage === "deployment_assets"
        ? extractPilotDeploymentAssets(btRaw)[
            pair.assetKey as (typeof PILOT_DEPLOYMENT_ASSET_KEYS)[number]
          ]
        : extractPilotStrategicAssets(btRaw)[
            pair.assetKey as (typeof PILOT_STRATEGIC_ASSET_KEYS)[number]
          ];
    const breakthroughText = (extracted ?? "").trim();

    const blind = buildBlindPair({
      prospectId: pair.prospectId,
      assetKey: pair.assetKey,
      standardText: baseline.standardText,
      breakthroughText,
    });
    writeBlindPair({ runRoot, pair: blind });

    (report.pairs as unknown[]).push({
      pairId: blind.pairId,
      prospectId: pair.prospectId,
      assetKey: pair.assetKey,
      stage: pair.stage,
      baselineRunId: FOCUSED_BASELINE_RUN_ID,
      baselineResolvedModel: baseline.resolvedModel,
      baselineLlmRole: baseline.llmRole,
      standardPromptSha256: baseline.standardPromptSha256,
      standardRegenerated: false,
      doctrineVersion: "v2",
      doctrineHash: doctrineMeta.sha256,
    });
  }

  report.finishedAt = new Date().toISOString();
  const reportPath = writeRunReport({ runId, report });
  console.log(`[breakthrough-eval] report ${reportPath}`);
  console.log(`[breakthrough-eval] artifacts ${runRoot}`);
  if ((report.integrityFailures as string[]).length > 0) {
    process.exitCode = 2;
  }
}

async function runClassic(
  mode: "assemble-only" | "smoke" | "full",
) {
  const runId = `run_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const runRoot = ensureArtifactDirs(runId);
  const fixtures = loadProspectFixtures();
  const selected = mode === "smoke" ? fixtures.slice(0, 3) : fixtures;

  const report: Record<string, unknown> = {
    harnessVersion: HARNESS_VERSION,
    runId,
    mode,
    doctrineVersion: "v1",
    doctrineHash: doctrineHash(process.cwd(), "v1"),
    startedAt: new Date().toISOString(),
    prospectCount: selected.length,
    assetCount: PILOT_ASSET_KEYS.length,
    pairs: [] as unknown[],
    integrityFailures: [] as string[],
    generationErrors: [] as string[],
  };

  console.log(`[breakthrough-eval] mode=${mode} runId=${runId}`);
  console.log(
    `[breakthrough-eval] fixtures=${selected.length} assets=${PILOT_ASSET_KEYS.length}`,
  );

  for (const fixture of selected) {
    const context = buildSyntheticContextFromFixture(fixture);
    const deploymentPair = assembleDeploymentStagePrompts(context, "v1");
    const strategicPair = assembleStrategicStagePrompts(context, "v1");

    writeStagePrompts({
      runRoot,
      prospectId: fixture.id,
      pair: deploymentPair,
    });
    writeStagePrompts({
      runRoot,
      prospectId: fixture.id,
      pair: strategicPair,
    });

    for (const pair of [deploymentPair, strategicPair]) {
      if (!pair.integrityOk) {
        const message = `${fixture.id}/${pair.stage}: ${pair.integrityErrors.join("; ")}`;
        (report.integrityFailures as string[]).push(message);
        console.error(`[breakthrough-eval] INTEGRITY FAIL ${message}`);
      }
    }

    let deploymentStandardRaw = "";
    let deploymentBreakthroughRaw = "";
    let strategicStandardRaw = "";
    let strategicBreakthroughRaw = "";

    if (mode !== "assemble-only") {
      const dStd = await generateStageOutput({
        stage: "deployment_assets",
        mode: "standard",
        prompt: deploymentPair.standardPrompt,
        discussionId: context.discussion.id,
      });
      const dBt = await generateStageOutput({
        stage: "deployment_assets",
        mode: "breakthrough",
        prompt: deploymentPair.breakthroughPrompt,
        discussionId: context.discussion.id,
      });
      const sStd = await generateStageOutput({
        stage: "strategic_blueprint",
        mode: "standard",
        prompt: strategicPair.standardPrompt,
        discussionId: context.discussion.id,
      });
      const sBt = await generateStageOutput({
        stage: "strategic_blueprint",
        mode: "breakthrough",
        prompt: strategicPair.breakthroughPrompt,
        discussionId: context.discussion.id,
      });

      for (const call of [dStd, dBt, sStd, sBt]) {
        if (call.error) {
          (report.generationErrors as string[]).push(
            `${fixture.id}/${call.stage}/${call.mode}: ${call.error}`,
          );
        }
      }

      deploymentStandardRaw = dStd.rawResponse;
      deploymentBreakthroughRaw = dBt.rawResponse;
      strategicStandardRaw = sStd.rawResponse;
      strategicBreakthroughRaw = sBt.rawResponse;

      writeFileSync(
        join(runRoot, "raw", `${fixture.id}.deployment.standard.txt`),
        deploymentStandardRaw,
        "utf8",
      );
      writeFileSync(
        join(runRoot, "raw", `${fixture.id}.deployment.breakthrough.txt`),
        deploymentBreakthroughRaw,
        "utf8",
      );
      writeFileSync(
        join(runRoot, "raw", `${fixture.id}.strategic.standard.txt`),
        strategicStandardRaw,
        "utf8",
      );
      writeFileSync(
        join(runRoot, "raw", `${fixture.id}.strategic.breakthrough.txt`),
        strategicBreakthroughRaw,
        "utf8",
      );
    }

    const stdDeploy = extractPilotDeploymentAssets(deploymentStandardRaw);
    const btDeploy = extractPilotDeploymentAssets(deploymentBreakthroughRaw);
    const stdStrategic = extractPilotStrategicAssets(strategicStandardRaw);
    const btStrategic = extractPilotStrategicAssets(strategicBreakthroughRaw);

    for (const assetKey of PILOT_ASSET_KEYS) {
      const meta = PILOT_ASSET_META[assetKey];
      const standardText =
        meta.stage === "deployment_assets"
          ? stdDeploy[assetKey as (typeof PILOT_DEPLOYMENT_ASSET_KEYS)[number]] ??
            (mode === "assemble-only"
              ? `_(assemble-only; no generation for ${assetKey})_`
              : "")
          : stdStrategic[assetKey as (typeof PILOT_STRATEGIC_ASSET_KEYS)[number]] ??
            (mode === "assemble-only"
              ? `_(assemble-only; no generation for ${assetKey})_`
              : "");
      const breakthroughText =
        meta.stage === "deployment_assets"
          ? btDeploy[assetKey as (typeof PILOT_DEPLOYMENT_ASSET_KEYS)[number]] ??
            (mode === "assemble-only"
              ? `_(assemble-only; no generation for ${assetKey})_`
              : "")
          : btStrategic[assetKey as (typeof PILOT_STRATEGIC_ASSET_KEYS)[number]] ??
            (mode === "assemble-only"
              ? `_(assemble-only; no generation for ${assetKey})_`
              : "");

      const blind = buildBlindPair({
        prospectId: fixture.id,
        assetKey,
        standardText,
        breakthroughText,
      });
      writeBlindPair({ runRoot, pair: blind });
      (report.pairs as unknown[]).push({
        pairId: blind.pairId,
        prospectId: fixture.id,
        assetKey,
        stage: meta.stage,
        deploymentIntegrityOk: deploymentPair.integrityOk,
        strategicIntegrityOk: strategicPair.integrityOk,
        resolvedModels: {
          deployment_assets: deploymentPair.resolvedModel,
          strategic_blueprint: strategicPair.resolvedModel,
        },
      });
    }

    console.log(`[breakthrough-eval] completed fixture ${fixture.id}`);
  }

  report.finishedAt = new Date().toISOString();
  const reportPath = writeRunReport({ runId, report });
  console.log(`[breakthrough-eval] report ${reportPath}`);
  console.log(`[breakthrough-eval] artifacts ${runRoot}`);

  if ((report.integrityFailures as string[]).length > 0) {
    process.exitCode = 2;
  }
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  if (mode === "focused-v2" || mode === "focused-v2-validate") {
    await runFocusedV2(mode);
    return;
  }
  await runClassic(mode);
}

main().catch((error) => {
  console.error("[breakthrough-eval] fatal", error);
  process.exitCode = 1;
});
