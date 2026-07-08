import { assertOrganizationId } from "@/services/brain/brainContextBuilder";
import {
  buildExecutiveInitiativeSelection,
  syncIntelligenceWithInitiativeSelection,
} from "@/services/brain/executiveInitiativeSelectionHelpers";
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
    executiveIntelligence: executiveReasoning.executiveIntelligence,
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

  const executiveInitiativeSelection = buildExecutiveInitiativeSelection({
    context: brainContext,
    executiveReasoning,
    executiveSummary,
    businessUnderstanding,
    marketUnderstanding,
    strategicUnderstanding,
    opportunityUnderstanding,
    priorityUnderstanding,
  });

  const syncedIntelligence = syncIntelligenceWithInitiativeSelection({
    intelligence: executiveReasoning.executiveIntelligence,
    initiativeSelection: executiveInitiativeSelection,
    organizationId: params.organizationId,
  });

  const initiativeHeadline =
    executiveInitiativeSelection.selectedInitiative.initiativeLabel;
  const enrichedSummary: typeof executiveSummary = {
    ...executiveSummary,
    headline: initiativeHeadline,
    primaryObjective:
      executiveInitiativeSelection.selectedInitiative.expectedBusinessOutcome,
  };
  const enrichedOpportunity: typeof opportunityUnderstanding = {
    ...opportunityUnderstanding,
    businessOpportunity: initiativeHeadline,
  };

  const understanding: ExecutiveUnderstanding = {
    metadata: {
      generatedAt: new Date().toISOString(),
      organizationId: params.organizationId,
      discussionId: enrichedSummary.discussionId,
      understandingVersion: EXECUTIVE_UNDERSTANDING_VERSION,
      reasoningVersion: executiveReasoning.metadata.reasoningVersion,
      memoryEnriched,
      learningEnriched,
      degradationMode,
      understandingFingerprint: buildUnderstandingFingerprint({
        executiveSummary: enrichedSummary,
        strategicUnderstanding,
        opportunityUnderstanding: enrichedOpportunity,
      }),
    },
    executiveSummary: enrichedSummary,
    businessUnderstanding,
    marketUnderstanding,
    strategicUnderstanding,
    opportunityUnderstanding: enrichedOpportunity,
    riskUnderstanding,
    priorityUnderstanding,
    supportingEvidence,
    executiveIntelligence: syncedIntelligence,
    executiveInitiativeSelection,
  };

  return understanding;
}
