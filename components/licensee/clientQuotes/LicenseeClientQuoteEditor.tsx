"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClientQuoteEditorView } from "@/components/licensee/clientQuotes/ClientQuoteEditorView";
import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import {
  compatibleClientQuoteTemplates,
  decideClientQuoteCurrencyChange,
  editorDraftFromQuote,
  editorDraftToUpdateBody,
  formatClientQuoteTimestamp,
  insertClientQuoteTemplateLine,
  isClientQuoteRouteId,
  missingClientQuoteIssueRequirements,
  previewClientQuoteMoney,
  type ClientQuoteEditorDraft,
} from "@/lib/licensee/clientQuoteEditorModel";
import {
  clientInvoiceDetailPath,
  submitCreateClientInvoice,
} from "@/lib/licensee/clientInvoiceEditorModel";
import { clientInvoiceErrorMessage } from "@/lib/licensee/clientInvoiceEditorMessages";
import {
  clientQuoteBlockerMessage,
  clientQuoteErrorMessage,
} from "@/lib/licensee/clientQuoteEditorMessages";
import { LICENSEE_ERROR_NOTICE_CLASS } from "@/lib/licensee/licenseeDashboardPresentation";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { PublicClientQuote } from "@/services/clientQuote/clientQuotePublic";
import type { PublicClientQuoteTemplate } from "@/services/clientQuote/clientQuoteTemplatePublic";

type QuoteResponse = {
  ok?: boolean;
  quote?: PublicClientQuote;
  error?: { code?: string; message?: string };
};

type PendingAction = "save" | "issue" | "revise";
type TemplatePhase = "loading" | "error" | "ready";

type TemplateListResponse = {
  ok?: boolean;
  templates?: PublicClientQuoteTemplate[];
  error?: { code?: string; message?: string };
};

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
  const [createInvoicePending, setCreateInvoicePending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templatesPhase, setTemplatesPhase] = useState<TemplatePhase>("loading");
  const [templates, setTemplates] = useState<PublicClientQuoteTemplate[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null);
  const pendingRef = useRef<PendingAction | null>(null);
  const createInvoiceLock = useRef(false);
  const editorRef = useRef<ClientQuoteEditorDraft | null>(null);
  const quoteRef = useRef<PublicClientQuote | null>(null);
  const selectedCurrencyRef = useRef<string | null>(null);

  const applyQuote = useCallback((next: PublicClientQuote) => {
    const draft = editorDraftFromQuote(next);
    quoteRef.current = next;
    editorRef.current = draft;
    selectedCurrencyRef.current = next.currencyCode;
    setQuote(next);
    setEditor(draft);
    setSelectedCurrency(next.currencyCode);
    setPendingCurrency(null);
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

  const loadTemplates = useCallback(async () => {
    setTemplatesPhase("loading");
    try {
      const response = await fetch("/api/licensee/client-quote-templates", {
        cache: "no-store",
      });
      const payload = await parseJsonResponse<TemplateListResponse>(response);
      if (!response.ok || !payload.ok || !Array.isArray(payload.templates)) {
        setTemplates([]);
        setTemplatesPhase("error");
        return;
      }
      setTemplates(payload.templates);
      setTemplatesPhase("ready");
    } catch {
      setTemplates([]);
      setTemplatesPhase("error");
    }
  }, []);

  useEffect(() => {
    pendingRef.current = null;
    setPending(null);
    setNotice(null);
    setError(null);
    setTemplatesOpen(false);
    setTemplates([]);
    setTemplatesPhase("loading");
    void load();
  }, [load]);

  function toggleTemplates() {
    if (quoteRef.current?.status !== "draft") return;
    setTemplatesOpen((open) => {
      const next = !open;
      if (next) void loadTemplates();
      return next;
    });
  }

  function insertTemplate(templateId: string) {
    const currentEditor = editorRef.current;
    const currentQuote = quoteRef.current;
    if (!currentEditor || !currentQuote || currentQuote.status !== "draft") return;
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    const next = insertClientQuoteTemplateLine(
      currentEditor,
      template,
      selectedCurrencyRef.current ?? currentQuote.currencyCode,
    );
    if (next === currentEditor) return;
    updateEditor(next);
  }

  function commitCurrency(next: string) {
    selectedCurrencyRef.current = next;
    setSelectedCurrency(next);
    setPendingCurrency(null);
    setNotice(null);
  }

  function requestCurrency(next: string) {
    const currentEditor = editorRef.current;
    const currentQuote = quoteRef.current;
    const currentCurrency = selectedCurrencyRef.current ?? currentQuote?.currencyCode;
    if (!currentEditor || !currentQuote || !currentCurrency || currentQuote.status !== "draft") {
      return;
    }
    const decision = decideClientQuoteCurrencyChange({
      currentCurrency,
      nextCurrency: next,
      editor: currentEditor,
    });
    if (decision.action === "confirm") {
      setPendingCurrency(decision.currencyCode);
      return;
    }
    if (decision.action === "apply") {
      commitCurrency(decision.currencyCode);
    }
  }

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
    const currency = selectedCurrencyRef.current ?? currentQuote.currencyCode;
    const built = editorDraftToUpdateBody(currentEditor, currency, {
      explicitCurrencyCode:
        currency !== currentQuote.currencyCode ? currency : undefined,
    });
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
      selectedCurrencyRef.current ?? currentQuote.currencyCode,
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

  async function createInvoice() {
    if (createInvoiceLock.current || pendingRef.current) return;
    if (quoteRef.current?.status !== "issued") return;
    createInvoiceLock.current = true;
    setCreateInvoicePending(true);
    setError(null);
    let navigating = false;
    try {
      const result = await submitCreateClientInvoice({ quoteId });
      if (!result.ok) {
        setError(
          result.network
            ? messages.clientInvoices.errors.generic
            : clientInvoiceErrorMessage(messages, result.code),
        );
        return;
      }
      navigating = true;
      router.push(clientInvoiceDetailPath(result.invoiceId));
    } finally {
      if (!navigating) {
        createInvoiceLock.current = false;
        setCreateInvoicePending(false);
      }
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
  const activeCurrency = selectedCurrency ?? quote.currencyCode;
  const preview = issued
    ? null
    : previewClientQuoteMoney(editor, activeCurrency);
  const frozen = issued ? quote.issuedSnapshot : null;
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
    : missingClientQuoteIssueRequirements(editor, activeCurrency);

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
        currencyCode={issued ? (frozen?.currencyCode ?? quote.currencyCode) : activeCurrency}
        editor={editor}
        lineTotalsMinor={lineTotalsMinor}
        totals={totals}
        frequencyTotals={frequencyTotals}
        pendingCurrencyCode={issued ? null : pendingCurrency}
        onCurrencyChange={requestCurrency}
        onConfirmCurrencyChange={() => {
          if (pendingCurrency) commitCurrency(pendingCurrency);
        }}
        onCancelCurrencyChange={() => setPendingCurrency(null)}
        templatesOpen={templatesOpen}
        templatesPhase={templatesPhase}
        templateChoices={compatibleClientQuoteTemplates(templates, activeCurrency)}
        onToggleTemplates={toggleTemplates}
        onRetryTemplates={() => void loadTemplates()}
        onInsertTemplate={insertTemplate}
        locale={locale}
        messages={messages}
        pending={pending}
        notice={issued ? null : notice}
        error={issued ? null : error}
        missingRequirements={missing}
        revisedFromQuoteId={quote.revisedFromQuoteId}
        downloadQuoteId={issued ? quote.id : null}
        issuedSnapshot={frozen}
        onChange={updateEditor}
        createInvoicePending={createInvoicePending}
        onSave={() => void saveDraft()}
        onIssue={() => void issueQuote()}
        onRevise={() => void reviseQuote()}
        onCreateInvoice={() => void createInvoice()}
      />
    </div>
  );
}
