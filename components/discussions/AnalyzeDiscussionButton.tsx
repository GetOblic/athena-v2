"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

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

const QUEUED_REFRESH_MS = 10_000;
const QUEUED_BUTTON_LOCK_MS = 10_000;

export function AnalyzeDiscussionButton({
  discussionId,
  label = "Regenerate Intelligence",
  compact = false,
}: AnalyzeDiscussionButtonProps) {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const queuedTimersRef = useRef<number[]>([]);

  function clearQueuedTimers() {
    for (const timerId of queuedTimersRef.current) {
      window.clearTimeout(timerId);
    }
    queuedTimersRef.current = [];
  }

  async function handleAnalyze() {
    clearQueuedTimers();
    setIsAnalyzing(true);
    setError(null);
    setWarning(null);

    let keepAnalyzing = false;

    try {
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
        keepAnalyzing = true;
        setWarning(
          data.message ||
            "Regeneration started. Refresh in a few moments.",
        );

        queuedTimersRef.current.push(
          window.setTimeout(() => {
            router.refresh();
          }, QUEUED_REFRESH_MS),
        );

        queuedTimersRef.current.push(
          window.setTimeout(() => {
            setIsAnalyzing(false);
          }, QUEUED_BUTTON_LOCK_MS),
        );

        return;
      }

      router.refresh();

      if (data.partial) {
        setWarning(
          data.warning ||
            "Strategic Blueprint could not be regenerated, previous valid blueprint was preserved.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      if (!keepAnalyzing) {
        setIsAnalyzing(false);
      }
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

      {warning && (
        <div className="mt-3 text-sm text-amber-300/90">{warning}</div>
      )}

      {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
    </div>
  );
}
