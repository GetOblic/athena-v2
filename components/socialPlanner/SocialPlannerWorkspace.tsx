"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  SOCIAL_CALENDAR_HISTORY_PAGE_SIZE,
  type SocialCalendarHistoryPaginationDto,
  type SocialCalendarListItemDto,
} from "@/services/socialPlanner/socialCalendarDto";
import { SocialPlannerCreateForm } from "@/components/socialPlanner/SocialPlannerCreateForm";
import { SocialPlannerHistory } from "@/components/socialPlanner/SocialPlannerHistory";
import {
  SOCIAL_PLANNER_DETAIL_POLL_MS,
  SOCIAL_PLANNER_HISTORY_POLL_TICKS,
  createSocialCalendarRequest,
  fetchSocialCalendarHistory,
  isSocialPlannerInFlight,
  type SocialPlannerCreatePayload,
} from "@/components/socialPlanner/socialPlannerClient";
import {
  SOCIAL_SEARCH_FIELD_CLASS,
  SOCIAL_SEARCH_SURFACE,
} from "@/lib/socialPlanner/socialPlannerPagePresentation";
import type { TenantFormattingLocale } from "@/lib/tenantI18n/format";
import { en } from "@/lib/tenantI18n/messages/en";
import { getSocialPlannerErrorChrome } from "@/lib/tenantI18n/socialPlannerPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

type SocialPlannerWorkspaceProps = {
  initialCalendars: SocialCalendarListItemDto[];
  initialPagination: SocialCalendarHistoryPaginationDto;
  loadError: string | null;
  messages?: TenantMessages;
  language?: OrganizationLanguage;
  locale?: TenantFormattingLocale;
};

export function SocialPlannerWorkspace({
  initialCalendars,
  initialPagination,
  loadError,
  messages,
  locale = "en-US",
}: SocialPlannerWorkspaceProps) {
  const dictionary = messages ?? en;
  const copy = dictionary.socialPlanner;
  const errorChrome = useMemo(
    () => getSocialPlannerErrorChrome(dictionary),
    [dictionary],
  );
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(initialPagination.page);
  const [limit] = useState(initialPagination.limit || SOCIAL_CALENDAR_HISTORY_PAGE_SIZE);
  const [calendars, setCalendars] = useState(initialCalendars);
  const [pagination, setPagination] = useState(initialPagination);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const latestRequestKeyRef = useRef("");

  const historyHasInFlight = calendars.some((item) =>
    isSocialPlannerInFlight(item.status),
  );

  const loadHistory = useCallback(
    async (nextSearch: string, nextPage: number) => {
      const requestKey = `${nextSearch}::${nextPage}::${limit}`;
      latestRequestKeyRef.current = requestKey;
      const history = await fetchSocialCalendarHistory(
        {
          search: nextSearch,
          page: nextPage,
          limit,
        },
        errorChrome,
      );
      if (latestRequestKeyRef.current !== requestKey) {
        return;
      }
      if (history.kind === "ok") {
        setCalendars(history.value.calendars);
        setPagination(history.value.pagination);
      }
    },
    [limit, errorChrome],
  );

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
    void loadHistory(value, 1);
  }

  function handlePageChange(nextPage: number) {
    setPage(nextPage);
    void loadHistory(search, nextPage);
  }

  useEffect(() => {
    if (!historyHasInFlight) {
      return;
    }

    let cancelled = false;
    let requestInFlight = false;
    let historyTicks = 0;

    const tick = async () => {
      if (cancelled || requestInFlight) return;
      requestInFlight = true;
      try {
        historyTicks += 1;
        if (historyTicks % SOCIAL_PLANNER_HISTORY_POLL_TICKS === 0) {
          await loadHistory(search, page);
        }
      } finally {
        requestInFlight = false;
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, SOCIAL_PLANNER_DETAIL_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [historyHasInFlight, search, page, limit, loadHistory]);

  async function handleCreate(body: SocialPlannerCreatePayload) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setCreateError(null);

    try {
      const result = await createSocialCalendarRequest(body, errorChrome);
      if (result.kind === "auth") {
        window.location.href = "/login";
        return;
      }
      if (result.kind === "validation" || result.kind === "error") {
        setCreateError(result.message);
        return;
      }
      if (result.kind !== "ok") {
        setCreateError(copy.somethingWentWrong);
        return;
      }

      const created = result.value;
      router.push(`/social-planner/${created.id}`);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-10">
      {loadError ? (
        <div className="rounded-[24px] border border-rose-400/30 bg-rose-500/10 p-8 text-center">
          <h2 className="text-2xl font-semibold text-rose-100">
            {copy.unableToLoad}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-rose-100/70">
            {loadError}
          </p>
        </div>
      ) : null}

      <SocialPlannerCreateForm
        submitting={submitting}
        error={createError}
        onSubmit={(body) => void handleCreate(body)}
        messages={dictionary}
        locale={locale}
      />

      {loadError ? null : (
        <div className={SOCIAL_SEARCH_SURFACE}>
          <label className="relative block">
            <span className="sr-only">{copy.search}</span>
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/35"
              aria-hidden="true"
            />
            <input
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder={copy.searchPlaceholder}
              className={SOCIAL_SEARCH_FIELD_CLASS}
            />
          </label>
        </div>
      )}

      <SocialPlannerHistory
        calendars={calendars}
        pagination={pagination}
        search={search}
        onPageChange={handlePageChange}
        messages={dictionary}
        locale={locale}
      />
    </div>
  );
}
