import type { AthenaBrainContext } from "@/services/brain/brainContextTypes";
import type { RelevantMemory } from "@/services/brain/reasoningPipeline/reasoningPipelineTypes";

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function buildRelevantMemory(brainContext: AthenaBrainContext): RelevantMemory {
  const executiveMemory = brainContext.executiveMemory;
  const knowledgeAssets = brainContext.knowledgeMemory.assets ?? [];
  const domains = brainContext.domainMemory.domains ?? [];
  const briefings = brainContext.briefingMemory.recentBriefings ?? [];
  const blueprints = brainContext.blueprintMemory.recentBlueprints ?? [];
  const learning = brainContext.executiveLearning;

  const recurringObjections = uniqueStrings([
    ...(executiveMemory.patternKnowledge.mostCommonObjection
      ? [executiveMemory.patternKnowledge.mostCommonObjection]
      : []),
    ...(learning.patternLearning.mostCommonObjection
      ? [learning.patternLearning.mostCommonObjection]
      : []),
    ...domains.flatMap((domain) =>
      domain.recurringObjections
        ? domain.recurringObjections.split(/[,;\n]+/).map((entry) => entry.trim())
        : [],
    ),
  ]);

  const recurringBuyerConcerns = uniqueStrings([
    ...executiveMemory.painPointKnowledge.map((entry) => entry.painPoint),
    ...brainContext.discussionMemory.recurringThemes,
    ...(learning.patternLearning.mostCommonOpportunityReason
      ? [learning.patternLearning.mostCommonOpportunityReason]
      : []),
  ]);

  const priorWinningAngles = uniqueStrings([
    ...brainContext.promotionCandidates.map((entry) => entry.value),
    ...briefings
      .filter((briefing) => briefing.status === "approved")
      .map((briefing) => briefing.summary ?? "")
      .filter(Boolean),
    ...(learning.patternLearning.mostCommonOpportunityReason
      ? [learning.patternLearning.mostCommonOpportunityReason]
      : []),
  ]);

  const priorRejectedAngles = uniqueStrings([
    ...brainContext.briefingMemory.rejectedBriefings.map(
      (briefing) => briefing.summary ?? "",
    ),
    ...brainContext.briefingMemory.needsRevisionBriefings.map(
      (briefing) => briefing.summary ?? "",
    ),
  ]);

  const existingAssets = uniqueStrings([
    ...knowledgeAssets.map((asset) => asset.title),
    ...blueprints.map((blueprint) => blueprint.assetTitle),
  ]);

  const relevantDomainTerminology = uniqueStrings(
    domains.flatMap((domain) => domain.terminology ?? []),
  );

  const existingPositioning =
    brainContext.businessMemory.identity?.aboutYou?.trim() ||
    brainContext.identityMemory.aboutYou?.trim() ||
    null;

  const hasMemory =
    recurringObjections.length > 0 ||
    recurringBuyerConcerns.length > 0 ||
    priorWinningAngles.length > 0 ||
    existingAssets.length > 0 ||
    Boolean(existingPositioning);

  return {
    recurringObjections,
    recurringBuyerConcerns,
    priorWinningAngles,
    priorRejectedAngles,
    existingAssets,
    existingPositioning,
    relevantDomainTerminology,
    hasMemory,
  };
}
