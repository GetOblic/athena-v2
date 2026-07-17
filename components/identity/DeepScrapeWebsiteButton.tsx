"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useBackgroundActionCompletionSound } from "@/lib/completionSound/useBackgroundActionCompletionSound";
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
    completedAt?: string | null;
    errorMessage?: string | null;
  } | null;
  lastDeepScrapeAt?: string | null;
  lastDeepScrapePages?: number | null;
  error?: { message?: string };
};

function ButtonSpinner() {
  return (
    <span
      className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
      aria-hidden="true"
    />
  );
}

export function DeepScrapeWebsiteButton(props: {
  initiallyAvailable: boolean;
  initialLastDeepScrapeAt?: string | null;
  initialLastDeepScrapePages?: number | null;
}) {
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
      setLabel(payload.isActive ? payload.job?.label ?? "Queued" : null);
      setLastAt(payload.lastDeepScrapeAt ?? null);
      setLastPages(
        typeof payload.lastDeepScrapePages === "number"
          ? payload.lastDeepScrapePages
          : null,
      );
      if (payload.job?.status) {
        completionSound.observe(payload.job.status);
      }
      if (payload.job?.status === "failed" && payload.job.errorMessage) {
        setError(payload.job.errorMessage);
      } else if (payload.job?.status === "completed") {
        setError(null);
        router.refresh();
      }
    } catch {
      // ignore transient poll errors
    }
  }, [completionSound, router]);

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
    setQueuing(true);
    setError(null);
    try {
      const response = await fetch("/api/identity/deep-scrape", {
        method: "POST",
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        label?: string;
        error?: { message?: string };
      }>(response);
      if (!response.ok || !payload.ok) {
        setError(payload.error?.message || "Failed to queue deep scrape.");
        return;
      }
      setIsActive(true);
      setLabel(payload.label ?? "Queued");
      void refreshStatus();
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Failed to queue deep scrape.",
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
    <div className="mt-8 space-y-3">
      <button
        type="button"
        onClick={() => void startDeepScrape()}
        disabled={busy}
        className="inline-flex w-full items-center justify-center rounded-full border border-[var(--athena-orange)]/40 bg-black/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? <ButtonSpinner /> : null}
        {busy ? label || "Deep Scrape Website" : "Deep Scrape Website"}
      </button>
      {busy && label ? (
        <p className="text-sm text-white/55">{label}</p>
      ) : null}
      {lastAt ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/50">
          <div className="text-xs uppercase tracking-[0.25em] text-white/35">
            Last Deep Scrape
          </div>
          <div className="mt-2 text-white/70">
            {new Date(lastAt).toLocaleString()}
          </div>
          {typeof lastPages === "number" ? (
            <div className="mt-1 text-white/50">
              Pages analyzed: {lastPages}
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? <div className="text-sm text-red-300">{error}</div> : null}
    </div>
  );
}
