"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type AnalyzeDiscussionButtonProps = {
  discussionId: string;
  label?: string;
  compact?: boolean;
};

type AnalyzeResponse = {
  success?: boolean;
  queued?: boolean;
  regenerated?: boolean;
  partial?: boolean;
  warning?: string;
  message?: string;
  error?: string;
};

type RegenerationStatusResponse = {
  success?: boolean;
  latestAnalysisId?: string | null;
  latestAnalysisCreatedAt?: string | null;
  blueprintUpdatedAt?: string | null;
};

type StatusSnapshot = {
  latestAnalysisId: string | null;
  latestAnalysisCreatedAt: string | null;
  blueprintUpdatedAt: string | null;
};

const REGENERATION_STARTED_MESSAGE =
  "Regeneration started. Athena is rebuilding this discussion in the background. This usually takes 60–120 seconds. You may safely leave or refresh this page.";

const REGENERATION_SUCCESS_MESSAGE = "Intelligence regenerated successfully.";
const REGENERATION_TIMEOUT_MESSAGE =
  "Athena is still working. Refresh this page in a minute.";

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 150_000;

async function fetchRegenerationStatus(
  discussionId: string,
): Promise<StatusSnapshot | null> {
  try {
    const response = await fetch(`/api/discussions/${discussionId}/status`, {
      cache: "no-store",
    });
    const data = (await response.json()) as RegenerationStatusResponse;

    if (!response.ok || !data.success) {
      return null;
    }

    return {
      latestAnalysisId: data.latestAnalysisId ?? null,
      latestAnalysisCreatedAt: data.latestAnalysisCreatedAt ?? null,
      blueprintUpdatedAt: data.blueprintUpdatedAt ?? null,
    };
  } catch {
    return null;
  }
}

function isRegenerationComplete(
  baseline: StatusSnapshot,
  current: StatusSnapshot,
  queuedAtMs: number,
): boolean {
  const queueFloorMs = queuedAtMs - 15_000;

  if (
    current.latestAnalysisId &&
    current.latestAnalysisId !== baseline.latestAnalysisId
  ) {
    const createdMs = Date.parse(current.latestAnalysisCreatedAt ?? "");
    if (!Number.isNaN(createdMs) && createdMs >= queueFloorMs) {
      return true;
    }
  }

  if (
    current.blueprintUpdatedAt &&
    current.blueprintUpdatedAt !== baseline.blueprintUpdatedAt
  ) {
    const updatedMs = Date.parse(current.blueprintUpdatedAt);
    const baselineMs = Date.parse(baseline.blueprintUpdatedAt ?? "");
    if (
      !Number.isNaN(updatedMs) &&
      updatedMs >= queueFloorMs &&
      updatedMs > (Number.isNaN(baselineMs) ? 0 : baselineMs)
    ) {
      return true;
    }
  }

  return false;
}

export function AnalyzeDiscussionButton({
  discussionId,
  label = "Regenerate Intelligence",
  compact = false,
}: AnalyzeDiscussionButtonProps) {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const pollCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      pollCleanupRef.current?.();
    };
  }, []);

  function stopPolling() {
    pollCleanupRef.current?.();
    pollCleanupRef.current = null;
  }

  function startPolling(baseline: StatusSnapshot, queuedAtMs: number) {
    stopPolling();

    const startedAt = Date.now();
    let pollTimerId: number | null = null;
    let cancelled = false;

    const scheduleNextPoll = () => {
      pollTimerId = window.setTimeout(() => {
        void pollOnce();
      }, POLL_INTERVAL_MS);
    };

    const finish = () => {
      cancelled = true;
      if (pollTimerId !== null) {
        window.clearTimeout(pollTimerId);
      }
    };

    const pollOnce = async () => {
      if (cancelled) {
        return;
      }

      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        finish();
        setInfoMessage(REGENERATION_TIMEOUT_MESSAGE);
        setIsAnalyzing(false);
        return;
      }

      const current = await fetchRegenerationStatus(discussionId);

      if (cancelled) {
        return;
      }

      if (current && isRegenerationComplete(baseline, current, queuedAtMs)) {
        finish();
        setInfoMessage(null);
        setSuccessMessage(REGENERATION_SUCCESS_MESSAGE);
        setIsAnalyzing(false);
        router.refresh();
        return;
      }

      scheduleNextPoll();
    };

    scheduleNextPoll();
    pollCleanupRef.current = finish;
  }

  async function handleAnalyze() {
    stopPolling();
    setIsAnalyzing(true);
    setError(null);
    setInfoMessage(null);
    setSuccessMessage(null);

    try {
      const baseline =
        (await fetchRegenerationStatus(discussionId)) ?? {
          latestAnalysisId: null,
          latestAnalysisCreatedAt: null,
          blueprintUpdatedAt: null,
        };

      const response = await fetch(`/api/discussions/${discussionId}/analyze`, {
        method: "POST",
      });

      const text = await response.text();
      let data: AnalyzeResponse;

      try {
        data = JSON.parse(text) as AnalyzeResponse;
      } catch {
        console.error(
          "Regenerate intelligence non-JSON response:",
          text.slice(0, 300),
        );
        throw new Error(
          "Regeneration failed because the server returned an unexpected response.",
        );
      }

      if (!data.success) {
        throw new Error(
          data.error || "Regeneration failed. Please check logs.",
        );
      }

      if (data.queued) {
        const queuedAtMs = Date.now();
        setInfoMessage(data.message || REGENERATION_STARTED_MESSAGE);
        startPolling(baseline, queuedAtMs);
        return;
      }

      router.refresh();

      if (data.partial) {
        setInfoMessage(
          data.warning ||
            "Strategic Blueprint could not be regenerated, previous valid blueprint was preserved.",
        );
      } else {
        setSuccessMessage(REGENERATION_SUCCESS_MESSAGE);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsAnalyzing((current) => (pollCleanupRef.current ? current : false));
    }
  }

  return (
    <div>
      {!compact && (
        <p className="mb-4 text-sm leading-6 text-white/40">
          Regenerates analysis, opportunity detection, executive briefing,
          deployment assets, and strategic asset blueprint for this discussion.
        </p>
      )}

      <button
        type="button"
        onClick={handleAnalyze}
        disabled={isAnalyzing}
        className={
          compact
            ? "rounded-full border border-[var(--athena-orange)]/40 bg-[var(--athena-orange)]/10 px-5 py-3 text-sm font-semibold text-[var(--athena-orange)] transition hover:bg-[var(--athena-orange)]/20 disabled:cursor-not-allowed disabled:opacity-50"
            : "w-full rounded-full bg-[var(--athena-orange)] px-6 py-4 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {isAnalyzing ? "Regenerating Intelligence..." : label}
      </button>

      {infoMessage && (
        <div className="mt-3 text-sm leading-6 text-amber-300/90">{infoMessage}</div>
      )}

      {successMessage && (
        <div className="mt-3 text-sm leading-6 text-emerald-300/90">
          {successMessage}
        </div>
      )}

      {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
    </div>
  );
}
