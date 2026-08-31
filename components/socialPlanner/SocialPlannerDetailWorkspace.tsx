"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SocialCalendarDetailDto } from "@/services/socialPlanner/socialCalendarDto";
import { SocialCalendarDetail } from "@/components/socialPlanner/SocialCalendarDetail";
import {
  SOCIAL_PLANNER_DETAIL_POLL_MS,
  SOCIAL_PLANNER_TRANSIENT_POLL_NOTICE_AFTER,
  applySocialPlannerConversationRequest,
  fetchSocialCalendarDetail,
  isSocialPlannerInFlight,
  thinkDifferentlySocialCalendarRequest,
} from "@/components/socialPlanner/socialPlannerClient";
import type { TenantFormattingLocale } from "@/lib/tenantI18n/format";
import { en } from "@/lib/tenantI18n/messages/en";
import { getSocialPlannerErrorChrome } from "@/lib/tenantI18n/socialPlannerPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

type SocialPlannerDetailWorkspaceProps = {
  initialDetail: SocialCalendarDetailDto | null;
  initialDetailError: "not_found" | "load_failed" | null;
  messages?: TenantMessages;
  language?: OrganizationLanguage;
  locale?: TenantFormattingLocale;
};

export function SocialPlannerDetailWorkspace({
  initialDetail,
  initialDetailError,
  messages,
  language = "en",
  locale = "en-US",
}: SocialPlannerDetailWorkspaceProps) {
  const dictionary = messages ?? en;
  const copy = dictionary.socialPlanner;
  const errorChrome = useMemo(
    () => getSocialPlannerErrorChrome(dictionary),
    [dictionary],
  );
  const router = useRouter();
  const [detail, setDetail] = useState(initialDetail);
  const [detailError, setDetailError] = useState<
    "not_found" | "load_failed" | null
  >(initialDetailError);
  const [thinkDifferentlyPending, setThinkDifferentlyPending] = useState(false);
  const [thinkDifferentlyError, setThinkDifferentlyError] = useState<string | null>(
    null,
  );
  const [applyPending, setApplyPending] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [pollNotice, setPollNotice] = useState<string | null>(null);
  const thinkDifferentlyRef = useRef(false);
  const applyRef = useRef(false);

  const calendarId = detail?.id ?? initialDetail?.id ?? null;
  const detailStatus = detail?.status ?? null;

  useEffect(() => {
    const shouldPollDetail =
      Boolean(calendarId) &&
      detailError == null &&
      isSocialPlannerInFlight(detailStatus);

    if (!shouldPollDetail || !calendarId) {
      return;
    }

    let cancelled = false;
    let requestInFlight = false;
    let transientFailures = 0;

    const tick = async () => {
      if (cancelled || requestInFlight) return;
      requestInFlight = true;
      try {
        const result = await fetchSocialCalendarDetail(calendarId, errorChrome);
        if (cancelled) return;
        if (result.kind === "ok") {
          transientFailures = 0;
          setPollNotice(null);
          setDetail(result.value);
          setDetailError(null);
        } else if (result.kind === "auth") {
          window.location.href = "/login";
        } else if (result.kind === "not_found") {
          setDetail(null);
          setDetailError("not_found");
        } else {
          transientFailures += 1;
          if (transientFailures >= SOCIAL_PLANNER_TRANSIENT_POLL_NOTICE_AFTER) {
            setPollNotice(copy.stillChecking);
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
  }, [calendarId, detailStatus, detailError, errorChrome, copy.stillChecking]);

  function handleCreateAnotherWeek() {
    router.push("/social-planner");
  }

  async function handleThinkDifferently() {
    if (!detail || thinkDifferentlyRef.current) return;
    thinkDifferentlyRef.current = true;
    setThinkDifferentlyPending(true);
    setThinkDifferentlyError(null);

    try {
      const result = await thinkDifferentlySocialCalendarRequest(
        detail.id,
        errorChrome,
      );
      if (result.kind === "auth") {
        window.location.href = "/login";
        return;
      }
      if (result.kind === "validation" || result.kind === "error") {
        setThinkDifferentlyError(result.message);
        return;
      }
      if (result.kind !== "ok") {
        setThinkDifferentlyError(copy.somethingWentWrong);
        return;
      }

      const created = result.value;
      router.push(`/social-planner/${created.id}`);
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
    setThinkDifferentlyError(null);

    try {
      const result = await applySocialPlannerConversationRequest(
        detail.id,
        errorChrome,
      );
      if (result.kind === "auth") {
        window.location.href = "/login";
        return;
      }
      if (result.kind === "validation" || result.kind === "error") {
        setApplyError(result.message);
        return;
      }
      if (result.kind !== "ok") {
        setApplyError(copy.somethingWentWrong);
        return;
      }

      const created = result.value;
      router.push(`/social-planner/${created.id}`);
    } finally {
      applyRef.current = false;
      setApplyPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-10">
      {detailError === "not_found" ? (
        <section className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-6 sm:p-8">
          <h2 className="text-2xl font-semibold">{copy.notFound}</h2>
          <div className="mt-6">
            <button
              type="button"
              onClick={handleCreateAnotherWeek}
              className="w-full rounded-2xl bg-[var(--athena-orange)] px-5 py-3 text-sm font-semibold text-white sm:w-auto"
            >
              {copy.createAnotherWeek}
            </button>
          </div>
        </section>
      ) : null}

      {detailError === "load_failed" ? (
        <section className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-6 sm:p-8">
          <h2 className="text-2xl font-semibold">{copy.couldNotDisplay}</h2>
          <div className="mt-6">
            <button
              type="button"
              onClick={handleCreateAnotherWeek}
              className="w-full rounded-2xl bg-[var(--athena-orange)] px-5 py-3 text-sm font-semibold text-white sm:w-auto"
            >
              {copy.createAnotherWeek}
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
          messages={dictionary}
          language={language}
          locale={locale}
        />
      ) : null}
    </div>
  );
}
