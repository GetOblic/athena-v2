"use client";

import { useEffect, useRef, useState } from "react";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import type { PublicAthenaEstimateDeliveryEmail } from "@/services/estimate/athenaEstimatePublic";
import {
  ORGANIZATION_LANGUAGES,
  type OrganizationLanguage,
} from "@/services/organizationLanguage";

/** Same bounds as the server delivery-email edit contract. */
const SUGGESTED_EMAIL_SUBJECT_MAX_CHARS = 120;
const SUGGESTED_EMAIL_BODY_MAX_CHARS = 2_000;

type EstimateMessages = LicenseeMessages["estimate"];

type SaveResponse = {
  ok?: boolean;
  deliveryEmail?: unknown;
  error?: { code?: string; message?: string };
};

type EmailSnapshot = {
  present: boolean;
  subject: string;
  body: string;
  language: OrganizationLanguage | null;
  edited: boolean;
};

export function shouldRenderSuggestedEmailSection(input: {
  status: string | null | undefined;
  hasPackage: boolean;
  detailPending: boolean;
}): boolean {
  if (input.detailPending || !input.hasPackage) return false;
  return input.status === "Ready";
}

/** Clipboard payload for Copy All. The "Subject:" label is the specified paste format. */
export function formatSuggestedEmailCopyAll(subject: string, body: string): string {
  return `Subject: ${subject}\n\n${body}`;
}

function clampSubject(value: string): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .slice(0, SUGGESTED_EMAIL_SUBJECT_MAX_CHARS);
}

function clampBody(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .slice(0, SUGGESTED_EMAIL_BODY_MAX_CHARS);
}

function snapshotFrom(
  email: PublicAthenaEstimateDeliveryEmail | null,
): EmailSnapshot {
  if (!email) {
    return {
      present: false,
      subject: "",
      body: "",
      language: null,
      edited: false,
    };
  }
  return {
    present: true,
    subject: email.subject,
    body: email.body,
    language: email.language,
    edited: email.edited,
  };
}

function readSavedEmail(
  value: unknown,
): PublicAthenaEstimateDeliveryEmail | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.subject !== "string" || typeof raw.body !== "string") return null;
  if (typeof raw.edited !== "boolean") return null;
  if (typeof raw.language !== "string") return null;
  const language = raw.language.trim().toLowerCase();
  if (!ORGANIZATION_LANGUAGES.includes(language as OrganizationLanguage)) {
    return null;
  }
  return {
    subject: raw.subject,
    body: raw.body,
    language: language as OrganizationLanguage,
    edited: raw.edited,
  };
}

function snapshotsMatch(left: EmailSnapshot, right: EmailSnapshot): boolean {
  return (
    left.present === right.present &&
    left.subject === right.subject &&
    left.body === right.body &&
    left.language === right.language &&
    left.edited === right.edited
  );
}

type EstimateSuggestedEmailSectionProps = {
  estimateId: string;
  deliveryEmail: PublicAthenaEstimateDeliveryEmail | null;
  messages: EstimateMessages;
  onSaved?: (
    estimateId: string,
    deliveryEmail: PublicAthenaEstimateDeliveryEmail,
  ) => void;
};

export function EstimateSuggestedEmailSection({
  estimateId,
  deliveryEmail,
  messages,
  onSaved,
}: EstimateSuggestedEmailSectionProps) {
  const [sessionEstimateId, setSessionEstimateId] = useState(estimateId);
  const [snapshot, setSnapshot] = useState(() => snapshotFrom(deliveryEmail));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [copyNotice, setCopyNotice] = useState(false);
  const serverRef = useRef(snapshot);
  const snapshotRef = useRef(snapshot);
  const estimateIdRef = useRef(estimateId);
  const savingRef = useRef(false);
  const copyTimerRef = useRef<number | null>(null);

  estimateIdRef.current = estimateId;
  snapshotRef.current = snapshot;

  if (sessionEstimateId !== estimateId) {
    const next = snapshotFrom(deliveryEmail);
    serverRef.current = next;
    savingRef.current = false;
    setSessionEstimateId(estimateId);
    setSnapshot(next);
    setSaveState("idle");
    setCopyNotice(false);
  }

  useEffect(() => {
    return () => {
      if (copyTimerRef.current != null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, [estimateId]);

  useEffect(() => {
    if (savingRef.current) return;
    if (estimateIdRef.current !== estimateId) return;
    const incoming = snapshotFrom(deliveryEmail);
    const baseline = serverRef.current;
    const current = snapshotRef.current;
    const dirty =
      current.subject !== baseline.subject || current.body !== baseline.body;
    if (dirty || snapshotsMatch(incoming, baseline)) return;
    serverRef.current = incoming;
    setSnapshot(incoming);
  }, [deliveryEmail, estimateId]);

  function updateDraft(next: Pick<EmailSnapshot, "subject" | "body">) {
    setSnapshot((prev) => ({ ...prev, ...next }));
    setSaveState((prev) => (prev === "saving" ? prev : "idle"));
  }

  async function copyText(kind: "subject" | "body" | "all") {
    const requestEstimateId = estimateIdRef.current;
    const current = snapshotRef.current;
    const text =
      kind === "subject"
        ? current.subject
        : kind === "body"
          ? current.body
          : formatSuggestedEmailCopyAll(current.subject, current.body);
    try {
      if (!navigator.clipboard?.writeText) return;
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    if (estimateIdRef.current !== requestEstimateId) return;
    setCopyNotice(true);
    if (copyTimerRef.current != null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopyNotice(false);
    }, 2000);
  }

  async function saveChanges() {
    if (savingRef.current || !snapshotRef.current.present) return;
    const requestEstimateId = estimateIdRef.current;
    const sentSubject = snapshotRef.current.subject;
    const sentBody = snapshotRef.current.body;
    savingRef.current = true;
    setSaveState("saving");
    try {
      const response = await fetch(
        `/api/licensee/estimate/${requestEstimateId}/delivery-email`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ subject: sentSubject, body: sentBody }),
        },
      );
      const payload = await parseJsonResponse<SaveResponse>(response);
      if (estimateIdRef.current !== requestEstimateId) return;
      const saved = response.ok && payload.ok ? readSavedEmail(payload.deliveryEmail) : null;
      if (!saved) {
        setSaveState("error");
        return;
      }
      const current = snapshotRef.current;
      if (current.subject !== sentSubject || current.body !== sentBody) {
        setSaveState("idle");
        return;
      }
      const next = snapshotFrom(saved);
      serverRef.current = next;
      setSnapshot(next);
      setSaveState("saved");
      onSaved?.(requestEstimateId, saved);
    } catch {
      if (estimateIdRef.current !== requestEstimateId) return;
      setSaveState("error");
    } finally {
      if (estimateIdRef.current === requestEstimateId) {
        savingRef.current = false;
      }
    }
  }

  return (
    <article
      className="rounded-2xl border border-white/10 bg-black/20 px-5 py-5"
      data-estimate-suggested-email={snapshot.present ? "ready" : "empty"}
      data-estimate-suggested-email-language={snapshot.language ?? ""}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--athena-orange)]">
          {messages.suggestedEmailTitle}
        </h3>
        {snapshot.present && snapshot.edited ? (
          <span
            className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-white/70"
            data-estimate-suggested-email-edited="true"
          >
            {messages.suggestedEmailEdited}
          </span>
        ) : null}
      </div>

      {snapshot.present ? (
        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="suggested-email-subject"
              className="block text-sm font-medium text-white/80"
            >
              {messages.suggestedEmailSubject}
            </label>
            <input
              id="suggested-email-subject"
              type="text"
              value={snapshot.subject}
              maxLength={SUGGESTED_EMAIL_SUBJECT_MAX_CHARS}
              autoComplete="off"
              onChange={(event) =>
                updateDraft({
                  subject: clampSubject(event.target.value),
                  body: snapshot.body,
                })
              }
              className="mt-2 w-full rounded-2xl border border-white/20 bg-[#161922] px-4 py-3 text-sm text-white outline-none focus:border-[var(--athena-orange)] focus:ring-2 focus:ring-[var(--athena-orange)]/30"
            />
            <p className="mt-1 text-xs text-white/35">
              {snapshot.subject.length}/{SUGGESTED_EMAIL_SUBJECT_MAX_CHARS}
            </p>
          </div>

          <div>
            <label
              htmlFor="suggested-email-body"
              className="block text-sm font-medium text-white/80"
            >
              {messages.suggestedEmailBody}
            </label>
            <textarea
              id="suggested-email-body"
              rows={10}
              value={snapshot.body}
              maxLength={SUGGESTED_EMAIL_BODY_MAX_CHARS}
              onChange={(event) =>
                updateDraft({
                  subject: snapshot.subject,
                  body: clampBody(event.target.value),
                })
              }
              className="mt-2 w-full rounded-2xl border border-white/20 bg-[#161922] px-4 py-3 text-sm leading-6 text-white outline-none focus:border-[var(--athena-orange)] focus:ring-2 focus:ring-[var(--athena-orange)]/30"
            />
            <p className="mt-1 text-xs text-white/35">
              {snapshot.body.length}/{SUGGESTED_EMAIL_BODY_MAX_CHARS}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copyText("subject")}
              data-estimate-suggested-email-copy="subject"
              className="inline-flex rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
            >
              {messages.suggestedEmailCopySubject}
            </button>
            <button
              type="button"
              onClick={() => void copyText("body")}
              data-estimate-suggested-email-copy="body"
              className="inline-flex rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
            >
              {messages.suggestedEmailCopyBody}
            </button>
            <button
              type="button"
              onClick={() => void copyText("all")}
              data-estimate-suggested-email-copy="all"
              className="inline-flex rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
            >
              {messages.suggestedEmailCopyAll}
            </button>
            <button
              type="button"
              onClick={() => void saveChanges()}
              disabled={saveState === "saving"}
              data-estimate-suggested-email-save="true"
              className="inline-flex rounded-full bg-[var(--athena-orange)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saveState === "saving"
                ? messages.suggestedEmailSaving
                : messages.suggestedEmailSave}
            </button>
          </div>

          {copyNotice ? (
            <p
              role="status"
              data-estimate-suggested-email-status="copied"
              className="text-sm text-white/70"
            >
              {messages.suggestedEmailCopied}
            </p>
          ) : null}
          {saveState === "saving" ? (
            <p
              role="status"
              data-estimate-suggested-email-status="saving"
              className="text-sm text-white/55"
            >
              {messages.suggestedEmailSaving}
            </p>
          ) : null}
          {saveState === "saved" ? (
            <p
              role="status"
              data-estimate-suggested-email-status="saved"
              className="text-sm text-emerald-100/80"
            >
              {messages.suggestedEmailSaved}
            </p>
          ) : null}
          {saveState === "error" ? (
            <p
              role="alert"
              data-estimate-suggested-email-status="error"
              className="text-sm text-red-300"
            >
              {messages.suggestedEmailSaveError}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-white/55">
          {messages.suggestedEmailEmpty}
        </p>
      )}
    </article>
  );
}
