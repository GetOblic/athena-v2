"use client";

import { useState } from "react";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { useDiscussionRegeneration } from "@/components/discussions/DiscussionRegenerationProvider";
import { unlockCompletionSound } from "@/lib/completionSound/playCompletionSound";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import {
  emptyRegenerationSnapshot,
  fetchRegenerationStatus,
} from "@/lib/discussionRegenerationStatus";

type AppendProspectInformationFormProps = {
  prospectId: string;
  discussionId: string;
};

type AppendResponse = {
  ok?: boolean;
  success?: boolean;
  accepted?: boolean;
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
  return "Failed to append information.";
}

export function AppendProspectInformationForm({
  prospectId,
  discussionId,
}: AppendProspectInformationFormProps) {
  const { trackQueuedGeneration, isGenerating } = useDiscussionRegeneration();
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || isGenerating || !body.trim()) return;

    unlockCompletionSound();
    setIsSubmitting(true);
    setResult(null);

    try {
      const baseline =
        (await fetchRegenerationStatus(discussionId)) ??
        emptyRegenerationSnapshot();

      const response = await fetch(`/api/prospects/${prospectId}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });

      const payload = await parseJsonResponse<AppendResponse>(response, {
        unexpectedMessage:
          "Athena received an unexpected server response while queuing this update.",
      });

      if (!response.ok || !payload.ok) {
        setResult({ ok: false, message: errorMessageFromPayload(payload) });
        return;
      }

      trackQueuedGeneration(baseline);
      setBody("");
      setResult({
        ok: true,
        message:
          payload.message ||
          "Information appended. Intelligence regeneration queued.",
      });
    } catch (error) {
      setResult({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to append information.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AthenaCollapsibleSection
      title="Append Information"
      defaultOpen={Boolean(result)}
    >
    <form onSubmit={handleSubmit}>
      <p className="text-sm leading-6 text-white/45">
        Add new notes or context without replacing imported fields. Athena
        preserves history and regenerates a new Current Executive Version in the
        background.
      </p>

      <label className="mt-6 grid gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
          Additional Information
        </span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          required
          rows={8}
          placeholder="Paste new context or intelligence about this prospect."
          className="resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-sm leading-6 text-white outline-none placeholder:text-white/25"
        />
      </label>

      <div className="mt-5 flex flex-wrap items-start gap-4">
        <button
          type="submit"
          disabled={isSubmitting || isGenerating || !body.trim()}
          className="rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white disabled:opacity-40"
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
    </form>
    </AthenaCollapsibleSection>
  );
}
