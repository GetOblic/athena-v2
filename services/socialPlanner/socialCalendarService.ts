/**
 * Organization-scoped Social Calendar persistence.
 * Ownership always comes from trusted server organizationId — never the client.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { mapSocialCalendarRow } from "@/services/socialPlanner/socialCalendarMappers";
import type { SocialCalendar } from "@/services/socialPlanner/socialCalendarTypes";
import {
  assertSocialCalendarLineage,
  resolveSocialCalendarRootId,
} from "@/services/socialPlanner/socialCalendarTypes";
import { SOCIAL_PLANNER_READY_HISTORY_QUERY } from "@/services/socialPlanner/diversity/loadSocialPlannerSocialMemory";
import {
  SOCIAL_PLANNER_HISTORY_SELECT,
  SOCIAL_PLANNER_HISTORY_TABLE,
  type SocialPlannerHistoryLoader,
  type SocialPlannerHistoryRow,
} from "@/services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";
import {
  SocialCalendarVersionAllocationError,
  isPostgresUniqueViolation,
} from "@/services/socialPlanner/thinkDifferently/socialPlannerThinkDifferentlyTypes";
import type { SocialPlannerConversationRevisionContextV1 } from "@/services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";

export type { SocialCalendar };

export const SOCIAL_CALENDAR_HISTORY_LIMIT = 50 as const;
export const SOCIAL_CALENDAR_TABLE = "athena_social_calendars" as const;

export class SocialCalendarNotFoundError extends Error {
  readonly code = "NOT_FOUND";
  constructor(message = "Social Calendar not found.") {
    super(message);
    this.name = "SocialCalendarNotFoundError";
  }
}

function touch(): string {
  return new Date().toISOString();
}

export async function listSocialCalendars(
  organizationId: string,
  limit = SOCIAL_CALENDAR_HISTORY_LIMIT,
): Promise<SocialCalendar[]> {
  const { data, error } = await supabaseAdmin
    .from(SOCIAL_CALENDAR_TABLE)
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[ATHENA_SOCIAL_PLANNER] list_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to load Social Calendars.");
  }

  return (data ?? []).map((row) =>
    mapSocialCalendarRow(row as Record<string, unknown>),
  );
}

export async function getSocialCalendarById(
  id: string,
  organizationId: string,
): Promise<SocialCalendar | null> {
  const { data, error } = await supabaseAdmin
    .from(SOCIAL_CALENDAR_TABLE)
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_SOCIAL_PLANNER] get_failed", {
      id,
      organizationId,
      error: error.message,
    });
    return null;
  }
  if (!data) return null;
  return mapSocialCalendarRow(data as Record<string, unknown>);
}

export async function createSocialCalendar(input: {
  organizationId: string;
  userId: string | null;
  periodStart: string;
  periodEnd: string;
  userGuidance: string | null;
}): Promise<SocialCalendar> {
  const now = touch();

  const { data, error } = await supabaseAdmin
    .from(SOCIAL_CALENDAR_TABLE)
    .insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      user_guidance: input.userGuidance,
      generation_mode: "standard",
      source_calendar_id: null,
      root_calendar_id: null,
      version_number: 1,
      status: "Queued",
      generation_stage: "queued",
      package_json: null,
      provenance_json: {},
      calendar_context_json: {},
      revision_context_json: null,
      error_code: null,
      error_message: null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[ATHENA_SOCIAL_PLANNER] create_failed", {
      organizationId: input.organizationId,
      error: error?.message,
    });
    throw new Error("Failed to create Social Calendar.");
  }

  return mapSocialCalendarRow(data as Record<string, unknown>);
}

export function resolveThinkDifferentlyLineage(source: Pick<
  SocialCalendar,
  "id" | "root_calendar_id" | "version_number"
>): {
  sourceCalendarId: string;
  rootCalendarId: string;
} {
  return {
    sourceCalendarId: source.id,
    rootCalendarId: resolveSocialCalendarRootId(source),
  };
}

export function nextSocialCalendarFamilyVersion(
  currentFamilyMaxVersion: number | null,
): number {
  const current = currentFamilyMaxVersion ?? 1;
  return Math.max(current, 1) + 1;
}

export async function getSocialCalendarFamilyMaxVersion(input: {
  organizationId: string;
  rootCalendarId: string;
}): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from(SOCIAL_CALENDAR_TABLE)
    .select("version_number")
    .eq("organization_id", input.organizationId)
    .eq("root_calendar_id", input.rootCalendarId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_SOCIAL_PLANNER] family_version_lookup_failed", {
      organizationId: input.organizationId,
      rootCalendarId: input.rootCalendarId,
      error: error.message,
    });
    throw new SocialCalendarVersionAllocationError();
  }

  return Number(data?.version_number ?? 1);
}

export async function createThinkDifferentlySocialCalendar(input: {
  organizationId: string;
  userId: string | null;
  source: SocialCalendar;
}): Promise<SocialCalendar> {
  const lineage = resolveThinkDifferentlyLineage(input.source);
  const familyMax = await getSocialCalendarFamilyMaxVersion({
    organizationId: input.organizationId,
    rootCalendarId: lineage.rootCalendarId,
  });
  const versionNumber = nextSocialCalendarFamilyVersion(familyMax);
  assertSocialCalendarLineage({
    generationMode: "think_differently",
    sourceCalendarId: lineage.sourceCalendarId,
    rootCalendarId: lineage.rootCalendarId,
    versionNumber,
  });

  const now = touch();
  const { data, error } = await supabaseAdmin
    .from(SOCIAL_CALENDAR_TABLE)
    .insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      period_start: input.source.period_start,
      period_end: input.source.period_end,
      user_guidance: input.source.user_guidance,
      generation_mode: "think_differently",
      source_calendar_id: lineage.sourceCalendarId,
      root_calendar_id: lineage.rootCalendarId,
      version_number: versionNumber,
      status: "Queued",
      generation_stage: "queued",
      package_json: null,
      provenance_json: {},
      calendar_context_json: {},
      revision_context_json: null,
      error_code: null,
      error_message: null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (isPostgresUniqueViolation(error)) {
    throw new SocialCalendarVersionAllocationError();
  }

  if (error || !data) {
    console.error("[ATHENA_SOCIAL_PLANNER] think_differently_create_failed", {
      organizationId: input.organizationId,
      sourceCalendarId: input.source.id,
      error: error?.message,
    });
    throw new Error("Failed to create Think Differently Social Calendar.");
  }

  return mapSocialCalendarRow(data as Record<string, unknown>);
}

export async function createConversationRevisionSocialCalendar(input: {
  organizationId: string;
  userId: string | null;
  source: SocialCalendar;
  revisionContext: SocialPlannerConversationRevisionContextV1;
}): Promise<SocialCalendar> {
  const lineage = resolveThinkDifferentlyLineage(input.source);
  const familyMax = await getSocialCalendarFamilyMaxVersion({
    organizationId: input.organizationId,
    rootCalendarId: lineage.rootCalendarId,
  });
  const versionNumber = nextSocialCalendarFamilyVersion(familyMax);
  assertSocialCalendarLineage({
    generationMode: "conversation_revision",
    sourceCalendarId: lineage.sourceCalendarId,
    rootCalendarId: lineage.rootCalendarId,
    versionNumber,
  });

  const now = touch();
  const { data, error } = await supabaseAdmin
    .from(SOCIAL_CALENDAR_TABLE)
    .insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      period_start: input.source.period_start,
      period_end: input.source.period_end,
      user_guidance: input.source.user_guidance,
      generation_mode: "conversation_revision",
      source_calendar_id: lineage.sourceCalendarId,
      root_calendar_id: lineage.rootCalendarId,
      version_number: versionNumber,
      status: "Queued",
      generation_stage: "queued",
      package_json: null,
      provenance_json: {},
      calendar_context_json: {},
      revision_context_json: input.revisionContext,
      error_code: null,
      error_message: null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (isPostgresUniqueViolation(error)) {
    throw new SocialCalendarVersionAllocationError();
  }

  if (error || !data) {
    console.error("[ATHENA_SOCIAL_PLANNER] conversation_revision_create_failed", {
      organizationId: input.organizationId,
      sourceCalendarId: input.source.id,
      error: error?.message,
    });
    throw new Error("Failed to create Conversation Revision Social Calendar.");
  }

  return mapSocialCalendarRow(data as Record<string, unknown>);
}

export async function markSocialCalendarEnqueueFailed(input: {
  calendarId: string;
  organizationId: string;
  errorCode: string;
  errorMessage: string;
}): Promise<void> {
  await supabaseAdmin
    .from(SOCIAL_CALENDAR_TABLE)
    .update({
      status: "Processing Failed",
      generation_stage: "failed",
      package_json: null,
      error_code: input.errorCode.slice(0, 120),
      error_message: input.errorMessage.slice(0, 1000),
      updated_at: touch(),
    })
    .eq("id", input.calendarId)
    .eq("organization_id", input.organizationId)
    .neq("status", "Ready");
}

export async function listReadySocialCalendarsForMemory(input: {
  organizationId: string;
  limit: number;
}): Promise<SocialPlannerHistoryRow[]> {
  const { data, error } = await supabaseAdmin
    .from(SOCIAL_PLANNER_READY_HISTORY_QUERY.table)
    .select(SOCIAL_PLANNER_HISTORY_SELECT)
    .eq("organization_id", input.organizationId)
    .eq("status", SOCIAL_PLANNER_READY_HISTORY_QUERY.status)
    .not("package_json", "is", null)
    .order(SOCIAL_PLANNER_READY_HISTORY_QUERY.orderBy, { ascending: false })
    .limit(input.limit);

  if (error) {
    console.error("[ATHENA_SOCIAL_PLANNER] history_load_failed", {
      organizationId: input.organizationId,
      error: error.message,
    });
    throw new Error("Failed to load Social Planner history.");
  }

  return (data ?? []).map((row) => {
    const record = row as unknown as Record<string, unknown>;
    return {
      id: String(record.id),
      organization_id: String(record.organization_id),
      period_start: String(record.period_start),
      period_end: String(record.period_end),
      generation_mode: record.generation_mode as SocialPlannerHistoryRow["generation_mode"],
      version_number: Number(record.version_number ?? 1),
      status: record.status as SocialPlannerHistoryRow["status"],
      package_json:
        record.package_json && typeof record.package_json === "object"
          ? (record.package_json as SocialPlannerHistoryRow["package_json"])
          : null,
      created_at: String(record.created_at ?? ""),
    };
  });
}

export const socialPlannerHistoryLoader: SocialPlannerHistoryLoader = {
  listReadyCalendars: listReadySocialCalendarsForMemory,
};

export { SOCIAL_PLANNER_HISTORY_TABLE };
