"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lightbulb, RefreshCw, Sparkles } from "lucide-react";
import { useDiscussionRegeneration } from "@/components/discussions/DiscussionRegenerationProvider";
import { unlockCompletionSound } from "@/lib/completionSound/playCompletionSound";
import {
  emptyRegenerationSnapshot,
  fetchRegenerationStatus,
} from "@/lib/discussionRegenerationStatus";
import {
  PROSPECT_PRIMARY_ACTION,
  PROSPECT_SECONDARY_GREEN_ACTION,
  PROSPECT_UTILITY_ACTION,
} from "@/lib/prospects/prospectDetailPresentation";
import { parseJsonResponse } from "@/lib/safeJsonResponse";

type ProspectRefreshChrome = {
  generateIntelligence: string;
  generatingIntelligence: string;
  thinkDifferently: string;
  thinkingDifferently: string;
  generateFailed: string;
  thinkFailed: string;
  refreshQueued: string;
  thinkQueued: string;
  refreshIntelligence?: string;
  refreshingIntelligence?: string;
  tryAgain?: string;
};

type ProspectRefreshIntelligenceButtonProps = {
  prospectId: string;
  discussionId?: string | null;
  chrome?: ProspectRefreshChrome | null;
  hasCurrentVersion?: boolean;
  intelligenceStatus?: string | null;
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
  chrome = null,
  hasCurrentVersion = false,
  intelligenceStatus = null,
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
              ? (chrome?.thinkFailed ?? "Think Differently failed.")
              : (chrome?.generateFailed ?? "Generate Intelligence failed.")),
        );
        return;
      }

      trackQueuedGeneration(baseline, kind);
      setMessage(
        payload.message ||
          (kind === "think_differently"
            ? (chrome?.thinkQueued ??
              "Think Differently queued. Athena is regenerating Strategic Blueprint and Deployment Assets in the background.")
            : (chrome?.refreshQueued ??
              "Prospect intelligence refresh queued. Athena is regenerating in the background.")),
      );
      router.refresh();
    } catch (queueError) {
      setError(
        queueError instanceof Error
          ? queueError.message
          : kind === "think_differently"
            ? (chrome?.thinkFailed ?? "Think Differently failed.")
            : (chrome?.generateFailed ?? "Generate Intelligence failed."),
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

  const failed = String(intelligenceStatus ?? "").trim() === "Processing Failed";
  const ready = String(intelligenceStatus ?? "").trim() === "Ready";
  const primaryLabel = generatingIntelligence
    ? ready
      ? (chrome?.refreshingIntelligence ??
        chrome?.generatingIntelligence ??
        "Refreshing…")
      : (chrome?.generatingIntelligence ?? "Generating…")
    : failed
      ? (chrome?.tryAgain ?? "Try generating again")
      : ready || hasCurrentVersion
        ? (chrome?.refreshIntelligence ?? "Refresh intelligence")
        : (chrome?.generateIntelligence ?? "Generate prospect intelligence");

  return (
    <div className="flex flex-col items-stretch gap-2">
      <div className="flex flex-wrap items-center gap-3">
        {hasCurrentVersion ? (
          <button
            type="button"
            data-prospect-header-action="think-differently"
            onClick={() => {
              unlockCompletionSound();
              void queueAction("think_differently");
            }}
            disabled={busy}
            className={PROSPECT_SECONDARY_GREEN_ACTION}
          >
            {thinkingDifferently ? (
              <span
                className="inline-block size-3.5 animate-spin rounded-full border-2 border-[var(--athena-success)]/30 border-t-[var(--athena-success)]"
                aria-hidden="true"
              />
            ) : (
              <Lightbulb className="size-4" />
            )}
            {thinkingDifferently
              ? (chrome?.thinkingDifferently ?? "Trying another approach…")
              : (chrome?.thinkDifferently ?? "Try another approach")}
          </button>
        ) : null}
        <button
          type="button"
          data-prospect-header-action={ready || hasCurrentVersion ? "refresh" : "generate"}
          onClick={() => void queueAction("generate_intelligence")}
          disabled={busy}
          className={
            ready || hasCurrentVersion
              ? PROSPECT_UTILITY_ACTION
              : PROSPECT_PRIMARY_ACTION
          }
        >
          {generatingIntelligence ? (
            <ButtonSpinner />
          ) : ready || hasCurrentVersion ? (
            <RefreshCw className="size-4" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {primaryLabel}
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
