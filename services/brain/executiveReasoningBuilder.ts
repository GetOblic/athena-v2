import {
  assertOrganizationId,
  BrainContextNotFoundError,
} from "@/services/brain/brainContextBuilder";
import { buildExecutiveBrainContext } from "@/services/brain/executiveContextBuilder";
import {
  buildBusinessAssessment,
  buildMarketAssessment,
  buildOpportunityAssessment,
  buildPriorityAssessment,
  buildRecommendedDirection,
  buildRiskAssessment,
  buildStrategicAssessment,
} from "@/services/brain/executiveReasoningHelpers";
import { buildExecutiveIntelligencePipeline } from "@/services/brain/executiveIntelligenceHelpers";
import type {
  BuildExecutiveReasoningParams,
  ExecutiveReasoning,
  ExecutiveReasoningSourceContext,
} from "@/services/brain/executiveReasoningTypes";
import { EXECUTIVE_REASONING_VERSION } from "@/services/brain/executiveReasoningTypes";
import { getDiscussionById } from "@/services/discussionService";
import { getOpportunityById } from "@/services/opportunityService";
import { belongsToOrganization } from "@/services/organizationService";
import { getReviewById } from "@/services/reviewService";

export class ExecutiveReasoningOrganizationRequiredError extends Error {
  constructor(message = "organizationId is required.") {
    super(message);
    this.name = "ExecutiveReasoningOrganizationRequiredError";
  }
}

async function verifyOptionalEntities(
  organizationId: string,
  params: BuildExecutiveReasoningParams,
): Promise<void> {
  if (params.discussionId?.trim()) {
    const discussion = await getDiscussionById(
      params.discussionId.trim(),
      organizationId,
    );
    if (!discussion || !belongsToOrganization(discussion, organizationId)) {
      throw new BrainContextNotFoundError(
        `Discussion not found for organization: ${params.discussionId}`,
      );
    }
  }

  if (params.opportunityId?.trim()) {
    const opportunity = await getOpportunityById(
      params.opportunityId.trim(),
      organizationId,
    );
    if (!opportunity || !belongsToOrganization(opportunity, organizationId)) {
      throw new BrainContextNotFoundError(
        `Opportunity not found for organization: ${params.opportunityId}`,
      );
    }
  }

  if (params.briefingId?.trim()) {
    const briefing = await getReviewById(params.briefingId.trim(), organizationId);
    if (!briefing || !belongsToOrganization(briefing, organizationId)) {
      throw new BrainContextNotFoundError(
        `Briefing not found for organization: ${params.briefingId}`,
      );
    }
  }
}

async function resolveSourceContext(
  params: BuildExecutiveReasoningParams & {
    sourceContext?: ExecutiveReasoningSourceContext;
  },
): Promise<ExecutiveReasoningSourceContext> {
  if (params.sourceContext) {
    return params.sourceContext;
  }

  const context = await buildExecutiveBrainContext({
    organizationId: params.organizationId,
    discussionId: params.discussionId,
    opportunityId: params.opportunityId,
    briefingId: params.briefingId,
    domainId: params.domainId,
  });

  if (!context) {
    throw new BrainContextNotFoundError(
      `Unable to build brain context for organization: ${params.organizationId}`,
    );
  }

  return context;
}

type BuildExecutiveReasoningInput = BuildExecutiveReasoningParams & {
  sourceContext?: ExecutiveReasoningSourceContext;
};

export async function buildExecutiveReasoning(
  params: BuildExecutiveReasoningInput,
): Promise<ExecutiveReasoning> {
  const organizationId = assertOrganizationId(params.organizationId);
  await verifyOptionalEntities(organizationId, params);

  const context = await resolveSourceContext(params);

  const priorityAssessment = buildPriorityAssessment(context);
  const riskAssessment = buildRiskAssessment(context);
  const recommendedDirection = buildRecommendedDirection({
    context,
    priority: priorityAssessment,
    risk: riskAssessment,
  });
  const executiveIntelligence = buildExecutiveIntelligencePipeline({
    context,
    direction: recommendedDirection,
    priority: priorityAssessment,
  });

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      organizationId,
      reasoningVersion: EXECUTIVE_REASONING_VERSION,
      memoryVersion: context.executiveMemory.metadata.memoryVersion,
      learningVersion: context.executiveLearning.metadata.learningVersion,
      discussionCountUsed: context.executiveMemory.metadata.discussionCount,
      knowledgeAssetCountUsed: context.executiveMemory.metadata.knowledgeAssetCount,
      scope: context.scope,
    },
    strategicAssessment: buildStrategicAssessment(context),
    businessAssessment: buildBusinessAssessment(context),
    marketAssessment: buildMarketAssessment(context),
    opportunityAssessment: buildOpportunityAssessment(context, executiveIntelligence),
    priorityAssessment,
    riskAssessment,
    recommendedDirection,
    executiveIntelligence,
  };
}
