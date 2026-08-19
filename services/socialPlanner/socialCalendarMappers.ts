/**
 * Social Calendar row mapping. Does not parse generated packages.
 */

import {
  isSocialCalendarGenerationMode,
  isSocialCalendarStatus,
  type SocialCalendar,
  type SocialCalendarContextJson,
  type SocialCalendarGenerationMode,
  type SocialCalendarPackageJson,
  type SocialCalendarProvenanceJson,
  type SocialCalendarRevisionContextJson,
  type SocialCalendarStatus,
} from "@/services/socialPlanner/socialCalendarTypes";

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function mapSocialCalendarRow(row: Record<string, unknown>): SocialCalendar {
  const statusRaw = String(row.status ?? "Queued");
  const status: SocialCalendarStatus = isSocialCalendarStatus(statusRaw)
    ? statusRaw
    : "Queued";

  const modeRaw = String(row.generation_mode ?? "standard");
  const generation_mode: SocialCalendarGenerationMode =
    isSocialCalendarGenerationMode(modeRaw) ? modeRaw : "standard";

  const packageValue = row.package_json;
  const package_json: SocialCalendarPackageJson | null =
    packageValue && typeof packageValue === "object" && !Array.isArray(packageValue)
      ? (packageValue as SocialCalendarPackageJson)
      : null;

  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    user_id: (row.user_id as string | null) ?? null,
    period_start: String(row.period_start ?? ""),
    period_end: String(row.period_end ?? ""),
    user_guidance: (row.user_guidance as string | null) ?? null,
    generation_mode,
    source_calendar_id: (row.source_calendar_id as string | null) ?? null,
    root_calendar_id: (row.root_calendar_id as string | null) ?? null,
    version_number: Number(row.version_number ?? 1),
    status,
    generation_stage: (row.generation_stage as string | null) ?? null,
    package_json,
    provenance_json: asObject(row.provenance_json) as SocialCalendarProvenanceJson,
    calendar_context_json: asObject(
      row.calendar_context_json,
    ) as SocialCalendarContextJson,
    revision_context_json:
      row.revision_context_json == null
        ? null
        : (asObject(row.revision_context_json) as SocialCalendarRevisionContextJson),
    error_code: (row.error_code as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}
