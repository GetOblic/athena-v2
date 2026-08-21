"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

type SocialPlannerWorkspaceProps = {
  initialCalendars: SocialCalendarListItemDto[];
  initialPagination: SocialCalendarHistoryPaginationDto;
  loadError: string | null;
};

export function SocialPlannerWorkspace({
  initialCalendars,
  initialPagination,
  loadError,
}: SocialPlannerWorkspaceProps) {
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
      const history = await fetchSocialCalendarHistory({
        search: nextSearch,
        page: nextPage,
        limit,
      });
      if (latestRequestKeyRef.current !== requestKey) {
        return;
      }
      if (history.kind === "ok") {
        setCalendars(history.value.calendars);
        setPagination(history.value.pagination);
      }
    },
    [limit],
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
      const result = await createSocialCalendarRequest(body);
      if (result.kind === "auth") {
        window.location.href = "/login";
        return;
      }
      if (result.kind === "validation" || result.kind === "error") {
        setCreateError(result.message);
        return;
      }
      if (result.kind !== "ok") {
        setCreateError("Something went wrong. Please try again.");
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
            Unable to load Social Planner
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
      />

      {loadError ? null : (
        <label className="block text-sm text-white/50">
          Search
          <input
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Search calendars, dates, strategy, asset types..."
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
          />
        </label>
      )}

      <SocialPlannerHistory
        calendars={calendars}
        pagination={pagination}
        search={search}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
