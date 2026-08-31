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
import { writeClipboardText } from "@/lib/clipboard";
import { postAthenaConversation } from "@/services/athenaConversation/athenaConversationClient";
import {
  clearAthenaConversationSession,
  readAthenaConversationSession,
  writeAthenaConversationSession,
} from "@/services/athenaConversation/athenaConversationSession";
import {
  ATHENA_CONVERSATION_LIMITS,
  type AthenaConversationHistoryMessage,
} from "@/services/athenaConversation/athenaConversationTypes";

export type AthenaConversationChrome = {
  you: string;
  athena: string;
  copy: string;
  copied: string;
  thinking: string;
  retry: string;
  asking: string;
  enterToSend: string;
  supportReference: string;
  transportFailed?: string;
};

const DEFAULT_CONVERSATION_CHROME: AthenaConversationChrome = {
  you: "You",
  athena: "Athena",
  copy: "Copy",
  copied: "Copied",
  thinking: "Athena is thinking…",
  retry: "Retry",
  asking: "Asking…",
  enterToSend: "Enter to send · Shift+Enter for a new line",
  supportReference: "Support reference:",
  transportFailed: "Athena could not reach the service. Please try again.",
};

export type AthenaConversationPanelProps = {
  title: string;
  description: string;
  placeholder: string;
  examplePrompts: readonly string[];
  storageKey: string;
  conversationEndpoint: string;
  defaultOpen?: boolean;
  /** Accessible label for the textarea. */
  inputLabel?: string;
  /** Optional DOM id for the outer panel wrapper. */
  panelId?: string;
  /** Optional DOM id for the textarea. */
  inputId?: string;
  /** Optional remount key when scope fingerprint changes. */
  remountKey?: string;
  readOnlyNotice?: string;
  clearLabel?: string;
  submitLabel?: string;
  emptyStateTitle?: string;
  chrome?: AthenaConversationChrome;
};

function ThinkingIndicator() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--athena-orange)]/30 border-t-[var(--athena-orange)]"
      aria-hidden="true"
    />
  );
}

function AthenaConversationPanelInner({
  title,
  description,
  placeholder,
  examplePrompts,
  storageKey,
  conversationEndpoint,
  defaultOpen = false,
  inputLabel,
  panelId,
  inputId,
  readOnlyNotice = "Conversation responses do not modify Athena data.",
  clearLabel = "Clear conversation",
  submitLabel = "Ask Athena",
  emptyStateTitle = "Try asking",
  chrome = DEFAULT_CONVERSATION_CHROME,
}: AthenaConversationPanelProps) {
  const messagesRegionId = useId();
  const generatedInputId = useId();
  const resolvedInputId = inputId ?? generatedInputId;
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const requestSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const mountedStorageKeyRef = useRef(storageKey);

  const initialMessages = (() => {
    const storage =
      typeof window !== "undefined" ? window.sessionStorage : null;
    return readAthenaConversationSession(storage, storageKey)?.messages ?? [];
  })();

  const [messages, setMessages] =
    useState<AthenaConversationHistoryMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingResponse, setPendingResponse] = useState(false);
  const [error, setError] = useState<{
    code: string;
    message: string;
    retryMessage?: string;
    requestId?: string | null;
  } | null>(null);
  const [copyAck, setCopyAck] = useState<string | null>(null);

  useEffect(() => {
    const storage =
      typeof window !== "undefined" ? window.sessionStorage : null;
    writeAthenaConversationSession(storage, storageKey, {
      schemaVersion: 1,
      messages,
      updatedAt: new Date().toISOString(),
    });
  }, [storageKey, messages]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      inFlightRef.current = false;
    };
  }, []);

  function rollbackUserTurn(trimmed: string) {
    setMessages((prev) => {
      if (
        prev.length > 0 &&
        prev[prev.length - 1]?.role === "user" &&
        prev[prev.length - 1]?.content === trimmed
      ) {
        return prev.slice(0, -1);
      }
      return prev;
    });
    setDraft(trimmed);
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    const seq = ++requestSeqRef.current;
    const scopeAtSend = mountedStorageKeyRef.current;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setBusy(true);
    setPendingResponse(true);
    setError(null);
    setDraft("");

    const historyForRequest = messages;
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);

    try {
      const outcome = await postAthenaConversation({
        endpoint: conversationEndpoint,
        message: trimmed,
        history: historyForRequest,
        signal: controller.signal,
      });

      if (
        seq !== requestSeqRef.current ||
        mountedStorageKeyRef.current !== scopeAtSend
      ) {
        return;
      }

      if (!outcome.ok) {
        if (outcome.failure.kind === "lifecycle_abort") {
          return;
        }
        rollbackUserTurn(trimmed);
        setError({
          code: outcome.failure.code,
          message: outcome.failure.message,
          retryMessage: trimmed,
          requestId: outcome.failure.requestId,
        });
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: outcome.result.message.content,
        },
      ]);
    } catch (err) {
      if (
        seq !== requestSeqRef.current ||
        (err instanceof Error && err.name === "AbortError")
      ) {
        return;
      }
      rollbackUserTurn(trimmed);
      setError({
        code: "TRANSPORT_ERROR",
        message:
          chrome.transportFailed ??
          "Athena could not reach the service. Please try again.",
        retryMessage: trimmed,
      });
    } finally {
      if (seq === requestSeqRef.current) {
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

  function clearConversation() {
    abortRef.current?.abort();
    inFlightRef.current = false;
    setBusy(false);
    setPendingResponse(false);
    setMessages([]);
    setError(null);
    const storage =
      typeof window !== "undefined" ? window.sessionStorage : null;
    clearAthenaConversationSession(storage, storageKey);
  }

  async function copyAssistant(content: string, key: string) {
    try {
      await writeClipboardText(content);
      setCopyAck(key);
      window.setTimeout(() => setCopyAck(null), 2000);
    } catch {
      // Clipboard failures stay silent; message remains visible.
    }
  }

  return (
    <div id={panelId} className="scroll-mt-24">
      <AthenaCollapsibleSection title={title} defaultOpen={defaultOpen}>
        <p className="max-w-2xl text-sm leading-6 text-white/45">
          {description}
        </p>

        <p className="mt-3 text-xs leading-5 text-white/35">{readOnlyNotice}</p>

        <div
          id={messagesRegionId}
          className="mt-6 space-y-4"
          aria-live="polite"
          aria-relevant="additions"
          aria-busy={pendingResponse || busy}
        >
          {messages.length === 0 && !pendingResponse ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/35">
                {emptyStateTitle}
              </div>
              <ul className="mt-3 space-y-2">
                {examplePrompts.map((example) => (
                  <li key={example}>
                    <button
                      type="button"
                      disabled={busy}
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
            </div>
          ) : (
            <>
              {messages.map((message, index) => {
                const key = `${message.role}-${index}`;
                const isUser = message.role === "user";
                return (
                  <div
                    key={key}
                    className={`break-words rounded-2xl border px-4 py-3 ${
                      isUser
                        ? "border-white/10 bg-white/[0.04]"
                        : "border-[var(--athena-orange)]/20 bg-[var(--athena-orange)]/[0.06]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                        {isUser ? chrome.you : chrome.athena}
                      </div>
                      {!isUser ? (
                        <button
                          type="button"
                          onClick={() =>
                            void copyAssistant(message.content, key)
                          }
                          className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-white/50 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
                        >
                          {copyAck === key ? chrome.copied : chrome.copy}
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-white/85">
                      {message.content}
                    </p>
                  </div>
                );
              })}
              {pendingResponse ? (
                <div
                  className="rounded-2xl border border-[var(--athena-orange)]/20 bg-[var(--athena-orange)]/[0.06] px-4 py-3"
                  data-athena-pending-response="true"
                >
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                      {chrome.athena}
                    </div>
                    <ThinkingIndicator />
                  </div>
                  <p className="mt-2 text-sm leading-7 text-white/65">
                    {chrome.thinking}
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>

        {error ? (
          <div
            className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
            role="alert"
          >
            <div>{error.message}</div>
            {error.requestId ? (
              <div className="mt-1 text-xs text-red-100/55">
                {chrome.supportReference} {error.requestId}
              </div>
            ) : null}
            {error.retryMessage ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void sendMessage(error.retryMessage!)}
                className="mt-2 rounded-lg border border-red-200/30 px-3 py-1.5 text-xs font-medium transition hover:bg-red-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] disabled:opacity-50"
              >
                {chrome.retry}
              </button>
            ) : null}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <label htmlFor={resolvedInputId} className="sr-only">
            {inputLabel ?? title}
          </label>
          <textarea
            id={resolvedInputId}
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={busy}
            rows={3}
            maxLength={ATHENA_CONVERSATION_LIMITS.maxMessageChars}
            placeholder={placeholder}
            className="w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white placeholder:text-white/30 focus:border-[var(--athena-orange)]/50 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] disabled:opacity-60"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-white/30">
              {chrome.enterToSend}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={clearConversation}
                disabled={busy || messages.length === 0}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/60 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] disabled:opacity-40"
              >
                {clearLabel}
              </button>
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className="rounded-xl border border-[var(--athena-orange)]/40 bg-[var(--athena-orange)]/15 px-4 py-2 text-sm font-semibold text-[var(--athena-orange)] transition hover:bg-[var(--athena-orange)]/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] disabled:opacity-40"
              >
                {busy ? chrome.asking : submitLabel}
              </button>
            </div>
          </div>
        </form>
      </AthenaCollapsibleSection>
    </div>
  );
}

export function AthenaConversationPanel(props: AthenaConversationPanelProps) {
  return (
    <AthenaConversationPanelInner
      key={props.remountKey ?? props.storageKey}
      {...props}
    />
  );
}
