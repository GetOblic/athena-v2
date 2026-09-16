"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import {
  SOCIAL_CALENDAR_HISTORY_PAGE_SIZE,
  type SocialCalendarHistoryPaginationDto,
  type SocialCalendarListItemDto,
} from "@/services/socialPlanner/socialCalendarDto";
import { SocialPlannerHistory } from "@/components/socialPlanner/SocialPlannerHistory";
import {
  SOCIAL_PLANNER_DETAIL_POLL_MS,
  SOCIAL_PLANNER_HISTORY_POLL_TICKS,
  fetchSocialCalendarHistory,
  isSocialPlannerInFlight,
} from "@/components/socialPlanner/socialPlannerClient";
import {
  SOCIAL_SEARCH_FIELD_CLASS,
  SOCIAL_SEARCH_SURFACE,
} from "@/lib/socialPlanner/socialPlannerPagePresentation";
import type { TenantFormattingLocale } from "@/lib/tenantI18n/format";
import { en } from "@/lib/tenantI18n/messages/en";
import { getSocialPlannerErrorChrome } from "@/lib/tenantI18n/socialPlannerPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { SocialCalendarImplementedPlannerKind } from "@/services/socialPlanner/socialCalendarPlannerKind";

type SocialPlannerHistoryPageWorkspaceProps = {
  plannerKind: SocialCalendarImplementedPlannerKind;
  initialCalendars: SocialCalendarListItemDto[];
  initialPagination: SocialCalendarHistoryPaginationDto;
  loadError: string | null;
  messages?: TenantMessages;
  locale?: TenantFormattingLocale;
};

export function SocialPlannerHistoryPageWorkspace({
  plannerKind,
  initialCalendars,
  initialPagination,
  loadError,
  messages,
  locale = "en-US",
}: SocialPlannerHistoryPageWorkspaceProps) {
  const dictionary = messages ?? en;
  const copy = dictionary.socialPlanner;
  const errorChrome = useMemo(
    () => getSocialPlannerErrorChrome(dictionary),
    [dictionary],
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(initialPagination.page);
  const [limit] = useState(
    initialPagination.limit || SOCIAL_CALENDAR_HISTORY_PAGE_SIZE,
  );
  const [calendars, setCalendars] = useState(initialCalendars);
  const [pagination, setPagination] = useState(initialPagination);
  const latestRequestKeyRef = useRef("");

  const historyHasInFlight = calendars.some((item) =>
    isSocialPlannerInFlight(item.status),
  );

  const loadHistory = useCallback(
    async (nextSearch: string, nextPage: number) => {
      const requestKey = `${plannerKind}::${nextSearch}::${nextPage}::${limit}`;
      latestRequestKeyRef.current = requestKey;
      const history = await fetchSocialCalendarHistory(
        {
          search: nextSearch,
          page: nextPage,
          limit,
          plannerKind,
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
    [limit, errorChrome, plannerKind],
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

  if (loadError) {
    return (
      <div className="rounded-[24px] border border-rose-400/30 bg-rose-500/10 p-8 text-center">
        <h2 className="text-2xl font-semibold text-rose-100">
          {copy.unableToLoad}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-rose-100/70">
          {loadError}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
            placeholder={
              plannerKind === "evergreen"
                ? copy.searchPlaceholderEvergreen
                : copy.searchPlaceholderDaily
            }
            className={SOCIAL_SEARCH_FIELD_CLASS}
          />
        </label>
      </div>

      <SocialPlannerHistory
        plannerKind={plannerKind}
        calendars={calendars}
        pagination={pagination}
        search={search}
        onPageChange={handlePageChange}
        messages={dictionary}
        locale={locale}
        showIntro={false}
        allowEmpty
      />
    </div>
  );
}
