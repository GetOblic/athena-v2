"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { IssuedDocumentCardEmail } from "@/components/licensee/clientDocuments/ClientDocumentSendByEmailLink";
import { buildClientDocumentGmailHandoff } from "@/lib/licensee/clientDocumentGmailHandoff";
import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import { clientQuoteBillingFrequencyLabel } from "@/lib/licensee/clientQuoteEditorMessages";
import {
  clientInvoiceDetailPath,
  shouldShowCreateInvoiceAction,
} from "@/lib/licensee/clientInvoiceEditorModel";
import {
  clientQuoteLibraryRow,
  filterClientQuotesForLibrary,
  isClientQuoteLibraryStatusFilter,
  type ClientQuoteInvoiceRelationship,
  type ClientQuoteLibraryPresentationStatus,
  type ClientQuoteLibraryRow,
  type ClientQuoteLibraryStatusFilter,
} from "@/lib/licensee/clientQuoteEditorModel";
import {
  LICENSEE_EMPTY_STATE_CLASS,
  LICENSEE_ERROR_NOTICE_CLASS,
  LICENSEE_FILTER_SELECT_CLASS,
  LICENSEE_PRIMARY_CTA_CLASS,
  LICENSEE_SEARCH_INPUT_CLASS,
  LICENSEE_SUCCESS_CTA_CLASS,
} from "@/lib/licensee/licenseeDashboardPresentation";
import type { PublicClientQuote } from "@/services/clientQuote/clientQuotePublic";

export type ClientQuoteMaskRequestResult = {
  ok: boolean;
  error: string | null;
};

export type ClientQuoteLibraryViewProps = {
  phase: "loading" | "error" | "ready";
  quotes: readonly PublicClientQuote[];
  error: string | null;
  notice?: string | null;
  locale: string;
  messages: LicenseeMessages;
  searchQuery?: string;
  statusFilter?: ClientQuoteLibraryStatusFilter;
  invoiceLinks?: readonly ClientQuoteInvoiceRelationship[];
  createInvoicePendingId?: string | null;
  createInvoiceError?: string | null;
  onRetry: () => void;
  onMask?: (quoteId: string) => Promise<ClientQuoteMaskRequestResult>;
  onCreateInvoice?: (quoteId: string) => void;
};

function libraryStatusLabel(
  status: ClientQuoteLibraryPresentationStatus,
  messages: LicenseeMessages,
): string {
  const copy = messages.clientQuotes;
  if (status === "invoiced") return copy.statusInvoiced;
  if (status === "issued") return copy.statusIssued;
  return copy.statusDraft;
}

function StatusBadge({
  status,
  messages,
}: {
  status: ClientQuoteLibraryPresentationStatus;
  messages: LicenseeMessages;
}) {
  const success = status === "issued" || status === "invoiced";
  return (
    <span
      data-client-quote-status={status}
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${
        success
          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
          : "border-amber-400/30 bg-amber-500/10 text-amber-100"
      }`}
    >
      {libraryStatusLabel(status, messages)}
    </span>
  );
}

export function ClientQuoteMaskDialog({
  row,
  messages,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  row: ClientQuoteLibraryRow;
  messages: LicenseeMessages;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const copy = messages.clientQuotes;
  const statusLabel = libraryStatusLabel(row.presentationStatus, messages);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 py-6 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-quote-mask-title"
        className="w-full max-w-md rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 shadow-2xl shadow-black/40"
        data-client-quote-mask-dialog="true"
      >
        <h2
          id="client-quote-mask-title"
          className="text-xl font-semibold text-white"
        >
          {copy.deleteDialogTitle}
        </h2>
        <p className="mt-3 text-sm leading-6 text-white/55">{copy.deleteDialogBody}</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-white/35">
              {copy.customerLabel}
            </dt>
            <dd className="mt-1 text-white/85">{row.customerName}</dd>
          </div>
          {row.quoteNumber ? (
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-white/35">
                {copy.quoteNumberLabel}
              </dt>
              <dd className="mt-1 text-white/85">{row.quoteNumber}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-white/35">
              {copy.statusLabel}
            </dt>
            <dd className="mt-1 text-white/85" data-client-quote-mask-status={row.presentationStatus}>
              {statusLabel}
            </dd>
          </div>
        </dl>
        {error ? (
          <p className="mt-3 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            data-client-quote-mask-cancel="true"
            className="rounded-xl border border-[var(--athena-border)] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white disabled:opacity-60"
          >
            {messages.common.cancel}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            data-client-quote-mask-confirm="true"
            className="rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-500/25 disabled:opacity-60"
          >
            {pending ? copy.deleting : copy.deleteConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ClientQuoteLibraryView({
  phase,
  quotes,
  error,
  notice = null,
  locale,
  messages,
  searchQuery,
  statusFilter: statusFilterProp,
  invoiceLinks = [],
  createInvoicePendingId = null,
  createInvoiceError = null,
  onRetry,
  onMask,
  onCreateInvoice,
}: ClientQuoteLibraryViewProps) {
  const copy = messages.clientQuotes;
  const [uncontrolledQuery, setUncontrolledQuery] = useState("");
  const [uncontrolledStatus, setUncontrolledStatus] =
    useState<ClientQuoteLibraryStatusFilter>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [masking, setMasking] = useState(false);
  const [maskError, setMaskError] = useState<string | null>(null);
  const query = searchQuery ?? uncontrolledQuery;
  const statusFilter = statusFilterProp ?? uncontrolledStatus;
  const statusLabels = {
    draft: copy.statusDraft,
    issued: copy.statusIssued,
    invoiced: copy.statusInvoiced,
  };
  const emailHandoffById = new Map(
    quotes.map((quote) => [
      quote.id,
      quote.status === "issued" && quote.issuedSnapshot
        ? buildClientDocumentGmailHandoff({
            kind: "quote",
            snapshot: quote.issuedSnapshot,
          })
        : null,
    ]),
  );
  const rows = filterClientQuotesForLibrary(
    quotes,
    query,
    statusLabels,
    statusFilter,
    invoiceLinks,
  ).map((quote) => clientQuoteLibraryRow(quote, locale, invoiceLinks));
  const pending = rows.find((row) => row.id === pendingId) ?? null;
  const searching = query.trim().length > 0;

  function setQuery(next: string) {
    if (searchQuery == null) setUncontrolledQuery(next);
  }

  function setStatus(next: ClientQuoteLibraryStatusFilter) {
    if (statusFilterProp == null) setUncontrolledStatus(next);
  }

  async function confirmMask() {
    if (!pending || masking || !onMask) return;
    setMasking(true);
    setMaskError(null);
    try {
      const result = await onMask(pending.id);
      if (result.ok) {
        setPendingId(null);
        setMaskError(null);
        return;
      }
      if (result.error) setMaskError(result.error);
    } finally {
      setMasking(false);
    }
  }

  return (
    <section data-client-quote-library="true">
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        {copy.eyebrow}
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        {copy.libraryTitle}
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">
        {copy.libraryIntro}
      </p>
      <div className="mt-6">
        <Link
          href="/licensee/client-quotes/templates"
          data-client-quote-manage-templates="true"
          className="inline-flex rounded-full border border-white/15 px-4 py-2.5 text-sm font-medium text-white/80 hover:bg-white/5 hover:text-white"
        >
          {messages.clientQuoteTemplates.manageAction}
        </Link>
      </div>

      {notice ? (
        <p className="mt-6 text-sm text-emerald-100" role="status">
          {notice}
        </p>
      ) : null}

      {phase === "loading" ? (
        <p className="mt-8 text-sm text-white/45" data-client-quote-loading="true">
          {copy.loading}
        </p>
      ) : null}

      {phase === "error" ? (
        <div className={`mt-8 ${LICENSEE_ERROR_NOTICE_CLASS}`} role="alert">
          <p>{error || copy.errors.generic}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
          >
            {messages.common.retry}
          </button>
        </div>
      ) : null}

      {phase === "ready" && quotes.length === 0 ? (
        <div className={`mt-8 ${LICENSEE_EMPTY_STATE_CLASS}`} data-client-quote-empty="true">
          <h2 className="text-xl font-semibold text-white">{copy.emptyTitle}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/50">
            {copy.emptyBody}
          </p>
          <Link href="/licensee/estimate" className={`mt-6 ${LICENSEE_PRIMARY_CTA_CLASS}`}>
            {copy.openEstimates}
          </Link>
        </div>
      ) : null}

      {phase === "ready" && quotes.length > 0 ? (
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full max-w-xl">
            <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-white/45">
              <Search className="h-5 w-5" aria-hidden="true" />
            </div>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              aria-label={copy.searchLabel}
              autoComplete="off"
              data-client-quote-search="true"
              className={LICENSEE_SEARCH_INPUT_CLASS}
            />
          </div>
          <select
            value={statusFilter}
            aria-label={copy.statusFilterLabel}
            data-client-quote-status-filter={statusFilter}
            onChange={(event) => {
              const next = event.target.value;
              if (isClientQuoteLibraryStatusFilter(next)) setStatus(next);
            }}
            className={`${LICENSEE_FILTER_SELECT_CLASS} w-full sm:w-44`}
          >
            <option value="all">{copy.statusAll}</option>
            <option value="draft">{copy.statusDraft}</option>
            <option value="issued">{copy.statusIssued}</option>
            <option value="invoiced">{copy.statusInvoiced}</option>
          </select>
          {searching ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              data-client-quote-search-clear="true"
              className="self-start rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
            >
              {copy.clearSearch}
            </button>
          ) : null}
        </div>
      ) : null}

      {createInvoiceError ? (
        <p className="mt-4 text-sm text-red-300" role="alert" data-create-client-invoice-error="true">
          {createInvoiceError}
        </p>
      ) : null}

      {phase === "ready" && quotes.length > 0 && rows.length === 0 ? (
        <div
          className={`mt-6 ${LICENSEE_EMPTY_STATE_CLASS}`}
          data-client-quote-search-empty={searching ? "true" : undefined}
          data-client-quote-filter-empty={!searching ? "true" : undefined}
        >
          <h2 className="text-xl font-semibold text-white">
            {searching ? copy.searchEmptyTitle : copy.filterEmptyTitle}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/50">
            {searching ? copy.searchEmptyBody : copy.filterEmptyBody}
          </p>
        </div>
      ) : null}

      {phase === "ready" && rows.length > 0 ? (
        <ul className="mt-6 space-y-3">
          {rows.map((row) => (
            <li key={row.id}>
              <article
                data-client-quote-row={row.id}
                className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={row.presentationStatus} messages={messages} />
                      <span className="text-sm font-medium text-white/80">
                        {row.quoteNumber ?? copy.numberPending}
                      </span>
                    </div>
                    <h2 className="mt-3 text-lg font-semibold text-white">
                      {row.projectTitle || copy.untitled}
                    </h2>
                    <dl className="mt-3 grid gap-2 text-sm text-white/55 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs uppercase tracking-[0.14em] text-white/35">
                          {copy.customerLabel}
                        </dt>
                        <dd className="mt-1 text-white/80">{row.customerName}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-[0.14em] text-white/35">
                          {row.dateKind === "issued"
                            ? copy.issuedLabel
                            : copy.createdLabel}
                        </dt>
                        <dd className="mt-1 text-white/80">{row.dateLabel}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="flex flex-row items-end justify-between gap-4 lg:flex-col lg:items-end">
                    <div className="text-right">
                      {row.frequencyAmounts.length > 1 ? (
                        <ul
                          className="space-y-1"
                          data-client-quote-frequency-totals={row.id}
                        >
                          {row.frequencyAmounts.map((amount) => (
                            <li
                              key={amount.billingFrequency}
                              data-client-quote-frequency-amount={`${row.id}:${amount.billingFrequency}`}
                              className="flex items-baseline justify-end gap-3"
                            >
                              <span className="text-xs uppercase tracking-[0.14em] text-white/35">
                                {clientQuoteBillingFrequencyLabel(
                                  messages,
                                  amount.billingFrequency,
                                )}
                              </span>
                              <span className="text-lg font-semibold text-white">
                                {amount.totalLabel}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <>
                          <div className="text-xs uppercase tracking-[0.14em] text-white/35">
                            {copy.totalLabel}
                          </div>
                          <div
                            className="mt-1 text-lg font-semibold text-white"
                            data-client-quote-total={row.id}
                          >
                            {row.totalLabel}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        data-client-quote-delete={row.id}
                        onClick={() => {
                          setMaskError(null);
                          setPendingId(row.id);
                        }}
                        className="inline-flex shrink-0 rounded-full border border-white/15 px-4 py-2.5 text-sm font-medium text-white/70 hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-100"
                      >
                        {copy.deleteAction}
                      </button>
                      {row.presentationStatus === "invoiced" && row.finalizedInvoiceId ? (
                        <Link
                          href={clientInvoiceDetailPath(row.finalizedInvoiceId)}
                          data-view-client-invoice={row.id}
                          className={LICENSEE_SUCCESS_CTA_CLASS}
                        >
                          {copy.viewInvoice}
                        </Link>
                      ) : shouldShowCreateInvoiceAction(row.status) ? (
                        <button
                          type="button"
                          data-create-client-invoice={row.id}
                          data-create-client-invoice-pending={
                            createInvoicePendingId === row.id ? "true" : "false"
                          }
                          disabled={createInvoicePendingId != null}
                          onClick={() => onCreateInvoice?.(row.id)}
                          className={LICENSEE_SUCCESS_CTA_CLASS}
                        >
                          {createInvoicePendingId === row.id
                            ? copy.creatingInvoice
                            : copy.createInvoice}
                        </button>
                      ) : null}
                      {row.presentationStatus === "draft" ? null : (
                        <IssuedDocumentCardEmail
                          handoff={emailHandoffById.get(row.id) ?? null}
                          messages={messages}
                          documentKind="quote"
                        />
                      )}
                      <Link
                        href={`/licensee/client-quotes/${row.id}`}
                        className="inline-flex shrink-0 rounded-full bg-[var(--athena-orange)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
                        data-client-quote-open={row.id}
                      >
                        {copy.openAction}
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : null}

      {pending ? (
        <ClientQuoteMaskDialog
          row={pending}
          messages={messages}
          pending={masking}
          error={maskError}
          onCancel={() => {
            if (masking) return;
            setPendingId(null);
            setMaskError(null);
          }}
          onConfirm={() => void confirmMask()}
        />
      ) : null}
    </section>
  );
}
