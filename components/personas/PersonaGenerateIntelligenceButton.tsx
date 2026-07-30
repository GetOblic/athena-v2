"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseJsonResponse } from "@/lib/safeJsonResponse";

type PersonaGenerateIntelligenceButtonProps = {
  personaId: string;
  initialStatus?: string | null;
  initialInFlight?: boolean;
};

type PersonaStatusPayload = {
  ok?: boolean;
  status?: string;
  regenerationInFlight?: boolean;
  hasGeneratedAnalysis?: boolean;
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

export function PersonaGenerateIntelligenceButton({
  personaId,
  initialStatus = null,
  initialInFlight = false,
}: PersonaGenerateIntelligenceButtonProps) {
  const router = useRouter();
  const [queueing, setQueueing] = useState(false);
  const [inFlight, setInFlight] = useState(initialInFlight);
  const [statusLabel, setStatusLabel] = useState(initialStatus);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
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

  async function queueGeneration() {
    if (queueing || inFlight) return;

    setQueueing(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/personas/${personaId}/refresh`, {
        method: "POST",
      });
      const payload = await parseJsonResponse<PersonaStatusPayload & {
        queued?: boolean;
        accepted?: boolean;
      }>(response);
      const errorMessage =
        typeof payload.error === "string"
          ? payload.error
          : payload.error?.message;

      if (!response.ok || !payload.ok) {
        setError(errorMessage || "Generate Intelligence failed.");
        return;
      }

      setInFlight(Boolean(payload.queued ?? payload.accepted ?? true));
      setMessage(
        payload.message ||
          "Persona intelligence generation queued. Athena is regenerating in the background.",
      );
      startPolling();
      router.refresh();
    } catch (queueError) {
      setError(
        queueError instanceof Error
          ? queueError.message
          : "Generate Intelligence failed.",
      );
    } finally {
      setQueueing(false);
    }
  }

  const busy = queueing || inFlight;
  const failed = /fail/i.test(String(statusLabel ?? ""));

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <button
        type="button"
        onClick={() => void queueGeneration()}
        disabled={busy}
        className="inline-flex items-center justify-center rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? <ButtonSpinner /> : null}
        {busy
          ? "Generating Intelligence…"
          : failed
            ? "Retry Generate Intelligence"
            : "Generate Intelligence"}
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
