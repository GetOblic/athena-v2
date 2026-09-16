/**
 * Social Planner plannerKind — product mode, not generation_mode.
 * generation_mode remains lineage/execution: standard | think_differently | conversation_revision.
 * Historical rows without plannerKind resolve as daily_social. No migration.
 *
 * Pure shared: kinds, resolvers, request normalizers, and queued provenance
 * composition. Must not import server persona/intelligence modules — client
 * DTO and create-request helpers reuse this file.
 */

import { normalizeSocialPlannerPersonaId } from "@/lib/socialPlanner/socialPlannerTargetPresentation";

export const SOCIAL_CALENDAR_PLANNER_KINDS = [
  "daily_social",
  "evergreen",
] as const;

export type SocialCalendarPlannerKind =
  (typeof SOCIAL_CALENDAR_PLANNER_KINDS)[number];

export const SOCIAL_CALENDAR_DEFAULT_PLANNER_KIND = "daily_social" as const;

export const SOCIAL_CALENDAR_IMPLEMENTED_PLANNER_KINDS = [
  "daily_social",
  "evergreen",
] as const;

export type SocialCalendarImplementedPlannerKind =
  (typeof SOCIAL_CALENDAR_IMPLEMENTED_PLANNER_KINDS)[number];

export const SOCIAL_CALENDAR_PLANNER_KIND_PROVENANCE_KEY = "plannerKind" as const;

export class SocialCalendarPlannerKindError extends Error {
  readonly code: "INVALID_PLANNER_KIND" | "PLANNER_KIND_NOT_IMPLEMENTED";

  constructor(
    code: "INVALID_PLANNER_KIND" | "PLANNER_KIND_NOT_IMPLEMENTED",
    message: string,
  ) {
    super(message);
    this.name = "SocialCalendarPlannerKindError";
    this.code = code;
  }
}

export function isSocialCalendarPlannerKind(
  value: unknown,
): value is SocialCalendarPlannerKind {
  return (
    typeof value === "string" &&
    (SOCIAL_CALENDAR_PLANNER_KINDS as readonly string[]).includes(value)
  );
}

export function isSocialCalendarPlannerKindImplemented(
  value: unknown,
): value is SocialCalendarImplementedPlannerKind {
  return (
    typeof value === "string" &&
    (SOCIAL_CALENDAR_IMPLEMENTED_PLANNER_KINDS as readonly string[]).includes(
      value,
    )
  );
}

/**
 * Historical / presentation resolver.
 * Missing, blank, or unknown values become daily_social.
 * Known kind "evergreen" is preserved; unknown values become daily_social.
 */
export function resolveSocialCalendarPlannerKind(
  value: unknown,
): SocialCalendarPlannerKind {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (isSocialCalendarPlannerKind(trimmed)) return trimmed;
  }
  return SOCIAL_CALENDAR_DEFAULT_PLANNER_KIND;
}

export function readExplicitSocialCalendarPlannerKind(
  provenance: unknown,
): SocialCalendarPlannerKind | null {
  if (
    !provenance ||
    typeof provenance !== "object" ||
    Array.isArray(provenance)
  ) {
    return null;
  }
  const value = (provenance as Record<string, unknown>)[
    SOCIAL_CALENDAR_PLANNER_KIND_PROVENANCE_KEY
  ];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (isSocialCalendarPlannerKind(trimmed)) return trimmed;
  }
  return null;
}

export function readSocialCalendarPlannerKind(
  provenance: unknown,
): SocialCalendarPlannerKind {
  return (
    readExplicitSocialCalendarPlannerKind(provenance) ??
    SOCIAL_CALENDAR_DEFAULT_PLANNER_KIND
  );
}

/**
 * History filter. Missing historical plannerKind is Daily only.
 * Explicit evergreen never appears in the Daily stream.
 */
export function socialCalendarMatchesPlannerHistory(
  plannerKind: SocialCalendarPlannerKind,
  historyKind: SocialCalendarPlannerKind,
): boolean {
  if (historyKind === "evergreen") {
    return plannerKind === "evergreen";
  }
  return plannerKind !== "evergreen";
}

export function plannerKindFromCalendar(calendar: {
  provenance_json?: unknown;
}): SocialCalendarPlannerKind {
  return readSocialCalendarPlannerKind(calendar.provenance_json);
}

export function assertSocialCalendarPlannerKindImplemented(
  kind: SocialCalendarPlannerKind,
): asserts kind is SocialCalendarImplementedPlannerKind {
  if (!isSocialCalendarPlannerKindImplemented(kind)) {
    throw new SocialCalendarPlannerKindError(
      "PLANNER_KIND_NOT_IMPLEMENTED",
      "Unsupported Social Planner kind.",
    );
  }
}

/**
 * Server entry-point normalizer. Callers must pass an explicit implemented kind.
 * Missing/unknown values fail closed — they do not default to Daily.
 */
export function normalizeSocialCalendarCreatePlannerKind(
  value: unknown,
): SocialCalendarImplementedPlannerKind {
  if (value === "daily_social" || value === "evergreen") {
    return value;
  }
  throw new SocialCalendarPlannerKindError(
    "INVALID_PLANNER_KIND",
    'plannerKind must be "daily_social" or "evergreen".',
  );
}

export function socialCalendarPlannerKindProvenance(
  plannerKind: SocialCalendarPlannerKind = SOCIAL_CALENDAR_DEFAULT_PLANNER_KIND,
): { plannerKind: SocialCalendarPlannerKind } {
  return { plannerKind };
}

/**
 * Same persisted key as SOCIAL_PLANNER_TARGET_PERSONA_PROVENANCE_KEY.
 * Inlined so this module stays browser-safe and does not import
 * socialPlannerTargetPersona (persona DB / intelligence / Brain).
 */
function queuedTargetPersonaProvenance(
  targetPersonaId: string | null | undefined,
): Record<string, unknown> {
  const id = normalizeSocialPlannerPersonaId(targetPersonaId);
  return id ? { targetPersonaId: id } : {};
}

export function buildSocialCalendarQueuedProvenance(input: {
  plannerKind: SocialCalendarImplementedPlannerKind;
  targetPersonaId?: string | null;
}): Record<string, unknown> {
  return {
    ...socialCalendarPlannerKindProvenance(input.plannerKind),
    ...queuedTargetPersonaProvenance(input.targetPersonaId),
  };
}

export function lineageSocialCalendarQueuedProvenance(
  sourceProvenance: unknown,
  readTargetPersonaId: (provenance: unknown) => string | null,
): Record<string, unknown> {
  const plannerKind = readSocialCalendarPlannerKind(sourceProvenance);
  assertSocialCalendarPlannerKindImplemented(plannerKind);
  return {
    ...socialCalendarPlannerKindProvenance(plannerKind),
    ...queuedTargetPersonaProvenance(readTargetPersonaId(sourceProvenance)),
  };
}

export function mergeSocialCalendarPlannerKindProvenance(
  frozen: Record<string, unknown>,
  existing: unknown,
): Record<string, unknown> {
  const existingKind = readExplicitSocialCalendarPlannerKind(existing);
  const frozenKind = readExplicitSocialCalendarPlannerKind(frozen);
  const plannerKind =
    existingKind === "evergreen" || frozenKind === "evergreen"
      ? "evergreen"
      : (existingKind ?? frozenKind ?? SOCIAL_CALENDAR_DEFAULT_PLANNER_KIND);
  return {
    ...frozen,
    [SOCIAL_CALENDAR_PLANNER_KIND_PROVENANCE_KEY]: plannerKind,
  };
}
