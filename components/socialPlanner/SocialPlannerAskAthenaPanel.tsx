"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import { ATHENA_REQUEST_ID_HEADER } from "@/services/athenaConversation/athenaConversationTypes";
import {
  SOCIAL_PLANNER_CONVERSATION_LIMITS,
  type SocialPlannerConversationPublicMessage,
} from "@/services/socialPlanner/conversation/socialPlannerConversationTypes";

export const SOCIAL_PLANNER_ASK_ATHENA_TITLE = "Ask Athena About This Calendar";

type HistoryResponse = {
  ok?: boolean;
  messages?: SocialPlannerConversationPublicMessage[];
  error?: { code?: string; message?: string };
};

type SendResponse = {
  ok?: boolean;
  message?: SocialPlannerConversationPublicMessage;
  error?: { code?: string; message?: string; retryable?: boolean };
};

type SocialPlannerAskAthenaPanelProps = {
  calendarId: string;
  applyPending?: boolean;
  applyError?: string | null;
  onApply?: () => void;
};

function ThinkingIndicator() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--athena-orange)]/30 border-t-[var(--athena-orange)]"
      aria-hidden="true"
    />
  );
}

function SocialPlannerAskAthenaPanelInner({
  calendarId,
  applyPending = false,
  applyError = null,
  onApply,
}: SocialPlannerAskAthenaPanelProps) {
  const messagesRegionId = useId();
  const inputId = useId();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const sendSeqRef = useRef(0);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  const [messages, setMessages] = useState<SocialPlannerConversationPublicMessage[]>(
    [],
  );
  const [draft, setDraft] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingResponse, setPendingResponse] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();

    async function loadHistory() {
      try {
        const response = await fetch(
          `/api/social-planner/${calendarId}/conversation`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = await parseJsonResponse<HistoryResponse>(response);
        if (!mountedRef.current) return;
        if (!response.ok || !payload.ok || !Array.isArray(payload.messages)) {
          setHistoryError(
            payload.error?.message || "Could not load conversation history.",
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
  }, [calendarId]);

  async function refreshHistoryAfterSend(seq: number) {
    const response = await fetch(
      `/api/social-planner/${calendarId}/conversation`,
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
    if (!trimmed || busy || inFlightRef.current || loadingHistory) {
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
        `/api/social-planner/${calendarId}/conversation`,
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
        setDraft(trimmed);
        setError(
          payload.error?.message ||
            (requestId
              ? "Athena could not answer right now."
              : "Athena could not answer right now."),
        );
        return;
      }
      await refreshHistoryAfterSend(seq);
    } catch {
      if (!mountedRef.current || seq !== sendSeqRef.current) return;
      setDraft(trimmed);
      setError("Athena could not answer right now.");
    } finally {
      if (mountedRef.current && seq === sendSeqRef.current) {
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
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(draft);
    }
  }

  const composerDisabled = busy || loadingHistory;

  return (
    <section
      className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-6 sm:p-7"
      data-social-planner-ask-athena=""
    >
      <h3 className="text-xl font-semibold">{SOCIAL_PLANNER_ASK_ATHENA_TITLE}</h3>
      <p className="mt-2 text-sm leading-6 text-white/50">
        Conversation does not change this saved week. Use Apply Athena&apos;s
        Suggestions when you want a new revised calendar.
      </p>

      <div
        id={messagesRegionId}
        className="mt-5 space-y-3"
        data-social-planner-conversation-history=""
      >
        {loadingHistory ? (
          <p className="text-sm text-white/40">Loading conversation…</p>
        ) : null}
        {historyError ? (
          <p className="text-sm text-rose-100/80">{historyError}</p>
        ) : null}
        {messages.map((message) => (
          <div
            key={message.id}
            data-social-planner-message-role={message.role}
            className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3"
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/35">
              {message.role === "user" ? "You" : "Athena"}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/80">
              {message.content}
            </p>
          </div>
        ))}
        {pendingResponse ? (
          <div
            className="flex items-center gap-2 text-sm text-white/45"
            data-athena-pending-response=""
          >
            <ThinkingIndicator />
            Athena is thinking…
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 text-sm text-rose-100/80" data-social-planner-conversation-error="">
          {error}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <label htmlFor={inputId} className="sr-only">
          Ask Athena about this calendar
        </label>
        <textarea
          id={inputId}
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={composerDisabled}
          rows={3}
          maxLength={SOCIAL_PLANNER_CONVERSATION_LIMITS.maxMessageChars}
          placeholder="Ask Athena about this calendar…"
          className="w-full min-w-0 resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white placeholder:text-white/30 focus:border-[var(--athena-orange)]/50 focus:outline-none disabled:opacity-60"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-white/30">
            Enter to send · Shift+Enter for a new line
          </p>
          <button
            type="submit"
            disabled={composerDisabled || !draft.trim()}
            className="rounded-xl border border-[var(--athena-orange)]/40 bg-[var(--athena-orange)]/15 px-4 py-2 text-sm font-semibold text-[var(--athena-orange)] disabled:opacity-40"
          >
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </form>

      {messages.length > 0 && onApply ? (
        <div className="mt-6 border-t border-white/8 pt-5">
          <button
            type="button"
            disabled={applyPending || busy}
            onClick={onApply}
            className="w-full rounded-2xl bg-[var(--athena-orange)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
          >
            Apply Athena&apos;s Suggestions
          </button>
          {applyError ? (
            <p className="mt-3 text-sm text-rose-100/80">{applyError}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function SocialPlannerAskAthenaPanel(
  props: SocialPlannerAskAthenaPanelProps,
) {
  return <SocialPlannerAskAthenaPanelInner key={props.calendarId} {...props} />;
}
