import { assertOrganizationId } from "@/services/brain/brainContextBuilder";
import {
  buildBusinessUnderstanding,
  buildExecutiveSummary,
  buildMarketUnderstanding,
  buildOpportunityUnderstanding,
  buildPriorityUnderstanding,
  buildRiskUnderstanding,
  buildStrategicUnderstanding,
  buildSupportingEvidence,
  buildUnderstandingFingerprint,
} from "@/services/brain/executiveUnderstanding/executiveUnderstandingHelpers";
import type {
  BuildExecutiveUnderstandingParams,
  ExecutiveUnderstanding,
} from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";
import { EXECUTIVE_UNDERSTANDING_VERSION } from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";

export { ExecutiveUnderstandingOrganizationRequiredError } from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";

export function buildExecutiveUnderstanding(
  params: BuildExecutiveUnderstandingParams,
): ExecutiveUnderstanding {
  assertOrganizationId(params.organizationId);

  const { brainContext, executiveReasoning, discussionId } = params;

  const businessUnderstanding = buildBusinessUnderstanding(
    brainContext,
    executiveReasoning,
  );
  const marketUnderstanding = buildMarketUnderstanding(
    brainContext,
    executiveReasoning,
  );
  const strategicUnderstanding = buildStrategicUnderstanding(executiveReasoning);
  const opportunityUnderstanding = buildOpportunityUnderstanding(
    brainContext,
    executiveReasoning,
  );
  const riskUnderstanding = buildRiskUnderstanding(executiveReasoning);
  const priorityUnderstanding = buildPriorityUnderstanding(executiveReasoning);
  const supportingEvidence = buildSupportingEvidence(
    brainContext,
    executiveReasoning,
  );

  const executiveSummary = buildExecutiveSummary({
    context: brainContext,
    strategic: strategicUnderstanding,
    opportunity: opportunityUnderstanding,
    discussionId,
  });

  const memoryEnriched =
    brainContext.executiveMemory.metadata.discussionCount > 0 ||
    brainContext.executiveMemory.painPointKnowledge.length > 0 ||
    brainContext.executiveMemory.terminologyKnowledge.length > 0;

  const learningEnriched =
    brainContext.executiveLearning.decisionLearning.totalValidatedDecisions > 0 ||
    brainContext.executiveLearning.briefingLearning.approved > 0;

  const degradationMode =
    memoryEnriched || learningEnriched
      ? "full"
      : "identity_and_current_only";

  const partialUnderstanding = {
    executiveSummary,
    strategicUnderstanding,
    opportunityUnderstanding,
  };

  const understanding: ExecutiveUnderstanding = {
    metadata: {
      generatedAt: new Date().toISOString(),
      organizationId: params.organizationId,
      discussionId: executiveSummary.discussionId,
      understandingVersion: EXECUTIVE_UNDERSTANDING_VERSION,
      reasoningVersion: executiveReasoning.metadata.reasoningVersion,
      memoryEnriched,
      learningEnriched,
      degradationMode,
      understandingFingerprint: buildUnderstandingFingerprint(partialUnderstanding),
    },
    executiveSummary,
    businessUnderstanding,
    marketUnderstanding,
    strategicUnderstanding,
    opportunityUnderstanding,
    riskUnderstanding,
    priorityUnderstanding,
    supportingEvidence,
  };

  return understanding;
}
