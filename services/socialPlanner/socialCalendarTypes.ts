/**
 * Social Calendar domain contracts (Athena V29 L1).
 * Persistence / status / lineage / period only — no generation package schema,
 * APIs, or orchestration.
 */

export const SOCIAL_CALENDAR_STATUSES = [
  "Queued",
  "Processing",
  "Ready",
  "Processing Failed",
] as const;

export type SocialCalendarStatus = (typeof SOCIAL_CALENDAR_STATUSES)[number];

export const SOCIAL_CALENDAR_GENERATION_MODES = [
  "standard",
  "think_differently",
  "conversation_revision",
] as const;

export type SocialCalendarGenerationMode =
  (typeof SOCIAL_CALENDAR_GENERATION_MODES)[number];

export const SOCIAL_CALENDAR_PERIOD_DAYS = 7 as const;

export const SOCIAL_CALENDAR_USER_GUIDANCE_MAX_CHARS = 4_000 as const;

/**
 * Opaque generated-package placeholder.
 * The seven-day output contract is finalized in L4.
 */
export type SocialCalendarPackageJson = Record<string, unknown>;

/**
 * Compact generation provenance envelope.
 * Later layers may store prompt / Trend Social / model / diversity-strategy keys.
 */
export type SocialCalendarProvenanceJson = Record<string, unknown>;

/**
 * Frozen generation-time calendar / geography snapshot.
 * Shape is populated by L2 — L1 only reserves the durable object.
 */
export type SocialCalendarContextJson = Record<string, unknown>;

/**
 * Frozen Apply-time conversation revision request.
 * NULL for standard / think_differently. Required object for conversation_revision.
 */
export type SocialCalendarRevisionContextJson = Record<string, unknown>;

/**
 * Ready-only fields that future services must not silently rewrite.
 * Regeneration / Think Differently / revision create a new row.
 */
export const SOCIAL_CALENDAR_READY_IMMUTABLE_FIELDS = [
  "period_start",
  "period_end",
  "user_guidance",
  "generation_mode",
  "source_calendar_id",
  "root_calendar_id",
  "version_number",
  "package_json",
  "provenance_json",
  "calendar_context_json",
  "revision_context_json",
] as const;

export type SocialCalendarReadyImmutableField =
  (typeof SOCIAL_CALENDAR_READY_IMMUTABLE_FIELDS)[number];

/**
 * Row shape for athena_social_calendars (service-role persistence).
 */
export type SocialCalendar = {
  id: string;
  organization_id: string;
  user_id: string | null;
  period_start: string;
  period_end: string;
  user_guidance: string | null;
  generation_mode: SocialCalendarGenerationMode;
  source_calendar_id: string | null;
  root_calendar_id: string | null;
  version_number: number;
  status: SocialCalendarStatus;
  generation_stage: string | null;
  package_json: SocialCalendarPackageJson | null;
  provenance_json: SocialCalendarProvenanceJson;
  calendar_context_json: SocialCalendarContextJson;
  revision_context_json: SocialCalendarRevisionContextJson | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type SocialCalendarPeriod = {
  periodStart: string;
  periodEnd: string;
};

export type SocialCalendarLineageInput = {
  generationMode: SocialCalendarGenerationMode;
  sourceCalendarId: string | null;
  rootCalendarId: string | null;
  versionNumber: number;
};

export class SocialCalendarPeriodError extends Error {
  readonly code = "INVALID_SOCIAL_CALENDAR_PERIOD";

  constructor(message = "Social Calendar period must be exactly seven calendar dates.") {
    super(message);
    this.name = "SocialCalendarPeriodError";
  }
}

export class SocialCalendarGuidanceError extends Error {
  readonly code = "INVALID_SOCIAL_CALENDAR_GUIDANCE";

  constructor(message = "Social Calendar user guidance is invalid.") {
    super(message);
    this.name = "SocialCalendarGuidanceError";
  }
}

export class SocialCalendarLineageError extends Error {
  readonly code = "INVALID_SOCIAL_CALENDAR_LINEAGE";

  constructor(message = "Social Calendar lineage is invalid.") {
    super(message);
    this.name = "SocialCalendarLineageError";
  }
}

export class ReadySocialCalendarImmutableError extends Error {
  readonly code = "READY_IMMUTABLE";

  constructor(
    message = "Ready Social Calendars cannot be overwritten. Create a new Social Calendar to regenerate, Think Differently, or revise.",
  ) {
    super(message);
    this.name = "ReadySocialCalendarImmutableError";
  }
}

const ISO_CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isSocialCalendarStatus(
  value: unknown,
): value is SocialCalendarStatus {
  return (
    typeof value === "string" &&
    (SOCIAL_CALENDAR_STATUSES as readonly string[]).includes(value)
  );
}

export function isSocialCalendarGenerationMode(
  value: unknown,
): value is SocialCalendarGenerationMode {
  return (
    typeof value === "string" &&
    (SOCIAL_CALENDAR_GENERATION_MODES as readonly string[]).includes(value)
  );
}

export function isSocialCalendarReadyImmutableField(
  value: unknown,
): value is SocialCalendarReadyImmutableField {
  return (
    typeof value === "string" &&
    (SOCIAL_CALENDAR_READY_IMMUTABLE_FIELDS as readonly string[]).includes(value)
  );
}

/**
 * Parse and reject non-ISO calendar dates, including invalid calendar days
 * that JavaScript would otherwise roll forward (e.g. 2026-02-30).
 */
export function parseSocialCalendarDate(value: unknown): string {
  if (typeof value !== "string" || !ISO_CALENDAR_DATE.test(value)) {
    throw new SocialCalendarPeriodError(
      "Social Calendar dates must be ISO calendar dates (YYYY-MM-DD).",
    );
  }

  const match = ISO_CALENDAR_DATE.exec(value);
  if (!match) {
    throw new SocialCalendarPeriodError(
      "Social Calendar dates must be ISO calendar dates (YYYY-MM-DD).",
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const parsed = new Date(utc);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new SocialCalendarPeriodError(
      `Invalid calendar date: ${value}.`,
    );
  }

  return value;
}

export function normalizeSocialCalendarPeriod(
  periodStart: unknown,
  periodEnd: unknown,
): SocialCalendarPeriod {
  const start = parseSocialCalendarDate(periodStart);
  const end = parseSocialCalendarDate(periodEnd);
  const startUtc = Date.parse(`${start}T00:00:00.000Z`);
  const endUtc = Date.parse(`${end}T00:00:00.000Z`);
  const inclusiveDays = Math.round((endUtc - startUtc) / MS_PER_DAY) + 1;

  if (inclusiveDays !== SOCIAL_CALENDAR_PERIOD_DAYS) {
    throw new SocialCalendarPeriodError(
      `Social Calendar period must cover exactly ${SOCIAL_CALENDAR_PERIOD_DAYS} calendar dates.`,
    );
  }

  return { periodStart: start, periodEnd: end };
}

export function normalizeSocialCalendarUserGuidance(
  value: unknown,
): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new SocialCalendarGuidanceError(
      "Social Calendar user guidance must be a string.",
    );
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > SOCIAL_CALENDAR_USER_GUIDANCE_MAX_CHARS) {
    throw new SocialCalendarGuidanceError(
      `Social Calendar user guidance exceeds maximum length of ${SOCIAL_CALENDAR_USER_GUIDANCE_MAX_CHARS} characters.`,
    );
  }
  return trimmed;
}

export function normalizeSocialCalendarGenerationMode(
  value: unknown,
): SocialCalendarGenerationMode {
  if (isSocialCalendarGenerationMode(value)) {
    return value;
  }
  throw new SocialCalendarLineageError(
    'generation_mode must be "standard", "think_differently", or "conversation_revision".',
  );
}

export function assertSocialCalendarLineage(
  input: SocialCalendarLineageInput,
): void {
  if (!Number.isInteger(input.versionNumber) || input.versionNumber < 1) {
    throw new SocialCalendarLineageError(
      "version_number must be an integer greater than or equal to 1.",
    );
  }

  const hasSource = Boolean(input.sourceCalendarId);
  const hasRoot = Boolean(input.rootCalendarId);
  if (hasSource !== hasRoot) {
    throw new SocialCalendarLineageError(
      "source_calendar_id and root_calendar_id must both be set, or both be null.",
    );
  }

  if (input.generationMode !== "standard" && !hasSource) {
    throw new SocialCalendarLineageError(
      `${input.generationMode} calendars must preserve a source_calendar_id.`,
    );
  }
}

export function isSocialCalendarLineageRoot(
  calendar: Pick<SocialCalendar, "source_calendar_id" | "root_calendar_id">,
): boolean {
  return calendar.source_calendar_id == null && calendar.root_calendar_id == null;
}

export function resolveSocialCalendarRootId(
  calendar: Pick<SocialCalendar, "id" | "root_calendar_id">,
): string {
  return calendar.root_calendar_id ?? calendar.id;
}

/**
 * Service-level Ready immutability invariant for later CRUD phases.
 */
export function assertCanMutateSocialCalendarFields(
  status: SocialCalendarStatus,
  fields: readonly string[],
): void {
  if (status !== "Ready") {
    return;
  }

  const blocked = fields.filter((field) =>
    isSocialCalendarReadyImmutableField(field),
  );
  if (blocked.length > 0) {
    throw new ReadySocialCalendarImmutableError();
  }
}
