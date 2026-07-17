/**
 * Non-production Breakthrough evaluation harness CLI.
 *
 * Usage:
 *   node --import tsx scripts/evaluation/breakthrough/src/run.ts --assemble-only
 *   node --import tsx scripts/evaluation/breakthrough/src/run.ts --smoke
 *   node --import tsx scripts/evaluation/breakthrough/src/run.ts --full
 *
 * Never imported by app/ or workers/. Never writes production tables.
 */

import "./loadEnv";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  HARNESS_VERSION,
  PILOT_ASSET_KEYS,
  PILOT_ASSET_META,
  PILOT_DEPLOYMENT_ASSET_KEYS,
  PILOT_STRATEGIC_ASSET_KEYS,
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
import { buildBlindPair } from "./blind";
import { doctrineHash } from "./doctrine";
import {
  extractPilotDeploymentAssets,
  extractPilotStrategicAssets,
} from "./extract";
import { loadProspectFixtures } from "./fixtures";
import { generateStageOutput } from "./generate";
import { buildSyntheticContextFromFixture } from "./syntheticContext";

type Mode = "assemble-only" | "smoke" | "full";

function parseMode(argv: string[]): Mode {
  if (argv.includes("--full")) return "full";
  if (argv.includes("--smoke")) return "smoke";
  return "assemble-only";
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const runId = `run_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const runRoot = ensureArtifactDirs(runId);
  const fixtures = loadProspectFixtures();
  const selected =
    mode === "smoke" ? fixtures.slice(0, 3) : fixtures;

  const report: Record<string, unknown> = {
    harnessVersion: HARNESS_VERSION,
    runId,
    mode,
    doctrineHash: doctrineHash(),
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
    const deploymentPair = assembleDeploymentStagePrompts(context);
    const strategicPair = assembleStrategicStagePrompts(context);

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

main().catch((error) => {
  console.error("[breakthrough-eval] fatal", error);
  process.exitCode = 1;
});
