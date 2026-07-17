/**
 * Prompt assembly for evaluation — reuses production assemblers unchanged.
 */

import { assembleDeploymentAssetsPrompt } from "@/services/brain/generationContracts/deploymentAssetsPromptAssembly";
import { assembleStrategicBlueprintPrompt } from "@/services/brain/generationContracts/generationPromptAssembly";
import { resolveModelForStage } from "@/lib/llm/modelRouting";
import type { AthenaLLMStage } from "@/lib/llm/modelRouting";
import type { DoctrineVersion } from "./constants";
import {
  appendBreakthroughDoctrine,
  doctrineHash,
  loadFrozenDoctrine,
} from "./doctrine";
import { sha256Text } from "./hash";
import { verifyBreakthroughAppendIntegrity } from "./integrity";
import type { AssembledFixtureContext } from "./syntheticContext";

export type StagePromptPair = {
  stage: AthenaLLMStage;
  standardPrompt: string;
  breakthroughPrompt: string;
  standardPromptSha256: string;
  breakthroughPromptSha256: string;
  doctrineHash: string;
  doctrineVersion: DoctrineVersion;
  resolvedModel: string;
  llmRole: string;
  integrityOk: boolean;
  integrityErrors: string[];
};

export function assembleDeploymentStagePrompts(
  context: AssembledFixtureContext,
  doctrineVersion: DoctrineVersion = "v1",
): StagePromptPair {
  const standardPrompt = assembleDeploymentAssetsPrompt({
    bundle: context.bundle,
    discussion: context.discussion,
    analysis: context.analysis,
    opportunity: context.opportunity,
    briefing: context.briefing,
    regenerationRunId: `breakthrough-eval-${context.discussion.id}`,
    brandIdentity: null,
    websiteIntelligence: context.websiteIntelligence,
  });

  return finalizePair("deployment_assets", standardPrompt, doctrineVersion);
}

export function assembleStrategicStagePrompts(
  context: AssembledFixtureContext,
  doctrineVersion: DoctrineVersion = "v1",
): StagePromptPair {
  const standardPrompt = assembleStrategicBlueprintPrompt({
    bundle: context.bundle,
    discussion: context.discussion as unknown as Record<string, unknown>,
    analysis: context.analysis,
    opportunity: context.opportunity,
    briefing: context.briefing,
    regenerationRunId: `breakthrough-eval-${context.discussion.id}`,
  });

  return finalizePair("strategic_blueprint", standardPrompt, doctrineVersion);
}

function finalizePair(
  stage: AthenaLLMStage,
  standardPrompt: string,
  doctrineVersion: DoctrineVersion,
): StagePromptPair {
  const doctrineText = loadFrozenDoctrine(process.cwd(), doctrineVersion);
  const doctrineSha = doctrineHash(process.cwd(), doctrineVersion);
  const breakthroughPrompt = appendBreakthroughDoctrine(
    standardPrompt,
    doctrineText,
    doctrineVersion,
  );
  const integrity = verifyBreakthroughAppendIntegrity({
    standardPrompt,
    breakthroughPrompt,
    doctrineText,
    doctrineHash: doctrineSha,
  });
  const route = resolveModelForStage(stage);

  return {
    stage,
    standardPrompt,
    breakthroughPrompt,
    standardPromptSha256: sha256Text(standardPrompt),
    breakthroughPromptSha256: sha256Text(breakthroughPrompt),
    doctrineHash: doctrineSha,
    doctrineVersion,
    resolvedModel: route.model,
    llmRole: route.role,
    integrityOk: integrity.ok,
    integrityErrors: integrity.errors,
  };
}
