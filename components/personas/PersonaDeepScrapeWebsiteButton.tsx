"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useBackgroundActionCompletionSound } from "@/lib/completionSound/useBackgroundActionCompletionSound";
import { parseJsonResponse } from "@/lib/safeJsonResponse";

type DeepScrapeStatusPayload = {
  ok?: boolean;
  available?: boolean;
  isActive?: boolean;
  researchState?: string;
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

export function PersonaDeepScrapeWebsiteButton(props: {
  personaId: string;
  initiallyAvailable: boolean;
}) {
  const router = useRouter();
  const completionSound = useBackgroundActionCompletionSound();
  const [available, setAvailable] = useState(props.initiallyAvailable);
  const [syncedInitiallyAvailable, setSyncedInitiallyAvailable] = useState(
    props.initiallyAvailable,
  );
  const [isActive, setIsActive] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [researchState, setResearchState] = useState("Not Researched");
  const [error, setError] = useState<string | null>(null);
  const [queuing, setQueuing] = useState(false);
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [lastPages, setLastPages] = useState<number | null>(null);

  if (props.initiallyAvailable !== syncedInitiallyAvailable) {
    setSyncedInitiallyAvailable(props.initiallyAvailable);
    if (props.initiallyAvailable) {
      setAvailable(true);
    }
  }

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/personas/${props.personaId}/deep-scrape/status`,
        { method: "GET", cache: "no-store" },
      );
      const payload = await parseJsonResponse<DeepScrapeStatusPayload>(response);
      if (!response.ok || !payload.ok) {
        return;
      }
      setAvailable(Boolean(payload.available));
      setIsActive(Boolean(payload.isActive));
      setLabel(payload.isActive ? payload.job?.label ?? "Queued" : null);
      setResearchState(payload.researchState ?? "Not Researched");
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
  }, [completionSound, props.personaId, router]);

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
        `/api/personas/${props.personaId}/deep-scrape`,
        { method: "POST" },
      );
      const payload = await parseJsonResponse<{
        ok?: boolean;
        label?: string;
        error?: { message?: string };
      }>(response);
      if (!response.ok || !payload.ok) {
        setError(
          payload.error?.message || "Failed to queue Reference Website research.",
        );
        return;
      }
      setIsActive(true);
      setLabel(payload.label ?? "Queued");
      setResearchState("Queued");
      void refreshStatus();
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Failed to queue Reference Website research.",
      );
    } finally {
      setQueuing(false);
    }
  }

  if (!available) {
    return (
      <div className="text-sm text-white/45 sm:text-right">
        Add a valid Reference Website to research external context.
      </div>
    );
  }

  const busy = queuing || isActive;

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <p className="max-w-sm text-sm leading-6 text-white/45 sm:text-right">
        Research the saved Reference Website and add relevant external context
        to this Persona’s next intelligence generation.
      </p>
      <button
        type="button"
        onClick={() => void startDeepScrape()}
        disabled={busy}
        className="inline-flex items-center justify-center rounded-full border border-[var(--athena-orange)]/40 bg-black/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? <ButtonSpinner /> : null}
        {busy
          ? label || "Deep Scrape Reference Website"
          : "Deep Scrape Reference Website"}
      </button>
      <p className="text-sm text-white/60 sm:text-right">{researchState}</p>
      {busy && label ? (
        <p className="text-sm text-white/45 sm:text-right">
          Regeneration will queue after research completes. Prior Current
          Version remains viewable until the new version publishes.
        </p>
      ) : null}
      {lastAt ? (
        <div className="text-sm text-white/45 sm:text-right">
          <div>Last research: {new Date(lastAt).toLocaleString()}</div>
          {typeof lastPages === "number" ? (
            <div>Pages analyzed: {lastPages}</div>
          ) : null}
        </div>
      ) : null}
      {error ? <div className="text-sm text-red-300">{error}</div> : null}
    </div>
  );
}
