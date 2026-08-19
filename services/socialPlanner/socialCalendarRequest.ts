/**
 * Browser create-request validation for Social Planner L6.
 * Server derives authoritative period, mode, and guidance.
 */

import {
  SOCIAL_CALENDAR_PERIOD_DAYS,
  SocialCalendarGuidanceError,
  SocialCalendarLineageError,
  SocialCalendarPeriodError,
  normalizeSocialCalendarPeriod,
  normalizeSocialCalendarUserGuidance,
  parseSocialCalendarDate,
  type SocialCalendarPeriod,
} from "@/services/socialPlanner/socialCalendarTypes";

export const SOCIAL_CALENDAR_CREATE_UNSUPPORTED_FIELDS = [
  "organization_id",
  "organizationId",
  "user_id",
  "userId",
  "package_json",
  "packageJson",
  "provenance_json",
  "provenanceJson",
  "calendar_context_json",
  "calendarContextJson",
  "version_number",
  "versionNumber",
  "source_calendar_id",
  "sourceCalendarId",
  "root_calendar_id",
  "rootCalendarId",
  "status",
  "generation_stage",
  "generationStage",
  "error_code",
  "errorCode",
  "error_message",
  "errorMessage",
] as const;

export class SocialCalendarRequestError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SocialCalendarRequestError";
    this.code = code;
  }
}

export type NormalizedSocialCalendarCreateRequest = {
  periodStart: string;
  periodEnd: string;
  userGuidance: string | null;
  generationMode: "standard";
};

function formatUtcDate(utc: number): string {
  const parsed = new Date(utc);
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function deriveSocialCalendarPeriodEnd(periodStart: string): string {
  const start = parseSocialCalendarDate(periodStart);
  const startUtc = Date.parse(`${start}T00:00:00.000Z`);
  return formatUtcDate(startUtc + (SOCIAL_CALENDAR_PERIOD_DAYS - 1) * 86_400_000);
}

export function normalizeSocialCalendarCreatePeriod(input: {
  periodStart: unknown;
  periodEnd?: unknown;
}): SocialCalendarPeriod {
  const start = parseSocialCalendarDate(input.periodStart);
  const end =
    input.periodEnd == null || input.periodEnd === ""
      ? deriveSocialCalendarPeriodEnd(start)
      : parseSocialCalendarDate(input.periodEnd);
  return normalizeSocialCalendarPeriod(start, end);
}

export function normalizeSocialCalendarCreateRequest(
  body: Record<string, unknown>,
): NormalizedSocialCalendarCreateRequest {
  const {
    organization_id: _organizationId,
    organizationId: _organizationIdCamel,
    user_id: _userId,
    userId: _userIdCamel,
    package_json: _packageJson,
    packageJson: _packageJsonCamel,
    provenance_json: _provenanceJson,
    provenanceJson: _provenanceJsonCamel,
    calendar_context_json: _calendarContextJson,
    calendarContextJson: _calendarContextJsonCamel,
    version_number: _versionNumber,
    versionNumber: _versionNumberCamel,
    source_calendar_id: _sourceCalendarId,
    sourceCalendarId: _sourceCalendarIdCamel,
    root_calendar_id: _rootCalendarId,
    rootCalendarId: _rootCalendarIdCamel,
    status: _status,
    generation_stage: _generationStage,
    generationStage: _generationStageCamel,
    error_code: _errorCode,
    errorCode: _errorCodeCamel,
    error_message: _errorMessage,
    errorMessage: _errorMessageCamel,
    job: _job,
    jobId: _jobId,
    claimed_by: _claimedBy,
    claim_token: _claimToken,
    ...rest
  } = body;

  void _organizationId;
  void _organizationIdCamel;
  void _userId;
  void _userIdCamel;
  void _packageJson;
  void _packageJsonCamel;
  void _provenanceJson;
  void _provenanceJsonCamel;
  void _calendarContextJson;
  void _calendarContextJsonCamel;
  void _versionNumber;
  void _versionNumberCamel;
  void _sourceCalendarId;
  void _sourceCalendarIdCamel;
  void _rootCalendarId;
  void _rootCalendarIdCamel;
  void _status;
  void _generationStage;
  void _generationStageCamel;
  void _errorCode;
  void _errorCodeCamel;
  void _errorMessage;
  void _errorMessageCamel;
  void _job;
  void _jobId;
  void _claimedBy;
  void _claimToken;

  const generationMode = rest.generationMode ?? rest.generation_mode;
  if (generationMode != null && generationMode !== "standard") {
    throw new SocialCalendarLineageError(
      'Social Planner L6 only supports generation mode "standard".',
    );
  }

  if (rest.periodStart == null && rest.period_start == null) {
    throw new SocialCalendarPeriodError(
      "periodStart is required and must be an ISO calendar date (YYYY-MM-DD).",
    );
  }

  const period = normalizeSocialCalendarCreatePeriod({
    periodStart: rest.periodStart ?? rest.period_start,
    periodEnd: rest.periodEnd ?? rest.period_end,
  });

  let userGuidance: string | null;
  try {
    userGuidance = normalizeSocialCalendarUserGuidance(
      rest.userGuidance ?? rest.user_guidance,
    );
  } catch (error) {
    if (error instanceof SocialCalendarGuidanceError) throw error;
    throw new SocialCalendarGuidanceError();
  }

  return {
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    userGuidance,
    generationMode: "standard",
  };
}

export const SOCIAL_CALENDAR_THINK_DIFFERENTLY_FORBIDDEN_FIELDS = [
  ...SOCIAL_CALENDAR_CREATE_UNSUPPORTED_FIELDS,
  "generationMode",
  "generation_mode",
  "periodStart",
  "period_start",
  "periodEnd",
  "period_end",
  "userGuidance",
  "user_guidance",
  "package",
  "calendarContext",
  "calendar_context",
  "provenance",
] as const;

export function normalizeThinkDifferentlyRequest(
  body: Record<string, unknown>,
): void {
  const present = SOCIAL_CALENDAR_THINK_DIFFERENTLY_FORBIDDEN_FIELDS.filter(
    (field) => field in body,
  );
  if (present.length > 0 || Object.keys(body).length > 0) {
    throw new SocialCalendarRequestError(
      "UNSUPPORTED_FIELD",
      "Think Differently does not accept generation fields from the browser.",
    );
  }
}
