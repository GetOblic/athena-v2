"use client";

import { useEffect, useRef, useState } from "react";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import {
  canSaveGetoblicContent,
  canSendGetoblicContent,
  deriveGetoblicContentEditorState,
  getoblicContentMaxChars,
  getoblicContentPersistence,
  initialGetoblicEditorContent,
  type GetoblicContentEditorActivity,
  type GetoblicContentEditorArtifact,
  type GetoblicContentEditorOutcome,
  type GetoblicContentEditorSaved,
} from "@/lib/prospects/getoblicContentEditorState";
import {
  PROSPECT_EDITOR_FIELD_CLASS,
  PROSPECT_PRIMARY_ACTION,
  PROSPECT_STATUS_CHIP_FAILED,
  PROSPECT_STATUS_CHIP_READY,
  PROSPECT_STATUS_CHIP_SAVED,
  PROSPECT_UTILITY_ACTION,
  PROSPECT_UTILITY_CYAN_ACTION,
} from "@/lib/prospects/prospectDetailPresentation";
import { parseJsonResponse } from "@/lib/safeJsonResponse";

const SECTION_CLASS = `rounded-[28px] border border-white/10 bg-[var(--athena-card)] p-6 sm:p-8 ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS}`;

type EditorCopy = TenantMessages["clientProspectIntelligence"]["editor"];

type GetoblicContentEditorProps = {
  surface: "prospect" | "client";
  prospectId?: string;
  artifact: GetoblicContentEditorArtifact;
  saved: GetoblicContentEditorSaved | null;
  historicalSuggestion?: string | null;
  savedReadFailed?: boolean;
  showGenerate?: boolean;
  copy: EditorCopy;
};

type ErrorBody = { code?: string; message?: string };

function draftPath(
  surface: "prospect" | "client",
  artifact: GetoblicContentEditorArtifact,
  prospectId: string,
): string {
  const leaf = artifact === "description" ? "description" : "knowledge-base";
  if (surface === "client") {
    return `/api/client-prospect-intelligence/getoblic-content-draft/${leaf}`;
  }
  return `/api/prospects/${encodeURIComponent(prospectId)}/getoblic-content-draft/${leaf}`;
}

function contentPath(surface: "prospect" | "client", prospectId: string): string {
  if (surface === "client") {
    return "/api/client-prospect-intelligence/getoblic-content";
  }
  return `/api/prospects/${encodeURIComponent(prospectId)}/getoblic-content`;
}

function publicationPath(
  surface: "prospect" | "client",
  artifact: GetoblicContentEditorArtifact,
  prospectId: string,
): string {
  const leaf = artifact === "description" ? "description" : "knowledge-base";
  if (surface === "client") {
    return `/api/client-prospect-intelligence/getoblic-publication/${leaf}`;
  }
  return `/api/prospects/${encodeURIComponent(prospectId)}/getoblic-directory/${leaf}`;
}

function readError(value: unknown): ErrorBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  return error as ErrorBody;
}

export function GetoblicContentEditor({
  surface,
  prospectId = "",
  artifact,
  saved,
  historicalSuggestion = null,
  savedReadFailed = false,
  showGenerate = true,
  copy,
}: GetoblicContentEditorProps) {
  const initial = initialGetoblicEditorContent({
    artifact,
    saved,
    historicalSuggestion,
    savedReadFailed,
  });
  const [text, setText] = useState(initial.text);
  const [baseline, setBaseline] = useState(initial.baseline);
  const [revision, setRevision] = useState<number | null>(initial.revision);
  const [suggestionSeed, setSuggestionSeed] = useState(initial.suggestionSeed);
  const [activity, setActivity] = useState<GetoblicContentEditorActivity>("idle");
  const [outcome, setOutcome] = useState<GetoblicContentEditorOutcome>("ready");
  const [sendStatus, setSendStatus] = useState<"idle" | "sent" | "failed">("idle");
  const [needsReload, setNeedsReload] = useState(savedReadFailed);
  const [errorText, setErrorText] = useState<string | null>(
    savedReadFailed ? copy.savedUnavailable : null,
  );
  const busyRef = useRef(false);
  const maxChars = getoblicContentMaxChars(artifact);
  const trimmed = text.trim();
  const dirty = text !== baseline;
  const showingSuggestion =
    suggestionSeed.length > 0 &&
    revision == null &&
    text === baseline &&
    baseline === suggestionSeed;
  const state = deriveGetoblicContentEditorState({
    activity,
    outcome,
    dirty,
    revision,
    showingSuggestion,
  });
  const persistence = getoblicContentPersistence({
    revision,
    dirty,
    showingSuggestion,
    text,
  });
  const tooLong = trimmed.length > maxChars;
  const canSave = canSaveGetoblicContent({
    activity,
    text,
    maxChars,
    revision,
    dirty,
    needsReload,
  });
  const canGenerate =
    showGenerate && activity === "idle" && !needsReload && Boolean(
      surface === "client" || prospectId.trim(),
    );
  const canSend = canSendGetoblicContent({
    activity,
    revision,
    needsReload,
    blocked: outcome === "conflict" || !(surface === "client" || prospectId.trim()),
  });
  const title = artifact === "description" ? copy.descriptionTitle : copy.knowledgeBaseTitle;
  const help = artifact === "description" ? copy.descriptionHelp : copy.knowledgeBaseHelp;
  const emptyCopy =
    artifact === "description" ? copy.emptyDescription : copy.emptyKnowledgeBase;
  const tooLongCopy =
    artifact === "description" ? copy.descriptionTooLong : copy.knowledgeBaseTooLong;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function clearOutcomeForEdit() {
    setOutcome("ready");
    setErrorText(null);
    setSendStatus("idle");
  }

  async function generate() {
    if (busyRef.current || !canGenerate) return;
    if (dirty) {
      const confirmed = window.confirm(copy.replaceDirtyConfirm);
      if (!confirmed) return;
    }
    busyRef.current = true;
    setActivity("generating");
    setErrorText(null);
    try {
      const response = await fetch(draftPath(surface, artifact, prospectId), {
        method: "POST",
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        artifact?: unknown;
        text?: unknown;
        error?: ErrorBody;
      }>(response);
      if (
        !response.ok ||
        payload.ok !== true ||
        payload.artifact !== artifact ||
        typeof payload.text !== "string" ||
        !payload.text.trim()
      ) {
        setOutcome("error");
        setErrorText(copy.error);
        return;
      }
      setText(payload.text);
      setOutcome("ready");
      setSendStatus("idle");
    } catch {
      setOutcome("error");
      setErrorText(copy.error);
    } finally {
      busyRef.current = false;
      setActivity("idle");
    }
  }

  async function save() {
    if (busyRef.current || !canSave) return;
    busyRef.current = true;
    setActivity("saving");
    setErrorText(null);
    try {
      const response = await fetch(contentPath(surface, prospectId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artifactType: artifact,
          content: trimmed,
          expectedRevision: revision,
        }),
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        revision?: unknown;
        content?: unknown;
        error?: ErrorBody;
      }>(response);
      const error = readError(payload);
      if (response.status === 409 && error?.code === "CONFLICT") {
        setOutcome("conflict");
        setErrorText(copy.conflict);
        return;
      }
      if (
        !response.ok ||
        payload.ok !== true ||
        typeof payload.revision !== "number" ||
        !Number.isInteger(payload.revision) ||
        typeof payload.content !== "string"
      ) {
        setOutcome("error");
        setErrorText(
          error?.code === "CONTENT_TOO_LONG"
            ? tooLongCopy
            : error?.code === "INVALID_CONTENT"
              ? copy.invalidContent
              : copy.error,
        );
        return;
      }
      setText(payload.content);
      setBaseline(payload.content);
      setRevision(payload.revision);
      setSuggestionSeed("");
      setNeedsReload(false);
      setOutcome("ready");
      setSendStatus("idle");
      setErrorText(null);
    } catch {
      setOutcome("error");
      setErrorText(copy.error);
    } finally {
      busyRef.current = false;
      setActivity("idle");
    }
  }

  async function sendSaved() {
    if (busyRef.current || !canSend) return;
    busyRef.current = true;
    setActivity("sending");
    setSendStatus("idle");
    setErrorText(null);
    try {
      const response = await fetch(
        publicationPath(surface, artifact, prospectId),
        { method: "POST", credentials: "same-origin" },
      );
      const payload = await parseJsonResponse<{
        ok?: boolean;
        success?: boolean;
        error?: ErrorBody;
      }>(response);
      if (!response.ok || payload.ok !== true || payload.success !== true) {
        setOutcome("error");
        setSendStatus("failed");
        setErrorText(copy.sendFailed);
        return;
      }
      setOutcome("ready");
      setSendStatus("sent");
      setErrorText(null);
    } catch {
      setOutcome("error");
      setSendStatus("failed");
      setErrorText(copy.sendFailed);
    } finally {
      busyRef.current = false;
      setActivity("idle");
    }
  }

  async function reloadSaved() {
    if (busyRef.current) return;
    if (dirty && !window.confirm(copy.reloadDirtyConfirm)) return;
    busyRef.current = true;
    setActivity("reloading");
    setErrorText(null);
    try {
      const response = await fetch(
        `${contentPath(surface, prospectId)}?artifact=${artifact}`,
        { method: "GET" },
      );
      const payload = await parseJsonResponse<{
        ok?: boolean;
        saved?: { revision?: unknown; content?: unknown } | null;
        error?: ErrorBody;
      }>(response);
      if (!response.ok || payload.ok !== true || !("saved" in payload)) {
        setOutcome("error");
        setErrorText(copy.error);
        return;
      }
      const next = payload.saved;
      if (next == null) {
        setText("");
        setBaseline("");
        setRevision(null);
        setSuggestionSeed("");
      } else if (
        typeof next.revision === "number" &&
        Number.isInteger(next.revision) &&
        next.revision >= 1 &&
        typeof next.content === "string"
      ) {
        setText(next.content);
        setBaseline(next.content);
        setRevision(next.revision);
        setSuggestionSeed("");
      } else {
        setOutcome("error");
        setErrorText(copy.error);
        return;
      }
      setNeedsReload(false);
      setOutcome("ready");
      setErrorText(null);
    } catch {
      setOutcome("error");
      setErrorText(copy.error);
    } finally {
      busyRef.current = false;
      setActivity("idle");
    }
  }

  const statusLabel =
    state === "generating"
      ? copy.generating
        : state === "sending"
          ? copy.sending
        : state === "saving"
          ? activity === "reloading"
            ? copy.reloadSaved
            : copy.saving
        : state === "conflict"
          ? copy.conflict
          : state === "saved"
            ? interpolateTenantMessage(copy.savedRevision, { revision: revision ?? "" })
            : state === "suggestion"
              ? copy.notSaved
              : state === "dirty" || persistence === "draft"
                ? copy.unsavedDraft
                : copy.notSaved;
  const statusClass =
    state === "conflict" || state === "error"
      ? PROSPECT_STATUS_CHIP_FAILED
      : state === "saved"
        ? PROSPECT_STATUS_CHIP_READY
        : PROSPECT_STATUS_CHIP_SAVED;
  const showReload = needsReload || outcome === "conflict" || revision != null;

  return (
    <section
      data-getoblic-content-editor={artifact}
      data-getoblic-content-surface={surface}
      data-getoblic-content-state={state}
      data-getoblic-content-dirty={dirty ? "true" : "false"}
      data-getoblic-content-persistence={persistence}
      data-getoblic-content-revision={revision ?? ""}
      data-getoblic-content-send={activity === "sending" ? "sending" : sendStatus}
      className={SECTION_CLASS}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
            {title}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">{help}</p>
        </div>
        <span className={statusClass}>{statusLabel}</span>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
          {persistence === "saved"
            ? copy.savedContentLabel
            : persistence === "suggestion"
              ? copy.notSaved
              : persistence === "draft"
                ? copy.draftContentLabel
                : copy.notSaved}
        </p>
        <p className="text-xs text-white/40">
          {interpolateTenantMessage(copy.characterCount, {
            count: trimmed.length,
            max: maxChars,
          })}
        </p>
      </div>

      {showingSuggestion ? (
        <p className="mt-3 text-sm leading-6 text-sky-100/80">{copy.historicalSuggestion}</p>
      ) : null}
      {persistence === "empty" ? (
        <p className="mt-3 text-sm leading-6 text-white/50">{emptyCopy}</p>
      ) : null}

      <textarea
        data-getoblic-content-field={artifact}
        value={text}
        rows={artifact === "description" ? 8 : 12}
        disabled={activity !== "idle"}
        onChange={(event) => {
          setText(event.target.value);
          if (activity === "idle") clearOutcomeForEdit();
        }}
        className={`mt-4 min-h-40 ${PROSPECT_EDITOR_FIELD_CLASS}`}
      />

      {tooLong ? (
        <p className="mt-3 text-sm leading-6 text-rose-200/85" role="alert">
          {tooLongCopy}
        </p>
      ) : null}
      {errorText ? (
        <p className="mt-3 text-sm leading-6 text-rose-200/85" role="alert">
          {errorText}
        </p>
      ) : null}

      {revision != null && dirty ? (
        <p
          className="mt-3 text-sm leading-6 text-amber-100/85"
          data-getoblic-content-send-warning="saved-revision"
        >
          {copy.sendPublishesSaved}
        </p>
      ) : null}
      {revision == null && activity === "idle" ? (
        <p className="mt-3 text-sm leading-6 text-white/50" data-getoblic-content-send-warning="unsaved">
          {copy.sendRequiresSaved}
        </p>
      ) : null}
      {sendStatus === "sent" ? (
        <p className="mt-3 text-sm leading-6 text-emerald-100/85" data-getoblic-content-send="sent">
          {copy.sent}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        {showGenerate ? (
          <button
            type="button"
            data-getoblic-content-action="generate"
            onClick={() => void generate()}
            disabled={!canGenerate}
            className={PROSPECT_UTILITY_CYAN_ACTION}
          >
            {activity === "generating"
              ? copy.generating
              : trimmed
                ? copy.regenerate
                : copy.generate}
          </button>
        ) : null}
        <button
          type="button"
          data-getoblic-content-action="save"
          onClick={() => void save()}
          disabled={!canSave}
          className={PROSPECT_PRIMARY_ACTION}
        >
          {activity === "saving" ? copy.saving : state === "saved" ? copy.saved : copy.save}
        </button>
        <button
          type="button"
          data-getoblic-content-action="send"
          onClick={() => void sendSaved()}
          disabled={!canSend}
          aria-busy={activity === "sending"}
          title={revision == null ? copy.sendRequiresSaved : undefined}
          className={PROSPECT_UTILITY_CYAN_ACTION}
        >
          {activity === "sending"
            ? copy.sending
            : artifact === "description"
              ? copy.sendDescription
              : copy.sendKnowledgeBase}
        </button>
        {showReload ? (
          <button
            type="button"
            data-getoblic-content-action="reload"
            onClick={() => void reloadSaved()}
            disabled={activity !== "idle"}
            className={PROSPECT_UTILITY_ACTION}
          >
            {copy.reloadSaved}
          </button>
        ) : null}
      </div>
    </section>
  );
}
