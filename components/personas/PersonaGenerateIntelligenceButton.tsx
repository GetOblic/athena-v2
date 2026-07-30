"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseJsonResponse } from "@/lib/safeJsonResponse";

type PersonaGenerateIntelligenceButtonProps = {
  personaId: string;
  initialStatus?: string | null;
  initialInFlight?: boolean;
  /** Think Differently only when a Current Executive Version exists. */
  hasCurrentExecutiveVersion?: boolean;
};

type PersonaStatusPayload = {
  ok?: boolean;
  status?: string;
  regenerationInFlight?: boolean;
  hasGeneratedAnalysis?: boolean;
  hasCurrentExecutiveVersion?: boolean;
  jobStatus?: string | null;
  error?: string | { message?: string };
  message?: string;
};

const POLL_MS = 5_000;

function ButtonSpinner() {
  return (
    <span
      className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
      aria-hidden="true"
    />
  );
}

type QueueKind = "generate_intelligence" | "think_differently";

export function PersonaGenerateIntelligenceButton({
  personaId,
  initialStatus = null,
  initialInFlight = false,
  hasCurrentExecutiveVersion = false,
}: PersonaGenerateIntelligenceButtonProps) {
  const router = useRouter();
  const [queueingKind, setQueueingKind] = useState<QueueKind | null>(null);
  const [inFlight, setInFlight] = useState(initialInFlight);
  const [statusLabel, setStatusLabel] = useState(initialStatus);
  const [canThinkDifferently, setCanThinkDifferently] = useState(
    hasCurrentExecutiveVersion,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
    }
    pollRef.current = null;
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/personas/${personaId}/status`, {
        cache: "no-store",
      });
      const payload = await parseJsonResponse<PersonaStatusPayload>(response);
      if (!response.ok || !payload.ok) return;

      setInFlight(Boolean(payload.regenerationInFlight));
      if (payload.status) setStatusLabel(payload.status);
      if (typeof payload.hasCurrentExecutiveVersion === "boolean") {
        setCanThinkDifferently(payload.hasCurrentExecutiveVersion);
      }

      if (!payload.regenerationInFlight) {
        stopPolling();
        router.refresh();
      }
    } catch {
      /* keep last known state */
    }
  }, [personaId, router, stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(() => {
      void refreshStatus();
    }, POLL_MS);
  }, [refreshStatus, stopPolling]);

  useEffect(() => {
    if (initialInFlight) {
      startPolling();
    }
    return stopPolling;
  }, [initialInFlight, startPolling, stopPolling]);

  useEffect(() => {
    setCanThinkDifferently(hasCurrentExecutiveVersion);
  }, [hasCurrentExecutiveVersion]);

  async function queueAction(kind: QueueKind) {
    if (queueingKind || inFlight) return;
    if (kind === "think_differently" && !canThinkDifferently) return;

    setQueueingKind(kind);
    setMessage(null);
    setError(null);

    const endpoint =
      kind === "think_differently"
        ? `/api/personas/${personaId}/think-differently`
        : `/api/personas/${personaId}/refresh`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
      });
      const payload = await parseJsonResponse<
        PersonaStatusPayload & {
          queued?: boolean;
          accepted?: boolean;
        }
      >(response);
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

      setInFlight(Boolean(payload.queued ?? payload.accepted ?? true));
      setMessage(
        payload.message ||
          (kind === "think_differently"
            ? "Think Differently queued. Athena is regenerating Strategic Blueprint and Deployment Assets in the background."
            : "Persona intelligence generation queued. Athena is regenerating in the background."),
      );
      startPolling();
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

  const busy = Boolean(queueingKind) || inFlight;
  const failed = /fail/i.test(String(statusLabel ?? ""));
  const generatingIntelligence =
    busy &&
    (queueingKind === "generate_intelligence" ||
      (inFlight && queueingKind !== "think_differently"));
  const thinkingDifferently =
    busy && queueingKind === "think_differently";

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
            : failed
              ? "Retry Generate Intelligence"
              : "Generate Intelligence"}
        </button>
        {canThinkDifferently ? (
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
            {thinkingDifferently
              ? "Thinking Differently…"
              : "Think Differently"}
          </button>
        ) : null}
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
