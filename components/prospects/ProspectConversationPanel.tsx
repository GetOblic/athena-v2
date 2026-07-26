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
import { postProspectConversation } from "@/services/prospectConversation/prospectConversationClient";
import {
  clearProspectConversationSession,
  readProspectConversationSession,
  writeProspectConversationSession,
} from "@/services/prospectConversation/prospectConversationSession";
import type {
  ProspectConversationAssetReference,
  ProspectConversationHistoryMessage,
  ProspectConversationVersionState,
} from "@/services/prospectConversation/prospectConversationTypes";

export type ProspectConversationDiscussTarget = {
  executiveVersionId: string;
  assetKind: "deployment" | "blueprint";
  assetKey: string;
};

type ProspectConversationPanelProps = {
  prospectId: string;
  executiveVersionId: string | null;
  versionState: ProspectConversationVersionState;
  versionLabel: string | null;
  /** Controlled asset target from Discuss actions / clear. */
  assetReference?: ProspectConversationAssetReference | null;
  onAssetReferenceChange?: (
    next: ProspectConversationAssetReference | null,
  ) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function versionIndicatorCopy(input: {
  versionState: ProspectConversationVersionState;
  versionLabel: string | null;
}): string {
  if (input.versionState === "current") {
    return "Using Current Executive Version";
  }
  if (input.versionState === "archived") {
    return input.versionLabel
      ? `Using Archived Executive Version — ${input.versionLabel.replace(/^Archived Executive Version — /, "")}`
      : "Using Archived Executive Version";
  }
  return "No Executive Version — using available prospect context";
}

function examplePrompts(hasAssetsHint: boolean): string[] {
  const examples = [
    "What is the strongest opportunity Athena identified?",
    "Explain the reasoning behind the current Strategic Blueprint.",
  ];
  if (hasAssetsHint) {
    examples.push("Rewrite the Newsletter Idea in the first person.");
  }
  return examples;
}

function readInitialSession(input: {
  prospectId: string;
  executiveVersionId: string | null;
}): {
  messages: ProspectConversationHistoryMessage[];
  assetReference: ProspectConversationAssetReference | null;
} {
  const storage =
    typeof window !== "undefined" ? window.sessionStorage : null;
  const stored = readProspectConversationSession(storage, input);
  return {
    messages: stored?.messages ?? [],
    assetReference: stored?.assetReference ?? null,
  };
}

function ThinkingIndicator() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--athena-orange)]/30 border-t-[var(--athena-orange)]"
      aria-hidden="true"
    />
  );
}

function ProspectConversationPanelInner({
  prospectId,
  executiveVersionId,
  versionState,
  versionLabel,
  assetReference: assetReferenceControlled,
  onAssetReferenceChange,
  open,
  onOpenChange,
}: ProspectConversationPanelProps) {
  const messagesRegionId = useId();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const requestSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  // Captures the mount scope; inner panel remounts when prospect/version changes.
  const mountedScopeRef = useRef({ prospectId, executiveVersionId });

  const initial = readInitialSession({ prospectId, executiveVersionId });
  const [messages, setMessages] =
    useState<ProspectConversationHistoryMessage[]>(initial.messages);
  const [draft, setDraft] = useState("");
  const [assetReferenceUncontrolled, setAssetReferenceUncontrolled] =
    useState<ProspectConversationAssetReference | null>(
      initial.assetReference,
    );
  const [resolvedAssetTitle, setResolvedAssetTitle] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [pendingResponse, setPendingResponse] = useState(false);
  const [error, setError] = useState<{
    code: string;
    message: string;
    retryMessage?: string;
    requestId?: string | null;
  } | null>(null);
  const [copyAck, setCopyAck] = useState<string | null>(null);

  const assetReferenceControlledMode = assetReferenceControlled !== undefined;
  const assetReference = assetReferenceControlledMode
    ? assetReferenceControlled
    : assetReferenceUncontrolled;

  function setAssetReference(
    next: ProspectConversationAssetReference | null,
  ) {
    if (!assetReferenceControlledMode) {
      setAssetReferenceUncontrolled(next);
    }
    onAssetReferenceChange?.(next);
  }

  // Persist scoped session to sessionStorage (external system write).
  // Pending Athena rows are never part of `messages` and are never persisted.
  useEffect(() => {
    const storage =
      typeof window !== "undefined" ? window.sessionStorage : null;
    writeProspectConversationSession(storage, {
      schemaVersion: 1,
      prospectId,
      executiveVersionId,
      messages,
      assetReference: assetReference ?? null,
      updatedAt: new Date().toISOString(),
    });
  }, [prospectId, executiveVersionId, messages, assetReference]);

  // Abort in-flight request when the panel unmounts or remounts for a new scope.
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
    const scopeAtSend = {
      prospectId: mountedScopeRef.current.prospectId,
      executiveVersionId: mountedScopeRef.current.executiveVersionId,
      assetReference,
    };

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
      const outcome = await postProspectConversation({
        prospectId,
        message: trimmed,
        history: historyForRequest,
        executiveVersionId,
        assetReference: assetReference ?? null,
        signal: controller.signal,
      });

      if (
        seq !== requestSeqRef.current ||
        mountedScopeRef.current.prospectId !== scopeAtSend.prospectId ||
        mountedScopeRef.current.executiveVersionId !==
          scopeAtSend.executiveVersionId
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
      if (outcome.result.context.asset) {
        setResolvedAssetTitle(outcome.result.context.asset.title);
        setAssetReference({
          kind: outcome.result.context.asset.kind,
          key: outcome.result.context.asset.key,
        });
      }
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
        message: "Athena could not reach the service. Please try again.",
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
    setResolvedAssetTitle(null);
    setAssetReference(null);
    const storage =
      typeof window !== "undefined" ? window.sessionStorage : null;
    clearProspectConversationSession(storage, {
      prospectId,
      executiveVersionId,
    });
  }

  function clearAssetTarget() {
    setAssetReference(null);
    setResolvedAssetTitle(null);
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

  const examples = examplePrompts(versionState !== "none");
  const discussingLabel = assetReference
    ? `Discussing: ${assetReference.kind === "deployment" ? "Deployment Asset" : "Strategic Blueprint"} — ${resolvedAssetTitle ?? assetReference.key}`
    : null;

  return (
    <div id="prospect-conversation" className="mt-8 scroll-mt-24">
      <AthenaCollapsibleSection
        title="Ask Athena About This Prospect"
        defaultOpen={false}
        open={open}
        onOpenChange={onOpenChange}
      >
        <p className="max-w-2xl text-sm leading-6 text-white/45">
          Ask questions about this prospect, its intelligence, or any visible
          strategic and deployment asset.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.15em] text-white/40">
          <span
            className={
              versionState === "current"
                ? "rounded-full border border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 px-3 py-1 font-semibold text-[var(--athena-orange)]"
                : versionState === "archived"
                  ? "rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 font-semibold text-white/55"
                  : "rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-semibold text-white/40"
            }
          >
            {versionIndicatorCopy({ versionState, versionLabel })}
          </span>
        </div>

        <p className="mt-3 text-xs leading-5 text-white/35">
          Conversation responses do not modify Athena intelligence or assets.
        </p>

        {discussingLabel ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
            <span>{discussingLabel}</span>
            <button
              type="button"
              onClick={clearAssetTarget}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
            >
              Clear target
            </button>
          </div>
        ) : null}

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
                Try asking
              </div>
              <ul className="mt-3 space-y-2">
                {examples.map((example) => (
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
                    className={`rounded-2xl border px-4 py-3 ${
                      isUser
                        ? "border-white/10 bg-white/[0.04]"
                        : "border-[var(--athena-orange)]/20 bg-[var(--athena-orange)]/[0.06]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                        {isUser ? "You" : "Athena"}
                      </div>
                      {!isUser ? (
                        <button
                          type="button"
                          onClick={() =>
                            void copyAssistant(message.content, key)
                          }
                          className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-white/50 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
                        >
                          {copyAck === key ? "Copied" : "Copy"}
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
                      Athena
                    </div>
                    <ThinkingIndicator />
                  </div>
                  <p className="mt-2 text-sm leading-7 text-white/65">
                    Athena is thinking…
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
                Support reference: {error.requestId}
              </div>
            ) : null}
            {error.retryMessage ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void sendMessage(error.retryMessage!)}
                className="mt-2 rounded-lg border border-red-200/30 px-3 py-1.5 text-xs font-medium transition hover:bg-red-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] disabled:opacity-50"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <label htmlFor="prospect-conversation-input" className="sr-only">
            Ask Athena about this prospect
          </label>
          <textarea
            id="prospect-conversation-input"
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={busy}
            rows={3}
            placeholder="Ask Athena about this prospect…"
            className="w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white placeholder:text-white/30 focus:border-[var(--athena-orange)]/50 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] disabled:opacity-60"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-white/30">
              Enter to send · Shift+Enter for a new line
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={clearConversation}
                disabled={busy || (messages.length === 0 && !assetReference)}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/60 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] disabled:opacity-40"
              >
                Clear conversation
              </button>
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className="rounded-xl border border-[var(--athena-orange)]/40 bg-[var(--athena-orange)]/15 px-4 py-2 text-sm font-semibold text-[var(--athena-orange)] transition hover:bg-[var(--athena-orange)]/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] disabled:opacity-40"
              >
                {busy ? "Asking…" : "Ask Athena"}
              </button>
            </div>
          </div>
        </form>
      </AthenaCollapsibleSection>
    </div>
  );
}

export function ProspectConversationPanel(props: ProspectConversationPanelProps) {
  return (
    <ProspectConversationPanelInner
      key={`prospect-conversation-${props.prospectId}-${props.executiveVersionId ?? "no-version"}`}
      {...props}
    />
  );
}
