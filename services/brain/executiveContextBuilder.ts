import { getCommunities } from "@/services/communityService";
import { belongsToOrganization } from "@/services/organizationService";
import type { OrganizationReadSnapshot } from "@/services/brain/organizationReadSnapshot";
import { readOpportunityOrganizationList } from "@/services/opportunityService";
import { readReviewOrganizationList } from "@/services/reviewService";
import {
  assertOrganizationId,
  BrainContextNotFoundError,
  buildBrainContextForBriefing,
  buildBrainContextForDiscussion,
  buildBrainContextForOpportunity,
  buildBrainContextForOrganization,
} from "@/services/brain/brainContextBuilder";
import {
  enrichDomainMemory,
  enrichFeedbackMemory,
  enrichKnowledgeMemory,
  generateContextWarnings,
  loadOperationalMemory,
  toExecutiveContext,
} from "@/services/brain/brainContextHelpers";
import { buildBrainSnapshot } from "@/services/brain/brainSnapshot";
import { getExecutiveMemory } from "@/services/brain/executiveMemoryService";
import { getExecutiveLearning } from "@/services/brain/executiveLearningService";
import { buildExecutiveReasoning } from "@/services/brain/executiveReasoningBuilder";
import type {
  AthenaBrainContext,
  BrainContextScope,
  BuildBrainContextParams,
} from "@/services/brain/brainContextTypes";
import type { ExecutiveReasoningSourceContext } from "@/services/brain/executiveReasoningTypes";

export { assertOrganizationId } from "@/services/brain/brainContextBuilder";
export {
  BrainContextNotFoundError,
  BrainContextOrganizationRequiredError,
} from "@/services/brain/brainContextBuilder";

async function resolveFocusDomainId(
  organizationId: string,
  domainId?: string,
): Promise<string | null> {
  if (!domainId?.trim()) {
    return null;
  }

  const communities = await getCommunities(organizationId);
  const match = communities.find((community) => community.id === domainId.trim());

  if (!match || !belongsToOrganization(match, organizationId)) {
    throw new BrainContextNotFoundError(
      `Intelligence Domain not found for organization: ${domainId}`,
    );
  }

  return match.id;
}

async function loadOrganizationReadSnapshot(
  organizationId: string,
): Promise<OrganizationReadSnapshot> {
  const [opportunities, reviews] = await Promise.all([
    readOpportunityOrganizationList(organizationId),
    readReviewOrganizationList(organizationId),
  ]);

  const snapshot: OrganizationReadSnapshot = { organizationId };
  // Failed reads stay unpublished. Sharing the helpers' empty failure result
  // would make one transient error look like an empty organization for every
  // consumer in this build. Successful empty collections are still reused.
  if (!opportunities.failed) {
    snapshot.opportunities = opportunities.records;
  }
  if (!reviews.failed) {
    snapshot.reviews = reviews.records;
  }
  return snapshot;
}

async function enrichExecutiveContext(
  engine: NonNullable<
    Awaited<ReturnType<typeof buildBrainContextForOrganization>>
  >,
  organizationId: string,
  focusDomainId: string | null,
  focusDiscussionId: string | null,
  organizationReadSnapshot: OrganizationReadSnapshot,
): Promise<ExecutiveReasoningSourceContext> {
  const feedbackMemory = enrichFeedbackMemory(
    engine.feedbackSignals,
    engine.briefingMemory.recentBriefings,
  );

  const [domainMemory, knowledgeMemory, operationalMemory] = await Promise.all([
    enrichDomainMemory(engine.domainMemory, organizationId, focusDomainId),
    enrichKnowledgeMemory(
      engine.knowledgeMemory,
      organizationId,
      organizationReadSnapshot,
    ),
    loadOperationalMemory(
      organizationId,
      feedbackMemory,
      engine.opportunityMemory.queues,
      organizationReadSnapshot,
    ),
  ]);

  const contextWarnings = generateContextWarnings({
    businessMemory: engine.businessMemory,
    domainMemory,
    discussionCount: engine.discussionMemory.recentDiscussions.length,
    opportunityCount: engine.opportunityMemory.recentOpportunities.length,
    approvedBriefingCount: engine.briefingMemory.approvedBriefings.length,
    knowledgeMemory,
    feedbackMemory,
    contextSummary: engine.contextSummary,
  });

  const partial = toExecutiveContext(engine, {
    operationalMemory,
    contextWarnings,
    snapshot: {
      brainHealth: "untrained",
      organizationSummary: "",
      businessSummary: "",
      marketSummary: "",
      activeDomains: 0,
      priorityOpportunities: 0,
      editorialQueue: 0,
      deploymentQueue: 0,
      knowledgeSummary: "",
      feedbackSummary: "",
      warnings: [],
    },
    domainMemory,
    knowledgeMemory,
    feedbackMemory,
  });

  const snapshot = buildBrainSnapshot(partial);

  const executiveMemory = await getExecutiveMemory({
    organizationId,
    domainId: focusDomainId ?? undefined,
    discussionId: focusDiscussionId ?? undefined,
    organizationReadSnapshot,
    sourceContext: {
      ...partial,
      snapshot,
      contextSummary: {
        ...partial.contextSummary,
        warnings: contextWarnings.codes,
      },
    },
  });

  const executiveLearning = await getExecutiveLearning({
    organizationId,
    domainId: focusDomainId ?? undefined,
    discussionId: focusDiscussionId ?? undefined,
    organizationReadSnapshot,
    sourceMemory: executiveMemory,
  });

  const enrichedExecutiveMemory = {
    ...executiveMemory,
    executiveLearning,
    promotionCandidates: executiveLearning.promotionCandidates,
  };

  const contextWithoutReasoning = {
    ...partial,
    snapshot,
    executiveMemory: enrichedExecutiveMemory,
    executiveLearning,
    marketEvidence: executiveLearning.marketLearning.evidence,
    promotionCandidates: executiveLearning.promotionCandidates,
    contextSummary: {
      ...partial.contextSummary,
      warnings: contextWarnings.codes,
    },
  };

  return contextWithoutReasoning;
}

async function attachReasoningToContext(
  context: ExecutiveReasoningSourceContext,
  params: BuildBrainContextParams,
): Promise<AthenaBrainContext> {
  const executiveReasoning = await buildExecutiveReasoning({
    organizationId: context.organization.id,
    domainId: params.domainId,
    discussionId: params.discussionId,
    opportunityId: params.opportunityId,
    briefingId: params.briefingId,
    sourceContext: context,
  });

  return {
    ...context,
    executiveReasoning,
  };
}

/**
 * Builds Brain Context through Memory and Learning, stopping before Reasoning.
 */
export async function buildExecutiveBrainContext(
  params: BuildBrainContextParams,
): Promise<ExecutiveReasoningSourceContext | null> {
  const organizationId = assertOrganizationId(params.organizationId);
  const organizationReadSnapshotPromise =
    loadOrganizationReadSnapshot(organizationId);
  const focusDomainId = await resolveFocusDomainId(
    organizationId,
    params.domainId,
  );

  let scope: BrainContextScope = "organization";
  let engine: Awaited<ReturnType<typeof buildBrainContextForOrganization>>;

  if (params.briefingId?.trim()) {
    scope = "briefing";
    engine = await buildBrainContextForBriefing({
      organizationId,
      briefingId: params.briefingId.trim(),
      organizationReadSnapshot: organizationReadSnapshotPromise,
    });
  } else if (params.opportunityId?.trim()) {
    scope = "opportunity";
    engine = await buildBrainContextForOpportunity({
      organizationId,
      opportunityId: params.opportunityId.trim(),
      organizationReadSnapshot: organizationReadSnapshotPromise,
    });
  } else if (params.discussionId?.trim()) {
    scope = "discussion";
    engine = await buildBrainContextForDiscussion({
      organizationId,
      discussionId: params.discussionId.trim(),
      organizationReadSnapshot: organizationReadSnapshotPromise,
    });
  } else if (focusDomainId) {
    scope = "domain";
    engine = await buildBrainContextForOrganization(
      organizationId,
      organizationReadSnapshotPromise,
    );
  } else {
    engine = await buildBrainContextForOrganization(
      organizationId,
      organizationReadSnapshotPromise,
    );
  }

  if (!engine) {
    await organizationReadSnapshotPromise;
    return null;
  }

  if (scope === "domain" && engine.scope === "organization") {
    engine = { ...engine, scope: "domain" };
  }

  const organizationReadSnapshot = await organizationReadSnapshotPromise;

  return enrichExecutiveContext(
    engine,
    organizationId,
    focusDomainId,
    params.discussionId?.trim() ?? null,
    organizationReadSnapshot,
  );
}

/**
 * Single intelligence entry point for Athena's Brain Engine.
 * All data remains strictly organization-scoped.
 */
export async function buildBrainContext(
  params: BuildBrainContextParams,
): Promise<AthenaBrainContext | null> {
  const contextWithoutReasoning = await buildExecutiveBrainContext(params);

  if (!contextWithoutReasoning) {
    return null;
  }

  return attachReasoningToContext(contextWithoutReasoning, params);
}
