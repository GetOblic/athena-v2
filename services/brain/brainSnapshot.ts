import type {
  AthenaBrainContext,
  BrainSnapshot,
} from "@/services/brain/brainContextTypes";

function resolveBrainHealth(
  context: AthenaBrainContext,
): BrainSnapshot["brainHealth"] {
  if (context.businessMemory.isBrainTrained) {
    return "ready";
  }

  if (context.businessMemory.completenessScore >= 40) {
    return "partial";
  }

  return "untrained";
}

export function buildBrainSnapshot(context: AthenaBrainContext): BrainSnapshot {
  const { operationalMemory, domainMemory, opportunityMemory, briefingMemory } =
    context;

  const priorityOpportunities =
    operationalMemory.queueCounts.immediateActionOpportunities +
    operationalMemory.queueCounts.highIntentOpportunities;

  const editorialQueue = operationalMemory.queueCounts.pendingEditorialTotal;

  const deploymentQueue = context.feedbackMemory.deploymentReadinessDistribution.ready ?? 0;

  const activeDomains = domainMemory.activeDomainCount;
  const domainNames = domainMemory.domains
    .slice(0, 3)
    .map((domain) => domain.name)
    .join(", ");

  const businessIdentity = context.identityMemory;
  const greeting = businessIdentity.greetingName ?? "the organization";
  const brainStatus = businessIdentity.brainStatus ?? "unknown";

  const knowledgeConfidence = context.knowledgeMemory.knowledgeConfidence;
  const knowledgeAssetCount = context.knowledgeMemory.assets.length;

  const warnings = [
    ...context.contextWarnings.messages,
    ...context.contextSummary.warnings.map((code) => code.replaceAll("_", " ")),
  ].filter((value, index, array) => array.indexOf(value) === index);

  return {
    brainHealth: resolveBrainHealth(context),
    organizationSummary: `${context.organization.name} (${context.organization.slug})`,
    businessSummary: `${greeting} — brain status ${brainStatus}, ${context.businessMemory.completenessScore}% complete`,
    marketSummary:
      domainMemory.totalDomains > 0
        ? `${domainMemory.totalDomains} domain(s); active: ${activeDomains}${domainNames ? ` — ${domainNames}` : ""}`
        : "No Intelligence Domains configured",
    activeDomains,
    priorityOpportunities,
    editorialQueue,
    deploymentQueue,
    knowledgeSummary:
      knowledgeConfidence != null
        ? `${knowledgeAssetCount} knowledge asset(s); confidence ${knowledgeConfidence.toFixed(0)}%`
        : `${knowledgeAssetCount} knowledge asset(s); confidence not yet measured`,
    feedbackSummary: `${context.feedbackMemory.approvalCount} approved, ${context.feedbackMemory.revisionRequestCount} need revision, ${context.feedbackMemory.staleDiscussionCount} stale discussions`,
    warnings,
  };
}
