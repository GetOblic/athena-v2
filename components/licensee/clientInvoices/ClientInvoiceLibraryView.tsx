"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { IssuedDocumentCardEmail } from "@/components/licensee/clientDocuments/ClientDocumentSendByEmailLink";
import { ClientInvoicePdfDownloadButton } from "@/components/licensee/clientInvoices/ClientInvoicePdfDownloadButton";
import { buildClientDocumentGmailHandoff } from "@/lib/licensee/clientDocumentGmailHandoff";
import {
  clientInvoiceDetailPath,
  clientInvoiceLibraryRow,
  filterClientInvoicesForLibrary,
  isClientInvoiceLibraryStatusFilter,
  type ClientInvoiceLibraryStatusFilter,
} from "@/lib/licensee/clientInvoiceEditorModel";
import { clientQuoteBillingFrequencyLabel } from "@/lib/licensee/clientQuoteEditorMessages";
import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import {
  LICENSEE_EMPTY_STATE_CLASS,
  LICENSEE_ERROR_NOTICE_CLASS,
  LICENSEE_FILTER_SELECT_CLASS,
  LICENSEE_SEARCH_INPUT_CLASS,
} from "@/lib/licensee/licenseeDashboardPresentation";
import type { PublicClientInvoice } from "@/services/clientInvoice/clientInvoicePublic";

export type ClientInvoiceLibraryViewProps = {
  phase: "loading" | "error" | "ready";
  invoices: readonly PublicClientInvoice[];
  error: string | null;
  locale: string;
  messages: LicenseeMessages;
  searchQuery?: string;
  statusFilter?: ClientInvoiceLibraryStatusFilter;
  onRetry: () => void;
};

function StatusBadge({
  status,
  messages,
}: {
  status: PublicClientInvoice["status"];
  messages: LicenseeMessages;
}) {
  const copy = messages.clientInvoices;
  const issued = status === "issued";
  return (
    <span
      data-client-invoice-status={status}
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${
        issued
          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
          : "border-amber-400/30 bg-amber-500/10 text-amber-100"
      }`}
    >
      {issued ? copy.statusIssued : copy.statusDraft}
    </span>
  );
}

export function ClientInvoiceLibraryView({
  phase,
  invoices,
  error,
  locale,
  messages,
  searchQuery,
  statusFilter: statusFilterProp,
  onRetry,
}: ClientInvoiceLibraryViewProps) {
  const copy = messages.clientInvoices;
  const [uncontrolledQuery, setUncontrolledQuery] = useState("");
  const [uncontrolledStatus, setUncontrolledStatus] =
    useState<ClientInvoiceLibraryStatusFilter>("all");
  const query = searchQuery ?? uncontrolledQuery;
  const statusFilter = statusFilterProp ?? uncontrolledStatus;
  const statusLabels = { draft: copy.statusDraft, issued: copy.statusIssued };
  const emailHandoffById = new Map(
    invoices.map((invoice) => [
      invoice.id,
      invoice.status === "issued" && invoice.issuedSnapshot
        ? buildClientDocumentGmailHandoff({
            kind: "invoice",
            snapshot: invoice.issuedSnapshot,
          })
        : null,
    ]),
  );
  const rows = filterClientInvoicesForLibrary(
    invoices,
    query,
    statusLabels,
    statusFilter,
  ).map((invoice) => clientInvoiceLibraryRow(invoice, locale));
  const searching = query.trim().length > 0;

  function setQuery(next: string) {
    if (searchQuery == null) setUncontrolledQuery(next);
  }

  function setStatus(next: ClientInvoiceLibraryStatusFilter) {
    if (statusFilterProp == null) setUncontrolledStatus(next);
  }

  return (
    <section data-client-invoice-library="true">
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        {copy.eyebrow}
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{copy.libraryTitle}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">{copy.libraryIntro}</p>

      {phase === "loading" ? (
        <p className="mt-8 text-sm text-white/45" data-client-invoice-loading="true">
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

      {phase === "ready" && invoices.length === 0 ? (
        <div className={`mt-8 ${LICENSEE_EMPTY_STATE_CLASS}`} data-client-invoice-empty="true">
          <h2 className="text-xl font-semibold text-white">{copy.emptyTitle}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/50">
            {copy.emptyBody}
          </p>
          <Link
            href="/licensee/client-quotes"
            className="mt-6 inline-flex rounded-full bg-[var(--athena-orange)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            {copy.openQuotes}
          </Link>
        </div>
      ) : null}

      {phase === "ready" && invoices.length > 0 ? (
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
              data-client-invoice-search="true"
              className={LICENSEE_SEARCH_INPUT_CLASS}
            />
          </div>
          <select
            value={statusFilter}
            aria-label={copy.statusFilterLabel}
            data-client-invoice-status-filter={statusFilter}
            onChange={(event) => {
              const next = event.target.value;
              if (isClientInvoiceLibraryStatusFilter(next)) setStatus(next);
            }}
            className={`${LICENSEE_FILTER_SELECT_CLASS} w-full sm:w-44`}
          >
            <option value="all">{copy.statusAll}</option>
            <option value="draft">{copy.statusDraft}</option>
            <option value="issued">{copy.statusIssued}</option>
          </select>
          {searching ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              data-client-invoice-search-clear="true"
              className="self-start rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
            >
              {copy.clearSearch}
            </button>
          ) : null}
        </div>
      ) : null}

      {phase === "ready" && invoices.length > 0 && rows.length === 0 ? (
        <div
          className={`mt-6 ${LICENSEE_EMPTY_STATE_CLASS}`}
          data-client-invoice-search-empty={searching ? "true" : undefined}
          data-client-invoice-filter-empty={!searching ? "true" : undefined}
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
                data-client-invoice-row={row.id}
                className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={row.status} messages={messages} />
                      <span className="text-sm font-medium text-white/80">
                        {row.invoiceNumber ?? copy.numberPending}
                      </span>
                      <span className="text-xs uppercase tracking-[0.14em] text-white/35">
                        {row.currencyCode}
                      </span>
                    </div>
                    <h2 className="mt-3 text-lg font-semibold text-white">
                      {row.projectTitle || copy.untitled}
                    </h2>
                    {row.scopeSummary ? (
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/50">
                        {row.scopeSummary}
                      </p>
                    ) : null}
                    <dl className="mt-3 grid gap-2 text-sm text-white/55 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs uppercase tracking-[0.14em] text-white/35">
                          {copy.customerLabel}
                        </dt>
                        <dd className="mt-1 text-white/80">{row.customerName}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-[0.14em] text-white/35">
                          {row.dateKind === "issued" ? copy.issuedLabel : copy.createdLabel}
                        </dt>
                        <dd className="mt-1 text-white/80">{row.dateLabel}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="flex flex-row items-end justify-between gap-4 lg:flex-col lg:items-end">
                    <div className="text-right">
                      {row.frequencyAmounts.length > 1 ? (
                        <ul className="space-y-1" data-client-invoice-frequency-totals={row.id}>
                          {row.frequencyAmounts.map((amount) => (
                            <li
                              key={amount.billingFrequency}
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
                            data-client-invoice-total={row.id}
                          >
                            {row.totalLabel}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {row.canDownloadPdf ? (
                        <ClientInvoicePdfDownloadButton
                          invoiceId={row.id}
                          messages={messages}
                        />
                      ) : null}
                      {row.status === "issued" ? (
                        <IssuedDocumentCardEmail
                          handoff={emailHandoffById.get(row.id) ?? null}
                          messages={messages}
                          documentKind="invoice"
                        />
                      ) : null}
                      <Link
                        href={clientInvoiceDetailPath(row.id)}
                        className="inline-flex shrink-0 rounded-full bg-[var(--athena-orange)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
                        data-client-invoice-open={row.id}
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
    </section>
  );
}
