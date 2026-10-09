"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClientQuoteEditorView } from "@/components/licensee/clientQuotes/ClientQuoteEditorView";
import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import {
  editorDraftFromQuote,
  editorDraftToUpdateBody,
  formatClientQuoteTimestamp,
  isClientQuoteRouteId,
  missingClientQuoteIssueRequirements,
  previewClientQuoteMoney,
  type ClientQuoteEditorDraft,
} from "@/lib/licensee/clientQuoteEditorModel";
import {
  clientQuoteBlockerMessage,
  clientQuoteErrorMessage,
} from "@/lib/licensee/clientQuoteEditorMessages";
import { LICENSEE_ERROR_NOTICE_CLASS } from "@/lib/licensee/licenseeDashboardPresentation";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { PublicClientQuote } from "@/services/clientQuote/clientQuotePublic";

type QuoteResponse = {
  ok?: boolean;
  quote?: PublicClientQuote;
  error?: { code?: string; message?: string };
};

type PendingAction = "save" | "issue" | "revise";

export function LicenseeClientQuoteEditor({
  quoteId,
  messages,
  locale,
}: {
  quoteId: string;
  messages: LicenseeMessages;
  locale: string;
}) {
  const router = useRouter();
  const copy = messages.clientQuotes;
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quote, setQuote] = useState<PublicClientQuote | null>(null);
  const [editor, setEditor] = useState<ClientQuoteEditorDraft | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<PendingAction | null>(null);
  const editorRef = useRef<ClientQuoteEditorDraft | null>(null);
  const quoteRef = useRef<PublicClientQuote | null>(null);

  const applyQuote = useCallback((next: PublicClientQuote) => {
    const draft = editorDraftFromQuote(next);
    quoteRef.current = next;
    editorRef.current = draft;
    setQuote(next);
    setEditor(draft);
  }, []);

  const load = useCallback(async () => {
    if (!isClientQuoteRouteId(quoteId)) {
      setQuote(null);
      setEditor(null);
      setLoadError(copy.errors.notFound);
      setPhase("error");
      return;
    }
    setPhase("loading");
    setLoadError(null);
    try {
      const response = await fetch(`/api/licensee/client-quotes/${quoteId}`, {
        cache: "no-store",
      });
      const payload = await parseJsonResponse<QuoteResponse>(response);
      if (!response.ok || !payload.ok || !payload.quote) {
        setLoadError(clientQuoteErrorMessage(messages, payload.error?.code));
        setPhase("error");
        return;
      }
      applyQuote(payload.quote);
      setPhase("ready");
    } catch {
      setLoadError(copy.errors.generic);
      setPhase("error");
    }
  }, [applyQuote, copy.errors.generic, copy.errors.notFound, messages, quoteId]);

  useEffect(() => {
    pendingRef.current = null;
    setPending(null);
    setNotice(null);
    setError(null);
    void load();
  }, [load]);

  function updateEditor(next: ClientQuoteEditorDraft) {
    if (quoteRef.current?.status === "issued") return;
    editorRef.current = next;
    setEditor(next);
    setNotice(null);
  }

  async function persistDraft(): Promise<PublicClientQuote | null> {
    const currentEditor = editorRef.current;
    const currentQuote = quoteRef.current;
    if (!currentEditor || !currentQuote || currentQuote.status !== "draft") {
      return null;
    }
    const built = editorDraftToUpdateBody(currentEditor, currentQuote.currencyCode);
    if (!built.ok) {
      setError(clientQuoteBlockerMessage(messages, built.blockers[0]));
      return null;
    }
    const response = await fetch(`/api/licensee/client-quotes/${quoteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(built.body),
    });
    const payload = await parseJsonResponse<QuoteResponse>(response);
    if (!response.ok || !payload.ok || !payload.quote) {
      setError(clientQuoteErrorMessage(messages, payload.error?.code));
      return null;
    }
    applyQuote(payload.quote);
    return payload.quote;
  }

  async function saveDraft() {
    if (pendingRef.current) return;
    if (quoteRef.current?.status !== "draft") return;
    pendingRef.current = "save";
    setPending("save");
    setError(null);
    setNotice(null);
    try {
      const saved = await persistDraft();
      if (saved) setNotice(copy.draftSaved);
    } catch {
      setError(copy.errors.generic);
    } finally {
      pendingRef.current = null;
      setPending(null);
    }
  }

  async function issueQuote() {
    if (pendingRef.current) return;
    const current = editorRef.current;
    const currentQuote = quoteRef.current;
    if (!current || !currentQuote || currentQuote.status !== "draft") return;
    const missing = missingClientQuoteIssueRequirements(
      current,
      currentQuote.currencyCode,
    );
    if (missing.length > 0) {
      setNotice(null);
      setError(copy.issueBlocked);
      return;
    }
    pendingRef.current = "issue";
    setPending("issue");
    setError(null);
    setNotice(null);
    try {
      const saved = await persistDraft();
      if (!saved) return;
      const response = await fetch(`/api/licensee/client-quotes/${quoteId}/issue`, {
        method: "POST",
      });
      const payload = await parseJsonResponse<QuoteResponse>(response);
      if (!response.ok || !payload.ok || !payload.quote) {
        setError(clientQuoteErrorMessage(messages, payload.error?.code));
        return;
      }
      applyQuote(payload.quote);
      setNotice(copy.quoteIssued);
    } catch {
      setError(copy.errors.generic);
    } finally {
      pendingRef.current = null;
      setPending(null);
    }
  }

  async function reviseQuote() {
    if (pendingRef.current) return;
    if (quoteRef.current?.status !== "issued") return;
    pendingRef.current = "revise";
    setPending("revise");
    setError(null);
    try {
      const response = await fetch(`/api/licensee/client-quotes/${quoteId}/revise`, {
        method: "POST",
      });
      const payload = await parseJsonResponse<QuoteResponse>(response);
      if (!response.ok || !payload.ok || !payload.quote?.id) {
        pendingRef.current = null;
        setPending(null);
        setError(clientQuoteErrorMessage(messages, payload.error?.code));
        return;
      }
      router.push(`/licensee/client-quotes/${payload.quote.id}`);
    } catch {
      pendingRef.current = null;
      setPending(null);
      setError(copy.errors.generic);
    }
  }

  if (phase === "loading") {
    return <p className="text-sm text-white/45">{copy.loading}</p>;
  }

  if (phase === "error" || !quote || !editor) {
    return (
      <div className={LICENSEE_ERROR_NOTICE_CLASS} role="alert">
        <p>{loadError || copy.errors.generic}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
        >
          {messages.common.retry}
        </button>
      </div>
    );
  }

  const issued = quote.status === "issued";
  const preview = issued
    ? null
    : previewClientQuoteMoney(editor, quote.currencyCode);
  const frozen = issued ? quote.issuedSnapshot : null;
  const totals = frozen?.totals ?? (preview?.ok ? preview.preview.totals : null);
  const lineTotalsMinor =
    frozen?.lineItems.map((line) => line.lineTotalMinor) ??
    (preview?.ok ? preview.preview.lineTotalsMinor : null);
  const missing = issued
    ? []
    : missingClientQuoteIssueRequirements(editor, quote.currencyCode);

  return (
    <div className="space-y-6">
      <Link href="/licensee/client-quotes" className="text-sm text-[var(--athena-orange)]">
        {copy.backToLibrary}
      </Link>
      {issued && error ? (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      <ClientQuoteEditorView
        mode={issued ? "issued" : "draft"}
        quoteNumber={frozen?.quoteNumber ?? quote.quoteNumber}
        issuedAtLabel={formatClientQuoteTimestamp(
          frozen?.issuedAt ?? quote.issuedAt,
          locale,
        )}
        currencyCode={frozen?.currencyCode ?? quote.currencyCode}
        editor={editor}
        lineTotalsMinor={lineTotalsMinor}
        totals={totals}
        locale={locale}
        messages={messages}
        pending={pending}
        notice={issued ? null : notice}
        error={issued ? null : error}
        missingRequirements={missing}
        revisedFromQuoteId={quote.revisedFromQuoteId}
        downloadQuoteId={issued ? quote.id : null}
        onChange={updateEditor}
        onSave={() => void saveDraft()}
        onIssue={() => void issueQuote()}
        onRevise={() => void reviseQuote()}
      />
    </div>
  );
}
