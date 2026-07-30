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
import { postPersonaConversation } from "@/services/personaConversation/personaConversationClient";
import {
  clearPersonaConversationSession,
  readPersonaConversationSession,
  writePersonaConversationSession,
} from "@/services/personaConversation/personaConversationSession";
import type {
  PersonaConversationHistoryMessage,
  PersonaConversationVersionState,
} from "@/services/personaConversation/personaConversationTypes";

type PersonaConversationPanelProps = {
  personaId: string;
  executiveVersionId: string | null;
  versionState: PersonaConversationVersionState;
  versionLabel: string | null;
};

const STARTER_QUESTIONS = [
  "What motivates this Persona most strongly?",
  "Which objections should we address first?",
  "How should our messaging change for this Persona?",
  "Which assumptions need validation?",
  "What channels appear most credible?",
  "How should the customer experience be adapted?",
];

function versionIndicatorCopy(input: {
  versionState: PersonaConversationVersionState;
  versionLabel: string | null;
}): string {
  if (input.versionState === "current") {
    return "Using Current Executive Version";
  }
  if (input.versionState === "archived") {
    return input.versionLabel
      ? `Using Archived Executive Version — ${input.versionLabel}`
      : "Using Archived Executive Version";
  }
  return "No Executive Version — using available Persona profile context";
}

function ThinkingIndicator() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--athena-orange)]/30 border-t-[var(--athena-orange)]"
      aria-hidden="true"
    />
  );
}

export function PersonaConversationPanel({
  personaId,
  executiveVersionId,
  versionState,
  versionLabel,
}: PersonaConversationPanelProps) {
  const messagesRegionId = useId();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);

  const initial =
    typeof window !== "undefined"
      ? readPersonaConversationSession(window.sessionStorage, {
          personaId,
          executiveVersionId,
        })
      : null;

  const [messages, setMessages] = useState<PersonaConversationHistoryMessage[]>(
    initial?.messages ?? [],
  );
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    writePersonaConversationSession(window.sessionStorage, {
      personaId,
      executiveVersionId,
      messages,
    });
  }, [personaId, executiveVersionId, messages]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function sendMessage(raw: string) {
    const message = raw.trim();
    if (!message || busy) return;

    const historyForRequest = messages.slice(-20);
    const nextMessages: PersonaConversationHistoryMessage[] = [
      ...messages,
      { role: "user", content: message },
    ];
    setMessages(nextMessages);
    setDraft("");
    setError(null);
    setBusy(true);

    const seq = ++requestSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const outcome = await postPersonaConversation({
      personaId,
      message,
      history: historyForRequest,
      executiveVersionId,
      signal: controller.signal,
    });

    if (seq !== requestSeqRef.current) return;

    setBusy(false);
    if (!outcome.ok) {
      if (outcome.failure.kind === "lifecycle_abort") return;
      setError(outcome.failure.message);
      return;
    }

    setMessages((current) => [
      ...current,
      {
        role: "assistant",
        content: outcome.result.message.content,
      },
    ]);
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

  function clearChat() {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    if (typeof window !== "undefined") {
      clearPersonaConversationSession(window.sessionStorage, {
        personaId,
        executiveVersionId,
      });
    }
  }

  return (
    <AthenaCollapsibleSection title="Ask Athena about this Persona" defaultOpen>
      <p className="text-sm leading-6 text-white/45">
        Ask grounded questions about this Persona archetype using the current
        profile, Notes, Reference Website research, and Current Executive
        Version when available.
      </p>
      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-white/35">
        {versionIndicatorCopy({ versionState, versionLabel })}
      </p>

      {versionState === "none" ? (
        <p className="mt-4 text-sm leading-6 text-amber-200/80">
          Generate Persona intelligence before asking Athena detailed strategic
          questions. Profile-level questions can still use available source
          fields.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {STARTER_QUESTIONS.map((question) => (
          <button
            key={question}
            type="button"
            disabled={busy}
            onClick={() => void sendMessage(question)}
            className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-left text-xs text-white/70 transition hover:border-[var(--athena-orange)]/40 hover:text-white disabled:opacity-40"
          >
            {question}
          </button>
        ))}
      </div>

      <div
        id={messagesRegionId}
        className="mt-6 max-h-[420px] space-y-4 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-4"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-white/40">No questions yet.</p>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={
                message.role === "user"
                  ? "ml-8 whitespace-pre-wrap text-sm leading-6 text-white/85"
                  : "mr-8 whitespace-pre-wrap text-sm leading-6 text-white/70"
              }
            >
              <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-white/35">
                {message.role === "user" ? "You" : "Athena"}
              </div>
              {message.content}
            </div>
          ))
        )}
        {busy ? (
          <div className="flex items-center gap-2 text-sm text-white/50">
            <ThinkingIndicator />
            Athena is thinking…
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          disabled={busy}
          placeholder="Ask Athena about this Persona…"
          className="w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/25 disabled:opacity-50"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Sending…" : "Send"}
          </button>
          <button
            type="button"
            onClick={clearChat}
            disabled={busy || messages.length === 0}
            className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/70 disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </form>
    </AthenaCollapsibleSection>
  );
}
