/**
 * Social Planner L9 conversation-revision contracts.
 * Frozen Apply-time request state — not a transcript, package, or provenance.
 */

import type {
  SocialPlannerAssetType,
  SocialPlannerObjective,
} from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import type { SocialCalendarPackageV1 } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import type {
  SocialCalendarDiverseGenerationResult,
  SocialPlannerHistoricalDiversityResult,
  SocialPlannerSocialMemoryV1,
} from "@/services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";
import type { SocialPlannerDiverseGenerationProvenance } from "@/services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";

export const SOCIAL_PLANNER_CONVERSATION_REVISION_BRIEF_SCHEMA_VERSION =
  "social_planner_conversation_revision_brief_v1" as const;

export const SOCIAL_PLANNER_CONVERSATION_REVISION_CONTEXT_SCHEMA_VERSION =
  "social_planner_conversation_revision_context_v1" as const;

export const SOCIAL_PLANNER_CONVERSATION_REVISION_PROMPT_VERSION =
  "social_planner_conversation_revision_v1" as const;

export const SOCIAL_PLANNER_CONVERSATION_REVISION_REPAIR_PROMPT_VERSION =
  "social_planner_conversation_revision_repair_v1" as const;

export const SOCIAL_PLANNER_REVISION_SATISFACTION_ALGORITHM_VERSION =
  "social_planner_revision_satisfaction_v1" as const;

export const SOCIAL_PLANNER_REVISION_BRIEF_BOUNDS = {
  desiredToneMaxChars: 80,
  changeSummaryMaxChars: 280,
  audienceShiftMaxChars: 120,
  conceptDirectionMaxChars: 160,
  keepThemesMax: 8,
  avoidConceptsMax: 8,
  desiredObjectivesMax: 4,
  formatsMax: 6,
  dayChangesMax: 7,
  preserveMax: 7,
  avoidMax: 8,
  avoidItemMaxChars: 80,
} as const;

export type SocialPlannerConversationRevisionGlobal = {
  desiredTone?: string;
  desiredObjectives?: SocialPlannerObjective[];
  preferredFormats?: SocialPlannerAssetType[];
  avoidFormats?: SocialPlannerAssetType[];
  avoidConcepts?: string[];
  audienceShift?: string;
  keepThemes?: string[];
  changeSummary?: string;
};

export type SocialPlannerConversationRevisionDayChange = {
  date: string;
  requestedAssetType?: SocialPlannerAssetType;
  requestedObjective?: SocialPlannerObjective;
  requestedTone?: string;
  requestedConceptDirection?: string;
  requestedChangeSummary?: string;
};

export type SocialPlannerConversationRevisionBriefV1 = {
  schemaVersion: typeof SOCIAL_PLANNER_CONVERSATION_REVISION_BRIEF_SCHEMA_VERSION;
  sourceCalendarId: string;
  conversationMessageCount: number;
  latestUserMessageId: string;
  latestUserMessageAt: string;
  actionable: boolean;
  global: SocialPlannerConversationRevisionGlobal;
  dayChanges: SocialPlannerConversationRevisionDayChange[];
  preserve: string[];
  avoid: string[];
};

export type SocialPlannerConversationRevisionContextV1 = {
  schemaVersion: typeof SOCIAL_PLANNER_CONVERSATION_REVISION_CONTEXT_SCHEMA_VERSION;
  brief: SocialPlannerConversationRevisionBriefV1;
  appliedAt: string;
};

export type SocialPlannerRevisionSatisfactionViolation = {
  code: string;
  message: string;
  candidateDate?: string;
};

export type SocialPlannerRevisionSatisfactionResult = {
  accepted: boolean;
  algorithmVersion: typeof SOCIAL_PLANNER_REVISION_SATISFACTION_ALGORITHM_VERSION;
  preservedDates: string[];
  revisedDates: string[];
  enforcedDirectives: string[];
  violations: SocialPlannerRevisionSatisfactionViolation[];
};

export type SocialPlannerConversationRevisionProvenance =
  SocialPlannerDiverseGenerationProvenance & {
    generationMode: "conversation_revision";
    conversationRevisionPromptVersion: typeof SOCIAL_PLANNER_CONVERSATION_REVISION_PROMPT_VERSION;
    conversationRevisionRepairPromptVersion: string | null;
    revisionSatisfactionAlgorithmVersion: typeof SOCIAL_PLANNER_REVISION_SATISFACTION_ALGORITHM_VERSION;
    revisionBriefSchemaVersion: typeof SOCIAL_PLANNER_CONVERSATION_REVISION_BRIEF_SCHEMA_VERSION;
    sourceCalendarId: string;
    rootCalendarId: string;
    sourceVersionNumber: number;
    newVersionNumber: number;
    conversationMessageCount: number;
    latestUserMessageId: string;
    latestUserMessageAt: string;
    revisionSatisfactionAccepted: boolean;
    revisionRepairUsed: boolean;
    preservedDateCount: number;
    revisedDateCount: number;
  };

export type SocialPlannerConversationRevisionGenerationResult =
  SocialCalendarDiverseGenerationResult & {
    sourcePackage: SocialCalendarPackageV1;
    revisionContext: SocialPlannerConversationRevisionContextV1;
    revisionSatisfaction: SocialPlannerRevisionSatisfactionResult;
    revisionRepairUsed: boolean;
    generationProvenance: SocialPlannerConversationRevisionProvenance;
    socialMemory: SocialPlannerSocialMemoryV1;
    historicalDiversity: SocialPlannerHistoricalDiversityResult;
  };

export class ConversationRevisionSourceError extends Error {
  readonly code:
    | "NOT_READY"
    | "SOURCE_PACKAGE_INVALID"
    | "NO_MESSAGES"
    | "NO_ACTIONABLE_REVISION";
  readonly httpStatus: 400 | 409;

  constructor(
    code:
      | "NOT_READY"
      | "SOURCE_PACKAGE_INVALID"
      | "NO_MESSAGES"
      | "NO_ACTIONABLE_REVISION",
    message: string,
    httpStatus: 400 | 409,
  ) {
    super(message);
    this.name = "ConversationRevisionSourceError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function isRevisionContextObject(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
