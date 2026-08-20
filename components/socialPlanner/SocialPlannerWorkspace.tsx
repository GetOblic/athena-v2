"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SocialCalendarListItemDto } from "@/services/socialPlanner/socialCalendarDto";
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
  loadError: string | null;
};

export function SocialPlannerWorkspace({
  initialCalendars,
  loadError,
}: SocialPlannerWorkspaceProps) {
  const router = useRouter();
  const [calendars, setCalendars] = useState(initialCalendars);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const historyHasInFlight = calendars.some((item) =>
    isSocialPlannerInFlight(item.status),
  );

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
          const history = await fetchSocialCalendarHistory();
          if (!cancelled && history.kind === "ok") {
            setCalendars(history.value);
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
  }, [historyHasInFlight]);

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

      <SocialPlannerHistory calendars={calendars} />
    </div>
  );
}
