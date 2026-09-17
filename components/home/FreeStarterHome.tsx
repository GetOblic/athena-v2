"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { writeClipboardText } from "@/lib/clipboard";
import {
  presentFreeStarterHome,
  type FreeStarterHomeView,
} from "@/lib/home/freeStarterHome";
import {
  fetchSocialCalendarDetail,
  SOCIAL_PLANNER_DETAIL_POLL_MS,
  shouldStopSocialPlannerPolling,
} from "@/components/socialPlanner/socialPlannerClient";
import {
  getLocalizedSocialPlannerAssetTypeLabel,
  getLocalizedSocialPlannerPlatformLabel,
  getLocalizedSocialPlannerStatusLabel,
} from "@/lib/tenantI18n/socialPlannerPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";

const focusRingClassName =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";

type FreeStarterHomeProps = {
  initialView: FreeStarterHomeView;
  messages: TenantMessages;
  variant?: "page" | "section";
};

type CreateResponse = {
  ok?: boolean;
  success?: boolean;
  calendar?: { id?: string; status?: string };
  error?: { code?: string; message?: string };
};

export function FreeStarterHome({
  initialView,
  messages,
  variant = "page",
}: FreeStarterHomeProps) {
  const copy = messages.dashboard.freeStarter;
  const [view, setView] = useState(initialView);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (view.kind !== "creating" || !view.calendarId) {
      return;
    }

    let cancelled = false;
    let inFlight = false;

    async function tick() {
      if (inFlight || !view.calendarId) return;
      inFlight = true;
      try {
        const result = await fetchSocialCalendarDetail(view.calendarId);
        if (cancelled || result.kind !== "ok") return;
        setView(
          presentFreeStarterHome({
            starterStatus: view.starterStatus,
            calendarId: result.value.id,
            calendarStatus: result.value.status,
            socialPackage: result.value.package,
          }),
        );
      } finally {
        inFlight = false;
      }
    }

    void tick();
    const timer = window.setInterval(() => {
      if (shouldStopSocialPlannerPolling(view.calendarStatus)) {
        return;
      }
      void tick();
    }, SOCIAL_PLANNER_DETAIL_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [view.kind, view.calendarId, view.calendarStatus, view.starterStatus]);

  async function createStarter() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/social-planner/free-starter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = (await response.json()) as CreateResponse;
      if (response.status === 202 && payload.calendar?.id) {
        setView(
          presentFreeStarterHome({
            starterStatus: "reserved",
            calendarId: payload.calendar.id,
            calendarStatus:
              payload.calendar.status === "Queued" ||
              payload.calendar.status === "Processing" ||
              payload.calendar.status === "Ready" ||
              payload.calendar.status === "Processing Failed"
                ? payload.calendar.status
                : "Queued",
          }),
        );
        return;
      }
      setError(payload.error?.message?.trim() || copy.createFailed);
    } catch {
      setError(copy.createFailed);
    } finally {
      setPending(false);
    }
  }

  async function copyFirstAsset() {
    if (!view.firstAsset?.serializedCopy) return;
    try {
      await writeClipboardText(view.firstAsset.serializedCopy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const HeadingTag = variant === "section" ? "h2" : "h1";
  const headingClassName =
    variant === "section"
      ? "mt-1 text-2xl font-semibold tracking-tight"
      : "mt-4 text-5xl font-semibold tracking-tight";

  return (
    <div
      data-home-surface="free-starter"
      data-free-starter-kind={view.kind}
      data-free-starter-variant={variant}
    >
      {variant === "page" ? (
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          {copy.eyebrow}
        </div>
      ) : null}

      {view.kind === "available" ? (
        <>
          {variant === "page" ? (
            <>
              <HeadingTag className={headingClassName}>
                {copy.readyTitle}
              </HeadingTag>
              <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
                {copy.readyBody}
              </p>
              <p className="mt-3 max-w-3xl text-base leading-7 text-white/50">
                {copy.readyDetail}
              </p>
            </>
          ) : null}
          <div className={variant === "page" ? "mt-8" : "mt-0"}>
            <button
              type="button"
              data-free-starter-cta="create"
              disabled={pending}
              onClick={() => void createStarter()}
              className={`inline-flex rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 disabled:opacity-60 ${focusRingClassName}`}
            >
              {copy.createCta}
            </button>
          </div>
        </>
      ) : null}

      {view.kind === "creating" ? (
        <>
          <HeadingTag className={headingClassName}>
            {copy.creatingTitle}
          </HeadingTag>
          <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
            {view.calendarStatus
              ? getLocalizedSocialPlannerStatusLabel(
                  messages,
                  view.calendarStatus,
                )
              : copy.creatingBody}
          </p>
        </>
      ) : null}

      {view.kind === "ready" ? (
        <>
          {variant === "page" ? (
            <>
              <HeadingTag className={headingClassName}>
                {copy.resultTitle}
              </HeadingTag>
              <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
                {copy.resultBody}
              </p>
            </>
          ) : null}
          {view.firstAsset ? (
            <article
              data-free-starter-preview="first-asset"
              className={`${variant === "section" ? "mt-0" : "mt-8"} max-w-3xl rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-6`}
            >
              <div className="text-sm font-semibold text-white">
                {getLocalizedSocialPlannerAssetTypeLabel(
                  messages,
                  view.firstAsset.assetType,
                )}
              </div>
              {view.firstAsset.platforms.length > 0 ? (
                <p className="mt-2 text-sm text-white/50">
                  {view.firstAsset.platforms
                    .map((platform) =>
                      getLocalizedSocialPlannerPlatformLabel(platform),
                    )
                    .join(" · ")}
                </p>
              ) : null}
              <p className="mt-4 text-sm leading-6 text-white/70">
                {view.firstAsset.socialCopyPreview}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  data-free-starter-cta="copy"
                  onClick={() => void copyFirstAsset()}
                  className={`inline-flex rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white ${focusRingClassName}`}
                >
                  {copied ? messages.common.copied : messages.common.copy}
                </button>
                {view.weekHref ? (
                  <Link
                    href={view.weekHref}
                    data-free-starter-cta="view-week"
                    className={`inline-flex rounded-full bg-[var(--athena-orange)] px-5 py-2.5 text-sm font-semibold text-white ${focusRingClassName}`}
                  >
                    {copy.viewWeek}
                  </Link>
                ) : null}
              </div>
            </article>
          ) : view.weekHref ? (
            <div className="mt-8">
              <Link
                href={view.weekHref}
                data-free-starter-cta="view-week"
                className={`inline-flex rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white ${focusRingClassName}`}
              >
                {copy.viewWeek}
              </Link>
            </div>
          ) : null}
        </>
      ) : null}

      {view.kind === "failed" ? (
        <>
          <HeadingTag className={headingClassName}>
            {copy.failedTitle}
          </HeadingTag>
          <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
            {copy.failedBody}
          </p>
          <div className="mt-8">
            <button
              type="button"
              data-free-starter-cta="retry"
              disabled={pending}
              onClick={() => void createStarter()}
              className={`inline-flex rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 disabled:opacity-60 ${focusRingClassName}`}
            >
              {copy.tryAgain}
            </button>
          </div>
        </>
      ) : null}

      {error ? (
        <p className="mt-4 max-w-xl text-sm leading-6 text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}
