"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Shuffle } from "lucide-react";
import {
  PERSONA_HEADER_ALTERNATIVE_CLASS,
  PERSONA_HEADER_GENERATE_CLASS,
  PERSONA_HEADER_REFRESH_CLASS,
} from "@/lib/personas/personaPagePresentation";
import { parseJsonResponse } from "@/lib/safeJsonResponse";

type PersonaGenerateChrome = {
  generateIntelligence: string;
  generatingIntelligence: string;
  retryGenerateIntelligence: string;
  thinkDifferently: string;
  thinkingDifferently: string;
  refreshIntelligence?: string;
  refreshingIntelligence?: string;
  generateFailed: string;
  thinkFailed: string;
  generateQueued: string;
  thinkQueued: string;
};

type PersonaGenerateIntelligenceButtonProps = {
  personaId: string;
  initialStatus?: string | null;
  initialInFlight?: boolean;
  /** Think Differently only when a Current Executive Version exists. */
  hasCurrentExecutiveVersion?: boolean;
  chrome?: PersonaGenerateChrome | null;
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
      className="inline-block size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
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
  chrome = null,
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
              ? (chrome?.thinkFailed ?? "Think Differently failed.")
              : (chrome?.generateFailed ?? "Generate Intelligence failed.")),
        );
        return;
      }

      setInFlight(Boolean(payload.queued ?? payload.accepted ?? true));
      setMessage(
        payload.message ||
          (kind === "think_differently"
            ? (chrome?.thinkQueued ??
              "Think Differently queued. Athena is regenerating Strategic Blueprint and Deployment Assets in the background.")
            : (chrome?.generateQueued ??
              "Persona intelligence generation queued. Athena is regenerating in the background.")),
      );
      startPolling();
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

  const busy = Boolean(queueingKind) || inFlight;
  const failed = /fail/i.test(String(statusLabel ?? ""));
  const ready = String(statusLabel ?? "") === "Ready";
  const generatingIntelligence =
    busy &&
    (queueingKind === "generate_intelligence" ||
      (inFlight && queueingKind !== "think_differently"));
  const thinkingDifferently =
    busy && queueingKind === "think_differently";

  return (
    <>
      {!ready || failed ? (
        <button
          type="button"
          data-persona-header-action="generate"
          onClick={() => void queueAction("generate_intelligence")}
          disabled={busy}
          className={PERSONA_HEADER_GENERATE_CLASS}
        >
          {generatingIntelligence ? (
            <ButtonSpinner />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {generatingIntelligence
            ? (chrome?.generatingIntelligence ??
              "Generating audience intelligence…")
            : failed
              ? (chrome?.retryGenerateIntelligence ?? "Try generating again")
              : (chrome?.generateIntelligence ??
                "Generate audience intelligence")}
        </button>
      ) : (
        <button
          type="button"
          data-persona-header-action="refresh"
          onClick={() => void queueAction("generate_intelligence")}
          disabled={busy}
          className={PERSONA_HEADER_REFRESH_CLASS}
        >
          {generatingIntelligence ? (
            <ButtonSpinner />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {generatingIntelligence
            ? (chrome?.refreshingIntelligence ??
              chrome?.generatingIntelligence ??
              "Refreshing intelligence…")
            : (chrome?.refreshIntelligence ?? "Refresh intelligence")}
        </button>
      )}
      {canThinkDifferently ? (
        <button
          type="button"
          data-persona-header-action="think-differently"
          onClick={() => void queueAction("think_differently")}
          disabled={busy}
          className={PERSONA_HEADER_ALTERNATIVE_CLASS}
        >
          {thinkingDifferently ? (
            <span
              className="inline-block size-3.5 animate-spin rounded-full border-2 border-[var(--athena-success)]/30 border-t-[var(--athena-success)]"
              aria-hidden="true"
            />
          ) : (
            <Shuffle className="size-4" />
          )}
          {thinkingDifferently
            ? (chrome?.thinkingDifferently ?? "Trying another approach…")
            : (chrome?.thinkDifferently ?? "Try another approach")}
        </button>
      ) : null}
      {message ? (
        <p className="basis-full text-sm whitespace-pre-wrap text-white/60">
          {message}
        </p>
      ) : null}
      {error ? (
        <div className="basis-full text-sm text-red-300">{error}</div>
      ) : null}
    </>
  );
}
