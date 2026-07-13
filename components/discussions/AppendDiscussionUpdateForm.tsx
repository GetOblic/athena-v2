"use client";

import { useState } from "react";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { useDiscussionRegeneration } from "@/components/discussions/DiscussionRegenerationProvider";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import {
  emptyRegenerationSnapshot,
  fetchRegenerationStatus,
} from "@/lib/discussionRegenerationStatus";

type AppendDiscussionUpdateFormProps = {
  discussionId: string;
};

type AppendResponse = {
  ok?: boolean;
  success?: boolean;
  accepted?: boolean;
  discussionId?: string;
  discussionUpdateId?: string;
  jobId?: string;
  status?: string;
  message?: string;
  error?: string | { code?: string; message?: string };
};

function errorMessageFromPayload(payload: AppendResponse): string {
  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }
  if (
    payload.error &&
    typeof payload.error === "object" &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return "Failed to append update.";
}

export function AppendDiscussionUpdateForm({
  discussionId,
}: AppendDiscussionUpdateFormProps) {
  const { trackQueuedGeneration, isGenerating } = useDiscussionRegeneration();
  const [url, setUrl] = useState("");
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting || isGenerating || !body.trim()) {
      return;
    }

    setIsSubmitting(true);
    setResult(null);

    try {
      const baseline =
        (await fetchRegenerationStatus(discussionId)) ??
        emptyRegenerationSnapshot();

      const response = await fetch(`/api/discussions/${discussionId}/updates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: url.trim() || null,
          body,
        }),
      });

      const payload = await parseJsonResponse<AppendResponse>(response, {
        unexpectedMessage:
          "Athena received an unexpected server response while queuing this discussion update.",
      });

      if (!response.ok || (!payload.success && !payload.ok)) {
        throw new Error(errorMessageFromPayload(payload));
      }

      setResult({
        ok: true,
        message:
          payload.message ??
          "Update saved. Athena is regenerating intelligence in the background. You can leave this page safely.",
      });

      setUrl("");
      setBody("");

      trackQueuedGeneration({
        latestAnalysisUpdatedAt: baseline.latestAnalysisUpdatedAt,
        blueprintUpdatedAt: baseline.blueprintUpdatedAt,
      });
    } catch (error) {
      setResult({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to append discussion update.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AthenaCollapsibleSection
      title="Append Discussion Update"
      defaultOpen={Boolean(result)}
    >
    <form onSubmit={handleSubmit}>
      <p className="text-sm leading-6 text-white/45">
        Paste new replies, reactions or follow-up messages from the same
        discussion. Athena appends them to the existing thread and re-runs the
        workflow in the background.
      </p>

      <div className="mt-6 grid gap-5">
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
            Discussion Update
          </span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
            rows={8}
            placeholder="Paste the new thread activity here."
            className="resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-sm leading-6 text-white outline-none placeholder:text-white/25"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
            Source URL optional
          </span>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Only if this update comes from a different source"
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25"
          />
        </label>

        <div className="flex flex-wrap items-start gap-4">
          <button
            type="submit"
            disabled={isSubmitting || isGenerating || !body.trim()}
            className="rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting
              ? "Queuing..."
              : isGenerating
                ? "Processing..."
                : "Append & Reprocess"}
          </button>

          {result && (
            <div
              className={
                result.ok
                  ? "max-w-2xl text-sm leading-6 text-emerald-300"
                  : "text-sm text-red-300"
              }
            >
              {result.message}
            </div>
          )}
        </div>
      </div>
    </form>
    </AthenaCollapsibleSection>
  );
}
