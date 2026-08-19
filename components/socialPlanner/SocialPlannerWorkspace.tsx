"use client";

import { useEffect, useRef, useState } from "react";
import type {
  SocialCalendarDetailDto,
  SocialCalendarListItemDto,
} from "@/services/socialPlanner/socialCalendarDto";
import { SocialCalendarDetail } from "@/components/socialPlanner/SocialCalendarDetail";
import {
  SocialPlannerCreateForm,
  type SocialPlannerCreateFormHandle,
} from "@/components/socialPlanner/SocialPlannerCreateForm";
import { SocialPlannerHistory } from "@/components/socialPlanner/SocialPlannerHistory";
import {
  SOCIAL_PLANNER_CALENDAR_ID_RE,
  SOCIAL_PLANNER_DETAIL_POLL_MS,
  SOCIAL_PLANNER_HISTORY_POLL_TICKS,
  SOCIAL_PLANNER_TRANSIENT_POLL_NOTICE_AFTER,
  createSocialCalendarRequest,
  fetchSocialCalendarDetail,
  fetchSocialCalendarHistory,
  thinkDifferentlySocialCalendarRequest,
  applySocialPlannerConversationRequest,
  isSocialPlannerInFlight,
  listItemFromCreate,
  queuedDetailFromCreate,
  shouldStopSocialPlannerPolling,
  socialPlannerWorkspacePath,
  type SocialPlannerCreatePayload,
} from "@/components/socialPlanner/socialPlannerClient";

type SocialPlannerWorkspaceProps = {
  initialCalendars: SocialCalendarListItemDto[];
  initialDetail: SocialCalendarDetailDto | null;
  initialSelectedId: string | null;
  initialDetailError: "not_found" | "load_failed" | null;
  loadError: string | null;
};

function writeWorkspaceUrl(calendarId: string | null) {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", socialPlannerWorkspacePath(calendarId));
}

export function SocialPlannerWorkspace({
  initialCalendars,
  initialDetail,
  initialSelectedId,
  initialDetailError,
  loadError,
}: SocialPlannerWorkspaceProps) {
  const [calendars, setCalendars] = useState(initialCalendars);
  const [detail, setDetail] = useState(initialDetail);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [detailError, setDetailError] = useState<
    "not_found" | "load_failed" | null
  >(initialDetailError);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [thinkDifferentlyPending, setThinkDifferentlyPending] = useState(false);
  const [thinkDifferentlyError, setThinkDifferentlyError] = useState<string | null>(
    null,
  );
  const [applyPending, setApplyPending] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [pollNotice, setPollNotice] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const thinkDifferentlyRef = useRef(false);
  const applyRef = useRef(false);
  const composerRef = useRef<SocialPlannerCreateFormHandle>(null);
  const openingRef = useRef(false);
  const calendarsRef = useRef(calendars);

  useEffect(() => {
    calendarsRef.current = calendars;
  }, [calendars]);

  const detailStatus = detail?.status ?? null;
  const historyHasInFlight = calendars.some((item) =>
    isSocialPlannerInFlight(item.status),
  );

  useEffect(() => {
    const selected = calendarsRef.current.find((item) => item.id === selectedId);
    const detailInFlight = isSocialPlannerInFlight(detailStatus);
    const waitingForFirstDetail =
      Boolean(selectedId) &&
      detailStatus == null &&
      detailError == null &&
      (selected ? isSocialPlannerInFlight(selected.status) : true);
    const shouldPollDetail =
      Boolean(selectedId) && (detailInFlight || waitingForFirstDetail);

    if (!shouldPollDetail && !historyHasInFlight) {
      return;
    }

    let cancelled = false;
    let requestInFlight = false;
    let historyTicks = 0;
    let transientFailures = 0;

    const tick = async () => {
      if (cancelled || requestInFlight) return;
      requestInFlight = true;
      try {
        if (shouldPollDetail && selectedId) {
          const result = await fetchSocialCalendarDetail(selectedId);
          if (cancelled) return;
          if (result.kind === "ok") {
            transientFailures = 0;
            setPollNotice(null);
            setDetail(result.value);
            setDetailError(null);
            setCalendars((current) => {
              const match = current.find((item) => item.id === result.value.id);
              if (
                match &&
                match.status === result.value.status &&
                match.generationStage === result.value.generationStage &&
                !shouldStopSocialPlannerPolling(result.value.status)
              ) {
                return current;
              }
              return current.map((item) =>
                item.id === result.value.id
                  ? {
                      ...item,
                      status: result.value.status,
                      generationStage: result.value.generationStage,
                      updatedAt: result.value.updatedAt,
                      error: result.value.error,
                      strategySummary:
                        result.value.package?.strategySummary ?? item.strategySummary,
                      whyThisWeekWorks:
                        result.value.package?.whyThisWeekWorks ??
                        item.whyThisWeekWorks,
                      assetCount:
                        result.value.package?.assets.length ?? item.assetCount,
                      assetTypes:
                        result.value.package?.assets.map((asset) => asset.assetType) ??
                        item.assetTypes,
                    }
                  : item,
              );
            });
            if (shouldStopSocialPlannerPolling(result.value.status)) {
              const history = await fetchSocialCalendarHistory();
              if (!cancelled && history.kind === "ok") {
                setCalendars(history.value);
              }
            }
          } else if (result.kind === "auth") {
            window.location.href = "/login";
          } else if (result.kind === "not_found") {
            setDetail(null);
            setDetailError("not_found");
          } else {
            transientFailures += 1;
            if (transientFailures >= SOCIAL_PLANNER_TRANSIENT_POLL_NOTICE_AFTER) {
              setPollNotice("Still checking your calendar…");
            }
          }
          return;
        }

        if (historyHasInFlight) {
          historyTicks += 1;
          if (historyTicks % SOCIAL_PLANNER_HISTORY_POLL_TICKS === 0) {
            const history = await fetchSocialCalendarHistory();
            if (!cancelled && history.kind === "ok") {
              setCalendars(history.value);
            }
          }
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
  }, [selectedId, detailStatus, detailError, historyHasInFlight]);

  function selectCalendar(id: string | null, nextDetail: SocialCalendarDetailDto | null = null) {
    setSelectedId(id);
    setDetail(nextDetail);
    setDetailError(null);
    setPollNotice(null);
    setCreateError(null);
    setThinkDifferentlyError(null);
    setApplyError(null);
    writeWorkspaceUrl(id);
  }

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
      const nextDetail = queuedDetailFromCreate(
        created,
        body.userGuidance.trim() || null,
      );
      setCalendars((current) => {
        const without = current.filter((item) => item.id !== created.id);
        return [listItemFromCreate(created), ...without];
      });
      selectCalendar(created.id, nextDetail);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleOpen(id: string) {
    if (!SOCIAL_PLANNER_CALENDAR_ID_RE.test(id) || openingRef.current) return;
    openingRef.current = true;
    setCreateError(null);
    setThinkDifferentlyError(null);
    setApplyError(null);
    setPollNotice(null);
    setSelectedId(id);
    setDetail(null);
    setDetailError(null);
    writeWorkspaceUrl(id);

    try {
      const result = await fetchSocialCalendarDetail(id);
      if (result.kind === "auth") {
        window.location.href = "/login";
        return;
      }
      if (result.kind === "ok") {
        setDetail(result.value);
        setDetailError(null);
        return;
      }
      if (result.kind === "not_found") {
        setDetail(null);
        setDetailError("not_found");
        return;
      }
      setDetail(null);
      setDetailError("load_failed");
    } finally {
      openingRef.current = false;
    }
  }

  function handleCreateAnotherWeek() {
    selectCalendar(null, null);
    window.setTimeout(() => {
      composerRef.current?.focusComposer();
    }, 0);
  }

  async function handleThinkDifferently() {
    if (!detail || thinkDifferentlyRef.current) return;
    thinkDifferentlyRef.current = true;
    setThinkDifferentlyPending(true);
    setThinkDifferentlyError(null);
    setCreateError(null);

    try {
      const result = await thinkDifferentlySocialCalendarRequest(detail.id);
      if (result.kind === "auth") {
        window.location.href = "/login";
        return;
      }
      if (result.kind === "validation" || result.kind === "error") {
        setThinkDifferentlyError(result.message);
        return;
      }
      if (result.kind !== "ok") {
        setThinkDifferentlyError("Something went wrong. Please try again.");
        return;
      }

      const created = result.value;
      const nextDetail = queuedDetailFromCreate(created, detail.userGuidance, {
        sourceCalendarId: detail.id,
        rootCalendarId: detail.rootCalendarId ?? detail.id,
      });
      setCalendars((current) => {
        const without = current.filter((item) => item.id !== created.id);
        return [listItemFromCreate(created), ...without];
      });
      selectCalendar(created.id, nextDetail);
    } finally {
      thinkDifferentlyRef.current = false;
      setThinkDifferentlyPending(false);
    }
  }

  async function handleApplySuggestions() {
    if (!detail || applyRef.current) return;
    applyRef.current = true;
    setApplyPending(true);
    setApplyError(null);
    setCreateError(null);
    setThinkDifferentlyError(null);

    try {
      const result = await applySocialPlannerConversationRequest(detail.id);
      if (result.kind === "auth") {
        window.location.href = "/login";
        return;
      }
      if (result.kind === "validation" || result.kind === "error") {
        setApplyError(result.message);
        return;
      }
      if (result.kind !== "ok") {
        setApplyError("Something went wrong. Please try again.");
        return;
      }

      const created = result.value;
      const nextDetail = queuedDetailFromCreate(created, detail.userGuidance, {
        sourceCalendarId: detail.id,
        rootCalendarId: detail.rootCalendarId ?? detail.id,
      });
      setCalendars((current) => {
        const without = current.filter((item) => item.id !== created.id);
        return [listItemFromCreate(created), ...without];
      });
      selectCalendar(created.id, nextDetail);
    } finally {
      applyRef.current = false;
      setApplyPending(false);
    }
  }

  const showComposer = selectedId == null;

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

      {showComposer ? (
        <SocialPlannerCreateForm
          ref={composerRef}
          submitting={submitting}
          error={createError}
          onSubmit={(body) => void handleCreate(body)}
        />
      ) : null}

      {selectedId && detailError === "not_found" ? (
        <section className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-6 sm:p-8">
          <h2 className="text-2xl font-semibold">This calendar could not be found.</h2>
          <div className="mt-6">
            <button
              type="button"
              onClick={handleCreateAnotherWeek}
              className="w-full rounded-2xl bg-[var(--athena-orange)] px-5 py-3 text-sm font-semibold text-white sm:w-auto"
            >
              Create Another Week
            </button>
          </div>
        </section>
      ) : null}

      {selectedId && detailError === "load_failed" ? (
        <section className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-6 sm:p-8">
          <h2 className="text-2xl font-semibold">This calendar could not be displayed.</h2>
          <div className="mt-6">
            <button
              type="button"
              onClick={handleCreateAnotherWeek}
              className="w-full rounded-2xl bg-[var(--athena-orange)] px-5 py-3 text-sm font-semibold text-white sm:w-auto"
            >
              Create Another Week
            </button>
          </div>
        </section>
      ) : null}

      {detail ? (
        <SocialCalendarDetail
          calendar={detail}
          pollNotice={pollNotice}
          thinkDifferentlyPending={thinkDifferentlyPending}
          thinkDifferentlyError={thinkDifferentlyError}
          applyPending={applyPending}
          applyError={applyError}
          onCreateAnotherWeek={handleCreateAnotherWeek}
          onThinkDifferently={
            detail.status === "Ready" && detail.package && !detail.packageUnavailable
              ? () => void handleThinkDifferently()
              : undefined
          }
          onApplySuggestions={
            detail.status === "Ready" && detail.package && !detail.packageUnavailable
              ? () => void handleApplySuggestions()
              : undefined
          }
        />
      ) : null}

      <SocialPlannerHistory
        calendars={calendars}
        selectedId={selectedId}
        onOpen={(id) => void handleOpen(id)}
      />
    </div>
  );
}
