/**
 * Compact Social Planner provenance freeze. No prompts, memory, or raw provider bodies.
 */

import type { SocialCalendarContext } from "@/services/socialPlanner/calendar/socialCalendarContextTypes";
import type { SocialPlannerDiverseGenerationProvenance } from "@/services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";
import type { SocialPlannerGenerationContextV1 } from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";
import type { SocialCalendarProvenanceJson } from "@/services/socialPlanner/socialCalendarTypes";
import type { SocialPlannerThinkDifferentlyProvenance } from "@/services/socialPlanner/thinkDifferently/socialPlannerThinkDifferentlyTypes";
import type { SocialPlannerConversationRevisionProvenance } from "@/services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";

export type SocialCalendarStandardProvenanceV1 = {
  generationMode: "standard";
  packageSchemaVersion: string;
  intelligenceComposerVersion: string;
  intelligenceSchemaVersion: string;
  calendarResolverVersion: string;
  calendarSchemaVersion: string;
  holidayProvider: string;
  holidayProviderVersion: string;
  holidayCoverage: string;
  geographySource: string | null;
  geographyStatus: string;
  trendSocialPrompt: {
    key: string;
    configured: boolean;
    revisionId: string | null;
  };
  strategyPromptVersion: string;
  assetPromptVersion: string;
  repairPromptVersion: string | null;
  repairUsed: boolean;
  provider: "openrouter";
  stages: SocialPlannerDiverseGenerationProvenance["stages"];
  socialMemorySchemaVersion: string;
  diversityAlgorithmVersion: string;
  historicalDiversityCheckVersion: string;
  historicalCalendarsConsidered: number;
  historicalAssetsConsidered: number;
  highestHistoricalSimilarity: number;
  weekHistoricalSimilarity: number;
  historicalDiversityRepairUsed: boolean;
  diversityRepairPromptVersion: string | null;
};

export type SocialCalendarThinkDifferentlyProvenanceV1 =
  Omit<SocialCalendarStandardProvenanceV1, "generationMode"> & {
    generationMode: "think_differently";
    sourceCalendarId: string;
    rootCalendarId: string;
    sourceVersionNumber: number;
    newVersionNumber: number;
    thinkDifferentlyPromptVersion: string;
    thinkDifferentlyRepairPromptVersion: string | null;
    sourceDivergenceAlgorithmVersion: string;
    sourceWeekSimilarity: number;
    highestSourceAssetSimilarity: number;
    sourceDivergenceRepairUsed: boolean;
  };

export type SocialCalendarConversationRevisionProvenanceV1 =
  Omit<SocialCalendarStandardProvenanceV1, "generationMode"> & {
    generationMode: "conversation_revision";
    sourceCalendarId: string;
    rootCalendarId: string;
    sourceVersionNumber: number;
    newVersionNumber: number;
    conversationRevisionPromptVersion: string;
    conversationRevisionRepairPromptVersion: string | null;
    revisionSatisfactionAlgorithmVersion: string;
    revisionBriefSchemaVersion: string;
    conversationMessageCount: number;
    latestUserMessageId: string;
    latestUserMessageAt: string;
    revisionSatisfactionAccepted: boolean;
    revisionRepairUsed: boolean;
    preservedDateCount: number;
    revisedDateCount: number;
  };

export type SocialCalendarFrozenProvenanceV1 =
  | SocialCalendarStandardProvenanceV1
  | SocialCalendarThinkDifferentlyProvenanceV1
  | SocialCalendarConversationRevisionProvenanceV1;

export function buildFrozenSocialCalendarProvenance(input: {
  context: SocialPlannerGenerationContextV1;
  calendarContext: SocialCalendarContext;
  generationProvenance: SocialPlannerDiverseGenerationProvenance;
}): SocialCalendarStandardProvenanceV1 {
  const { context, calendarContext, generationProvenance } = input;

  return {
    generationMode: "standard",
    packageSchemaVersion: generationProvenance.packageSchemaVersion,
    intelligenceComposerVersion: context.provenance.composerVersion,
    intelligenceSchemaVersion: context.provenance.schemaVersion,
    calendarResolverVersion: calendarContext.provenance.resolverVersion,
    calendarSchemaVersion: calendarContext.provenance.schemaVersion,
    holidayProvider: calendarContext.provenance.holidayProvider,
    holidayProviderVersion: calendarContext.provenance.holidayProviderVersion,
    holidayCoverage: calendarContext.provenance.holidayCoverage,
    geographySource: calendarContext.geography.source,
    geographyStatus: calendarContext.geography.status,
    trendSocialPrompt: {
      key: generationProvenance.trendSocialPrompt.key,
      configured: generationProvenance.trendSocialPrompt.configured,
      revisionId: generationProvenance.trendSocialPrompt.revisionId,
    },
    strategyPromptVersion: generationProvenance.strategyPromptVersion,
    assetPromptVersion: generationProvenance.assetPromptVersion,
    repairPromptVersion: generationProvenance.repairPromptVersion,
    repairUsed: generationProvenance.repairUsed,
    provider: "openrouter",
    stages: generationProvenance.stages,
    socialMemorySchemaVersion: generationProvenance.socialMemorySchemaVersion,
    diversityAlgorithmVersion: generationProvenance.diversityAlgorithmVersion,
    historicalDiversityCheckVersion:
      generationProvenance.historicalDiversityCheckVersion,
    historicalCalendarsConsidered:
      generationProvenance.historicalCalendarsConsidered,
    historicalAssetsConsidered: generationProvenance.historicalAssetsConsidered,
    highestHistoricalSimilarity:
      generationProvenance.highestHistoricalSimilarity,
    weekHistoricalSimilarity: generationProvenance.weekHistoricalSimilarity,
    historicalDiversityRepairUsed:
      generationProvenance.historicalDiversityRepairUsed,
    diversityRepairPromptVersion:
      generationProvenance.diversityRepairPromptVersion,
  };
}

export function buildFrozenThinkDifferentlyProvenance(input: {
  context: SocialPlannerGenerationContextV1;
  calendarContext: SocialCalendarContext;
  generationProvenance: SocialPlannerThinkDifferentlyProvenance;
}): SocialCalendarThinkDifferentlyProvenanceV1 {
  const shared = buildFrozenSocialCalendarProvenance({
    context: input.context,
    calendarContext: input.calendarContext,
    generationProvenance: input.generationProvenance,
  });

  return {
    generationMode: "think_differently",
    packageSchemaVersion: shared.packageSchemaVersion,
    intelligenceComposerVersion: shared.intelligenceComposerVersion,
    intelligenceSchemaVersion: shared.intelligenceSchemaVersion,
    calendarResolverVersion: shared.calendarResolverVersion,
    calendarSchemaVersion: shared.calendarSchemaVersion,
    holidayProvider: shared.holidayProvider,
    holidayProviderVersion: shared.holidayProviderVersion,
    holidayCoverage: shared.holidayCoverage,
    geographySource: shared.geographySource,
    geographyStatus: shared.geographyStatus,
    trendSocialPrompt: shared.trendSocialPrompt,
    strategyPromptVersion: shared.strategyPromptVersion,
    assetPromptVersion: shared.assetPromptVersion,
    repairPromptVersion: shared.repairPromptVersion,
    repairUsed: shared.repairUsed,
    provider: shared.provider,
    stages: shared.stages,
    socialMemorySchemaVersion: shared.socialMemorySchemaVersion,
    diversityAlgorithmVersion: shared.diversityAlgorithmVersion,
    historicalDiversityCheckVersion: shared.historicalDiversityCheckVersion,
    historicalCalendarsConsidered: shared.historicalCalendarsConsidered,
    historicalAssetsConsidered: shared.historicalAssetsConsidered,
    highestHistoricalSimilarity: shared.highestHistoricalSimilarity,
    weekHistoricalSimilarity: shared.weekHistoricalSimilarity,
    historicalDiversityRepairUsed: shared.historicalDiversityRepairUsed,
    diversityRepairPromptVersion: shared.diversityRepairPromptVersion,
    sourceCalendarId: input.generationProvenance.sourceCalendarId,
    rootCalendarId: input.generationProvenance.rootCalendarId,
    sourceVersionNumber: input.generationProvenance.sourceVersionNumber,
    newVersionNumber: input.generationProvenance.newVersionNumber,
    thinkDifferentlyPromptVersion:
      input.generationProvenance.thinkDifferentlyPromptVersion,
    thinkDifferentlyRepairPromptVersion:
      input.generationProvenance.thinkDifferentlyRepairPromptVersion,
    sourceDivergenceAlgorithmVersion:
      input.generationProvenance.sourceDivergenceAlgorithmVersion,
    sourceWeekSimilarity: input.generationProvenance.sourceWeekSimilarity,
    highestSourceAssetSimilarity:
      input.generationProvenance.highestSourceAssetSimilarity,
    sourceDivergenceRepairUsed:
      input.generationProvenance.sourceDivergenceRepairUsed,
  };
}

export function buildFrozenConversationRevisionProvenance(input: {
  context: SocialPlannerGenerationContextV1;
  calendarContext: SocialCalendarContext;
  generationProvenance: SocialPlannerConversationRevisionProvenance;
}): SocialCalendarConversationRevisionProvenanceV1 {
  const shared = buildFrozenSocialCalendarProvenance({
    context: input.context,
    calendarContext: input.calendarContext,
    generationProvenance: input.generationProvenance,
  });

  return {
    generationMode: "conversation_revision",
    packageSchemaVersion: shared.packageSchemaVersion,
    intelligenceComposerVersion: shared.intelligenceComposerVersion,
    intelligenceSchemaVersion: shared.intelligenceSchemaVersion,
    calendarResolverVersion: shared.calendarResolverVersion,
    calendarSchemaVersion: shared.calendarSchemaVersion,
    holidayProvider: shared.holidayProvider,
    holidayProviderVersion: shared.holidayProviderVersion,
    holidayCoverage: shared.holidayCoverage,
    geographySource: shared.geographySource,
    geographyStatus: shared.geographyStatus,
    trendSocialPrompt: shared.trendSocialPrompt,
    strategyPromptVersion: shared.strategyPromptVersion,
    assetPromptVersion: shared.assetPromptVersion,
    repairPromptVersion: shared.repairPromptVersion,
    repairUsed: shared.repairUsed,
    provider: shared.provider,
    stages: shared.stages,
    socialMemorySchemaVersion: shared.socialMemorySchemaVersion,
    diversityAlgorithmVersion: shared.diversityAlgorithmVersion,
    historicalDiversityCheckVersion: shared.historicalDiversityCheckVersion,
    historicalCalendarsConsidered: shared.historicalCalendarsConsidered,
    historicalAssetsConsidered: shared.historicalAssetsConsidered,
    highestHistoricalSimilarity: shared.highestHistoricalSimilarity,
    weekHistoricalSimilarity: shared.weekHistoricalSimilarity,
    historicalDiversityRepairUsed: shared.historicalDiversityRepairUsed,
    diversityRepairPromptVersion: shared.diversityRepairPromptVersion,
    sourceCalendarId: input.generationProvenance.sourceCalendarId,
    rootCalendarId: input.generationProvenance.rootCalendarId,
    sourceVersionNumber: input.generationProvenance.sourceVersionNumber,
    newVersionNumber: input.generationProvenance.newVersionNumber,
    conversationRevisionPromptVersion:
      input.generationProvenance.conversationRevisionPromptVersion,
    conversationRevisionRepairPromptVersion:
      input.generationProvenance.conversationRevisionRepairPromptVersion,
    revisionSatisfactionAlgorithmVersion:
      input.generationProvenance.revisionSatisfactionAlgorithmVersion,
    revisionBriefSchemaVersion:
      input.generationProvenance.revisionBriefSchemaVersion,
    conversationMessageCount: input.generationProvenance.conversationMessageCount,
    latestUserMessageId: input.generationProvenance.latestUserMessageId,
    latestUserMessageAt: input.generationProvenance.latestUserMessageAt,
    revisionSatisfactionAccepted:
      input.generationProvenance.revisionSatisfactionAccepted,
    revisionRepairUsed: input.generationProvenance.revisionRepairUsed,
    preservedDateCount: input.generationProvenance.preservedDateCount,
    revisedDateCount: input.generationProvenance.revisedDateCount,
  };
}

export function toProvenanceJson(
  provenance: SocialCalendarFrozenProvenanceV1,
): SocialCalendarProvenanceJson {
  return provenance as unknown as SocialCalendarProvenanceJson;
}
