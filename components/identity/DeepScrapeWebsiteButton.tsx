"use client";

import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useBackgroundActionCompletionSound } from "@/lib/completionSound/useBackgroundActionCompletionSound";
import {
  localizeDeepScrapeStage,
  type DeepScrapeProgressMessages,
} from "@/lib/tenantI18n/deepScrapeProgress";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { TenantFormattingLocale } from "@/lib/tenantI18n/format";

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
    errorCode?: string | null;
    errorMessage?: string | null;
  } | null;
  lastDeepScrapeAt?: string | null;
  lastDeepScrapePages?: number | null;
  error?: { message?: string };
};

type DeepScrapeMessages = DeepScrapeProgressMessages & {
  button: string;
  lastTitle: string;
  pagesAnalyzed: string;
  queueFailed: string;
  genericError: string;
};

const DEFAULT_DEEP_SCRAPE_MESSAGES: DeepScrapeMessages = {
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
      className="inline-block size-4 animate-spin rounded-full border-2 border-[var(--athena-success)]/30 border-t-[var(--athena-success)]"
      aria-hidden="true"
    />
  );
}

const DEFAULT_BUTTON_CLASS =
  "inline-flex w-full items-center justify-center gap-2 rounded-full border border-[var(--athena-success)]/50 bg-[var(--athena-success)]/15 px-6 py-3.5 text-sm font-semibold text-[var(--athena-success)] shadow-[0_0_18px_rgba(0,208,132,0.1)] transition hover:border-[var(--athena-success)]/70 hover:bg-[var(--athena-success)]/25 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto";

const COMPACT_BUTTON_CLASS =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-[var(--athena-success)]/50 bg-[var(--athena-success)]/15 px-4 text-sm font-semibold text-[var(--athena-success)] shadow-[0_0_18px_rgba(0,208,132,0.1)] transition hover:border-[var(--athena-success)]/70 hover:bg-[var(--athena-success)]/25 disabled:cursor-not-allowed disabled:opacity-40";

export function DeepScrapeWebsiteButton(props: {
  initiallyAvailable: boolean;
  initialLastDeepScrapeAt?: string | null;
  initialLastDeepScrapePages?: number | null;
  messages?: DeepScrapeMessages;
  locale?: TenantFormattingLocale;
  variant?: "default" | "compact";
}) {
  const messages = props.messages ?? DEFAULT_DEEP_SCRAPE_MESSAGES;
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
  const [lastAt, setLastAt] = useState<string | null>(
    props.initialLastDeepScrapeAt ?? null,
  );
  const [lastPages, setLastPages] = useState<number | null>(
    props.initialLastDeepScrapePages ?? null,
  );

  // Soft refresh can flip initiallyAvailable without remounting. Promote only false → true.
  if (props.initiallyAvailable !== syncedInitiallyAvailable) {
    setSyncedInitiallyAvailable(props.initiallyAvailable);
    if (props.initiallyAvailable) {
      setAvailable(true);
    }
  }

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/identity/deep-scrape/status", {
        method: "GET",
        cache: "no-store",
      });
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
  }, [completionSound, messages, router]);

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
      const response = await fetch("/api/identity/deep-scrape", {
        method: "POST",
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        stage?: string;
        status?: string;
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
  const compact = props.variant === "compact";

  return (
    <div className={compact ? "flex min-w-0 flex-col gap-1" : "space-y-3"}>
      <button
        type="button"
        onClick={() => void startDeepScrape()}
        disabled={busy}
        className={compact ? COMPACT_BUTTON_CLASS : DEFAULT_BUTTON_CLASS}
      >
        {busy ? (
          <ButtonSpinner />
        ) : (
          <Globe className="size-4" aria-hidden="true" />
        )}
        {busy ? label || messages.button : messages.button}
      </button>
      {!compact && busy && label ? (
        <p className="text-sm text-white/55">{label}</p>
      ) : null}
      {!compact && lastAt ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/50">
          <div className="text-xs uppercase tracking-[0.25em] text-white/35">
            {messages.lastTitle}
          </div>
          <div className="mt-2 text-white/70">
            {new Intl.DateTimeFormat(locale, DATETIME_FORMAT).format(
              new Date(lastAt),
            )}
          </div>
          {typeof lastPages === "number" ? (
            <div className="mt-1 text-white/50">
              {interpolateTenantMessage(messages.pagesAnalyzed, {
                count: lastPages,
              })}
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <div className={compact ? "text-xs text-red-300" : "text-sm text-red-300"}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
