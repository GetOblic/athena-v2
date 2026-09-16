/**
 * Deterministic Evergreen package + strategy validation.
 * Format assignment is authoritative. The model cannot silently reselect formats.
 */

import { opportunityAppliesToGeography } from "@/services/socialPlanner/calendar/socialCalendarOpportunities";
import {
  SOCIAL_CALENDAR_DAY_NAMES,
  SOCIAL_CALENDAR_OPPORTUNITY_CATEGORIES,
  SOCIAL_CALENDAR_OPPORTUNITY_SCOPES,
  type SocialCalendarContext,
  type SocialCalendarDayName,
  type SocialCalendarOpportunity,
} from "@/services/socialPlanner/calendar/socialCalendarContextTypes";
import {
  SOCIAL_PLANNER_CONTENT_ARCHETYPES,
  SOCIAL_PLANNER_OBJECTIVES,
  SOCIAL_PLANNER_SOURCE_SIGNAL_TYPES,
  type SocialCalendarSelectedAnchor,
  type SocialPlannerContentArchetype,
  type SocialPlannerObjective,
  type SocialPlannerSourceSignal,
} from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION,
  SOCIAL_PLANNER_EVERGREEN_DRAFT_MIN_CHARS,
  SOCIAL_PLANNER_EVERGREEN_PACKAGE_LIMITS as LIMITS,
  type SocialCalendarEvergreenDayV1,
  type SocialCalendarEvergreenPackageV1,
  type SocialPlannerEvergreenFingerprint,
  type SocialPlannerEvergreenGenerationMetadata,
  type SocialPlannerEvergreenWeekFingerprint,
} from "@/services/socialPlanner/generation/socialCalendarEvergreenPackageTypes";
import {
  evergreenFormatAssignmentMap,
  isSocialPlannerEvergreenFormat,
  type SocialPlannerEvergreenFormatAssignment,
} from "@/services/socialPlanner/generation/socialPlannerEvergreenRotation";
import {
  SocialCalendarPackageValidationError,
  SocialPlannerStrategyValidationError,
} from "@/services/socialPlanner/generation/socialPlannerGenerationErrors";
import {
  classifyCtaType,
  classifyHookType,
  normalizeComparableText,
} from "@/services/socialPlanner/generation/socialPlannerCreativeFingerprint";
import { SOCIAL_CALENDAR_PERIOD_DAYS } from "@/services/socialPlanner/socialCalendarTypes";
import type { SocialPlannerGenerationContextV1 } from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";
import {
  authorizedSocialPlannerTargetPersonaId,
  socialPlannerHasPrimaryTargetAudience,
} from "@/services/socialPlanner/socialPlannerTargetPersona";
import {
  SOCIAL_PLANNER_EVERGREEN_FORMATS,
  type SocialPlannerEvergreenFormat,
} from "@/services/socialPlanner/socialPlannerDailyChannels";
import {
  SOCIAL_PLANNER_WEEKLY_STRATEGY_SCHEMA_VERSION,
} from "@/services/socialPlanner/generation/socialPlannerWeeklyStrategyTypes";

export const SOCIAL_PLANNER_EVERGREEN_WEEKLY_STRATEGY_SCHEMA_VERSION =
  "social_planner_evergreen_weekly_strategy_v1" as const;

export type SocialPlannerEvergreenFormatPlanEntry = {
  date: string;
  evergreenFormat: SocialPlannerEvergreenFormat;
  contentArchetype: SocialPlannerContentArchetype;
  primaryObjective: SocialPlannerObjective;
};

export type SocialPlannerEvergreenWeeklyStrategyV1 = {
  schemaVersion: typeof SOCIAL_PLANNER_EVERGREEN_WEEKLY_STRATEGY_SCHEMA_VERSION;
  weeklyObjective: string;
  secondaryObjectives: string[];
  audiencePlan: Array<{
    audience: string;
    personaId: string | null;
    role: "primary" | "secondary";
  }>;
  topicPlan: Array<{ topic: string; rationale: string }>;
  formatPlan: SocialPlannerEvergreenFormatPlanEntry[];
  calendarOpportunityPlan: {
    selected: Array<{
      sourceCandidateId: string;
      date: string;
      label: string;
      category: string;
      scope: string;
      reason: string;
    }>;
    ignored: Array<{ sourceCandidateId: string; reason: string }>;
  };
  contentBalance: {
    promotionalWeight: "low" | "moderate" | "high";
    educationalWeight: "low" | "moderate" | "high";
    communityWeight: "low" | "moderate" | "high";
    funnelNotes: string;
  };
  narrativeArc: string;
  creativeDirection: string;
  avoidances: string[];
  userGuidanceInterpretation: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function boundedString(
  value: unknown,
  field: string,
  max: number,
  failures: string[],
  required = true,
): string | null {
  if (value == null || value === "") {
    if (required) failures.push(`${field} is required.`);
    return null;
  }
  if (typeof value !== "string") {
    failures.push(`${field} must be a string.`);
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) failures.push(`${field} must not be empty.`);
    return null;
  }
  if (trimmed.length > max) {
    failures.push(`${field} exceeds ${max} characters.`);
  }
  return trimmed;
}

function jsonChars(value: unknown): number {
  return JSON.stringify(value).length;
}

function countSentences(text: string): number {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0).length;
}

function isObjective(value: unknown): value is SocialPlannerObjective {
  return (
    typeof value === "string" &&
    (SOCIAL_PLANNER_OBJECTIVES as readonly string[]).includes(value)
  );
}

function isArchetype(value: unknown): value is SocialPlannerContentArchetype {
  return (
    typeof value === "string" &&
    (SOCIAL_PLANNER_CONTENT_ARCHETYPES as readonly string[]).includes(value)
  );
}

function weekdayForDate(
  context: SocialCalendarContext,
  date: string,
): SocialCalendarDayName | null {
  const day = context.dayContexts.find((entry) => entry.date === date);
  if (!day) return null;
  if (!(SOCIAL_CALENDAR_DAY_NAMES as readonly string[]).includes(day.dayOfWeek)) {
    return null;
  }
  return day.dayOfWeek;
}

function candidateMap(
  context: SocialCalendarContext,
): Map<string, SocialCalendarOpportunity> {
  return new Map(
    context.opportunities.map((opportunity) => [opportunity.id, opportunity]),
  );
}

function looksLikeOutlineOnly(draft: string): boolean {
  const lines = draft
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 4) return true;
  const suggestionVoice = /^(write|consider|talk about|idea:|outline:|suggest)/i;
  const suggestionCount = lines.filter((line) => suggestionVoice.test(line)).length;
  return suggestionCount >= Math.max(3, Math.floor(lines.length * 0.6));
}

function draftHasCourseStructure(draft: string): boolean {
  return (
    /\b(module|lesson)\b/i.test(draft) &&
    /\b(outcome|learn|learner|student)\b/i.test(draft)
  );
}

function parseSelectedAnchor(
  raw: unknown,
  field: string,
  dayDate: string,
  candidates: Map<string, SocialCalendarOpportunity>,
  geography: SocialCalendarContext["geography"],
  failures: string[],
): SocialCalendarSelectedAnchor | null {
  if (!isRecord(raw)) {
    failures.push(`${field} must be an object.`);
    return null;
  }
  const sourceCandidateId = boundedString(
    raw.sourceCandidateId ?? raw.id,
    `${field}.sourceCandidateId`,
    160,
    failures,
  );
  if (!sourceCandidateId) return null;

  const candidate = candidates.get(sourceCandidateId);
  if (!candidate) {
    failures.push(
      `${field}: unknown calendar opportunity ${sourceCandidateId}.`,
    );
    return null;
  }
  if (!opportunityAppliesToGeography(candidate, geography)) {
    failures.push(
      `${field}: calendar opportunity ${sourceCandidateId} is outside the trusted jurisdiction.`,
    );
  }
  const date = asString(raw.date) ?? candidate.date;
  if (date !== candidate.date) {
    failures.push(
      `${field}: calendar opportunity ${sourceCandidateId} date does not match the candidate.`,
    );
  }
  if (date !== dayDate) {
    failures.push(
      `${field}: calendar opportunity ${sourceCandidateId} cannot attach to ${dayDate}.`,
    );
  }
  const category = asString(raw.category) ?? candidate.category;
  if (
    !(SOCIAL_CALENDAR_OPPORTUNITY_CATEGORIES as readonly string[]).includes(
      category,
    )
  ) {
    failures.push(`${field}.category is unsupported.`);
  }
  const scope = asString(raw.scope) ?? candidate.scope;
  if (!(SOCIAL_CALENDAR_OPPORTUNITY_SCOPES as readonly string[]).includes(scope)) {
    failures.push(`${field}.scope is unsupported.`);
  }
  const reason = boundedString(
    raw.reason,
    `${field}.reason`,
    LIMITS.calendarReasonMaxChars,
    failures,
  );
  return {
    sourceCandidateId,
    date: candidate.date,
    label: asString(raw.label) ?? candidate.label,
    category: candidate.category,
    scope: candidate.scope,
    jurisdictionCountryCode: candidate.jurisdictionCountryCode,
    jurisdictionRegionCode: candidate.jurisdictionRegionCode,
    jurisdictionHemisphere: candidate.jurisdictionHemisphere,
    reason: reason ?? "Selected as a relevant calendar anchor.",
  };
}

function parseSourceSignals(
  raw: unknown,
  field: string,
  failures: string[],
): SocialPlannerSourceSignal[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    failures.push(`${field} must be an array.`);
    return [];
  }
  if (raw.length > LIMITS.sourceSignalsMax) {
    failures.push(`${field} exceeds ${LIMITS.sourceSignalsMax} entries.`);
  }
  const signals: SocialPlannerSourceSignal[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry)) {
      failures.push(`${field}[${index}] must be an object.`);
      continue;
    }
    const type = asString(entry.type);
    if (
      !type ||
      !(SOCIAL_PLANNER_SOURCE_SIGNAL_TYPES as readonly string[]).includes(type)
    ) {
      failures.push(`${field}[${index}].type is unsupported.`);
      continue;
    }
    if (type === "prospect_portfolio" && entry.id != null) {
      failures.push(`${field}[${index}] must not attach a Prospect id.`);
    }
    signals.push({
      type: type as SocialPlannerSourceSignalType,
      id: asNullableString(entry.id),
    });
  }
  return signals;
}

type SocialPlannerSourceSignalType =
  (typeof SOCIAL_PLANNER_SOURCE_SIGNAL_TYPES)[number];

type EvergreenFingerprintSource = Omit<
  SocialCalendarEvergreenDayV1,
  "creativeFingerprint"
> & {
  contentArchetype: SocialPlannerContentArchetype;
  primaryObjective: SocialPlannerObjective;
};

export function buildEvergreenDayFingerprint(
  day: EvergreenFingerprintSource,
): SocialPlannerEvergreenFingerprint {
  return {
    evergreenFormat: day.evergreenFormat,
    contentArchetype: day.contentArchetype,
    topic: normalizeComparableText(day.topic),
    angle: normalizeComparableText(day.angle),
    hookType: classifyHookType(day.title),
    hookNormalized: normalizeComparableText(day.title),
    objective: day.primaryObjective,
    audience: normalizeComparableText(day.audience),
    personaIds: [...day.personaIds],
    ctaType: classifyCtaType(day.cta),
    calendarAnchorIds: day.calendarAnchors.map((anchor) => anchor.sourceCandidateId),
  };
}

export function buildEvergreenWeekFingerprint(
  days: SocialCalendarEvergreenDayV1[],
): SocialPlannerEvergreenWeekFingerprint {
  const formats: SocialPlannerEvergreenFormat[] = [];
  const objectives: SocialPlannerObjective[] = [];
  const archetypes: SocialPlannerContentArchetype[] = [];
  const personaIds: string[] = [];
  const topics: string[] = [];
  const calendarAnchorIds: string[] = [];
  for (const day of days) {
    if (!formats.includes(day.evergreenFormat)) formats.push(day.evergreenFormat);
    const objective = day.creativeFingerprint.objective;
    if (!objectives.includes(objective)) objectives.push(objective);
    const archetype = day.creativeFingerprint.contentArchetype;
    if (!archetypes.includes(archetype)) archetypes.push(archetype);
    for (const personaId of day.personaIds) {
      if (!personaIds.includes(personaId)) personaIds.push(personaId);
    }
    const topic = day.creativeFingerprint.topic;
    if (topic && !topics.includes(topic)) topics.push(topic);
    for (const anchorId of day.creativeFingerprint.calendarAnchorIds) {
      if (!calendarAnchorIds.includes(anchorId)) calendarAnchorIds.push(anchorId);
    }
  }
  return {
    evergreenFormats: formats,
    objectives,
    archetypes,
    personaIds,
    topics,
    calendarAnchorIds,
  };
}

function parseDay(
  raw: unknown,
  index: number,
  expectedDate: string,
  assignedFormat: SocialPlannerEvergreenFormat,
  context: SocialPlannerGenerationContextV1,
  failures: string[],
): SocialCalendarEvergreenDayV1 | null {
  const field = `days[${index}]`;
  if (!isRecord(raw)) {
    failures.push(`${field} must be an object.`);
    return null;
  }

  const date = asString(raw.date);
  if (date !== expectedDate) {
    failures.push(`${field}.date must be ${expectedDate}.`);
  }
  const weekday = weekdayForDate(context.calendarContext, expectedDate);
  if (!weekday) {
    failures.push(`${field}: weekday could not be reconstructed for ${expectedDate}.`);
  }

  let evergreenFormat = raw.evergreenFormat;
  if (!isSocialPlannerEvergreenFormat(evergreenFormat)) {
    failures.push(
      `${field}.evergreenFormat must be one of ${SOCIAL_PLANNER_EVERGREEN_FORMATS.join(", ")}.`,
    );
    evergreenFormat = assignedFormat;
  } else if (evergreenFormat !== assignedFormat) {
    failures.push(
      `${field}.evergreenFormat must be ${assignedFormat} for ${expectedDate}.`,
    );
    evergreenFormat = assignedFormat;
  }

  if (
    asString(raw.assetType) ||
    Array.isArray(raw.recommendedPlatforms) ||
    asString(raw.socialCopy)
  ) {
    failures.push(
      `${field} must not use Daily socialCopy, assetType, or recommendedPlatforms.`,
    );
  }

  const title = boundedString(raw.title, `${field}.title`, LIMITS.titleMaxChars, failures);
  const concept = boundedString(
    raw.concept,
    `${field}.concept`,
    LIMITS.conceptMaxChars,
    failures,
  );
  const draft = boundedString(
    raw.draft,
    `${field}.draft`,
    LIMITS.draftMaxChars,
    failures,
  );
  const topic = boundedString(raw.topic, `${field}.topic`, LIMITS.topicMaxChars, failures);
  const angle = boundedString(raw.angle, `${field}.angle`, LIMITS.angleMaxChars, failures);
  const audience = boundedString(
    raw.audience,
    `${field}.audience`,
    LIMITS.audienceMaxChars,
    failures,
  );
  const cta = boundedString(
    raw.cta,
    `${field}.cta`,
    LIMITS.ctaMaxChars,
    failures,
    false,
  );
  const publishingGuidance = boundedString(
    raw.publishingGuidance,
    `${field}.publishingGuidance`,
    LIMITS.publishingGuidanceMaxChars,
    failures,
    false,
  );
  const calendarReason = boundedString(
    raw.calendarReason,
    `${field}.calendarReason`,
    LIMITS.calendarReasonMaxChars,
    failures,
    false,
  );

  if (draft) {
    const min = SOCIAL_PLANNER_EVERGREEN_DRAFT_MIN_CHARS[assignedFormat];
    if (draft.length < min) {
      failures.push(
        `${field}.draft must be a usable ${assignedFormat} draft of at least ${min} characters.`,
      );
    }
    if (looksLikeOutlineOnly(draft)) {
      failures.push(
        `${field}.draft must be a usable working draft, not an outline or list of suggestions.`,
      );
    }
    if (assignedFormat === "skool_course_idea" && !draftHasCourseStructure(draft)) {
      failures.push(
        `${field}.draft must include course/module structure and a learner outcome.`,
      );
    }
  }

  const contentArchetype = raw.contentArchetype;
  if (!isArchetype(contentArchetype)) {
    failures.push(`${field}.contentArchetype is unsupported.`);
  }
  const primaryObjective = raw.primaryObjective;
  if (!isObjective(primaryObjective)) {
    failures.push(`${field}.primaryObjective is unsupported.`);
  }

  const authorizedPersona = authorizedSocialPlannerTargetPersonaId(context);
  const personaIdsRaw = Array.isArray(raw.personaIds) ? raw.personaIds : [];
  const personaIds = personaIdsRaw.filter((id): id is string => typeof id === "string");
  if (personaIds.length > LIMITS.personaIdsPerDayMax) {
    failures.push(`${field}.personaIds exceeds ${LIMITS.personaIdsPerDayMax}.`);
  }
  if (socialPlannerHasPrimaryTargetAudience(context) && authorizedPersona) {
    if (personaIds.length !== 1 || personaIds[0] !== authorizedPersona) {
      failures.push(
        `${field}.personaIds must contain only the targeted Audience.`,
      );
    }
  }

  const candidates = candidateMap(context.calendarContext);
  const anchorsRaw = Array.isArray(raw.calendarAnchors) ? raw.calendarAnchors : [];
  if (anchorsRaw.length > LIMITS.anchorsPerDayMax) {
    failures.push(`${field}.calendarAnchors exceeds ${LIMITS.anchorsPerDayMax}.`);
  }
  const calendarAnchors = anchorsRaw
    .map((anchor, anchorIndex) =>
      parseSelectedAnchor(
        anchor,
        `${field}.calendarAnchors[${anchorIndex}]`,
        expectedDate,
        candidates,
        context.calendarContext.geography,
        failures,
      ),
    )
    .filter((anchor): anchor is SocialCalendarSelectedAnchor => Boolean(anchor));

  const sourceSignals = parseSourceSignals(
    raw.sourceSignals,
    `${field}.sourceSignals`,
    failures,
  );

  const day: Omit<SocialCalendarEvergreenDayV1, "creativeFingerprint"> & {
    contentArchetype: SocialPlannerContentArchetype;
    primaryObjective: SocialPlannerObjective;
  } = {
    date: expectedDate,
    weekday: weekday ?? "Monday",
    evergreenFormat: assignedFormat,
    title: title ?? "",
    concept: concept ?? "",
    draft: draft ?? "",
    cta: cta,
    publishingGuidance,
    audience: audience ?? "",
    personaIds,
    topic: topic ?? "",
    angle: angle ?? "",
    calendarAnchors,
    calendarReason,
    sourceSignals,
    contentArchetype: isArchetype(contentArchetype)
      ? contentArchetype
      : "educational",
    primaryObjective: isObjective(primaryObjective)
      ? primaryObjective
      : "educate",
  };

  const { contentArchetype: archetype, primaryObjective: objective, ...rest } = day;
  void archetype;
  const fingerprintDay = {
    ...rest,
    contentArchetype: day.contentArchetype,
    primaryObjective: day.primaryObjective,
  };

  return {
    ...rest,
    creativeFingerprint: buildEvergreenDayFingerprint(fingerprintDay),
  };
}

function validateProspectPrivacy(
  pkg: Pick<
    SocialCalendarEvergreenPackageV1,
    "strategySummary" | "whyThisWeekWorks" | "days"
  >,
  context: SocialPlannerGenerationContextV1,
  failures: string[],
): void {
  const tokens = new Set<string>();
  for (const prospect of context.prospects.prospects) {
    const name = prospect.businessName.trim();
    if (name.length >= 3) tokens.add(normalizeComparableText(name));
  }
  if (tokens.size === 0) return;
  const parts = [pkg.strategySummary, pkg.whyThisWeekWorks];
  for (const day of pkg.days) {
    parts.push(
      day.title,
      day.concept,
      day.draft,
      day.cta ?? "",
      day.publishingGuidance ?? "",
      day.audience,
      day.topic,
      day.angle,
    );
  }
  const haystack = normalizeComparableText(parts.join(" "));
  for (const token of tokens) {
    if (haystack.includes(token)) {
      failures.push("Evergreen package must not expose Prospect identifiers.");
      return;
    }
  }
}

function validateEvergreenCoverage(
  days: SocialCalendarEvergreenDayV1[],
  failures: string[],
): void {
  const formats = new Set(days.map((day) => day.evergreenFormat));
  for (const required of SOCIAL_PLANNER_EVERGREEN_FORMATS) {
    if (!formats.has(required)) {
      failures.push(
        `Evergreen week must include ${required} at least once across the seven days.`,
      );
    }
  }
  if (formats.has("substack_note" as SocialPlannerEvergreenFormat)) {
    failures.push("Substack Note is not an Evergreen format.");
  }
}

export function validateSocialPlannerEvergreenWeeklyStrategy(
  raw: Record<string, unknown>,
  context: SocialPlannerGenerationContextV1,
  assignedFormats: readonly SocialPlannerEvergreenFormatAssignment[],
): SocialPlannerEvergreenWeeklyStrategyV1 {
  const failures: string[] = [];
  if (
    raw.schemaVersion !== SOCIAL_PLANNER_EVERGREEN_WEEKLY_STRATEGY_SCHEMA_VERSION &&
    raw.schemaVersion !== SOCIAL_PLANNER_WEEKLY_STRATEGY_SCHEMA_VERSION
  ) {
    failures.push("Evergreen strategy schemaVersion is unsupported.");
  }

  const dates = context.calendarContext.period.dates;
  const assigned = evergreenFormatAssignmentMap(assignedFormats);
  const formatPlanRaw = Array.isArray(raw.formatPlan) ? raw.formatPlan : [];
  if (formatPlanRaw.length !== SOCIAL_CALENDAR_PERIOD_DAYS) {
    failures.push("Evergreen formatPlan must contain exactly seven days.");
  }

  const formatPlan: SocialPlannerEvergreenFormatPlanEntry[] = dates.map(
    (date, index) => {
      const entry = isRecord(formatPlanRaw[index]) ? formatPlanRaw[index] : {};
      const entryDate = asString(entry.date);
      if (entryDate && entryDate !== date) {
        failures.push(`formatPlan[${index}].date must be ${date}.`);
      }
      if (
        isSocialPlannerEvergreenFormat(entry.evergreenFormat) &&
        entry.evergreenFormat !== assigned.get(date)
      ) {
        failures.push(
          `formatPlan[${index}].evergreenFormat must remain ${assigned.get(date)}.`,
        );
      }
      if (asString(entry.assetType)) {
        failures.push(
          `formatPlan[${index}] must use evergreenFormat, not Daily assetType.`,
        );
      }
      const archetype = isArchetype(entry.contentArchetype)
        ? entry.contentArchetype
        : "educational";
      const objective = isObjective(entry.primaryObjective)
        ? entry.primaryObjective
        : "educate";
      if (!isArchetype(entry.contentArchetype)) {
        failures.push(`formatPlan[${index}].contentArchetype is unsupported.`);
      }
      if (!isObjective(entry.primaryObjective)) {
        failures.push(`formatPlan[${index}].primaryObjective is unsupported.`);
      }
      return {
        date,
        evergreenFormat: assigned.get(date) ?? SOCIAL_PLANNER_EVERGREEN_FORMATS[0],
        contentArchetype: archetype,
        primaryObjective: objective,
      };
    },
  );

  const weeklyObjective = boundedString(
    raw.weeklyObjective,
    "weeklyObjective",
    280,
    failures,
  );
  const narrativeArc = boundedString(raw.narrativeArc, "narrativeArc", 600, failures);
  const creativeDirection = boundedString(
    raw.creativeDirection,
    "creativeDirection",
    400,
    failures,
  );

  if (failures.length > 0) {
    throw new SocialPlannerStrategyValidationError(failures);
  }

  return {
    schemaVersion: SOCIAL_PLANNER_EVERGREEN_WEEKLY_STRATEGY_SCHEMA_VERSION,
    weeklyObjective: weeklyObjective ?? "",
    secondaryObjectives: Array.isArray(raw.secondaryObjectives)
      ? raw.secondaryObjectives.filter((entry): entry is string => typeof entry === "string")
      : [],
    audiencePlan: Array.isArray(raw.audiencePlan)
      ? raw.audiencePlan
          .filter(isRecord)
          .map((entry) => ({
            audience: asString(entry.audience) ?? "",
            personaId: asNullableString(entry.personaId),
            role: entry.role === "secondary" ? "secondary" : "primary",
          }))
      : [],
    topicPlan: Array.isArray(raw.topicPlan)
      ? raw.topicPlan
          .filter(isRecord)
          .map((entry) => ({
            topic: asString(entry.topic) ?? "",
            rationale: asString(entry.rationale) ?? "",
          }))
      : [],
    formatPlan,
    calendarOpportunityPlan: {
      selected: [],
      ignored: [],
    },
    contentBalance: {
      promotionalWeight: "low",
      educationalWeight: "high",
      communityWeight: "moderate",
      funnelNotes: asString(isRecord(raw.contentBalance) ? raw.contentBalance.funnelNotes : null) ?? "",
    },
    narrativeArc: narrativeArc ?? "",
    creativeDirection: creativeDirection ?? "",
    avoidances: Array.isArray(raw.avoidances)
      ? raw.avoidances.filter((entry): entry is string => typeof entry === "string")
      : [],
    userGuidanceInterpretation: asNullableString(raw.userGuidanceInterpretation),
  };
}

export function validateAndNormalizeSocialCalendarEvergreenPackage(input: {
  raw: Record<string, unknown>;
  context: SocialPlannerGenerationContextV1;
  metadata: SocialPlannerEvergreenGenerationMetadata;
  assignedFormats: readonly SocialPlannerEvergreenFormatAssignment[];
}): SocialCalendarEvergreenPackageV1 {
  const { raw, context, metadata, assignedFormats } = input;
  const structural: string[] = [];
  const portfolio: string[] = [];
  const budget: string[] = [];

  if (raw.schemaVersion !== SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION) {
    structural.push(
      "Package schemaVersion must be social_calendar_evergreen_package_v1.",
    );
  }
  if (raw.plannerKind != null && raw.plannerKind !== "evergreen") {
    structural.push("Evergreen package plannerKind must be evergreen.");
  }
  if (Array.isArray(raw.assets)) {
    structural.push("Evergreen package must use days, not Daily assets.");
  }

  const dates = context.calendarContext.period.dates;
  if (dates.length !== SOCIAL_CALENDAR_PERIOD_DAYS) {
    structural.push("Calendar Context must contain exactly seven dates.");
  }
  const assigned = evergreenFormatAssignmentMap(assignedFormats);

  const daysRaw = Array.isArray(raw.days) ? raw.days : null;
  if (!daysRaw) {
    structural.push("Package days must be an array.");
  } else if (daysRaw.length !== SOCIAL_CALENDAR_PERIOD_DAYS) {
    structural.push("Package must contain exactly seven Evergreen days.");
  }

  const strategySummary = boundedString(
    raw.strategySummary,
    "strategySummary",
    LIMITS.strategySummaryMaxChars,
    structural,
  );
  const whyThisWeekWorks = boundedString(
    raw.whyThisWeekWorks,
    "whyThisWeekWorks",
    LIMITS.whyThisWeekWorksMaxChars,
    structural,
  );
  if (whyThisWeekWorks) {
    if (whyThisWeekWorks.length < LIMITS.whyThisWeekWorksMinChars) {
      structural.push(
        `whyThisWeekWorks must be at least ${LIMITS.whyThisWeekWorksMinChars} characters.`,
      );
    }
    const sentences = countSentences(whyThisWeekWorks);
    if (
      sentences < LIMITS.whyThisWeekWorksMinSentences ||
      sentences > LIMITS.whyThisWeekWorksMaxSentences
    ) {
      structural.push(
        `whyThisWeekWorks must be ${LIMITS.whyThisWeekWorksMinSentences}-${LIMITS.whyThisWeekWorksMaxSentences} concise sentences.`,
      );
    }
  }

  const days: SocialCalendarEvergreenDayV1[] = [];
  if (daysRaw) {
    const count = Math.max(daysRaw.length, dates.length);
    for (let index = 0; index < count; index += 1) {
      const expectedDate = dates[index];
      if (!expectedDate) {
        structural.push(`Unexpected extra Evergreen day at index ${index}.`);
        continue;
      }
      if (!daysRaw[index]) {
        structural.push(`Missing Evergreen day for ${expectedDate}.`);
        continue;
      }
      const assignedFormat =
        assigned.get(expectedDate) ?? SOCIAL_PLANNER_EVERGREEN_FORMATS[0];
      const parsed = parseDay(
        daysRaw[index],
        index,
        expectedDate,
        assignedFormat,
        context,
        structural,
      );
      if (parsed) days.push(parsed);
    }
  }

  const seenDates = days.map((day) => day.date);
  if (new Set(seenDates).size !== seenDates.length) {
    structural.push("Package dates must be unique.");
  }

  if (days.length === SOCIAL_CALENDAR_PERIOD_DAYS) {
    validateEvergreenCoverage(days, portfolio);
    if (strategySummary && whyThisWeekWorks) {
      validateProspectPrivacy(
        { strategySummary, whyThisWeekWorks, days },
        context,
        portfolio,
      );
    }
  }

  const draft: SocialCalendarEvergreenPackageV1 = {
    schemaVersion: SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION,
    plannerKind: "evergreen",
    period: {
      periodStart: context.calendarContext.period.periodStart,
      periodEnd: context.calendarContext.period.periodEnd,
      dates: [...dates],
    },
    strategySummary: strategySummary ?? "",
    whyThisWeekWorks: whyThisWeekWorks ?? "",
    days,
    weekFingerprint: buildEvergreenWeekFingerprint(days),
    generationMetadata: metadata,
  };

  for (const day of days) {
    const size = jsonChars(day);
    if (size > LIMITS.dayMaxChars) {
      budget.push(
        `Evergreen day ${day.date} exceeds the ${LIMITS.dayMaxChars} character budget.`,
      );
    }
  }
  const packageSize = jsonChars(draft);
  if (packageSize > LIMITS.packageMaxChars) {
    budget.push(
      `Package exceeds the ${LIMITS.packageMaxChars} character hard budget (${packageSize}).`,
    );
  }

  if (structural.length > 0) {
    throw new SocialCalendarPackageValidationError("structural", structural);
  }
  if (portfolio.length > 0) {
    throw new SocialCalendarPackageValidationError("portfolio", portfolio);
  }
  if (budget.length > 0) {
    throw new SocialCalendarPackageValidationError("budget", budget);
  }

  return draft;
}
