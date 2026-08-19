/**
 * Deterministic validation for the frozen conversation-revision brief.
 */

import {
  SOCIAL_PLANNER_ASSET_TYPES,
  SOCIAL_PLANNER_OBJECTIVES,
  type SocialPlannerAssetType,
  type SocialPlannerObjective,
} from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  SOCIAL_PLANNER_CONVERSATION_REVISION_BRIEF_SCHEMA_VERSION,
  SOCIAL_PLANNER_CONVERSATION_REVISION_CONTEXT_SCHEMA_VERSION,
  SOCIAL_PLANNER_REVISION_BRIEF_BOUNDS,
  isRevisionContextObject,
  type SocialPlannerConversationRevisionBriefV1,
  type SocialPlannerConversationRevisionContextV1,
  type SocialPlannerConversationRevisionDayChange,
  type SocialPlannerConversationRevisionGlobal,
} from "@/services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";

export class SocialPlannerRevisionBriefError extends Error {
  readonly code = "NO_ACTIONABLE_REVISION";

  constructor(message = "Conversation revision brief is invalid.") {
    super(message);
    this.name = "SocialPlannerRevisionBriefError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asOptionalString(value: unknown, max: number): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") {
    throw new SocialPlannerRevisionBriefError("Revision brief string field is invalid.");
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function asStringArray(value: unknown, maxItems: number, maxChars: number): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new SocialPlannerRevisionBriefError("Revision brief array field is invalid.");
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxChars));
}

function asAssetTypes(value: unknown): SocialPlannerAssetType[] {
  return asStringArray(value, SOCIAL_PLANNER_REVISION_BRIEF_BOUNDS.formatsMax, 40).filter(
    (item): item is SocialPlannerAssetType =>
      (SOCIAL_PLANNER_ASSET_TYPES as readonly string[]).includes(item),
  );
}

function asObjectives(value: unknown): SocialPlannerObjective[] {
  return asStringArray(
    value,
    SOCIAL_PLANNER_REVISION_BRIEF_BOUNDS.desiredObjectivesMax,
    40,
  ).filter((item): item is SocialPlannerObjective =>
    (SOCIAL_PLANNER_OBJECTIVES as readonly string[]).includes(item),
  );
}

function normalizeGlobal(
  value: unknown,
): SocialPlannerConversationRevisionGlobal {
  if (value == null) return {};
  if (!isRecord(value)) {
    throw new SocialPlannerRevisionBriefError("Revision brief global object is invalid.");
  }
  const global: SocialPlannerConversationRevisionGlobal = {};
  const desiredTone = asOptionalString(
    value.desiredTone,
    SOCIAL_PLANNER_REVISION_BRIEF_BOUNDS.desiredToneMaxChars,
  );
  if (desiredTone) global.desiredTone = desiredTone;
  const desiredObjectives = asObjectives(value.desiredObjectives);
  if (desiredObjectives.length > 0) global.desiredObjectives = desiredObjectives;
  const preferredFormats = asAssetTypes(value.preferredFormats);
  if (preferredFormats.length > 0) global.preferredFormats = preferredFormats;
  const avoidFormats = asAssetTypes(value.avoidFormats);
  if (avoidFormats.length > 0) global.avoidFormats = avoidFormats;
  const avoidConcepts = asStringArray(
    value.avoidConcepts,
    SOCIAL_PLANNER_REVISION_BRIEF_BOUNDS.avoidConceptsMax,
    SOCIAL_PLANNER_REVISION_BRIEF_BOUNDS.avoidItemMaxChars,
  );
  if (avoidConcepts.length > 0) global.avoidConcepts = avoidConcepts;
  const audienceShift = asOptionalString(
    value.audienceShift,
    SOCIAL_PLANNER_REVISION_BRIEF_BOUNDS.audienceShiftMaxChars,
  );
  if (audienceShift) global.audienceShift = audienceShift;
  const keepThemes = asStringArray(
    value.keepThemes,
    SOCIAL_PLANNER_REVISION_BRIEF_BOUNDS.keepThemesMax,
    SOCIAL_PLANNER_REVISION_BRIEF_BOUNDS.avoidItemMaxChars,
  );
  if (keepThemes.length > 0) global.keepThemes = keepThemes;
  const changeSummary = asOptionalString(
    value.changeSummary,
    SOCIAL_PLANNER_REVISION_BRIEF_BOUNDS.changeSummaryMaxChars,
  );
  if (changeSummary) global.changeSummary = changeSummary;
  return global;
}

function normalizeDayChanges(
  value: unknown,
  allowedDates: readonly string[],
): SocialPlannerConversationRevisionDayChange[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new SocialPlannerRevisionBriefError("Revision brief dayChanges must be an array.");
  }
  const allowed = new Set(allowedDates);
  const seen = new Set<string>();
  const changes: SocialPlannerConversationRevisionDayChange[] = [];
  for (const raw of value.slice(0, SOCIAL_PLANNER_REVISION_BRIEF_BOUNDS.dayChangesMax)) {
    if (!isRecord(raw) || typeof raw.date !== "string" || !allowed.has(raw.date)) {
      continue;
    }
    if (seen.has(raw.date)) continue;
    seen.add(raw.date);
    const change: SocialPlannerConversationRevisionDayChange = { date: raw.date };
    if (
      typeof raw.requestedAssetType === "string" &&
      (SOCIAL_PLANNER_ASSET_TYPES as readonly string[]).includes(raw.requestedAssetType)
    ) {
      change.requestedAssetType = raw.requestedAssetType as SocialPlannerAssetType;
    }
    if (
      typeof raw.requestedObjective === "string" &&
      (SOCIAL_PLANNER_OBJECTIVES as readonly string[]).includes(raw.requestedObjective)
    ) {
      change.requestedObjective = raw.requestedObjective as SocialPlannerObjective;
    }
    const requestedTone = asOptionalString(
      raw.requestedTone,
      SOCIAL_PLANNER_REVISION_BRIEF_BOUNDS.desiredToneMaxChars,
    );
    if (requestedTone) change.requestedTone = requestedTone;
    const requestedConceptDirection = asOptionalString(
      raw.requestedConceptDirection,
      SOCIAL_PLANNER_REVISION_BRIEF_BOUNDS.conceptDirectionMaxChars,
    );
    if (requestedConceptDirection) {
      change.requestedConceptDirection = requestedConceptDirection;
    }
    const requestedChangeSummary = asOptionalString(
      raw.requestedChangeSummary,
      SOCIAL_PLANNER_REVISION_BRIEF_BOUNDS.changeSummaryMaxChars,
    );
    if (requestedChangeSummary) {
      change.requestedChangeSummary = requestedChangeSummary;
    }
    changes.push(change);
  }
  return changes;
}

export function hasActionableRevisionIntent(
  brief: Pick<
    SocialPlannerConversationRevisionBriefV1,
    "global" | "dayChanges" | "avoid"
  >,
): boolean {
  const global = brief.global;
  return (
    brief.dayChanges.length > 0 ||
    brief.avoid.length > 0 ||
    Boolean(global.desiredTone) ||
    Boolean(global.changeSummary) ||
    Boolean(global.audienceShift) ||
    (global.desiredObjectives?.length ?? 0) > 0 ||
    (global.preferredFormats?.length ?? 0) > 0 ||
    (global.avoidFormats?.length ?? 0) > 0 ||
    (global.avoidConcepts?.length ?? 0) > 0
  );
}

export function validateSocialPlannerConversationRevisionBrief(input: {
  raw: unknown;
  sourceCalendarId: string;
  allowedDates: readonly string[];
  conversationMessageCount: number;
  latestUserMessageId: string;
  latestUserMessageAt: string;
}): SocialPlannerConversationRevisionBriefV1 {
  if (!isRecord(input.raw)) {
    throw new SocialPlannerRevisionBriefError();
  }

  const dayChanges = normalizeDayChanges(input.raw.dayChanges, input.allowedDates);
  const global = normalizeGlobal(input.raw.global);
  const preserve = asStringArray(
    input.raw.preserve,
    SOCIAL_PLANNER_REVISION_BRIEF_BOUNDS.preserveMax,
    10,
  ).filter((date) => input.allowedDates.includes(date));
  const avoid = asStringArray(
    input.raw.avoid,
    SOCIAL_PLANNER_REVISION_BRIEF_BOUNDS.avoidMax,
    SOCIAL_PLANNER_REVISION_BRIEF_BOUNDS.avoidItemMaxChars,
  );

  const brief: SocialPlannerConversationRevisionBriefV1 = {
    schemaVersion: SOCIAL_PLANNER_CONVERSATION_REVISION_BRIEF_SCHEMA_VERSION,
    sourceCalendarId: input.sourceCalendarId,
    conversationMessageCount: input.conversationMessageCount,
    latestUserMessageId: input.latestUserMessageId,
    latestUserMessageAt: input.latestUserMessageAt,
    actionable: false,
    global,
    dayChanges,
    preserve,
    avoid,
  };
  brief.actionable = hasActionableRevisionIntent(brief);
  return brief;
}

export function validateSocialPlannerConversationRevisionContext(input: {
  raw: unknown;
  sourceCalendarId: string;
  allowedDates: readonly string[];
}): SocialPlannerConversationRevisionContextV1 {
  if (!isRevisionContextObject(input.raw)) {
    throw new SocialPlannerRevisionBriefError("Revision context must be an object.");
  }
  const briefRaw = isRecord(input.raw.brief) ? input.raw.brief : input.raw;
  const brief = validateSocialPlannerConversationRevisionBrief({
    raw: briefRaw,
    sourceCalendarId: input.sourceCalendarId,
    allowedDates: input.allowedDates,
    conversationMessageCount: Number(briefRaw.conversationMessageCount ?? 0),
    latestUserMessageId: String(briefRaw.latestUserMessageId ?? ""),
    latestUserMessageAt: String(briefRaw.latestUserMessageAt ?? ""),
  });
  if (brief.sourceCalendarId !== input.sourceCalendarId) {
    brief.sourceCalendarId = input.sourceCalendarId;
  }
  if (!brief.actionable) {
    throw new SocialPlannerRevisionBriefError(
      "Frozen revision context is not actionable.",
    );
  }
  return {
    schemaVersion: SOCIAL_PLANNER_CONVERSATION_REVISION_CONTEXT_SCHEMA_VERSION,
    brief,
    appliedAt:
      typeof input.raw.appliedAt === "string" && input.raw.appliedAt.trim()
        ? input.raw.appliedAt
        : new Date().toISOString(),
  };
}

export function tryParsePersistedRevisionContext(
  value: unknown,
  sourceCalendarId: string,
  allowedDates: readonly string[],
): SocialPlannerConversationRevisionContextV1 | null {
  try {
    return validateSocialPlannerConversationRevisionContext({
      raw: value,
      sourceCalendarId,
      allowedDates,
    });
  } catch {
    return null;
  }
}
