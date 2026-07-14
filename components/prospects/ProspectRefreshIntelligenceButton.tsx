"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDiscussionRegeneration } from "@/components/discussions/DiscussionRegenerationProvider";
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

/**
 * Page-header Refresh Intelligence for Prospects.
 * Uses the existing /api/prospects/[id]/refresh route and regeneration provider.
 */
export function ProspectRefreshIntelligenceButton({
  prospectId,
  discussionId = null,
}: ProspectRefreshIntelligenceButtonProps) {
  const router = useRouter();
  const { isGenerating, trackQueuedGeneration } = useDiscussionRegeneration();
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshIntelligence() {
    if (refreshing || isGenerating) return;

    setRefreshing(true);
    setMessage(null);
    setError(null);

    try {
      const statusDiscussionId = discussionId;
      const baseline = statusDiscussionId
        ? ((await fetchRegenerationStatus(statusDiscussionId)) ??
          emptyRegenerationSnapshot())
        : emptyRegenerationSnapshot();

      const response = await fetch(`/api/prospects/${prospectId}/refresh`, {
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
        setError(errorMessage || "Refresh failed.");
        return;
      }

      trackQueuedGeneration(baseline);
      setMessage(
        payload.message ||
          "Prospect intelligence refresh queued. Athena is regenerating in the background.",
      );
      router.refresh();
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Refresh failed.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  const busy = refreshing || isGenerating;

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <button
        type="button"
        onClick={() => void refreshIntelligence()}
        disabled={busy}
        className="inline-flex items-center justify-center rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? <ButtonSpinner /> : null}
        {busy ? "Queuing…" : "Refresh Intelligence"}
      </button>
      {message ? (
        <p className="text-sm text-white/60 whitespace-pre-wrap sm:text-right">
          {message}
        </p>
      ) : null}
      {error ? <div className="text-sm text-red-300">{error}</div> : null}
    </div>
  );
}
