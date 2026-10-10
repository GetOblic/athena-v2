"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ClientDocumentSendByEmailLink } from "@/components/licensee/clientDocuments/ClientDocumentSendByEmailLink";
import { ClientInvoicePdfDownloadButton } from "@/components/licensee/clientInvoices/ClientInvoicePdfDownloadButton";
import {
  buildClientDocumentGmailHandoff,
  type ClientInvoiceGmailSnapshot,
} from "@/lib/licensee/clientDocumentGmailHandoff";
import {
  CLIENT_INVOICE_ISSUE_REQUIREMENTS,
  type ClientInvoiceEditorDraft,
  type ClientInvoiceIssueRequirement,
} from "@/lib/licensee/clientInvoiceEditorModel";
import { clientQuoteBillingFrequencyLabel } from "@/lib/licensee/clientQuoteEditorMessages";
import {
  addClientQuoteLine,
  clientQuoteFrequencyGroupsForDisplay,
  clientQuoteHasMixedBillingFrequency,
  formatClientQuoteDate,
  formatClientQuoteMinorAmount,
  moveClientQuoteLineAt,
  removeClientQuoteLineAt,
  setClientQuoteDiscountKind,
  setClientQuoteLineBillingFrequency,
  setClientQuoteTaxKind,
  type ClientQuoteEditorDraft,
  type ClientQuoteIssuerEdit,
  type ClientQuotePostalAddressEdit,
} from "@/lib/licensee/clientQuoteEditorModel";
import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import { CLIENT_INVOICE_FIELD_LIMITS } from "@/services/clientInvoice/clientInvoiceTypes";
import {
  CLIENT_QUOTE_BILLING_FREQUENCIES,
  CLIENT_QUOTE_FIELD_LIMITS,
  isClientQuoteBillingFrequency,
  type ClientQuoteFrequencyTotals,
  type ClientQuoteTotals,
} from "@/services/clientQuote/clientQuoteTypes";

const FIELD_CLASS =
  "w-full rounded-2xl border border-white/20 bg-[#161922] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[var(--athena-orange)] focus:ring-2 focus:ring-[var(--athena-orange)]/30";
const LABEL_CLASS =
  "mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-white/45";
const SECTION_CLASS =
  "rounded-[28px] border border-white/10 bg-[var(--athena-card)] p-5 md:p-7";

export type ClientInvoiceEditorViewProps = {
  mode: "draft" | "issued";
  invoiceId: string;
  invoiceNumber: string | null;
  issueDateLabel: string | null;
  currencyCode: string;
  contentLanguageLabel: string;
  sourceQuoteId: string;
  sourceQuoteNumber: string;
  editor: ClientInvoiceEditorDraft;
  lineTotalsMinor: number[] | null;
  totals: ClientQuoteTotals | null;
  frequencyTotals?: readonly ClientQuoteFrequencyTotals[] | null;
  locale: string;
  messages: LicenseeMessages;
  pending: "save" | "issue" | null;
  notice: string | null;
  error: string | null;
  missingRequirements: readonly ClientInvoiceIssueRequirement[];
  /** Frozen issued snapshot. Draft invoices do not receive one. */
  issuedSnapshot?: ClientInvoiceGmailSnapshot | null;
  confirmIssueOpen: boolean;
  onChange: (editor: ClientInvoiceEditorDraft) => void;
  onSave: () => void;
  onRequestIssue: () => void;
  onCancelIssue: () => void;
  onConfirmIssue: () => void;
};

function FieldShell({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className={LABEL_CLASS}>{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-white/35">{hint}</span> : null}
    </label>
  );
}

function TextControl({
  label,
  value,
  readOnly,
  field,
  onChange,
  maxLength,
  hint,
}: {
  label: string;
  value: string;
  readOnly: boolean;
  field: string;
  onChange: (value: string) => void;
  maxLength?: number;
  hint?: string;
}) {
  if (readOnly) {
    return (
      <div>
        <div className={LABEL_CLASS}>{label}</div>
        <p className="text-sm leading-6 text-white" data-field={field}>
          {value.trim() ? value : "—"}
        </p>
      </div>
    );
  }
  return (
    <FieldShell label={label} hint={hint}>
      <input
        data-field={field}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className={FIELD_CLASS}
      />
    </FieldShell>
  );
}

function AreaControl({
  label,
  value,
  readOnly,
  field,
  onChange,
  maxLength,
  rows = 4,
  hint,
}: {
  label: string;
  value: string;
  readOnly: boolean;
  field: string;
  onChange: (value: string) => void;
  maxLength?: number;
  rows?: number;
  hint?: string;
}) {
  if (readOnly) {
    return (
      <div>
        <div className={LABEL_CLASS}>{label}</div>
        <p className="whitespace-pre-wrap text-sm leading-6 text-white" data-field={field}>
          {value.trim() ? value : "—"}
        </p>
      </div>
    );
  }
  return (
    <FieldShell label={label} hint={hint}>
      <textarea
        data-field={field}
        value={value}
        rows={rows}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className={FIELD_CLASS}
      />
    </FieldShell>
  );
}

function MoneyRow({
  label,
  value,
  emphasize = false,
  field,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  field?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={emphasize ? "text-sm font-semibold text-white" : "text-sm text-white/55"}>
        {label}
      </dt>
      <dd
        data-field={field}
        className={emphasize ? "text-lg font-semibold text-white" : "text-sm text-white"}
      >
        {value}
      </dd>
    </div>
  );
}

function requirementLabel(
  id: ClientInvoiceIssueRequirement,
  messages: LicenseeMessages,
): string {
  const quotes = messages.clientQuotes;
  const invoices = messages.clientInvoices;
  switch (id) {
    case "issuerLegalName":
      return quotes.missingIssuerLegalName;
    case "customerName":
      return quotes.missingCustomerName;
    case "projectTitle":
      return quotes.missingProjectTitle;
    case "scopeSummary":
      return quotes.missingScope;
    case "lineItem":
      return quotes.missingLine;
    case "paymentTerms":
      return quotes.missingPayment;
    case "paymentDueDate":
      return invoices.missingPaymentDueDate;
  }
}

function AddressFields({
  prefix,
  address,
  readOnly,
  messages,
  onChange,
}: {
  prefix: string;
  address: ClientQuotePostalAddressEdit;
  readOnly: boolean;
  messages: LicenseeMessages;
  onChange: (address: ClientQuotePostalAddressEdit) => void;
}) {
  const copy = messages.clientQuotes;
  const limits = CLIENT_QUOTE_FIELD_LIMITS;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TextControl
        label={copy.addressLine1}
        value={address.line1}
        readOnly={readOnly}
        field={`${prefix}.line1`}
        maxLength={limits.addressLine}
        onChange={(line1) => onChange({ ...address, line1 })}
      />
      <TextControl
        label={copy.addressLine2}
        value={address.line2}
        readOnly={readOnly}
        field={`${prefix}.line2`}
        maxLength={limits.addressLine}
        onChange={(line2) => onChange({ ...address, line2 })}
      />
      <TextControl
        label={copy.city}
        value={address.city}
        readOnly={readOnly}
        field={`${prefix}.city`}
        maxLength={limits.city}
        onChange={(city) => onChange({ ...address, city })}
      />
      <TextControl
        label={copy.region}
        value={address.region}
        readOnly={readOnly}
        field={`${prefix}.region`}
        maxLength={limits.region}
        onChange={(region) => onChange({ ...address, region })}
      />
      <TextControl
        label={copy.postalCode}
        value={address.postalCode}
        readOnly={readOnly}
        field={`${prefix}.postalCode`}
        maxLength={limits.postalCode}
        onChange={(postalCode) => onChange({ ...address, postalCode })}
      />
      <TextControl
        label={copy.country}
        value={address.country}
        readOnly={readOnly}
        field={`${prefix}.country`}
        maxLength={limits.country}
        onChange={(country) => onChange({ ...address, country })}
      />
    </div>
  );
}

export function ClientInvoiceEditorView({
  mode,
  invoiceId,
  invoiceNumber,
  issueDateLabel,
  currencyCode,
  contentLanguageLabel,
  sourceQuoteId,
  sourceQuoteNumber,
  editor,
  lineTotalsMinor,
  totals,
  frequencyTotals = null,
  locale,
  messages,
  pending,
  notice,
  error,
  missingRequirements,
  issuedSnapshot = null,
  confirmIssueOpen,
  onChange,
  onSave,
  onRequestIssue,
  onCancelIssue,
  onConfirmIssue,
}: ClientInvoiceEditorViewProps) {
  const quotes = messages.clientQuotes;
  const copy = messages.clientInvoices;
  const readOnly = mode === "issued";
  const emailHandoff =
    readOnly && issuedSnapshot
      ? buildClientDocumentGmailHandoff({
          kind: "invoice",
          snapshot: issuedSnapshot,
        })
      : null;
  const busy = pending !== null;
  const missing = new Set(missingRequirements);
  const commercial = editor.commercial;
  const mixedFrequency = clientQuoteHasMixedBillingFrequency(commercial);
  const frequencyGroups = clientQuoteFrequencyGroupsForDisplay(frequencyTotals);
  const showGroupedTotals = frequencyGroups.length > 1;
  const dueLabel = editor.paymentDueDate.trim()
    ? formatClientQuoteDate(editor.paymentDueDate.trim(), locale)
    : "—";

  function updateCommercial(next: ClientQuoteEditorDraft) {
    onChange({ ...editor, commercial: next });
  }

  function patchIssuer(patch: Partial<ClientQuoteIssuerEdit>) {
    updateCommercial({ ...commercial, issuer: { ...commercial.issuer, ...patch } });
  }

  function patchLine(index: number, patch: Partial<ClientQuoteEditorDraft["lines"][number]>) {
    updateCommercial({
      ...commercial,
      lines: commercial.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    });
  }

  return (
    <div data-client-invoice-editor="true" data-client-invoice-mode={mode} className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          {readOnly ? copy.issuedEyebrow : copy.draftEyebrow}
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {commercial.projectTitle.trim() || copy.untitled}
        </h1>
      </div>

      <section className={SECTION_CLASS} data-client-invoice-source="true">
        <h2 className="text-lg font-semibold text-white">{copy.sourceQuoteLabel}</h2>
        <p className="mt-2 text-sm leading-6 text-white/50">{copy.sourceQuoteHint}</p>
        <p className="mt-4 text-sm text-white" data-client-invoice-source-quote={sourceQuoteId}>
          {sourceQuoteNumber}
        </p>
        <Link
          href={`/licensee/client-quotes/${sourceQuoteId}`}
          className="mt-3 inline-flex text-sm text-[var(--athena-orange)]"
          data-client-invoice-open-source={sourceQuoteId}
        >
          {copy.openSourceQuote}
        </Link>
      </section>

      <section className={SECTION_CLASS}>
        <div className="grid gap-4 md:grid-cols-2">
          <div data-client-invoice-currency-locked={currencyCode}>
            <div className={LABEL_CLASS}>{copy.currencyLabel}</div>
            <p className="text-sm text-white">{currencyCode}</p>
            <p className="mt-1 text-xs text-white/40">{copy.currencyLocked}</p>
          </div>
          <div data-client-invoice-language-locked="true">
            <div className={LABEL_CLASS}>{copy.documentLanguage}</div>
            <p className="text-sm text-white">{contentLanguageLabel}</p>
            <p className="mt-1 text-xs text-white/40">{copy.languageLocked}</p>
          </div>
        </div>
        {readOnly ? (
          <dl className="mt-6 grid gap-4 md:grid-cols-3">
            <div>
              <dt className={LABEL_CLASS}>{copy.invoiceNumberLabel}</dt>
              <dd className="text-sm text-white" data-client-invoice-number="true">
                {invoiceNumber}
              </dd>
            </div>
            <div>
              <dt className={LABEL_CLASS}>{copy.issueDateLabel}</dt>
              <dd className="text-sm text-white" data-client-invoice-issue-date="true">
                {issueDateLabel}
              </dd>
            </div>
            <div>
              <dt className={LABEL_CLASS}>{copy.paymentDueDateLabel}</dt>
              <dd className="text-sm text-white" data-field="paymentDueDate">
                {dueLabel}
              </dd>
            </div>
          </dl>
        ) : (
          <p
            className="mt-4 text-sm leading-6 text-white/50"
            data-client-invoice-issue-date-hint="true"
          >
            {copy.issueDateHint}
          </p>
        )}
        {readOnly ? (
          <p className="mt-4 text-sm leading-6 text-white/55">{copy.issuedReadonly}</p>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className={SECTION_CLASS}>
          <h2 className="text-lg font-semibold text-white">{quotes.issuerTitle}</h2>
          <div className="mt-5 space-y-4">
            <TextControl
              label={quotes.legalName}
              value={commercial.issuer.legalName}
              readOnly={readOnly}
              field="issuer.legalName"
              maxLength={CLIENT_QUOTE_FIELD_LIMITS.legalName}
              onChange={(legalName) => patchIssuer({ legalName })}
            />
            <TextControl
              label={quotes.tradingName}
              value={commercial.issuer.tradingName}
              readOnly={readOnly}
              field="issuer.tradingName"
              maxLength={CLIENT_QUOTE_FIELD_LIMITS.tradingName}
              onChange={(tradingName) => patchIssuer({ tradingName })}
            />
            <TextControl
              label={quotes.contactName}
              value={commercial.issuer.contactName}
              readOnly={readOnly}
              field="issuer.contactName"
              maxLength={CLIENT_QUOTE_FIELD_LIMITS.contactName}
              onChange={(contactName) => patchIssuer({ contactName })}
            />
            <TextControl
              label={quotes.jobTitle}
              value={commercial.issuer.jobTitle}
              readOnly={readOnly}
              field="issuer.jobTitle"
              maxLength={CLIENT_QUOTE_FIELD_LIMITS.jobTitle}
              onChange={(jobTitle) => patchIssuer({ jobTitle })}
            />
            <AddressFields
              prefix="issuer.address"
              address={commercial.issuer.postalAddress}
              readOnly={readOnly}
              messages={messages}
              onChange={(postalAddress) => patchIssuer({ postalAddress })}
            />
            <TextControl
              label={quotes.phone}
              value={commercial.issuer.phone}
              readOnly={readOnly}
              field="issuer.phone"
              maxLength={CLIENT_QUOTE_FIELD_LIMITS.phone}
              onChange={(phone) => patchIssuer({ phone })}
            />
            <TextControl
              label={quotes.email}
              value={commercial.issuer.email}
              readOnly={readOnly}
              field="issuer.email"
              maxLength={CLIENT_QUOTE_FIELD_LIMITS.email}
              onChange={(email) => patchIssuer({ email })}
            />
            <TextControl
              label={quotes.website}
              value={commercial.issuer.website}
              readOnly={readOnly}
              field="issuer.website"
              maxLength={CLIENT_QUOTE_FIELD_LIMITS.website}
              onChange={(website) => patchIssuer({ website })}
            />
            <TextControl
              label={quotes.registrationNumber}
              value={commercial.issuer.registrationNumber}
              readOnly={readOnly}
              field="issuer.registrationNumber"
              maxLength={CLIENT_QUOTE_FIELD_LIMITS.registrationNumber}
              onChange={(registrationNumber) => patchIssuer({ registrationNumber })}
            />
            <TextControl
              label={quotes.taxIdentifier}
              value={commercial.issuer.taxIdentifier}
              readOnly={readOnly}
              field="issuer.taxIdentifier"
              maxLength={CLIENT_QUOTE_FIELD_LIMITS.taxIdentifier}
              onChange={(taxIdentifier) => patchIssuer({ taxIdentifier })}
            />
            <TextControl
              label={quotes.taxIdentifierLabel}
              value={commercial.issuer.taxIdentifierLabel}
              readOnly={readOnly}
              field="issuer.taxIdentifierLabel"
              maxLength={CLIENT_QUOTE_FIELD_LIMITS.taxIdentifierLabel}
              onChange={(taxIdentifierLabel) => patchIssuer({ taxIdentifierLabel })}
            />
            <AreaControl
              label={quotes.additionalNote}
              value={commercial.issuer.additionalNote}
              readOnly={readOnly}
              field="issuer.additionalNote"
              maxLength={CLIENT_QUOTE_FIELD_LIMITS.additionalNote}
              onChange={(additionalNote) => patchIssuer({ additionalNote })}
            />
          </div>
        </section>

        <section className={SECTION_CLASS}>
          <h2 className="text-lg font-semibold text-white">{quotes.customerTitle}</h2>
          <div className="mt-5 space-y-4">
            <TextControl
              label={quotes.customerName}
              value={commercial.customer.name}
              readOnly={readOnly}
              field="customer.name"
              maxLength={CLIENT_QUOTE_FIELD_LIMITS.legalName}
              onChange={(name) =>
                updateCommercial({
                  ...commercial,
                  customer: { ...commercial.customer, name },
                })
              }
            />
            <TextControl
              label={quotes.contactName}
              value={commercial.customer.contactName}
              readOnly={readOnly}
              field="customer.contactName"
              maxLength={CLIENT_QUOTE_FIELD_LIMITS.contactName}
              onChange={(contactName) =>
                updateCommercial({
                  ...commercial,
                  customer: { ...commercial.customer, contactName },
                })
              }
            />
            <TextControl
              label={quotes.jobTitle}
              value={commercial.customer.jobTitle}
              readOnly={readOnly}
              field="customer.jobTitle"
              maxLength={CLIENT_QUOTE_FIELD_LIMITS.jobTitle}
              onChange={(jobTitle) =>
                updateCommercial({
                  ...commercial,
                  customer: { ...commercial.customer, jobTitle },
                })
              }
            />
            <AddressFields
              prefix="customer.address"
              address={commercial.customer.postalAddress}
              readOnly={readOnly}
              messages={messages}
              onChange={(postalAddress) =>
                updateCommercial({
                  ...commercial,
                  customer: { ...commercial.customer, postalAddress },
                })
              }
            />
            <TextControl
              label={quotes.phone}
              value={commercial.customer.phone}
              readOnly={readOnly}
              field="customer.phone"
              maxLength={CLIENT_QUOTE_FIELD_LIMITS.phone}
              onChange={(phone) =>
                updateCommercial({
                  ...commercial,
                  customer: { ...commercial.customer, phone },
                })
              }
            />
            <TextControl
              label={quotes.email}
              value={commercial.customer.email}
              readOnly={readOnly}
              field="customer.email"
              maxLength={CLIENT_QUOTE_FIELD_LIMITS.email}
              onChange={(email) =>
                updateCommercial({
                  ...commercial,
                  customer: { ...commercial.customer, email },
                })
              }
            />
            <TextControl
              label={quotes.taxIdentifier}
              value={commercial.customer.taxIdentifier}
              readOnly={readOnly}
              field="customer.taxIdentifier"
              maxLength={CLIENT_QUOTE_FIELD_LIMITS.taxIdentifier}
              onChange={(taxIdentifier) =>
                updateCommercial({
                  ...commercial,
                  customer: { ...commercial.customer, taxIdentifier },
                })
              }
            />
          </div>
        </section>
      </div>

      <section className={SECTION_CLASS}>
        <TextControl
          label={quotes.projectTitleLabel}
          value={commercial.projectTitle}
          readOnly={readOnly}
          field="projectTitle"
          maxLength={CLIENT_QUOTE_FIELD_LIMITS.projectTitle}
          onChange={(projectTitle) => updateCommercial({ ...commercial, projectTitle })}
        />
        <div className="mt-4">
          <AreaControl
            label={quotes.scopeSummaryLabel}
            value={commercial.scopeSummary}
            readOnly={readOnly}
            field="scopeSummary"
            rows={5}
            maxLength={CLIENT_QUOTE_FIELD_LIMITS.scopeSummary}
            onChange={(scopeSummary) => updateCommercial({ ...commercial, scopeSummary })}
          />
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">{quotes.servicesTitle}</h2>
          {readOnly ? null : (
            <button
              type="button"
              data-client-invoice-add-line="true"
              onClick={() => updateCommercial(addClientQuoteLine(commercial, currencyCode))}
              className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
            >
              {quotes.addLine}
            </button>
          )}
        </div>
        <div className="mt-5 space-y-4">
          {commercial.lines.map((line, index) => {
            const frequency = isClientQuoteBillingFrequency(line.billingFrequency)
              ? line.billingFrequency
              : "one_time";
            const lineTotal =
              lineTotalsMinor && lineTotalsMinor[index] != null
                ? formatClientQuoteMinorAmount(lineTotalsMinor[index], currencyCode)
                : "—";
            return (
              <div
                key={line.id}
                data-client-invoice-line={line.id}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_8rem_9rem_11rem]">
                  <TextControl
                    label={quotes.description}
                    value={line.description}
                    readOnly={readOnly}
                    field={`line.${line.id}.description`}
                    maxLength={CLIENT_QUOTE_FIELD_LIMITS.lineDescription}
                    onChange={(description) => patchLine(index, { description })}
                  />
                  <TextControl
                    label={quotes.quantity}
                    value={line.quantityText}
                    readOnly={readOnly}
                    field={`line.${line.id}.quantity`}
                    onChange={(quantityText) => patchLine(index, { quantityText })}
                  />
                  <TextControl
                    label={quotes.unitPrice}
                    value={line.unitPriceText}
                    readOnly={readOnly}
                    field={`line.${line.id}.unitPrice`}
                    onChange={(unitPriceText) => patchLine(index, { unitPriceText })}
                  />
                  {readOnly ? (
                    <div>
                      <div className={LABEL_CLASS}>{quotes.billingFrequency}</div>
                      <p
                        className="text-sm leading-6 text-white"
                        data-field={`line.${line.id}.billingFrequency`}
                      >
                        {clientQuoteBillingFrequencyLabel(messages, frequency)}
                      </p>
                    </div>
                  ) : (
                    <FieldShell label={quotes.billingFrequency}>
                      <select
                        data-field={`line.${line.id}.billingFrequency`}
                        value={frequency}
                        onChange={(event) => {
                          const next = event.target.value;
                          if (!isClientQuoteBillingFrequency(next)) return;
                          updateCommercial(
                            setClientQuoteLineBillingFrequency(commercial, index, next),
                          );
                        }}
                        className={FIELD_CLASS}
                      >
                        {CLIENT_QUOTE_BILLING_FREQUENCIES.map((item) => (
                          <option key={item} value={item}>
                            {clientQuoteBillingFrequencyLabel(messages, item)}
                          </option>
                        ))}
                      </select>
                    </FieldShell>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-white/70">
                    {quotes.lineTotal}: {lineTotal}
                  </p>
                  {readOnly ? null : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy || index === 0}
                        onClick={() =>
                          updateCommercial(moveClientQuoteLineAt(commercial, index, -1))
                        }
                        className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/5 disabled:opacity-40"
                      >
                        {quotes.moveUp}
                      </button>
                      <button
                        type="button"
                        disabled={busy || index === commercial.lines.length - 1}
                        onClick={() =>
                          updateCommercial(moveClientQuoteLineAt(commercial, index, 1))
                        }
                        className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/5 disabled:opacity-40"
                      >
                        {quotes.moveDown}
                      </button>
                      <button
                        type="button"
                        disabled={busy || commercial.lines.length <= 1}
                        onClick={() =>
                          updateCommercial(removeClientQuoteLineAt(commercial, index))
                        }
                        className="rounded-xl border border-red-400/30 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-500/10 disabled:opacity-40"
                      >
                        {quotes.removeLine}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className="text-lg font-semibold text-white">{quotes.discountTitle}</h2>
        {readOnly ? (
          <p className="mt-4 text-sm text-white" data-field="discount.kind">
            {commercial.discountKind}
          </p>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <FieldShell label={quotes.discountTitle}>
              <select
                data-field="discount.kind"
                value={commercial.discountKind}
                onChange={(event) => {
                  const kind = event.target.value;
                  if (kind === "none" || kind === "fixed" || kind === "percentage") {
                    updateCommercial(setClientQuoteDiscountKind(commercial, kind, currencyCode));
                  }
                }}
                className={FIELD_CLASS}
              >
                <option value="none">{quotes.discountNone}</option>
                <option value="fixed" disabled={mixedFrequency}>
                  {quotes.discountFixed}
                </option>
                <option value="percentage">{quotes.discountPercentage}</option>
              </select>
            </FieldShell>
            {commercial.discountKind === "fixed" ? (
              <TextControl
                label={quotes.discountAmount}
                value={commercial.discountAmountText}
                readOnly={false}
                field="discount.amount"
                onChange={(discountAmountText) =>
                  updateCommercial({ ...commercial, discountAmountText })
                }
              />
            ) : null}
            {commercial.discountKind === "percentage" ? (
              <TextControl
                label={quotes.discountPercent}
                value={commercial.discountPercentText}
                readOnly={false}
                field="discount.percent"
                onChange={(discountPercentText) =>
                  updateCommercial({ ...commercial, discountPercentText })
                }
              />
            ) : null}
          </div>
        )}
        {mixedFrequency ? (
          <p className="mt-4 text-sm leading-6 text-amber-100/80">{quotes.fixedDiscountMixed}</p>
        ) : null}

        <h2 className="mt-8 text-lg font-semibold text-white">{quotes.taxTitle}</h2>
        {readOnly ? (
          <p className="mt-4 text-sm text-white" data-field="tax.kind">
            {commercial.taxKind}
          </p>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <FieldShell label={quotes.taxTitle}>
              <select
                data-field="tax.kind"
                value={commercial.taxKind}
                onChange={(event) => {
                  const kind = event.target.value;
                  if (kind === "none" || kind === "percentage") {
                    updateCommercial(setClientQuoteTaxKind(commercial, kind));
                  }
                }}
                className={FIELD_CLASS}
              >
                <option value="none">{quotes.taxNone}</option>
                <option value="percentage">{quotes.taxPercentage}</option>
              </select>
            </FieldShell>
            {commercial.taxKind === "percentage" ? (
              <>
                <TextControl
                  label={quotes.taxPercent}
                  value={commercial.taxPercentText}
                  readOnly={false}
                  field="tax.percent"
                  onChange={(taxPercentText) =>
                    updateCommercial({ ...commercial, taxPercentText })
                  }
                />
                <TextControl
                  label={quotes.taxLabel}
                  value={commercial.taxLabel}
                  readOnly={false}
                  field="tax.label"
                  maxLength={CLIENT_QUOTE_FIELD_LIMITS.taxIdentifierLabel}
                  onChange={(taxLabel) => updateCommercial({ ...commercial, taxLabel })}
                />
              </>
            ) : null}
          </div>
        )}

        <h2 className="mt-8 text-lg font-semibold text-white">
          {showGroupedTotals ? quotes.frequencySummaryTitle : quotes.total}
        </h2>
        {readOnly ? (
          <p className="mt-2 text-xs uppercase tracking-[0.14em] text-white/35">
            {copy.frozenTotals}
          </p>
        ) : (
          <p className="mt-2 text-sm leading-6 text-white/50">{copy.totalsAuthority}</p>
        )}
        {showGroupedTotals ? (
          <div className="mt-4 space-y-5" data-client-invoice-totals="frequency">
            <p className="text-sm leading-6 text-white/55">{quotes.frequencySummarySeparate}</p>
            {frequencyGroups.map((group) => (
              <section key={group.billingFrequency}>
                <h3 className="text-sm font-semibold text-white">
                  {clientQuoteBillingFrequencyLabel(messages, group.billingFrequency)}
                </h3>
                <dl className="mt-2 space-y-2">
                  <MoneyRow
                    label={quotes.total}
                    value={formatClientQuoteMinorAmount(
                      group.totals.totalMinor,
                      currencyCode,
                    )}
                    emphasize
                    field={`frequency.${group.billingFrequency}.total`}
                  />
                </dl>
              </section>
            ))}
          </div>
        ) : totals ? (
          <dl className="mt-4 space-y-2" data-client-invoice-totals="true">
            <MoneyRow
              label={quotes.subtotal}
              value={formatClientQuoteMinorAmount(totals.subtotalMinor, currencyCode)}
              field="totals.subtotal"
            />
            <MoneyRow
              label={quotes.discount}
              value={formatClientQuoteMinorAmount(totals.discountMinor, currencyCode)}
              field="totals.discount"
            />
            <MoneyRow
              label={quotes.tax}
              value={formatClientQuoteMinorAmount(totals.taxMinor, currencyCode)}
              field="totals.tax"
            />
            <MoneyRow
              label={quotes.total}
              value={formatClientQuoteMinorAmount(totals.totalMinor, currencyCode)}
              emphasize
              field="totals.total"
            />
          </dl>
        ) : (
          <p className="mt-4 text-sm text-white/45" data-client-invoice-totals="unavailable">
            {quotes.totalsUnavailable}
          </p>
        )}
      </section>

      <section className={SECTION_CLASS}>
        <h2 className="text-lg font-semibold text-white">{quotes.paymentTitle}</h2>
        <div className="mt-5 space-y-4">
          <AreaControl
            label={quotes.paymentSummary}
            value={commercial.paymentSummary}
            readOnly={readOnly}
            field="payment.summary"
            maxLength={CLIENT_QUOTE_FIELD_LIMITS.paymentSummary}
            onChange={(paymentSummary) => updateCommercial({ ...commercial, paymentSummary })}
          />
          <AreaControl
            label={quotes.scheduleNote}
            value={commercial.paymentScheduleNote}
            readOnly={readOnly}
            field="payment.scheduleNote"
            maxLength={CLIENT_QUOTE_FIELD_LIMITS.paymentScheduleNote}
            onChange={(paymentScheduleNote) =>
              updateCommercial({ ...commercial, paymentScheduleNote })
            }
          />
          {readOnly ? null : (
            <FieldShell label={copy.paymentDueDateLabel} hint={copy.paymentDueDateHint}>
              <input
                type="date"
                data-field="paymentDueDate"
                value={editor.paymentDueDate}
                onChange={(event) =>
                  onChange({ ...editor, paymentDueDate: event.target.value })
                }
                className={FIELD_CLASS}
              />
            </FieldShell>
          )}
          <AreaControl
            label={copy.paymentInstructionsLabel}
            value={editor.paymentInstructions}
            readOnly={readOnly}
            field="paymentInstructions"
            rows={4}
            maxLength={CLIENT_INVOICE_FIELD_LIMITS.paymentInstructions}
            hint={copy.paymentInstructionsHint}
            onChange={(paymentInstructions) => onChange({ ...editor, paymentInstructions })}
          />
        </div>
      </section>

      {readOnly ? (
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:justify-end">
          <ClientInvoicePdfDownloadButton
            invoiceId={invoiceId}
            disabled={busy}
            messages={messages}
          />
          {emailHandoff ? (
            <ClientDocumentSendByEmailLink
              handoff={emailHandoff}
              messages={messages}
              layout="detail"
              documentKind="invoice"
            />
          ) : null}
        </div>
      ) : (
        <section
          className="rounded-2xl border border-white/10 bg-[var(--athena-card)] px-4 py-4 md:px-5"
          data-client-invoice-issue-panel="true"
        >
          <h2 className="text-sm font-semibold text-white">{copy.requirementsTitle}</h2>
          <ul className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
            {CLIENT_INVOICE_ISSUE_REQUIREMENTS.map((requirement) => {
              const met = !missing.has(requirement);
              return (
                <li
                  key={requirement}
                  data-requirement={requirement}
                  data-met={met ? "true" : "false"}
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
                    met
                      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                      : "border-amber-400/30 bg-amber-500/10 text-amber-100"
                  }`}
                >
                  {requirementLabel(requirement, messages)}
                </li>
              );
            })}
          </ul>
          {notice ? (
            <p className="mt-4 text-sm text-emerald-100" role="status">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="mt-4 text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              data-client-invoice-save="true"
              disabled={busy}
              onClick={onSave}
              className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-60"
            >
              {pending === "save" ? copy.savingDraft : copy.saveDraft}
            </button>
            <button
              type="button"
              data-client-invoice-issue="true"
              disabled={busy}
              onClick={onRequestIssue}
              className="rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {pending === "issue" ? copy.issuingInvoice : copy.issueInvoice}
            </button>
          </div>
        </section>
      )}

      {confirmIssueOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 py-6 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-invoice-issue-title"
            className="w-full max-w-md rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 shadow-2xl shadow-black/40"
            data-client-invoice-issue-dialog="true"
          >
            <h2 id="client-invoice-issue-title" className="text-xl font-semibold text-white">
              {copy.issueDialogTitle}
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/55">{copy.issueDialogBody}</p>
            <p className="mt-3 text-sm leading-6 text-white/55">{copy.issueDateHint}</p>
            {error ? (
              <p className="mt-3 text-sm text-red-300" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={onCancelIssue}
                data-client-invoice-issue-cancel="true"
                className="rounded-xl border border-[var(--athena-border)] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white disabled:opacity-60"
              >
                {messages.common.cancel}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirmIssue}
                data-client-invoice-issue-confirm="true"
                className="rounded-xl bg-[var(--athena-orange)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {pending === "issue" ? copy.issuingInvoice : copy.issueConfirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
