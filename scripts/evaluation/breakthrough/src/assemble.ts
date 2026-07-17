/**
 * Prompt assembly for evaluation — reuses production assemblers unchanged.
 */

import { assembleDeploymentAssetsPrompt } from "@/services/brain/generationContracts/deploymentAssetsPromptAssembly";
import { assembleStrategicBlueprintPrompt } from "@/services/brain/generationContracts/generationPromptAssembly";
import { resolveModelForStage } from "@/lib/llm/modelRouting";
import type { AthenaLLMStage } from "@/lib/llm/modelRouting";
import { appendBreakthroughDoctrine, doctrineHash, loadFrozenDoctrine } from "./doctrine";
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
  resolvedModel: string;
  llmRole: string;
  integrityOk: boolean;
  integrityErrors: string[];
};

export function assembleDeploymentStagePrompts(
  context: AssembledFixtureContext,
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

  return finalizePair("deployment_assets", standardPrompt);
}

export function assembleStrategicStagePrompts(
  context: AssembledFixtureContext,
): StagePromptPair {
  const standardPrompt = assembleStrategicBlueprintPrompt({
    bundle: context.bundle,
    discussion: context.discussion as unknown as Record<string, unknown>,
    analysis: context.analysis,
    opportunity: context.opportunity,
    briefing: context.briefing,
    regenerationRunId: `breakthrough-eval-${context.discussion.id}`,
  });

  return finalizePair("strategic_blueprint", standardPrompt);
}

function finalizePair(
  stage: AthenaLLMStage,
  standardPrompt: string,
): StagePromptPair {
  const doctrineText = loadFrozenDoctrine();
  const doctrineSha = doctrineHash();
  const breakthroughPrompt = appendBreakthroughDoctrine(
    standardPrompt,
    doctrineText,
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
    resolvedModel: route.model,
    llmRole: route.role,
    integrityOk: integrity.ok,
    integrityErrors: integrity.errors,
  };
}
