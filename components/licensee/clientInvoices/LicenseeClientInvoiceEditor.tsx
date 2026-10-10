"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ClientInvoiceEditorView } from "@/components/licensee/clientInvoices/ClientInvoiceEditorView";
import {
  clientInvoiceIssueBlockers,
  clientInvoiceSaveBlockers,
  clientInvoiceUtcIssueDate,
  editorDraftFromInvoice,
  editorDraftToInvoiceUpdateBody,
  missingClientInvoiceIssueRequirements,
  previewClientInvoiceMoney,
  type ClientInvoiceEditorDraft,
} from "@/lib/licensee/clientInvoiceEditorModel";
import {
  clientInvoiceBlockerMessage,
  clientInvoiceErrorMessage,
} from "@/lib/licensee/clientInvoiceEditorMessages";
import { formatClientQuoteDate, isClientQuoteRouteId } from "@/lib/licensee/clientQuoteEditorModel";
import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import { LICENSEE_ERROR_NOTICE_CLASS } from "@/lib/licensee/licenseeDashboardPresentation";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { PublicClientInvoice } from "@/services/clientInvoice/clientInvoicePublic";
import { organizationLanguageLabel } from "@/services/organizationLanguage";

type InvoiceResponse = {
  ok?: boolean;
  invoice?: PublicClientInvoice;
  error?: { code?: string; message?: string };
};

type PendingAction = "save" | "issue";

export function LicenseeClientInvoiceEditor({
  invoiceId,
  messages,
  locale,
}: {
  invoiceId: string;
  messages: LicenseeMessages;
  locale: string;
}) {
  const copy = messages.clientInvoices;
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<PublicClientInvoice | null>(null);
  const [editor, setEditor] = useState<ClientInvoiceEditorDraft | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmIssueOpen, setConfirmIssueOpen] = useState(false);
  const pendingRef = useRef<PendingAction | null>(null);
  const editorRef = useRef<ClientInvoiceEditorDraft | null>(null);
  const invoiceRef = useRef<PublicClientInvoice | null>(null);

  const applyInvoice = useCallback((next: PublicClientInvoice) => {
    const draft = editorDraftFromInvoice(next);
    invoiceRef.current = next;
    editorRef.current = draft;
    setInvoice(next);
    setEditor(draft);
  }, []);

  const load = useCallback(async () => {
    if (!isClientQuoteRouteId(invoiceId)) {
      setInvoice(null);
      setEditor(null);
      setLoadError(copy.errors.notFound);
      setPhase("error");
      return;
    }
    setPhase("loading");
    setLoadError(null);
    try {
      const response = await fetch(`/api/licensee/invoices/${invoiceId}`, {
        cache: "no-store",
      });
      const payload = await parseJsonResponse<InvoiceResponse>(response);
      if (!response.ok || !payload.ok || !payload.invoice) {
        setLoadError(clientInvoiceErrorMessage(messages, payload.error?.code));
        setPhase("error");
        return;
      }
      applyInvoice(payload.invoice);
      setPhase("ready");
    } catch {
      setLoadError(copy.errors.generic);
      setPhase("error");
    }
  }, [applyInvoice, copy.errors.generic, copy.errors.notFound, invoiceId, messages]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateEditor(next: ClientInvoiceEditorDraft) {
    editorRef.current = next;
    setEditor(next);
    setNotice(null);
  }

  async function persistDraft(): Promise<PublicClientInvoice | null> {
    const current = editorRef.current;
    const currentInvoice = invoiceRef.current;
    if (!current || !currentInvoice || currentInvoice.status !== "draft") return null;
    const blockers = clientInvoiceSaveBlockers(current, currentInvoice.currencyCode);
    if (blockers.length > 0) {
      setNotice(null);
      setError(clientInvoiceBlockerMessage(messages, blockers[0]));
      return null;
    }
    const built = editorDraftToInvoiceUpdateBody(
      current,
      currentInvoice.currencyCode,
      currentInvoice.draft.sourceQuote,
    );
    if (!built.ok) {
      setError(clientInvoiceBlockerMessage(messages, built.blockers[0] ?? "lineItem"));
      return null;
    }
    const response = await fetch(`/api/licensee/invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(built.body),
    });
    const payload = await parseJsonResponse<InvoiceResponse>(response);
    if (!response.ok || !payload.ok || !payload.invoice) {
      setError(clientInvoiceErrorMessage(messages, payload.error?.code));
      return null;
    }
    applyInvoice(payload.invoice);
    return payload.invoice;
  }

  async function saveDraft() {
    if (pendingRef.current) return;
    if (invoiceRef.current?.status !== "draft") return;
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

  function requestIssue() {
    if (pendingRef.current) return;
    const current = editorRef.current;
    const currentInvoice = invoiceRef.current;
    if (!current || !currentInvoice || currentInvoice.status !== "draft") return;
    const blockers = clientInvoiceIssueBlockers(
      current,
      currentInvoice.currencyCode,
      clientInvoiceUtcIssueDate(),
    );
    if (blockers.length > 0) {
      setNotice(null);
      setError(clientInvoiceBlockerMessage(messages, blockers[0]));
      setConfirmIssueOpen(false);
      return;
    }
    setError(null);
    setConfirmIssueOpen(true);
  }

  async function confirmIssue() {
    if (pendingRef.current) return;
    const current = editorRef.current;
    const currentInvoice = invoiceRef.current;
    if (!current || !currentInvoice || currentInvoice.status !== "draft") return;
    pendingRef.current = "issue";
    setPending("issue");
    setError(null);
    setNotice(null);
    try {
      const saved = await persistDraft();
      if (!saved) return;
      const response = await fetch(`/api/licensee/invoices/${invoiceId}/issue`, {
        method: "POST",
      });
      const payload = await parseJsonResponse<InvoiceResponse>(response);
      if (!response.ok || !payload.ok || !payload.invoice) {
        setError(clientInvoiceErrorMessage(messages, payload.error?.code));
        return;
      }
      applyInvoice(payload.invoice);
      setConfirmIssueOpen(false);
      setNotice(copy.invoiceIssued);
    } catch {
      setError(copy.errors.generic);
    } finally {
      pendingRef.current = null;
      setPending(null);
    }
  }

  if (phase === "loading") {
    return <p className="text-sm text-white/45">{copy.loading}</p>;
  }

  if (phase === "error" || !invoice || !editor) {
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

  const issued = invoice.status === "issued";
  const frozen = issued ? invoice.issuedSnapshot : null;
  const preview = issued ? null : previewClientInvoiceMoney(editor, invoice.currencyCode);
  const totals = frozen?.totals ?? (preview?.ok ? preview.preview.totals : null);
  const frequencyTotals = issued
    ? (frozen?.frequencyTotals ?? null)
    : preview?.ok
      ? preview.preview.frequencyTotals
      : null;
  const lineTotalsMinor =
    frozen?.lineItems.map((line) => line.lineTotalMinor) ??
    (preview?.ok ? preview.preview.lineTotalsMinor : null);
  const missing = issued
    ? []
    : missingClientInvoiceIssueRequirements(
        editor,
        invoice.currencyCode,
        clientInvoiceUtcIssueDate(),
      );
  const sourceQuoteNumber =
    frozen?.sourceQuote.quoteNumber ?? invoice.draft.sourceQuote.quoteNumber;

  return (
    <div className="space-y-6">
      <Link href="/licensee/invoices" className="text-sm text-[var(--athena-orange)]">
        {copy.backToLibrary}
      </Link>
      {issued && notice ? (
        <p className="text-sm text-emerald-100" role="status">
          {notice}
        </p>
      ) : null}
      <ClientInvoiceEditorView
        mode={issued ? "issued" : "draft"}
        invoiceId={invoice.id}
        invoiceNumber={invoice.invoiceNumber}
        issueDateLabel={
          invoice.issueDate ? formatClientQuoteDate(invoice.issueDate, locale) : null
        }
        currencyCode={frozen?.currencyCode ?? invoice.currencyCode}
        contentLanguageLabel={organizationLanguageLabel(
          frozen?.contentLanguage ?? invoice.contentLanguage,
        )}
        sourceQuoteId={invoice.sourceQuoteId}
        sourceQuoteNumber={sourceQuoteNumber}
        editor={editor}
        lineTotalsMinor={lineTotalsMinor}
        totals={totals}
        frequencyTotals={frequencyTotals}
        locale={locale}
        messages={messages}
        pending={issued ? null : pending}
        notice={issued ? null : notice}
        error={error}
        missingRequirements={missing}
        issuedSnapshot={frozen}
        confirmIssueOpen={confirmIssueOpen && !issued}
        onChange={updateEditor}
        onSave={() => void saveDraft()}
        onRequestIssue={requestIssue}
        onCancelIssue={() => {
          if (pendingRef.current) return;
          setConfirmIssueOpen(false);
        }}
        onConfirmIssue={() => void confirmIssue()}
      />
    </div>
  );
}
