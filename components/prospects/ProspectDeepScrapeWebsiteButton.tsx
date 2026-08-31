"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useBackgroundActionCompletionSound } from "@/lib/completionSound/useBackgroundActionCompletionSound";
import type { TenantFormattingLocale } from "@/lib/tenantI18n/format";
import {
  localizeDeepScrapeStage,
  type DeepScrapeProgressMessages,
} from "@/lib/tenantI18n/deepScrapeProgress";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { parseJsonResponse } from "@/lib/safeJsonResponse";

type DeepScrapeStatusPayload = {
  ok?: boolean;
  available?: boolean;
  isActive?: boolean;
  job?: {
    id: string;
    status: string;
    stage: string;
    label: string;
    pagesAnalyzed?: number;
    pagesCrawled?: number;
    pagesTarget?: number | null;
    pagesRendered?: number | null;
    phase?: string | null;
    completedAt?: string | null;
    errorMessage?: string | null;
  } | null;
  lastDeepScrapeAt?: string | null;
  lastDeepScrapePages?: number | null;
  error?: { message?: string };
};

type ProspectDeepScrapeMessages = DeepScrapeProgressMessages & {
  button: string;
  lastTitle: string;
  pagesAnalyzed: string;
  queueFailed: string;
  genericError: string;
};

const DEFAULT_MESSAGES: ProspectDeepScrapeMessages = {
  button: "Deep Scrape Website",
  lastTitle: "Last Deep Scrape",
  pagesAnalyzed: "Pages analyzed: {count}",
  queueFailed: "Failed to queue deep scrape.",
  queued: "Queued",
  failed: "Failed",
  completed: "Completed",
  awaitingFollowOn: "Generating Executive Intelligence",
  discovering: "Discovering Website",
  crawling: "Crawling candidate pages",
  crawlingWithCount: "Crawling {crawled} candidate pages",
  crawlingWithTarget: "Crawling {crawled} of {target} candidate pages",
  rendering: "Rendering JavaScript page {rendered}",
  renderingWithTarget: "Rendering JavaScript page {rendered} of {target}",
  synthesizing: "Synthesizing Website Intelligence",
  retraining: "Retraining Athena Brain",
  regenerating: "Generating Executive Intelligence",
  genericError: "Deep website scrape failed. Please try again later.",
};

const DATETIME_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

function ButtonSpinner() {
  return (
    <span
      className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
      aria-hidden="true"
    />
  );
}

export function ProspectDeepScrapeWebsiteButton(props: {
  prospectId: string;
  initiallyAvailable: boolean;
  messages?: ProspectDeepScrapeMessages;
  locale?: TenantFormattingLocale;
}) {
  const messages = props.messages ?? DEFAULT_MESSAGES;
  const locale = props.locale ?? "en-US";
  const router = useRouter();
  const completionSound = useBackgroundActionCompletionSound();
  const [available, setAvailable] = useState(props.initiallyAvailable);
  const [syncedInitiallyAvailable, setSyncedInitiallyAvailable] = useState(
    props.initiallyAvailable,
  );
  const [isActive, setIsActive] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queuing, setQueuing] = useState(false);
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [lastPages, setLastPages] = useState<number | null>(null);

  // After generation, router.refresh() delivers initiallyAvailable=true without remounting.
  // Promote only false → true during render so a stale prop cannot hide a visible button.
  if (props.initiallyAvailable !== syncedInitiallyAvailable) {
    setSyncedInitiallyAvailable(props.initiallyAvailable);
    if (props.initiallyAvailable) {
      setAvailable(true);
    }
  }

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/prospects/${props.prospectId}/deep-scrape/status`,
        { method: "GET", cache: "no-store" },
      );
      const payload = await parseJsonResponse<DeepScrapeStatusPayload>(response);
      if (!response.ok || !payload.ok) {
        return;
      }
      setAvailable(Boolean(payload.available));
      setIsActive(Boolean(payload.isActive));
      setLabel(
        payload.isActive
          ? localizeDeepScrapeStage(payload.job, messages)
          : null,
      );
      setLastAt(payload.lastDeepScrapeAt ?? null);
      setLastPages(
        typeof payload.lastDeepScrapePages === "number"
          ? payload.lastDeepScrapePages
          : null,
      );
      if (payload.job?.status) {
        completionSound.observe(payload.job.status);
      }
      if (payload.job?.status === "failed") {
        setError(payload.job.errorMessage?.trim() || messages.genericError);
      } else if (payload.job?.status === "completed") {
        setError(null);
        router.refresh();
      }
    } catch {
      // ignore transient poll errors
    }
  }, [completionSound, messages, props.prospectId, router]);

  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    const tick = () => {
      if (!cancelled) {
        void refreshStatus();
      }
    };
    const initial = setTimeout(tick, 0);
    return () => {
      cancelled = true;
      clearTimeout(initial);
    };
  }, [available, refreshStatus]);

  useEffect(() => {
    if (!available || !isActive) return;
    const timer = setInterval(() => {
      void refreshStatus();
    }, 5_000);
    return () => clearInterval(timer);
  }, [available, isActive, refreshStatus]);

  async function startDeepScrape() {
    if (queuing || isActive || !available) return;
    completionSound.unlock();
    setQueuing(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/prospects/${props.prospectId}/deep-scrape`,
        { method: "POST" },
      );
      const payload = await parseJsonResponse<{
        ok?: boolean;
        status?: string;
        stage?: string;
        label?: string;
        error?: { message?: string };
      }>(response);
      if (!response.ok || !payload.ok) {
        setError(payload.error?.message || messages.queueFailed);
        return;
      }
      setIsActive(true);
      setLabel(
        localizeDeepScrapeStage(
          { status: payload.status, stage: payload.stage },
          messages,
        ),
      );
      void refreshStatus();
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : messages.queueFailed,
      );
    } finally {
      setQueuing(false);
    }
  }

  if (!available) {
    return null;
  }

  const busy = queuing || isActive;

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <button
        type="button"
        onClick={() => void startDeepScrape()}
        disabled={busy}
        className="inline-flex items-center justify-center rounded-full border border-[var(--athena-orange)]/40 bg-black/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? <ButtonSpinner /> : null}
        {busy ? label || messages.button : messages.button}
      </button>
      {busy && label ? (
        <p className="text-sm text-white/60 sm:text-right">{label}</p>
      ) : null}
      {lastAt ? (
        <div className="text-sm text-white/45 sm:text-right">
          <div>
            {messages.lastTitle}:{" "}
            {new Intl.DateTimeFormat(locale, DATETIME_FORMAT).format(
              new Date(lastAt),
            )}
          </div>
          {typeof lastPages === "number" ? (
            <div>
              {interpolateTenantMessage(messages.pagesAnalyzed, {
                count: lastPages,
              })}
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? <div className="text-sm text-red-300">{error}</div> : null}
    </div>
  );
}
