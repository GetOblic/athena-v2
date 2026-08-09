"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import { ATHENA_REQUEST_ID_HEADER } from "@/services/athenaConversation/athenaConversationTypes";
import {
  ESTIMATE_CONVERSATION_LIMITS,
  type EstimateConversationPublicMessage,
} from "@/services/estimateConversation/estimateConversationTypes";

export const ESTIMATE_ASK_ATHENA_TITLE = "Ask Athena";

export const ESTIMATE_ASK_ATHENA_DESCRIPTION =
  "Ask Athena about this Estimate — why this price was recommended, challenge assumptions, explore scope changes, or get advice on how to position the proposal.";

export const ESTIMATE_ASK_ATHENA_IMMUTABLE_NOTICE =
  "Conversation does not change this saved Estimate. To create a new formal Estimate, use Regenerate.";

export const ESTIMATE_ASK_ATHENA_DISCONNECTED_NOTICE =
  "This sub-account is no longer connected. Historical conversation remains available, but new Ask Athena advice requires an active sub-account relationship.";

export const ESTIMATE_ASK_ATHENA_METHODOLOGY_UNAVAILABLE =
  "Athena Estimate pricing methodology is not currently configured. Ask Athena is temporarily unavailable.";

export const ESTIMATE_ASK_ATHENA_EXAMPLE_PROMPTS = [
  "Why did you recommend this price?",
  "What would justify charging more?",
  "Would a lower price be too low?",
  "What if I remove part of the scope?",
  "How should I defend this price to the client?",
] as const;

type HistoryResponse = {
  ok?: boolean;
  messages?: EstimateConversationPublicMessage[];
  error?: { code?: string; message?: string };
};

type SendResponse = {
  ok?: boolean;
  message?: EstimateConversationPublicMessage;
  error?: { code?: string; message?: string; retryable?: boolean };
};

type EstimateAskAthenaPanelProps = {
  estimateId: string;
  relationshipConnected: boolean;
  /** Called when the Estimate is no longer available (hidden / 404). */
  onEstimateUnavailable?: () => void;
  /** Called when POST reports NOT_READY race — parent should refresh detail. */
  onNotReady?: () => void;
};

function ThinkingIndicator() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--athena-orange)]/30 border-t-[var(--athena-orange)]"
      aria-hidden="true"
    />
  );
}

function mapConversationError(
  code: string | undefined,
  fallback: string,
): string {
  if (code === "ESTIMATE_INSTRUCTION_NOT_CONFIGURED") {
    return ESTIMATE_ASK_ATHENA_METHODOLOGY_UNAVAILABLE;
  }
  if (code === "NOT_READY") {
    return "This Estimate is not ready for Ask Athena yet. Please try again shortly.";
  }
  if (code === "NOT_FOUND") {
    return "This Estimate is no longer available.";
  }
  return fallback;
}

function EstimateAskAthenaPanelInner({
  estimateId,
  relationshipConnected,
  onEstimateUnavailable,
  onNotReady,
}: EstimateAskAthenaPanelProps) {
  const messagesRegionId = useId();
  const inputId = useId();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const onUnavailableRef = useRef(onEstimateUnavailable);
  const onNotReadyRef = useRef(onNotReady);
  const sendSeqRef = useRef(0);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  const [messages, setMessages] = useState<EstimateConversationPublicMessage[]>(
    [],
  );
  const [draft, setDraft] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingResponse, setPendingResponse] = useState(false);
  const [error, setError] = useState<{
    code: string;
    message: string;
    retryMessage?: string;
    requestId?: string | null;
  } | null>(null);

  useEffect(() => {
    onUnavailableRef.current = onEstimateUnavailable;
    onNotReadyRef.current = onNotReady;
  }, [onEstimateUnavailable, onNotReady]);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();

    async function loadHistory() {
      try {
        const response = await fetch(
          `/api/licensee/estimate/${estimateId}/conversation`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = await parseJsonResponse<HistoryResponse>(response);
        if (!mountedRef.current) return;

        if (response.status === 404 || payload.error?.code === "NOT_FOUND") {
          setHistoryError("This Estimate is no longer available.");
          setMessages([]);
          onUnavailableRef.current?.();
          return;
        }

        if (!response.ok || !payload.ok || !Array.isArray(payload.messages)) {
          setHistoryError(
            mapConversationError(
              payload.error?.code,
              payload.error?.message || "Could not load conversation history.",
            ),
          );
          setMessages([]);
          return;
        }

        setMessages(payload.messages);
        setHistoryError(null);
      } catch (err) {
        if (
          !mountedRef.current ||
          (err instanceof Error && err.name === "AbortError")
        ) {
          return;
        }
        setHistoryError("Could not load conversation history.");
        setMessages([]);
      } finally {
        if (mountedRef.current) {
          setLoadingHistory(false);
        }
      }
    }

    void loadHistory();

    return () => {
      mountedRef.current = false;
      controller.abort();
      inFlightRef.current = false;
    };
  }, [estimateId]);

  async function refreshHistoryAfterSend(seq: number) {
    const response = await fetch(
      `/api/licensee/estimate/${estimateId}/conversation`,
      { cache: "no-store" },
    );
    const payload = await parseJsonResponse<HistoryResponse>(response);
    if (!mountedRef.current || seq !== sendSeqRef.current) {
      return;
    }
    if (response.ok && payload.ok && Array.isArray(payload.messages)) {
      setMessages(payload.messages);
    }
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (
      !trimmed ||
      busy ||
      inFlightRef.current ||
      !relationshipConnected ||
      loadingHistory
    ) {
      return;
    }

    inFlightRef.current = true;
    const seq = ++sendSeqRef.current;
    setBusy(true);
    setPendingResponse(true);
    setError(null);
    setDraft("");

    try {
      const response = await fetch(
        `/api/licensee/estimate/${estimateId}/conversation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed }),
        },
      );
      const requestId = response.headers.get(ATHENA_REQUEST_ID_HEADER);
      const payload = await parseJsonResponse<SendResponse>(response);

      if (!mountedRef.current || seq !== sendSeqRef.current) {
        return;
      }

      if (!response.ok || !payload.ok || !payload.message?.content) {
        const code = payload.error?.code ?? "CONVERSATION_FAILED";
        setDraft(trimmed);
        setError({
          code,
          message: mapConversationError(
            code,
            payload.error?.message || "Athena could not answer right now.",
          ),
          retryMessage:
            code === "ESTIMATE_INSTRUCTION_NOT_CONFIGURED" ||
            code === "NOT_FOUND" ||
            code === "NOT_READY"
              ? undefined
              : trimmed,
          requestId,
        });

        if (response.status === 404 || code === "NOT_FOUND") {
          onUnavailableRef.current?.();
        } else if (response.status === 409 || code === "NOT_READY") {
          onNotReadyRef.current?.();
        }
        return;
      }

      // Prefer durable history after POST so ordering stays DB-authoritative.
      await refreshHistoryAfterSend(seq);
      if (!mountedRef.current || seq !== sendSeqRef.current) {
        return;
      }
      // If refresh failed silently, still surface the assistant turn.
      setMessages((prev) => {
        if (prev.some((item) => item.id === payload.message!.id)) {
          return prev;
        }
        const userTurn: EstimateConversationPublicMessage = {
          id: `local-user-${payload.message!.id}`,
          role: "user",
          content: trimmed,
          createdAt: new Date().toISOString(),
        };
        return [
          ...prev,
          userTurn,
          {
            id: payload.message!.id,
            role: "assistant",
            content: payload.message!.content,
            createdAt: payload.message!.createdAt,
          },
        ];
      });
    } catch {
      if (!mountedRef.current || seq !== sendSeqRef.current) {
        return;
      }
      setDraft(trimmed);
      setError({
        code: "TRANSPORT_ERROR",
        message: "Athena could not reach the service. Please try again.",
        retryMessage: trimmed,
      });
    } finally {
      if (seq === sendSeqRef.current) {
        setBusy(false);
        setPendingResponse(false);
        inFlightRef.current = false;
      }
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void sendMessage(draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(draft);
    }
  }

  const composerDisabled =
    !relationshipConnected || busy || loadingHistory;

  return (
    <div
      id="estimate-ask-athena"
      className="mt-8 scroll-mt-24"
      data-estimate-ask-athena="true"
    >
      <AthenaCollapsibleSection
        title={ESTIMATE_ASK_ATHENA_TITLE}
        summary="Ask why Athena recommended this price, challenge assumptions, or explore positioning."
        defaultOpen={false}
      >
        <p className="max-w-2xl text-sm leading-6 text-white/45">
          {ESTIMATE_ASK_ATHENA_DESCRIPTION}
        </p>

        <p
          className="mt-3 text-xs leading-5 text-amber-100/70"
          data-estimate-immutable-notice="true"
        >
          {ESTIMATE_ASK_ATHENA_IMMUTABLE_NOTICE}
        </p>

        {!relationshipConnected ? (
          <p
            className="mt-3 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-50"
            data-estimate-disconnected-notice="true"
            role="status"
          >
            {ESTIMATE_ASK_ATHENA_DISCONNECTED_NOTICE}
          </p>
        ) : null}

        <div
          id={messagesRegionId}
          className="mt-6 min-w-0 space-y-4 overflow-x-hidden"
          aria-live="polite"
          aria-relevant="additions"
          aria-busy={loadingHistory || pendingResponse || busy}
        >
          {loadingHistory ? (
            <p className="text-sm text-white/40" role="status">
              Loading conversation…
            </p>
          ) : null}

          {historyError && !loadingHistory ? (
            <p className="text-sm text-red-300" role="alert">
              {historyError}
            </p>
          ) : null}

          {!loadingHistory &&
          !historyError &&
          messages.length === 0 &&
          !pendingResponse ? (
            <div
              className="rounded-2xl border border-white/10 bg-black/20 p-5"
              data-estimate-conversation-empty="true"
            >
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/35">
                Try asking
              </div>
              {relationshipConnected ? (
                <ul className="mt-3 space-y-2">
                  {ESTIMATE_ASK_ATHENA_EXAMPLE_PROMPTS.map((example) => (
                    <li key={example}>
                      <button
                        type="button"
                        disabled={composerDisabled}
                        onClick={() => {
                          setDraft(example);
                          inputRef.current?.focus();
                        }}
                        className="text-left text-sm text-white/65 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] disabled:opacity-50"
                      >
                        “{example}”
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-white/45">
                  No conversation yet for this Estimate.
                </p>
              )}
            </div>
          ) : null}

          {!loadingHistory && messages.length > 0
            ? messages.map((message) => {
                const isUser = message.role === "user";
                return (
                  <div
                    key={message.id}
                    className={`min-w-0 break-words rounded-2xl border px-4 py-3 ${
                      isUser
                        ? "border-white/10 bg-white/[0.04]"
                        : "border-[var(--athena-orange)]/20 bg-[var(--athena-orange)]/[0.06]"
                    }`}
                    data-estimate-message-role={message.role}
                  >
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                      {isUser ? "You" : "Athena"}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-white/85">
                      {message.content}
                    </p>
                  </div>
                );
              })
            : null}

          {pendingResponse ? (
            <div
              className="rounded-2xl border border-[var(--athena-orange)]/20 bg-[var(--athena-orange)]/[0.06] px-4 py-3"
              data-athena-pending-response="true"
            >
              <div className="flex items-center gap-2">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                  Athena
                </div>
                <ThinkingIndicator />
              </div>
              <p className="mt-2 text-sm leading-7 text-white/65">
                Athena is thinking…
              </p>
            </div>
          ) : null}
        </div>

        {error ? (
          <div
            className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
            role="alert"
            data-estimate-conversation-error={error.code}
          >
            <div>{error.message}</div>
            {error.requestId ? (
              <div className="mt-1 text-xs text-red-100/55">
                Support reference: {error.requestId}
              </div>
            ) : null}
            {error.retryMessage ? (
              <button
                type="button"
                disabled={composerDisabled}
                onClick={() => void sendMessage(error.retryMessage!)}
                className="mt-2 rounded-lg border border-red-200/30 px-3 py-1.5 text-xs font-medium transition hover:bg-red-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] disabled:opacity-50"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="mt-6 space-y-3"
          data-estimate-ask-composer={
            relationshipConnected ? "enabled" : "disabled"
          }
        >
          <label htmlFor={inputId} className="sr-only">
            Ask Athena about this Estimate
          </label>
          <textarea
            id={inputId}
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={composerDisabled}
            rows={3}
            maxLength={ESTIMATE_CONVERSATION_LIMITS.maxMessageChars}
            placeholder={
              relationshipConnected
                ? "Ask Athena about this Estimate…"
                : "Reconnect the sub-account to ask new questions"
            }
            className="w-full min-w-0 resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white placeholder:text-white/30 focus:border-[var(--athena-orange)]/50 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] disabled:cursor-not-allowed disabled:opacity-60"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-white/30">
              Enter to send · Shift+Enter for a new line
            </p>
            <button
              type="submit"
              disabled={composerDisabled || !draft.trim()}
              className="rounded-xl border border-[var(--athena-orange)]/40 bg-[var(--athena-orange)]/15 px-4 py-2 text-sm font-semibold text-[var(--athena-orange)] transition hover:bg-[var(--athena-orange)]/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] disabled:opacity-40"
            >
              {busy ? "Asking…" : "Ask Athena"}
            </button>
          </div>
        </form>
      </AthenaCollapsibleSection>
    </div>
  );
}

export function EstimateAskAthenaPanel(props: EstimateAskAthenaPanelProps) {
  // Remount on Estimate switch so history cannot leak across threads.
  return <EstimateAskAthenaPanelInner key={props.estimateId} {...props} />;
}
