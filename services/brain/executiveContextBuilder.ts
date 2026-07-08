import { getCommunities } from "@/services/communityService";
import { belongsToOrganization } from "@/services/organizationService";
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
import type {
  AthenaBrainContext,
  BrainContextScope,
  BuildBrainContextParams,
} from "@/services/brain/brainContextTypes";

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

async function enrichExecutiveContext(
  engine: NonNullable<
    Awaited<ReturnType<typeof buildBrainContextForOrganization>>
  >,
  organizationId: string,
  focusDomainId: string | null,
  focusDiscussionId: string | null,
): Promise<AthenaBrainContext> {
  const feedbackMemory = enrichFeedbackMemory(
    engine.feedbackSignals,
    engine.briefingMemory.recentBriefings,
  );

  const [domainMemory, knowledgeMemory, operationalMemory] = await Promise.all([
    enrichDomainMemory(engine.domainMemory, organizationId, focusDomainId),
    enrichKnowledgeMemory(engine.knowledgeMemory, organizationId),
    loadOperationalMemory(
      organizationId,
      feedbackMemory,
      engine.opportunityMemory.queues,
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
    sourceContext: {
      ...partial,
      snapshot,
      contextSummary: {
        ...partial.contextSummary,
        warnings: contextWarnings.codes,
      },
    },
  });

  return {
    ...partial,
    snapshot,
    executiveMemory,
    contextSummary: {
      ...partial.contextSummary,
      warnings: contextWarnings.codes,
    },
  };
}

/**
 * Single intelligence entry point for Athena's Brain Engine.
 * All data remains strictly organization-scoped.
 */
export async function buildBrainContext(
  params: BuildBrainContextParams,
): Promise<AthenaBrainContext | null> {
  const organizationId = assertOrganizationId(params.organizationId);
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
    });
  } else if (params.opportunityId?.trim()) {
    scope = "opportunity";
    engine = await buildBrainContextForOpportunity({
      organizationId,
      opportunityId: params.opportunityId.trim(),
    });
  } else if (params.discussionId?.trim()) {
    scope = "discussion";
    engine = await buildBrainContextForDiscussion({
      organizationId,
      discussionId: params.discussionId.trim(),
    });
  } else if (focusDomainId) {
    scope = "domain";
    engine = await buildBrainContextForOrganization(organizationId);
  } else {
    engine = await buildBrainContextForOrganization(organizationId);
  }

  if (!engine) {
    return null;
  }

  if (scope === "domain" && engine.scope === "organization") {
    engine = { ...engine, scope: "domain" };
  }

  return enrichExecutiveContext(
    engine,
    organizationId,
    focusDomainId,
    params.discussionId?.trim() ?? null,
  );
}
