"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDiscussionRegeneration } from "@/components/discussions/DiscussionRegenerationProvider";
import { unlockCompletionSound } from "@/lib/completionSound/playCompletionSound";
import {
  emptyRegenerationSnapshot,
  fetchRegenerationStatus,
} from "@/lib/discussionRegenerationStatus";
import { parseJsonResponse } from "@/lib/safeJsonResponse";

type ProspectRefreshIntelligenceButtonProps = {
  prospectId: string;
  discussionId?: string | null;
};

function ButtonSpinner() {
  return (
    <span
      className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
      aria-hidden="true"
    />
  );
}

type QueueKind = "generate_intelligence" | "think_differently";

/**
 * Page-header Generate Intelligence + Think Differently for Prospects.
 */
export function ProspectRefreshIntelligenceButton({
  prospectId,
  discussionId = null,
}: ProspectRefreshIntelligenceButtonProps) {
  const router = useRouter();
  const {
    isGenerating,
    activeGenerationKind,
    trackQueuedGeneration,
  } = useDiscussionRegeneration();
  const [queueingKind, setQueueingKind] = useState<QueueKind | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function queueAction(kind: QueueKind) {
    if (queueingKind || isGenerating) return;

    // Unlock audio during the initiating click, before any await.
    // Completion chime is owned by DiscussionRegenerationProvider.
    unlockCompletionSound();

    setQueueingKind(kind);
    setMessage(null);
    setError(null);

    const endpoint =
      kind === "think_differently"
        ? `/api/prospects/${prospectId}/think-differently`
        : `/api/prospects/${prospectId}/refresh`;

    try {
      const statusDiscussionId = discussionId;
      const baseline = statusDiscussionId
        ? ((await fetchRegenerationStatus(statusDiscussionId)) ??
          emptyRegenerationSnapshot())
        : emptyRegenerationSnapshot();

      const response = await fetch(endpoint, {
        method: "POST",
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        success?: boolean;
        accepted?: boolean;
        queued?: boolean;
        message?: string;
        error?: string | { message?: string };
      }>(response);
      const errorMessage =
        typeof payload.error === "string"
          ? payload.error
          : payload.error?.message;

      if (!response.ok || !payload.ok) {
        setError(
          errorMessage ||
            (kind === "think_differently"
              ? "Think Differently failed."
              : "Generate Intelligence failed."),
        );
        return;
      }

      trackQueuedGeneration(baseline, kind);
      setMessage(
        payload.message ||
          (kind === "think_differently"
            ? "Think Differently queued. Athena is regenerating Strategic Blueprint and Deployment Assets in the background."
            : "Prospect intelligence refresh queued. Athena is regenerating in the background."),
      );
      router.refresh();
    } catch (queueError) {
      setError(
        queueError instanceof Error
          ? queueError.message
          : kind === "think_differently"
            ? "Think Differently failed."
            : "Generate Intelligence failed.",
      );
    } finally {
      setQueueingKind(null);
    }
  }

  const busy = Boolean(queueingKind) || isGenerating;
  const generatingIntelligence =
    busy &&
    (queueingKind === "generate_intelligence" ||
      activeGenerationKind === "generate_intelligence" ||
      (isGenerating && activeGenerationKind !== "think_differently"));
  const thinkingDifferently =
    busy &&
    (queueingKind === "think_differently" ||
      activeGenerationKind === "think_differently");

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => void queueAction("generate_intelligence")}
          disabled={busy}
          className="inline-flex items-center justify-center rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {generatingIntelligence ? <ButtonSpinner /> : null}
          {generatingIntelligence
            ? "Generating Intelligence…"
            : "Generate Intelligence"}
        </button>
        <button
          type="button"
          onClick={() => void queueAction("think_differently")}
          disabled={busy}
          className="inline-flex items-center justify-center rounded-full border border-[var(--athena-success)]/30 bg-[var(--athena-success)]/15 px-6 py-3 text-sm font-semibold text-[var(--athena-success)] transition hover:border-[var(--athena-success)]/45 hover:bg-[var(--athena-success)]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--athena-success)]/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {thinkingDifferently ? (
            <span
              className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--athena-success)]/30 border-t-[var(--athena-success)]"
              aria-hidden="true"
            />
          ) : null}
          {thinkingDifferently ? "Thinking Differently…" : "Think Differently"}
        </button>
      </div>
      {message ? (
        <p className="text-sm text-white/60 whitespace-pre-wrap sm:text-right">
          {message}
        </p>
      ) : null}
      {error ? <div className="text-sm text-red-300">{error}</div> : null}
    </div>
  );
}
