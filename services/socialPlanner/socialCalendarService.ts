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
import {
  SOCIAL_CALENDAR_HISTORY_MAX_LIMIT,
  SOCIAL_CALENDAR_HISTORY_PAGE_SIZE,
  toSocialCalendarListItemDto,
  type SocialCalendarHistoryPaginationDto,
} from "@/services/socialPlanner/socialCalendarDto";
import {
  filterSocialCalendarsByHistorySearch,
  paginateSocialCalendarHistoryItems,
} from "@/services/socialPlanner/socialCalendarHistorySearch";

export type { SocialCalendar };
export {
  SOCIAL_CALENDAR_HISTORY_MAX_LIMIT,
  SOCIAL_CALENDAR_HISTORY_PAGE_SIZE,
};

export const SOCIAL_CALENDAR_TABLE = "athena_social_calendars" as const;

export const SOCIAL_CALENDAR_LIBRARY_SELECT = [
  "id",
  "organization_id",
  "period_start",
  "period_end",
  "generation_mode",
  "generation_stage",
  "version_number",
  "source_calendar_id",
  "root_calendar_id",
  "status",
  "package_json",
  "error_code",
  "error_message",
  "created_at",
  "updated_at",
].join(", ");

export type SocialCalendarHistoryListQuery = {
  search?: string | number | null;
  page?: string | number | null;
  limit?: string | number | null;
};

export type SocialCalendarHistoryResult = {
  calendars: SocialCalendar[];
  pagination: SocialCalendarHistoryPaginationDto;
};

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

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function normalizeSocialCalendarHistorySearch(
  value: unknown,
): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeSocialCalendarHistoryPage(value: unknown): number {
  const parsed = parsePositiveInt(value);
  if (parsed == null || parsed < 1) return 1;
  return parsed;
}

export function normalizeSocialCalendarHistoryLimit(value: unknown): number {
  const parsed = parsePositiveInt(value);
  if (parsed == null || parsed < 1) return SOCIAL_CALENDAR_HISTORY_PAGE_SIZE;
  return Math.min(parsed, SOCIAL_CALENDAR_HISTORY_MAX_LIMIT);
}

export function normalizeSocialCalendarHistoryQuery(
  query: SocialCalendarHistoryListQuery = {},
): { search: string; page: number; limit: number } {
  return {
    search: normalizeSocialCalendarHistorySearch(query.search),
    page: normalizeSocialCalendarHistoryPage(query.page),
    limit: normalizeSocialCalendarHistoryLimit(query.limit),
  };
}

export function buildSocialCalendarHistoryPagination(
  page: number,
  limit: number,
  total: number,
): SocialCalendarHistoryPaginationDto {
  const safeTotal = Math.max(0, total);
  const totalPages = safeTotal === 0 ? 0 : Math.ceil(safeTotal / limit);
  return {
    page,
    limit,
    total: safeTotal,
    totalPages,
    hasMore: page < totalPages,
  };
}

function mapLibraryRows(rows: unknown[] | null): SocialCalendar[] {
  return (rows ?? []).map((row) =>
    mapSocialCalendarRow(row as Record<string, unknown>),
  );
}

function libraryQuery(organizationId: string, countExact: boolean) {
  const select = countExact
    ? supabaseAdmin
        .from(SOCIAL_CALENDAR_TABLE)
        .select(SOCIAL_CALENDAR_LIBRARY_SELECT, { count: "exact" })
    : supabaseAdmin
        .from(SOCIAL_CALENDAR_TABLE)
        .select(SOCIAL_CALENDAR_LIBRARY_SELECT);

  return select
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
}

async function listSocialCalendarsPage(
  organizationId: string,
  page: number,
  limit: number,
): Promise<SocialCalendarHistoryResult> {
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data, error, count } = await libraryQuery(organizationId, true).range(
    from,
    to,
  );

  if (error) {
    console.error("[ATHENA_SOCIAL_PLANNER] list_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to load Social Calendars.");
  }

  return {
    calendars: mapLibraryRows(data),
    pagination: buildSocialCalendarHistoryPagination(
      page,
      limit,
      count ?? data?.length ?? 0,
    ),
  };
}

async function searchSocialCalendars(
  organizationId: string,
  search: string,
  page: number,
  limit: number,
): Promise<SocialCalendarHistoryResult> {
  const { data, error } = await libraryQuery(organizationId, false);

  if (error) {
    console.error("[ATHENA_SOCIAL_PLANNER] search_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to load Social Calendars.");
  }

  const calendars = mapLibraryRows(data);
  const matched = filterSocialCalendarsByHistorySearch(
    calendars.map(toSocialCalendarListItemDto),
    search,
  );
  const matchedIds = new Set(matched.map((item) => item.id));
  const orderedMatches = calendars.filter((calendar) =>
    matchedIds.has(calendar.id),
  );

  return {
    calendars: paginateSocialCalendarHistoryItems(orderedMatches, page, limit),
    pagination: buildSocialCalendarHistoryPagination(page, limit, matched.length),
  };
}

export async function listSocialCalendars(
  organizationId: string,
  query: SocialCalendarHistoryListQuery = {},
): Promise<SocialCalendarHistoryResult> {
  const { search, page, limit } = normalizeSocialCalendarHistoryQuery(query);
  if (search) {
    return searchSocialCalendars(organizationId, search, page, limit);
  }
  return listSocialCalendarsPage(organizationId, page, limit);
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
