import type {
  BuildGenerationContractParams,
  GenerationContract,
  GenerationWorkflowType,
} from "@/services/brain/generationContracts/generationContractTypes";
import {
  buildDeploymentAssetContract,
  buildDiscussionAnalysisContract,
  buildExecutiveBriefingContract,
  buildOpportunityContract,
  buildStrategicBlueprintContract,
} from "@/services/brain/generationContracts/contractHelpers";

export function buildGenerationContract(
  params: BuildGenerationContractParams,
): GenerationContract {
  switch (params.workflowType) {
    case "discussion_analysis":
      return buildDiscussionAnalysisContract(params);
    case "opportunity":
      return buildOpportunityContract(params);
    case "executive_briefing":
      return buildExecutiveBriefingContract(params);
    case "deployment_asset":
      return buildDeploymentAssetContract(params);
    case "strategic_blueprint":
      return buildStrategicBlueprintContract(params);
    default: {
      const exhaustive: never = params.workflowType;
      throw new Error(`Unsupported workflow type: ${exhaustive}`);
    }
  }
}

export function resolveWorkflowContractBuilder(
  workflowType: GenerationWorkflowType,
) {
  switch (workflowType) {
    case "discussion_analysis":
      return buildDiscussionAnalysisContract;
    case "opportunity":
      return buildOpportunityContract;
    case "executive_briefing":
      return buildExecutiveBriefingContract;
    case "deployment_asset":
      return buildDeploymentAssetContract;
    case "strategic_blueprint":
      return buildStrategicBlueprintContract;
    default: {
      const exhaustive: never = workflowType;
      throw new Error(`Unsupported workflow type: ${exhaustive}`);
    }
  }
}
