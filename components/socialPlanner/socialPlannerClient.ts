/**
 * Social Planner browser helpers: create body, polling policy, API error mapping.
 * No Supabase access. Server remains integrity authority.
 */

import {
  SOCIAL_CALENDAR_HISTORY_PAGE_SIZE,
  type CreateSocialCalendarResponse,
  type SocialCalendarDetailDto,
  type SocialCalendarHistoryPaginationDto,
  type SocialCalendarListItemDto,
} from "@/services/socialPlanner/socialCalendarDto";
import { parseJsonResponse } from "@/lib/safeJsonResponse";

export const SOCIAL_PLANNER_DETAIL_POLL_MS = 3_000;
export const SOCIAL_PLANNER_HISTORY_POLL_TICKS = 4;
export const SOCIAL_PLANNER_TRANSIENT_POLL_NOTICE_AFTER = 2;
export const SOCIAL_PLANNER_SOCIAL_COPY_PREVIEW_CHARS = 180;

export const SOCIAL_PLANNER_CALENDAR_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SocialPlannerApiError = {
  code?: string;
  message?: string;
};

export type SocialPlannerErrorChrome = {
  authenticationRequired?: string;
  notFound?: string;
  notReadyThinkDifferently?: string;
  checkWeek?: string;
  somethingWentWrong?: string;
  failedToStart?: string;
  failedThinkDifferently?: string;
  cannotApplyYet?: string;
  failedApply?: string;
};

const DEFAULT_ERROR_CHROME = {
  authenticationRequired: "Authentication required",
  notFound: "This calendar could not be found.",
  notReadyThinkDifferently: "This calendar is not ready for Think Differently.",
  checkWeek: "Please check the week you selected and try again.",
  somethingWentWrong: "Something went wrong. Please try again.",
  failedToStart: "Failed to start Social Planner.",
  failedThinkDifferently: "Failed to start Think Differently.",
  cannotApplyYet: "This conversation cannot be applied yet.",
  failedApply: "Failed to apply Athena's suggestions.",
} as const satisfies Required<SocialPlannerErrorChrome>;

function resolveErrorChrome(
  chrome?: SocialPlannerErrorChrome,
): Required<SocialPlannerErrorChrome> {
  return {
    authenticationRequired:
      chrome?.authenticationRequired ?? DEFAULT_ERROR_CHROME.authenticationRequired,
    notFound: chrome?.notFound ?? DEFAULT_ERROR_CHROME.notFound,
    notReadyThinkDifferently:
      chrome?.notReadyThinkDifferently ??
      DEFAULT_ERROR_CHROME.notReadyThinkDifferently,
    checkWeek: chrome?.checkWeek ?? DEFAULT_ERROR_CHROME.checkWeek,
    somethingWentWrong:
      chrome?.somethingWentWrong ?? DEFAULT_ERROR_CHROME.somethingWentWrong,
    failedToStart: chrome?.failedToStart ?? DEFAULT_ERROR_CHROME.failedToStart,
    failedThinkDifferently:
      chrome?.failedThinkDifferently ?? DEFAULT_ERROR_CHROME.failedThinkDifferently,
    cannotApplyYet: chrome?.cannotApplyYet ?? DEFAULT_ERROR_CHROME.cannotApplyYet,
    failedApply: chrome?.failedApply ?? DEFAULT_ERROR_CHROME.failedApply,
  };
}

export type SocialPlannerCreatePayload = {
  periodStart: string;
  periodEnd: string;
  userGuidance: string;
};

export function buildSocialCalendarCreateBody(input: {
  periodStart: string;
  periodEnd: string;
  userGuidance: string;
}): SocialPlannerCreatePayload {
  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    userGuidance: input.userGuidance.trim(),
  };
}

export function socialPlannerCreateBodyKeys(
  body: SocialPlannerCreatePayload,
): string[] {
  return Object.keys(body).sort();
}

export function isSocialPlannerInFlight(
  status: string | null | undefined,
): boolean {
  return status === "Queued" || status === "Processing";
}

export function shouldStopSocialPlannerPolling(
  status: string | null | undefined,
): boolean {
  return status === "Ready" || status === "Processing Failed";
}

export function socialPlannerWorkspacePath(calendarId?: string | null): string {
  if (calendarId && SOCIAL_PLANNER_CALENDAR_ID_RE.test(calendarId)) {
    return `/social-planner/${calendarId}`;
  }
  return "/social-planner";
}

export function mapSocialPlannerApiError(
  status: number,
  error: SocialPlannerApiError | null | undefined,
  fallback: string,
  chrome?: SocialPlannerErrorChrome,
): string {
  const labels = resolveErrorChrome(chrome);
  if (status === 401) {
    return labels.authenticationRequired;
  }
  if (status === 404) {
    return labels.notFound;
  }
  if (status === 409) {
    const message = error?.message?.trim();
    return message || labels.notReadyThinkDifferently;
  }
  if (status === 400) {
    const message = error?.message?.trim();
    return message || labels.checkWeek;
  }
  if (status >= 500) {
    return labels.somethingWentWrong;
  }
  return fallback;
}

export function queuedDetailFromCreate(
  created: CreateSocialCalendarResponse,
  userGuidance: string | null,
  lineage?: {
    sourceCalendarId?: string | null;
    rootCalendarId?: string | null;
  },
): SocialCalendarDetailDto {
  return {
    id: created.id,
    periodStart: created.periodStart,
    periodEnd: created.periodEnd,
    status: created.status,
    generationMode: created.generationMode,
    generationStage: "queued",
    versionNumber: created.versionNumber,
    sourceCalendarId: lineage?.sourceCalendarId ?? null,
    rootCalendarId: lineage?.rootCalendarId ?? null,
    userGuidance,
    package: null,
    packageUnavailable: false,
    createdAt: created.createdAt,
    updatedAt: created.createdAt,
    error: null,
  };
}

export function listItemFromCreate(
  created: CreateSocialCalendarResponse,
): SocialCalendarListItemDto {
  return {
    id: created.id,
    periodStart: created.periodStart,
    periodEnd: created.periodEnd,
    status: created.status,
    generationMode: created.generationMode,
    generationStage: "queued",
    versionNumber: created.versionNumber,
    sourceCalendarId: null,
    rootCalendarId: null,
    strategySummary: null,
    whyThisWeekWorks: null,
    assetCount: 0,
    assetTypes: [],
    families: [],
    modelsUsed: null,
    createdAt: created.createdAt,
    updatedAt: created.createdAt,
    error: null,
  };
}

export function previewSocialCopy(value: string, max = SOCIAL_PLANNER_SOCIAL_COPY_PREVIEW_CHARS): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

type CreateResponse = {
  ok?: boolean;
  success?: boolean;
  calendar?: CreateSocialCalendarResponse;
  error?: SocialPlannerApiError;
};

type ListResponse = {
  ok?: boolean;
  success?: boolean;
  calendars?: SocialCalendarListItemDto[];
  pagination?: SocialCalendarHistoryPaginationDto;
  error?: SocialPlannerApiError;
};

export type SocialCalendarHistoryFetchQuery = {
  search?: string;
  page?: number;
  limit?: number;
};

export type SocialCalendarHistoryPage = {
  calendars: SocialCalendarListItemDto[];
  pagination: SocialCalendarHistoryPaginationDto;
};

type DetailResponse = {
  ok?: boolean;
  success?: boolean;
  calendar?: SocialCalendarDetailDto;
  error?: SocialPlannerApiError;
};

export type SocialPlannerFetchResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "auth" }
  | { kind: "not_found" }
  | { kind: "validation"; message: string }
  | { kind: "transient" }
  | { kind: "error"; message: string };

export async function createSocialCalendarRequest(
  body: SocialPlannerCreatePayload,
  chrome?: SocialPlannerErrorChrome,
): Promise<SocialPlannerFetchResult<CreateSocialCalendarResponse>> {
  const labels = resolveErrorChrome(chrome);
  try {
    const response = await fetch("/api/social-planner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await parseJsonResponse<CreateResponse>(response, {
      unexpectedMessage: labels.somethingWentWrong,
    });
    if (response.status === 401) return { kind: "auth" };
    if (response.status === 202 && payload.calendar?.id) {
      return { kind: "ok", value: payload.calendar };
    }
    if (response.status === 400) {
      return {
        kind: "validation",
        message: mapSocialPlannerApiError(400, payload.error, "", chrome),
      };
    }
    if (response.status >= 500) {
      return {
        kind: "error",
        message: mapSocialPlannerApiError(500, payload.error, "", chrome),
      };
    }
    return {
      kind: "error",
      message: mapSocialPlannerApiError(
        response.status,
        payload.error,
        labels.failedToStart,
        chrome,
      ),
    };
  } catch {
    return {
      kind: "error",
      message: labels.somethingWentWrong,
    };
  }
}

export async function fetchSocialCalendarDetail(
  id: string,
  chrome?: SocialPlannerErrorChrome,
): Promise<SocialPlannerFetchResult<SocialCalendarDetailDto>> {
  const labels = resolveErrorChrome(chrome);
  try {
    const response = await fetch(`/api/social-planner/${id}`, {
      cache: "no-store",
    });
    const payload = await parseJsonResponse<DetailResponse>(response, {
      unexpectedMessage: labels.somethingWentWrong,
    });
    if (response.status === 401) return { kind: "auth" };
    if (response.status === 404) return { kind: "not_found" };
    if (response.ok && payload.calendar) {
      return { kind: "ok", value: payload.calendar };
    }
    if (response.status >= 500 || !response.ok) {
      return { kind: "transient" };
    }
    return { kind: "transient" };
  } catch {
    return { kind: "transient" };
  }
}

export async function thinkDifferentlySocialCalendarRequest(
  sourceId: string,
  chrome?: SocialPlannerErrorChrome,
): Promise<SocialPlannerFetchResult<CreateSocialCalendarResponse>> {
  const labels = resolveErrorChrome(chrome);
  try {
    const response = await fetch(
      `/api/social-planner/${sourceId}/think-differently`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    const payload = await parseJsonResponse<CreateResponse>(response, {
      unexpectedMessage: labels.somethingWentWrong,
    });
    if (response.status === 401) return { kind: "auth" };
    if (response.status === 404) return { kind: "not_found" };
    if (response.status === 202 && payload.calendar?.id) {
      return { kind: "ok", value: payload.calendar };
    }
    if (response.status === 400 || response.status === 409) {
      return {
        kind: "validation",
        message: mapSocialPlannerApiError(
          response.status,
          payload.error,
          labels.notReadyThinkDifferently,
          chrome,
        ),
      };
    }
    if (response.status >= 500) {
      return {
        kind: "error",
        message: mapSocialPlannerApiError(500, payload.error, "", chrome),
      };
    }
    return {
      kind: "error",
      message: mapSocialPlannerApiError(
        response.status,
        payload.error,
        labels.failedThinkDifferently,
        chrome,
      ),
    };
  } catch {
    return {
      kind: "error",
      message: labels.somethingWentWrong,
    };
  }
}

export async function applySocialPlannerConversationRequest(
  sourceId: string,
  chrome?: SocialPlannerErrorChrome,
): Promise<SocialPlannerFetchResult<CreateSocialCalendarResponse>> {
  const labels = resolveErrorChrome(chrome);
  try {
    const response = await fetch(
      `/api/social-planner/${sourceId}/conversation/apply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    const payload = await parseJsonResponse<CreateResponse>(response, {
      unexpectedMessage: labels.somethingWentWrong,
    });
    if (response.status === 401) return { kind: "auth" };
    if (response.status === 404) return { kind: "not_found" };
    if (response.status === 202 && payload.calendar?.id) {
      return { kind: "ok", value: payload.calendar };
    }
    if (response.status === 400 || response.status === 409) {
      return {
        kind: "validation",
        message: mapSocialPlannerApiError(
          response.status,
          payload.error,
          labels.cannotApplyYet,
          chrome,
        ),
      };
    }
    if (response.status >= 500) {
      return {
        kind: "error",
        message: mapSocialPlannerApiError(500, payload.error, "", chrome),
      };
    }
    return {
      kind: "error",
      message: mapSocialPlannerApiError(
        response.status,
        payload.error,
        labels.failedApply,
        chrome,
      ),
    };
  } catch {
    return {
      kind: "error",
      message: labels.somethingWentWrong,
    };
  }
}

export async function fetchSocialCalendarHistory(
  query: SocialCalendarHistoryFetchQuery = {},
  chrome?: SocialPlannerErrorChrome,
): Promise<SocialPlannerFetchResult<SocialCalendarHistoryPage>> {
  const labels = resolveErrorChrome(chrome);
  try {
    const params = new URLSearchParams();
    const search = query.search?.trim() ?? "";
    if (search) params.set("search", search);
    if (query.page != null) params.set("page", String(query.page));
    if (query.limit != null) params.set("limit", String(query.limit));
    const qs = params.toString();
    const response = await fetch(
      qs ? `/api/social-planner?${qs}` : "/api/social-planner",
      { cache: "no-store" },
    );
    const payload = await parseJsonResponse<ListResponse>(response, {
      unexpectedMessage: labels.somethingWentWrong,
    });
    if (response.status === 401) return { kind: "auth" };
    if (response.ok && Array.isArray(payload.calendars)) {
      const limit = query.limit ?? SOCIAL_CALENDAR_HISTORY_PAGE_SIZE;
      const page = query.page ?? 1;
      const pagination = payload.pagination ?? {
        page,
        limit,
        total: payload.calendars.length,
        totalPages: payload.calendars.length === 0 ? 0 : 1,
        hasMore: false,
      };
      return {
        kind: "ok",
        value: {
          calendars: payload.calendars,
          pagination,
        },
      };
    }
    return { kind: "transient" };
  } catch {
    return { kind: "transient" };
  }
}
