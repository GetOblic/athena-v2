"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { usePersonaDiscussContext } from "@/components/personas/personaDiscussContext";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import {
  PERSONA_CONVERSATION_NETWORK_FALLBACK,
  postPersonaConversation,
} from "@/services/personaConversation/personaConversationClient";
import {
  clearPersonaConversationSession,
  readPersonaConversationSession,
  writePersonaConversationSession,
} from "@/services/personaConversation/personaConversationSession";
import {
  describePersonaAssetKind,
  isPersonaAnalysisAssetReferenceKey,
} from "@/services/personaConversation/personaConversationAssetLabels";
import type {
  PersonaConversationAssetReference,
  PersonaConversationHistoryMessage,
  PersonaConversationVersionState,
} from "@/services/personaConversation/personaConversationTypes";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import type { TenantMessages } from "@/lib/tenantI18n/types";

export type PersonaConversationChrome = TenantMessages["personas"]["conversation"];

type PersonaConversationPanelProps = {
  personaId: string;
  executiveVersionId: string | null;
  versionState: PersonaConversationVersionState;
  versionLabel: string | null;
  /** Controlled asset target from Discuss actions / clear. */
  assetReference?: PersonaConversationAssetReference | null;
  onAssetReferenceChange?: (
    next: PersonaConversationAssetReference | null,
  ) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  chrome?: PersonaConversationChrome | null;
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
  chrome?: PersonaConversationChrome | null;
}): string {
  if (input.versionState === "current") {
    return input.chrome?.usingCurrent ?? "Using Current Executive Version";
  }
  if (input.versionState === "archived") {
    return input.versionLabel
      ? interpolateTenantMessage(
          input.chrome?.usingArchivedNamed ??
            "Using Archived Executive Version — {label}",
          { label: input.versionLabel },
        )
      : (input.chrome?.usingArchived ?? "Using Archived Executive Version");
  }
  return (
    input.chrome?.usingNone ??
    "No Executive Version — using available Persona profile context"
  );
}

function discussingBadgeLabel(input: {
  assetReference: PersonaConversationAssetReference;
  resolvedAssetTitle: string | null;
  resolvedGroup: "deployment" | "analysis" | "blueprint" | null;
  chrome?: PersonaConversationChrome | null;
}): string {
  const group =
    input.resolvedGroup ??
    (input.assetReference.kind === "blueprint"
      ? "blueprint"
      : isPersonaAnalysisAssetReferenceKey(input.assetReference.key)
        ? "analysis"
        : "deployment");
  const kindLabel = input.chrome
    ? group === "analysis"
      ? input.chrome.analysisAsset
      : group === "blueprint" || input.assetReference.kind === "blueprint"
        ? input.chrome.strategicBlueprint
        : input.chrome.deploymentAsset
    : describePersonaAssetKind(input.assetReference.kind, group);
  return interpolateTenantMessage(
    input.chrome?.discussing ?? "Discussing: {kind} — {title}",
    {
      kind: kindLabel,
      title: input.resolvedAssetTitle ?? input.assetReference.key,
    },
  );
}

function ThinkingIndicator() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--athena-orange)]/30 border-t-[var(--athena-orange)]"
      aria-hidden="true"
    />
  );
}

function PersonaConversationPanelInner({
  personaId,
  executiveVersionId: executiveVersionIdProp,
  versionState: versionStateProp,
  versionLabel: versionLabelProp,
  assetReference: assetReferenceControlled,
  onAssetReferenceChange,
  open: openControlled,
  onOpenChange,
  chrome = null,
}: PersonaConversationPanelProps) {
  const discussContext = usePersonaDiscussContext();
  const messagesRegionId = useId();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);

  const executiveVersionId =
    discussContext?.executiveVersionId ?? executiveVersionIdProp;
  const versionState = discussContext?.versionState ?? versionStateProp;
  const versionLabel = discussContext?.versionLabel ?? versionLabelProp;

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
  const [assetReferenceUncontrolled, setAssetReferenceUncontrolled] =
    useState<PersonaConversationAssetReference | null>(
      initial?.assetReference ?? null,
    );
  const [resolvedAssetTitle, setResolvedAssetTitle] = useState<string | null>(
    null,
  );
  const [resolvedGroup, setResolvedGroup] = useState<
    "deployment" | "analysis" | "blueprint" | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assetReferenceControlledMode =
    assetReferenceControlled !== undefined || discussContext != null;
  const assetReference = assetReferenceControlledMode
    ? (assetReferenceControlled !== undefined
        ? assetReferenceControlled
        : discussContext?.assetReference ?? null)
    : assetReferenceUncontrolled;

  const open =
    openControlled !== undefined
      ? openControlled
      : discussContext?.open;

  function setAssetReference(next: PersonaConversationAssetReference | null) {
    if (!assetReferenceControlledMode) {
      setAssetReferenceUncontrolled(next);
    }
    onAssetReferenceChange?.(next);
    discussContext?.onAssetReferenceChange(next);
  }

  function handleOpenChange(next: boolean) {
    onOpenChange?.(next);
    discussContext?.onOpenChange(next);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    writePersonaConversationSession(window.sessionStorage, {
      personaId,
      executiveVersionId,
      messages,
      assetReference: assetReference ?? null,
    });
  }, [personaId, executiveVersionId, messages, assetReference]);

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
      assetReference: assetReference ?? null,
      signal: controller.signal,
    });

    if (seq !== requestSeqRef.current) return;

    setBusy(false);
    if (!outcome.ok) {
      if (outcome.failure.kind === "lifecycle_abort") return;
      const fallback = chrome?.transportFailed ?? PERSONA_CONVERSATION_NETWORK_FALLBACK;
      setError(
        outcome.failure.kind === "transport" &&
          outcome.failure.message === PERSONA_CONVERSATION_NETWORK_FALLBACK
          ? fallback
          : outcome.failure.message,
      );
      return;
    }

    setMessages((current) => [
      ...current,
      {
        role: "assistant",
        content: outcome.result.message.content,
      },
    ]);
    if (outcome.result.context.asset) {
      setResolvedAssetTitle(outcome.result.context.asset.title);
      setResolvedGroup(outcome.result.context.asset.group);
      setAssetReference({
        kind: outcome.result.context.asset.kind,
        key: outcome.result.context.asset.key,
      });
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

  function clearChat() {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setResolvedAssetTitle(null);
    setResolvedGroup(null);
    setAssetReference(null);
    if (typeof window !== "undefined") {
      clearPersonaConversationSession(window.sessionStorage, {
        personaId,
        executiveVersionId,
      });
    }
  }

  function clearAssetTarget() {
    setAssetReference(null);
    setResolvedAssetTitle(null);
    setResolvedGroup(null);
  }

  const starterQuestions = chrome
    ? [
        chrome.example1,
        chrome.example2,
        chrome.example3,
        chrome.example4,
        chrome.example5,
        chrome.example6,
      ]
    : STARTER_QUESTIONS;

  const discussingLabel = assetReference
    ? discussingBadgeLabel({
        assetReference,
        resolvedAssetTitle,
        resolvedGroup,
        chrome,
      })
    : null;

  return (
    <div id="persona-conversation" className="scroll-mt-24">
      <AthenaCollapsibleSection
        title={chrome?.title ?? "Ask Athena about this Persona"}
        defaultOpen
        open={open}
        onOpenChange={
          openControlled !== undefined || discussContext != null
            ? handleOpenChange
            : undefined
        }
      >
        <p className="text-sm leading-6 text-white/45">
          {chrome?.intro ??
            "Ask grounded questions about this Persona archetype using the current profile, Notes, Reference Website research, and Current Executive Version when available."}
        </p>
        <p className="mt-2 text-xs uppercase tracking-[0.2em] text-white/35">
          {versionIndicatorCopy({ versionState, versionLabel, chrome })}
        </p>

        <p className="mt-3 text-xs leading-5 text-white/35">
          {chrome?.readOnlyNotice ??
            "Conversation responses do not modify Athena intelligence or assets."}
        </p>

        {discussingLabel ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
            <span>{discussingLabel}</span>
            <button
              type="button"
              onClick={clearAssetTarget}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
            >
              {chrome?.clearTarget ?? "Clear target"}
            </button>
          </div>
        ) : null}

        {versionState === "none" ? (
          <p className="mt-4 text-sm leading-6 text-amber-200/80">
            {chrome?.noneWarning ??
              "Generate Persona intelligence before asking Athena detailed strategic questions. Profile-level questions can still use available source fields."}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {starterQuestions.map((question) => (
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
            <p className="text-sm text-white/40">
              {chrome?.empty ?? "No questions yet."}
            </p>
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
                  {message.role === "user"
                    ? (chrome?.you ?? "You")
                    : (chrome?.athena ?? "Athena")}
                </div>
                {message.content}
              </div>
            ))
          )}
          {busy ? (
            <div className="flex items-center gap-2 text-sm text-white/50">
              <ThinkingIndicator />
              {chrome?.thinking ?? "Athena is thinking…"}
            </div>
          ) : null}
        </div>

        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label htmlFor="persona-conversation-input" className="sr-only">
            {chrome?.inputLabel ?? "Ask Athena about this Persona"}
          </label>
          <textarea
            id="persona-conversation-input"
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            disabled={busy}
            placeholder={
              chrome?.placeholder ?? "Ask Athena about this Persona…"
            }
            className="w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] disabled:opacity-50"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy
                ? (chrome?.sending ?? "Sending…")
                : (chrome?.send ?? "Send")}
            </button>
            <button
              type="button"
              onClick={clearChat}
              disabled={busy || (messages.length === 0 && !assetReference)}
              className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/70 disabled:opacity-40"
            >
              {chrome?.clear ?? "Clear"}
            </button>
          </div>
        </form>
      </AthenaCollapsibleSection>
    </div>
  );
}

export function PersonaConversationPanel(props: PersonaConversationPanelProps) {
  const discussContext = usePersonaDiscussContext();
  const executiveVersionId =
    discussContext?.executiveVersionId ?? props.executiveVersionId;
  return (
    <PersonaConversationPanelInner
      key={`persona-conversation-${props.personaId}-${executiveVersionId ?? "no-version"}`}
      {...props}
    />
  );
}
