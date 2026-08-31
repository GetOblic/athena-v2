"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { unlockCompletionSound } from "@/lib/completionSound/playCompletionSound";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import {
  emptyRegenerationSnapshot,
  fetchRegenerationStatus,
} from "@/lib/discussionRegenerationStatus";

type PersonaAppendChrome = {
  title: string;
  help: string;
  currentNotes: string;
  field: string;
  placeholder: string;
  cta: string;
  appending: string;
  failed: string;
  unexpected: string;
  success: string;
  partialSuccess: string;
};

type PersonaAppendInteractionProps = {
  personaId: string;
  discussionId: string | null;
  initialNotes: string | null;
  /** Optional regeneration tracking when bridge Discussion exists. */
  onQueued?: (baseline: {
    latestAnalysisUpdatedAt: string | null;
    blueprintUpdatedAt: string | null;
  }) => void;
  isGenerating?: boolean;
  chrome?: PersonaAppendChrome | null;
};

type AppendResponse = {
  ok?: boolean;
  success?: boolean;
  accepted?: boolean;
  partialSuccess?: boolean;
  notes?: string;
  message?: string;
  regenerationError?: string;
  error?: string | { code?: string; message?: string };
};

function errorMessageFromPayload(
  payload: AppendResponse,
  fallback: string,
): string {
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
  return fallback;
}

export function PersonaAppendInteraction({
  personaId,
  discussionId,
  initialNotes,
  onQueued,
  isGenerating = false,
  chrome = null,
}: PersonaAppendInteractionProps) {
  const router = useRouter();
  const [interaction, setInteraction] = useState("");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
    persistenceOk?: boolean;
  } | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || isGenerating || !interaction.trim()) return;

    unlockCompletionSound();
    setIsSubmitting(true);
    setResult(null);

    try {
      const baseline = discussionId
        ? ((await fetchRegenerationStatus(discussionId)) ??
          emptyRegenerationSnapshot())
        : emptyRegenerationSnapshot();

      const response = await fetch(`/api/personas/${personaId}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interaction }),
      });

      const payload = await parseJsonResponse<AppendResponse>(response, {
        unexpectedMessage:
          chrome?.unexpected ??
          "Athena received an unexpected server response while appending this interaction.",
      });

      if (!response.ok || !payload.ok) {
        setResult({
          ok: false,
          message: errorMessageFromPayload(
            payload,
            chrome?.failed ?? "Failed to append interaction.",
          ),
          persistenceOk: false,
        });
        return;
      }

      if (typeof payload.notes === "string") {
        setNotes(payload.notes);
      }
      setInteraction("");

      if (payload.partialSuccess) {
        setResult({
          ok: false,
          persistenceOk: true,
          message:
            payload.message ||
            (chrome?.partialSuccess ??
              "Interaction appended, but regeneration could not be queued. Use Generate Intelligence to recover."),
        });
        router.refresh();
        return;
      }

      if (discussionId && onQueued) {
        onQueued(baseline);
      }
      setResult({
        ok: true,
        persistenceOk: true,
        message:
          payload.message ||
          (chrome?.success ??
            "Interaction appended. Intelligence regeneration queued."),
      });
      router.refresh();
    } catch (error) {
      setResult({
        ok: false,
        persistenceOk: false,
        message:
          error instanceof Error
            ? error.message
            : (chrome?.failed ?? "Failed to append interaction."),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AthenaCollapsibleSection
      title={chrome?.title ?? "Append Interaction"}
      defaultOpen={Boolean(result)}
    >
      <form onSubmit={handleSubmit}>
        <p className="text-sm leading-6 text-white/45">
          {chrome?.help ??
            "Capture a real-world interaction — conversation, interview, feedback, objection, or observed behavior. Athena appends it to Notes without overwriting prior notes, then regenerates a new Current Executive Version."}
        </p>

        {notes.trim() ? (
          <div className="mt-6">
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
              {chrome?.currentNotes ?? "Current Notes"}
            </div>
            <div className="mt-2 whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/70">
              {notes}
            </div>
          </div>
        ) : null}

        <label className="mt-6 grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
            {chrome?.field ?? "Interaction"}
          </span>
          <textarea
            value={interaction}
            onChange={(event) => setInteraction(event.target.value)}
            required
            rows={6}
            disabled={isSubmitting || isGenerating}
            className="min-h-[140px] rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none ring-[var(--athena-orange)]/40 placeholder:text-white/25 focus:ring-2 disabled:opacity-50"
            placeholder={
              chrome?.placeholder ??
              "Describe the interaction, observation, or feedback…"
            }
          />
        </label>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={isSubmitting || isGenerating || !interaction.trim()}
            className="inline-flex items-center justify-center rounded-full border border-[var(--athena-orange)]/40 bg-black/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting
              ? (chrome?.appending ?? "Appending…")
              : (chrome?.cta ?? "Append Interaction and Regenerate")}
          </button>
          {result ? (
            <p
              className={[
                "text-sm",
                result.ok
                  ? "text-emerald-300"
                  : result.persistenceOk
                    ? "text-amber-300"
                    : "text-red-300",
              ].join(" ")}
            >
              {result.message}
            </p>
          ) : null}
        </div>
      </form>
    </AthenaCollapsibleSection>
  );
}
