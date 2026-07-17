/**
 * Read-only Standard baselines from the frozen original full pilot run.
 * Never regenerates or mutates Standard outputs.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FOCUSED_BASELINE_RUN_ID,
  PILOT_ASSET_META,
  type PilotAssetKey,
} from "./constants";
import {
  extractPilotDeploymentAssets,
  extractPilotStrategicAssets,
} from "./extract";
import type { FocusedPairSpec } from "./focusedPairs";
import { outDir } from "./paths";

export type StandardBaseline = {
  pairId: string;
  prospectId: string;
  assetKey: PilotAssetKey;
  stage: "deployment_assets" | "strategic_blueprint";
  standardText: string;
  baselineRunId: string;
  resolvedModel: string;
  llmRole: string;
  integrityOk: boolean;
  standardPromptSha256: string;
  source: {
    rawPath: string;
    integrityPath: string;
  };
};

function baselineRunRoot(cwd = process.cwd()): string {
  return join(outDir(cwd), FOCUSED_BASELINE_RUN_ID);
}

function loadIntegrity(
  prospectId: string,
  stage: "deployment_assets" | "strategic_blueprint",
  cwd = process.cwd(),
): {
  resolvedModel: string;
  llmRole: string;
  integrityOk: boolean;
  standardPromptSha256: string;
  path: string;
} {
  const path = join(
    baselineRunRoot(cwd),
    "prompts",
    prospectId,
    stage,
    "integrity.json",
  );
  if (!existsSync(path)) {
    throw new Error(
      `Missing Standard baseline integrity for ${prospectId}/${stage} at ${path}`,
    );
  }
  const data = JSON.parse(readFileSync(path, "utf8")) as {
    resolvedModel?: string;
    llmRole?: string;
    integrityOk?: boolean;
    standardPromptSha256?: string;
  };
  if (!data.resolvedModel || !data.llmRole || !data.standardPromptSha256) {
    throw new Error(
      `Malformed integrity metadata for ${prospectId}/${stage}: missing model/role/hash.`,
    );
  }
  return {
    resolvedModel: data.resolvedModel,
    llmRole: data.llmRole,
    integrityOk: data.integrityOk === true,
    standardPromptSha256: data.standardPromptSha256,
    path,
  };
}

function loadStandardRaw(
  prospectId: string,
  stage: "deployment_assets" | "strategic_blueprint",
  cwd = process.cwd(),
): { text: string; path: string } {
  const fileName =
    stage === "deployment_assets"
      ? `${prospectId}.deployment.standard.txt`
      : `${prospectId}.strategic.standard.txt`;
  const path = join(baselineRunRoot(cwd), "raw", fileName);
  if (!existsSync(path)) {
    throw new Error(
      `Missing Standard baseline raw for ${prospectId}/${stage} at ${path}`,
    );
  }
  const text = readFileSync(path, "utf8");
  if (!text.trim()) {
    throw new Error(
      `Empty Standard baseline raw for ${prospectId}/${stage} at ${path}`,
    );
  }
  return { text, path };
}

export function loadStandardBaselineForPair(
  pair: FocusedPairSpec,
  cwd = process.cwd(),
): StandardBaseline {
  const stage = PILOT_ASSET_META[pair.assetKey].stage;
  if (stage !== pair.stage) {
    throw new Error(
      `Stage mismatch for ${pair.pairId}: meta=${stage} spec=${pair.stage}`,
    );
  }
  const integrity = loadIntegrity(pair.prospectId, stage, cwd);
  const raw = loadStandardRaw(pair.prospectId, stage, cwd);

  const extracted =
    stage === "deployment_assets"
      ? extractPilotDeploymentAssets(raw.text)[pair.assetKey as never]
      : extractPilotStrategicAssets(raw.text)[pair.assetKey as never];

  const standardText = (extracted ?? "").trim();
  if (!standardText) {
    throw new Error(
      `Standard baseline missing or empty for focused pair ${pair.pairId}. ` +
        `Refusing to regenerate Standard.`,
    );
  }

  return {
    pairId: pair.pairId,
    prospectId: pair.prospectId,
    assetKey: pair.assetKey,
    stage,
    standardText,
    baselineRunId: FOCUSED_BASELINE_RUN_ID,
    resolvedModel: integrity.resolvedModel,
    llmRole: integrity.llmRole,
    integrityOk: integrity.integrityOk,
    standardPromptSha256: integrity.standardPromptSha256,
    source: {
      rawPath: raw.path,
      integrityPath: integrity.path,
    },
  };
}

/**
 * Load and validate Standard baselines for every focused pair.
 * Throws on any missing/malformed/empty baseline.
 */
export function loadAllFocusedStandardBaselines(
  pairs: FocusedPairSpec[],
  cwd = process.cwd(),
): StandardBaseline[] {
  const root = baselineRunRoot(cwd);
  if (!existsSync(root)) {
    throw new Error(
      `Frozen baseline run not found: ${FOCUSED_BASELINE_RUN_ID} under ${root}`,
    );
  }
  return pairs.map((pair) => loadStandardBaselineForPair(pair, cwd));
}
