"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ClientQuotePdfDownloadButton } from "@/components/licensee/clientQuotes/ClientQuotePdfDownloadButton";
import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import {
  addClientQuoteAppendixSection,
  addClientQuoteLine,
  formatClientQuoteDate,
  formatClientQuoteMinorAmount,
  moveClientQuoteLineAt,
  removeClientQuoteAppendixSection,
  removeClientQuoteLineAt,
  setClientQuoteAppendixEnabled,
  setClientQuoteDiscountKind,
  setClientQuoteTaxKind,
  withClientQuoteDocumentLanguage,
  CLIENT_QUOTE_ISSUE_REQUIREMENTS,
  type ClientQuoteEditorDraft,
  type ClientQuoteIssueRequirement,
  type ClientQuoteIssuerEdit,
  type ClientQuotePostalAddressEdit,
} from "@/lib/licensee/clientQuoteEditorModel";
import { CLIENT_QUOTE_FIELD_LIMITS } from "@/services/clientQuote/clientQuoteTypes";
import type { ClientQuoteTotals } from "@/services/clientQuote/clientQuoteTypes";
import {
  ORGANIZATION_LANGUAGES,
  isOrganizationLanguage,
  organizationLanguageLabel,
} from "@/services/organizationLanguage";

const FIELD_CLASS =
  "w-full rounded-2xl border border-white/20 bg-[#161922] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[var(--athena-orange)] focus:ring-2 focus:ring-[var(--athena-orange)]/30";
const LABEL_CLASS =
  "mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-white/45";
const SECTION_CLASS =
  "rounded-[28px] border border-white/10 bg-[var(--athena-card)] p-5 md:p-7";

export type ClientQuoteEditorViewProps = {
  mode: "draft" | "issued";
  quoteNumber: string | null;
  issuedAtLabel: string | null;
  currencyCode: string;
  editor: ClientQuoteEditorDraft;
  lineTotalsMinor: number[] | null;
  totals: ClientQuoteTotals | null;
  locale: string;
  messages: LicenseeMessages;
  pending: "save" | "issue" | "revise" | null;
  notice: string | null;
  error: string | null;
  missingRequirements: readonly ClientQuoteIssueRequirement[];
  revisedFromQuoteId: string | null;
  downloadQuoteId?: string | null;
  onChange: (editor: ClientQuoteEditorDraft) => void;
  onSave: () => void;
  onIssue: () => void;
  onRevise: () => void;
};

function requirementLabel(
  id: ClientQuoteIssueRequirement,
  messages: LicenseeMessages,
): string {
  const copy = messages.clientQuotes;
  switch (id) {
    case "issuerLegalName":
      return copy.missingIssuerLegalName;
    case "customerName":
      return copy.missingCustomerName;
    case "projectTitle":
      return copy.missingProjectTitle;
    case "scopeSummary":
      return copy.missingScope;
    case "lineItem":
      return copy.missingLine;
    case "paymentTerms":
      return copy.missingPayment;
    case "validity":
      return copy.missingValidity;
    default:
      return id;
  }
}

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
  optional,
}: {
  label: string;
  value: string;
  readOnly: boolean;
  field: string;
  onChange: (value: string) => void;
  maxLength?: number;
  optional?: string;
}) {
  const caption = optional ? `${label} ${optional}` : label;
  if (readOnly) {
    return (
      <div>
        <div className={LABEL_CLASS}>{caption}</div>
        <p className="text-sm leading-6 text-white" data-field={field}>
          {value.trim() ? value : "—"}
        </p>
      </div>
    );
  }
  return (
    <FieldShell label={caption}>
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
}: {
  label: string;
  value: string;
  readOnly: boolean;
  field: string;
  onChange: (value: string) => void;
  maxLength?: number;
  rows?: number;
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
    <FieldShell label={label}>
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

function AddressFields({
  prefix,
  address,
  readOnly,
  messages,
  onChange,
}: {
  prefix: "issuer" | "customer";
  address: ClientQuotePostalAddressEdit;
  readOnly: boolean;
  messages: LicenseeMessages;
  onChange: (address: ClientQuotePostalAddressEdit) => void;
}) {
  const copy = messages.clientQuotes;
  const optional = messages.common.optional;
  const fields: Array<[keyof ClientQuotePostalAddressEdit, string, number]> = [
    ["line1", copy.addressLine1, CLIENT_QUOTE_FIELD_LIMITS.addressLine],
    ["line2", copy.addressLine2, CLIENT_QUOTE_FIELD_LIMITS.addressLine],
    ["city", copy.city, CLIENT_QUOTE_FIELD_LIMITS.city],
    ["region", copy.region, CLIENT_QUOTE_FIELD_LIMITS.region],
    ["postalCode", copy.postalCode, CLIENT_QUOTE_FIELD_LIMITS.postalCode],
    ["country", copy.country, CLIENT_QUOTE_FIELD_LIMITS.country],
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map(([key, label, maxLength]) => (
        <TextControl
          key={key}
          label={label}
          optional={optional}
          value={address[key]}
          readOnly={readOnly}
          field={`${prefix}.${key}`}
          maxLength={maxLength}
          onChange={(value) => onChange({ ...address, [key]: value })}
        />
      ))}
    </div>
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

export function ClientQuoteEditorView({
  mode,
  quoteNumber,
  issuedAtLabel,
  currencyCode,
  editor,
  lineTotalsMinor,
  totals,
  locale,
  messages,
  pending,
  notice,
  error,
  missingRequirements,
  revisedFromQuoteId,
  downloadQuoteId = null,
  onChange,
  onSave,
  onIssue,
  onRevise,
}: ClientQuoteEditorViewProps) {
  const copy = messages.clientQuotes;
  const readOnly = mode === "issued";
  const busy = pending !== null;
  const missing = new Set(missingRequirements);

  function patchIssuer(partial: Partial<ClientQuoteIssuerEdit>) {
    onChange({ ...editor, issuer: { ...editor.issuer, ...partial } });
  }

  function patchCustomer(partial: Partial<ClientQuoteEditorDraft["customer"]>) {
    onChange({ ...editor, customer: { ...editor.customer, ...partial } });
  }

  const discountLabel =
    editor.discountKind === "fixed"
      ? copy.discountFixed
      : editor.discountKind === "percentage"
        ? `${copy.discountPercentage} ${editor.discountPercentText}%`
        : copy.discountNone;
  const taxLabel =
    editor.taxKind === "percentage"
      ? `${copy.taxPercentage} ${editor.taxPercentText}%${editor.taxLabel.trim() ? ` · ${editor.taxLabel.trim()}` : ""}`
      : copy.taxNone;

  return (
    <div data-client-quote-editor="true" data-client-quote-mode={mode} className="space-y-6">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          {readOnly ? copy.issuedEyebrow : copy.draftEyebrow}
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {editor.projectTitle.trim() || copy.untitled}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50" data-client-quote-currency={currencyCode}>
          {copy.currencyLocked}{" "}
          <span className="font-medium text-white">{currencyCode}</span>
        </p>
      </header>

      {readOnly ? (
        <section className={SECTION_CLASS} data-client-quote-issued-summary="true">
          <p className="text-sm leading-6 text-white/70">{copy.issuedReadonly}</p>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className={LABEL_CLASS}>{copy.quoteNumberLabel}</dt>
              <dd className="text-lg font-semibold text-white" data-field="quoteNumber">
                {quoteNumber || "—"}
              </dd>
            </div>
            <div>
              <dt className={LABEL_CLASS}>{copy.issueDateLabel}</dt>
              <dd className="text-sm text-white" data-field="issuedAt">
                {issuedAtLabel || "—"}
              </dd>
            </div>
            <div>
              <dt className={LABEL_CLASS}>{copy.documentLanguage}</dt>
              <dd className="text-sm text-white" data-field="contentLanguage">
                {organizationLanguageLabel(editor.contentLanguage)}
              </dd>
            </div>
          </dl>
          {revisedFromQuoteId ? (
            <p className="mt-4 text-sm text-white/50">
              <Link
                href={`/licensee/client-quotes/${revisedFromQuoteId}`}
                className="text-[var(--athena-orange)]"
              >
                {copy.revisedFrom}
              </Link>
            </p>
          ) : null}
        </section>
      ) : null}

      {readOnly ? null : (
        <section className={SECTION_CLASS}>
          <h2 className="text-lg font-semibold text-white">{copy.documentLanguage}</h2>
          <p className="mt-2 text-sm leading-6 text-white/50">{copy.documentLanguageHint}</p>
          <p className="mt-2 text-sm leading-6 text-amber-100/80">{copy.languageNoTranslate}</p>
          <select
            data-field="contentLanguage"
            value={editor.contentLanguage}
            onChange={(event) => {
              const next = event.target.value;
              if (!isOrganizationLanguage(next)) return;
              onChange(withClientQuoteDocumentLanguage(editor, next));
            }}
            className={`${FIELD_CLASS} mt-4 md:max-w-xs`}
          >
            {ORGANIZATION_LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {organizationLanguageLabel(language)}
              </option>
            ))}
          </select>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className={SECTION_CLASS}>
          <h2 className="text-lg font-semibold text-white">{copy.issuerTitle}</h2>
          {readOnly ? (
            <p className="mt-2 text-xs uppercase tracking-[0.14em] text-white/35">
              {copy.frozenIdentity}
            </p>
          ) : null}
          <div className="mt-5 space-y-4">
            <TextControl
              label={copy.legalName}
              value={editor.issuer.legalName}
              readOnly={readOnly}
              field="issuer.legalName"
              maxLength={CLIENT_QUOTE_FIELD_LIMITS.legalName}
              onChange={(legalName) => patchIssuer({ legalName })}
            />
            <TextControl
              label={copy.tradingName}
              optional={messages.common.optional}
              value={editor.issuer.tradingName}
              readOnly={readOnly}
              field="issuer.tradingName"
              maxLength={CLIENT_QUOTE_FIELD_LIMITS.tradingName}
              onChange={(tradingName) => patchIssuer({ tradingName })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextControl
                label={copy.contactName}
                optional={messages.common.optional}
                value={editor.issuer.contactName}
                readOnly={readOnly}
                field="issuer.contactName"
                maxLength={CLIENT_QUOTE_FIELD_LIMITS.contactName}
                onChange={(contactName) => patchIssuer({ contactName })}
              />
              <TextControl
                label={copy.jobTitle}
                optional={messages.common.optional}
                value={editor.issuer.jobTitle}
                readOnly={readOnly}
                field="issuer.jobTitle"
                maxLength={CLIENT_QUOTE_FIELD_LIMITS.jobTitle}
                onChange={(jobTitle) => patchIssuer({ jobTitle })}
              />
            </div>
            <AddressFields
              prefix="issuer"
              address={editor.issuer.postalAddress}
              readOnly={readOnly}
              messages={messages}
              onChange={(postalAddress) => patchIssuer({ postalAddress })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextControl
                label={copy.phone}
                optional={messages.common.optional}
                value={editor.issuer.phone}
                readOnly={readOnly}
                field="issuer.phone"
                maxLength={CLIENT_QUOTE_FIELD_LIMITS.phone}
                onChange={(phone) => patchIssuer({ phone })}
              />
              <TextControl
                label={copy.email}
                optional={messages.common.optional}
                value={editor.issuer.email}
                readOnly={readOnly}
                field="issuer.email"
                maxLength={CLIENT_QUOTE_FIELD_LIMITS.email}
                onChange={(email) => patchIssuer({ email })}
              />
              <TextControl
                label={copy.website}
                optional={messages.common.optional}
                value={editor.issuer.website}
                readOnly={readOnly}
                field="issuer.website"
                maxLength={CLIENT_QUOTE_FIELD_LIMITS.website}
                onChange={(website) => patchIssuer({ website })}
              />
              <TextControl
                label={copy.registrationNumber}
                optional={messages.common.optional}
                value={editor.issuer.registrationNumber}
                readOnly={readOnly}
                field="issuer.registrationNumber"
                maxLength={CLIENT_QUOTE_FIELD_LIMITS.registrationNumber}
                onChange={(registrationNumber) => patchIssuer({ registrationNumber })}
              />
              <TextControl
                label={copy.taxIdentifierLabel}
                optional={messages.common.optional}
                value={editor.issuer.taxIdentifierLabel}
                readOnly={readOnly}
                field="issuer.taxIdentifierLabel"
                maxLength={CLIENT_QUOTE_FIELD_LIMITS.taxIdentifierLabel}
                onChange={(taxIdentifierLabel) => patchIssuer({ taxIdentifierLabel })}
              />
              <TextControl
                label={copy.taxIdentifier}
                optional={messages.common.optional}
                value={editor.issuer.taxIdentifier}
                readOnly={readOnly}
                field="issuer.taxIdentifier"
                maxLength={CLIENT_QUOTE_FIELD_LIMITS.taxIdentifier}
                onChange={(taxIdentifier) => patchIssuer({ taxIdentifier })}
              />
            </div>
            <AreaControl
              label={`${copy.additionalNote} ${messages.common.optional}`}
              value={editor.issuer.additionalNote}
              readOnly={readOnly}
              field="issuer.additionalNote"
              maxLength={CLIENT_QUOTE_FIELD_LIMITS.additionalNote}
              onChange={(additionalNote) => patchIssuer({ additionalNote })}
            />
          </div>
        </section>

        <section className={SECTION_CLASS}>
          <h2 className="text-lg font-semibold text-white">{copy.customerTitle}</h2>
          {readOnly ? (
            <p className="mt-2 text-xs uppercase tracking-[0.14em] text-white/35">
              {copy.frozenIdentity}
            </p>
          ) : null}
          <div className="mt-5 space-y-4">
            <TextControl
              label={copy.customerName}
              value={editor.customer.name}
              readOnly={readOnly}
              field="customer.name"
              maxLength={CLIENT_QUOTE_FIELD_LIMITS.customerName}
              onChange={(name) => patchCustomer({ name })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextControl
                label={copy.contactName}
                optional={messages.common.optional}
                value={editor.customer.contactName}
                readOnly={readOnly}
                field="customer.contactName"
                maxLength={CLIENT_QUOTE_FIELD_LIMITS.contactName}
                onChange={(contactName) => patchCustomer({ contactName })}
              />
              <TextControl
                label={copy.jobTitle}
                optional={messages.common.optional}
                value={editor.customer.jobTitle}
                readOnly={readOnly}
                field="customer.jobTitle"
                maxLength={CLIENT_QUOTE_FIELD_LIMITS.jobTitle}
                onChange={(jobTitle) => patchCustomer({ jobTitle })}
              />
            </div>
            <AddressFields
              prefix="customer"
              address={editor.customer.postalAddress}
              readOnly={readOnly}
              messages={messages}
              onChange={(postalAddress) => patchCustomer({ postalAddress })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextControl
                label={copy.phone}
                optional={messages.common.optional}
                value={editor.customer.phone}
                readOnly={readOnly}
                field="customer.phone"
                maxLength={CLIENT_QUOTE_FIELD_LIMITS.phone}
                onChange={(phone) => patchCustomer({ phone })}
              />
              <TextControl
                label={copy.email}
                optional={messages.common.optional}
                value={editor.customer.email}
                readOnly={readOnly}
                field="customer.email"
                maxLength={CLIENT_QUOTE_FIELD_LIMITS.email}
                onChange={(email) => patchCustomer({ email })}
              />
              <TextControl
                label={copy.taxIdentifier}
                optional={messages.common.optional}
                value={editor.customer.taxIdentifier}
                readOnly={readOnly}
                field="customer.taxIdentifier"
                maxLength={CLIENT_QUOTE_FIELD_LIMITS.taxIdentifier}
                onChange={(taxIdentifier) => patchCustomer({ taxIdentifier })}
              />
            </div>
          </div>
        </section>
      </div>

      <section className={SECTION_CLASS}>
        <h2 className="text-lg font-semibold text-white">{copy.projectTitleLabel}</h2>
        <div className="mt-5 space-y-4">
          <TextControl
            label={copy.projectTitleLabel}
            value={editor.projectTitle}
            readOnly={readOnly}
            field="projectTitle"
            maxLength={CLIENT_QUOTE_FIELD_LIMITS.projectTitle}
            onChange={(projectTitle) => onChange({ ...editor, projectTitle })}
          />
          <AreaControl
            label={copy.scopeSummaryLabel}
            value={editor.scopeSummary}
            readOnly={readOnly}
            field="scopeSummary"
            rows={5}
            maxLength={CLIENT_QUOTE_FIELD_LIMITS.scopeSummary}
            onChange={(scopeSummary) => onChange({ ...editor, scopeSummary })}
          />
          {readOnly ? null : (
            <p className="text-sm leading-6 text-white/45">{copy.scopeHint}</p>
          )}
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-white">{copy.servicesTitle}</h2>
          {readOnly ? null : (
            <button
              type="button"
              data-client-quote-add-line="true"
              disabled={busy || editor.lines.length >= CLIENT_QUOTE_FIELD_LIMITS.lineItems}
              onClick={() => onChange(addClientQuoteLine(editor, currencyCode))}
              className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/5 disabled:opacity-50"
            >
              {copy.addLine}
            </button>
          )}
        </div>
        <div className="mt-5 space-y-4">
          {editor.lines.map((line, index) => {
            const lineTotal =
              lineTotalsMinor && lineTotalsMinor[index] != null
                ? formatClientQuoteMinorAmount(lineTotalsMinor[index], currencyCode)
                : "—";
            return (
              <div
                key={line.id}
                data-client-quote-line={line.id}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_8rem_9rem_9rem]">
                  <TextControl
                    label={copy.description}
                    value={line.description}
                    readOnly={readOnly}
                    field={`line.${line.id}.description`}
                    maxLength={CLIENT_QUOTE_FIELD_LIMITS.lineDescription}
                    onChange={(description) =>
                      onChange({
                        ...editor,
                        lines: editor.lines.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, description } : item,
                        ),
                      })
                    }
                  />
                  <TextControl
                    label={copy.quantity}
                    value={line.quantityText}
                    readOnly={readOnly}
                    field={`line.${line.id}.quantity`}
                    onChange={(quantityText) =>
                      onChange({
                        ...editor,
                        lines: editor.lines.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, quantityText } : item,
                        ),
                      })
                    }
                  />
                  <TextControl
                    label={copy.unitPrice}
                    value={line.unitPriceText}
                    readOnly={readOnly}
                    field={`line.${line.id}.unitPrice`}
                    onChange={(unitPriceText) =>
                      onChange({
                        ...editor,
                        lines: editor.lines.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, unitPriceText } : item,
                        ),
                      })
                    }
                  />
                  <div>
                    <div className={LABEL_CLASS}>{copy.lineTotal}</div>
                    <p className="py-3 text-sm font-medium text-white" data-field={`line.${line.id}.total`}>
                      {lineTotal}
                    </p>
                  </div>
                </div>
                {readOnly ? null : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-client-quote-move-up={line.id}
                      disabled={busy || index === 0}
                      onClick={() => onChange(moveClientQuoteLineAt(editor, index, -1))}
                      className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/5 disabled:opacity-40"
                    >
                      {copy.moveUp}
                    </button>
                    <button
                      type="button"
                      data-client-quote-move-down={line.id}
                      disabled={busy || index === editor.lines.length - 1}
                      onClick={() => onChange(moveClientQuoteLineAt(editor, index, 1))}
                      className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/5 disabled:opacity-40"
                    >
                      {copy.moveDown}
                    </button>
                    <button
                      type="button"
                      data-client-quote-remove-line={line.id}
                      disabled={busy || editor.lines.length <= 1}
                      onClick={() => onChange(removeClientQuoteLineAt(editor, index))}
                      className="rounded-xl border border-red-400/30 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-500/10 disabled:opacity-40"
                    >
                      {copy.removeLine}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className="text-lg font-semibold text-white">{copy.discountTitle}</h2>
        {readOnly ? (
          <p className="mt-4 text-sm text-white" data-field="discount">
            {discountLabel}
          </p>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <FieldShell label={copy.discountTitle}>
              <select
                data-field="discount.kind"
                value={editor.discountKind}
                onChange={(event) => {
                  const kind = event.target.value;
                  if (kind === "none" || kind === "fixed" || kind === "percentage") {
                    onChange(setClientQuoteDiscountKind(editor, kind, currencyCode));
                  }
                }}
                className={FIELD_CLASS}
              >
                <option value="none">{copy.discountNone}</option>
                <option value="fixed">{copy.discountFixed}</option>
                <option value="percentage">{copy.discountPercentage}</option>
              </select>
            </FieldShell>
            {editor.discountKind === "fixed" ? (
              <TextControl
                label={copy.discountAmount}
                value={editor.discountAmountText}
                readOnly={false}
                field="discount.amount"
                onChange={(discountAmountText) => onChange({ ...editor, discountAmountText })}
              />
            ) : null}
            {editor.discountKind === "percentage" ? (
              <TextControl
                label={copy.discountPercent}
                value={editor.discountPercentText}
                readOnly={false}
                field="discount.percent"
                onChange={(discountPercentText) => onChange({ ...editor, discountPercentText })}
              />
            ) : null}
          </div>
        )}

        <h2 className="mt-8 text-lg font-semibold text-white">{copy.taxTitle}</h2>
        {readOnly ? (
          <p className="mt-4 text-sm text-white" data-field="tax">
            {taxLabel}
          </p>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <FieldShell label={copy.taxTitle}>
              <select
                data-field="tax.kind"
                value={editor.taxKind}
                onChange={(event) => {
                  const kind = event.target.value;
                  if (kind === "none" || kind === "percentage") {
                    onChange(setClientQuoteTaxKind(editor, kind));
                  }
                }}
                className={FIELD_CLASS}
              >
                <option value="none">{copy.taxNone}</option>
                <option value="percentage">{copy.taxPercentage}</option>
              </select>
            </FieldShell>
            {editor.taxKind === "percentage" ? (
              <>
                <TextControl
                  label={copy.taxPercent}
                  value={editor.taxPercentText}
                  readOnly={false}
                  field="tax.percent"
                  onChange={(taxPercentText) => onChange({ ...editor, taxPercentText })}
                />
                <TextControl
                  label={copy.taxLabel}
                  optional={messages.common.optional}
                  value={editor.taxLabel}
                  readOnly={false}
                  field="tax.label"
                  maxLength={CLIENT_QUOTE_FIELD_LIMITS.taxIdentifierLabel}
                  onChange={(taxLabelText) => onChange({ ...editor, taxLabel: taxLabelText })}
                />
              </>
            ) : null}
          </div>
        )}

        <h2 className="mt-8 text-lg font-semibold text-white">{copy.total}</h2>
        {readOnly ? (
          <p className="mt-2 text-xs uppercase tracking-[0.14em] text-white/35">
            {copy.frozenTotals}
          </p>
        ) : null}
        {totals ? (
          <dl className="mt-4 space-y-2" data-client-quote-totals="true">
            <MoneyRow
              label={copy.subtotal}
              value={formatClientQuoteMinorAmount(totals.subtotalMinor, currencyCode)}
              field="totals.subtotal"
            />
            <MoneyRow
              label={copy.discount}
              value={formatClientQuoteMinorAmount(totals.discountMinor, currencyCode)}
              field="totals.discount"
            />
            <MoneyRow
              label={copy.taxableAmount}
              value={formatClientQuoteMinorAmount(totals.taxableMinor, currencyCode)}
              field="totals.taxable"
            />
            <MoneyRow
              label={copy.tax}
              value={formatClientQuoteMinorAmount(totals.taxMinor, currencyCode)}
              field="totals.tax"
            />
            <MoneyRow
              label={copy.total}
              value={formatClientQuoteMinorAmount(totals.totalMinor, currencyCode)}
              field="totals.total"
              emphasize
            />
          </dl>
        ) : (
          <p className="mt-4 text-sm text-white/45" data-client-quote-totals="unavailable">
            {copy.totalsUnavailable}
          </p>
        )}
        <p className="mt-4 text-xs leading-5 text-white/40">{copy.totalsAuthority}</p>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className="text-lg font-semibold text-white">{copy.paymentTitle}</h2>
        {readOnly ? (
          <p className="mt-2 text-xs uppercase tracking-[0.14em] text-white/35">
            {copy.frozenTerms}
          </p>
        ) : null}
        <div className="mt-5 space-y-4">
          <AreaControl
            label={copy.paymentSummary}
            value={editor.paymentSummary}
            readOnly={readOnly}
            field="paymentSummary"
            maxLength={CLIENT_QUOTE_FIELD_LIMITS.paymentSummary}
            onChange={(paymentSummary) => onChange({ ...editor, paymentSummary })}
          />
          <AreaControl
            label={`${copy.scheduleNote} ${messages.common.optional}`}
            value={editor.paymentScheduleNote}
            readOnly={readOnly}
            field="paymentScheduleNote"
            maxLength={CLIENT_QUOTE_FIELD_LIMITS.paymentScheduleNote}
            onChange={(paymentScheduleNote) => onChange({ ...editor, paymentScheduleNote })}
          />
        </div>

        <h2 className="mt-8 text-lg font-semibold text-white">{copy.validityTitle}</h2>
        {readOnly ? null : (
          <p className="mt-2 text-sm leading-6 text-white/45">{copy.validityHint}</p>
        )}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {readOnly ? (
            <>
              <div>
                <div className={LABEL_CLASS}>{copy.validForDays}</div>
                <p className="text-sm text-white" data-field="validForDays">
                  {editor.validForDaysText.trim() || "—"}
                </p>
              </div>
              <div>
                <div className={LABEL_CLASS}>{copy.validUntil}</div>
                <p className="text-sm text-white" data-field="validUntil">
                  {editor.validUntil.trim()
                    ? formatClientQuoteDate(editor.validUntil, locale)
                    : "—"}
                </p>
              </div>
            </>
          ) : (
            <>
              <TextControl
                label={copy.validForDays}
                optional={messages.common.optional}
                value={editor.validForDaysText}
                readOnly={false}
                field="validForDays"
                onChange={(validForDaysText) => onChange({ ...editor, validForDaysText })}
              />
              <FieldShell label={`${copy.validUntil} ${messages.common.optional}`}>
                <input
                  type="date"
                  data-field="validUntil"
                  value={editor.validUntil}
                  onChange={(event) =>
                    onChange({ ...editor, validUntil: event.target.value })
                  }
                  className={FIELD_CLASS}
                />
              </FieldShell>
            </>
          )}
        </div>
        <div className="mt-4">
          <AreaControl
            label={`${copy.commercialNotes} ${messages.common.optional}`}
            value={editor.validityNote}
            readOnly={readOnly}
            field="validityNote"
            maxLength={CLIENT_QUOTE_FIELD_LIMITS.validityNote}
            onChange={(validityNote) => onChange({ ...editor, validityNote })}
          />
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className="text-lg font-semibold text-white">{copy.appendixTitle}</h2>
        {readOnly ? (
          editor.appendixEnabled ? null : (
            <p className="mt-4 text-sm text-white/55" data-field="appendix.enabled">
              {copy.appendixOff}
            </p>
          )
        ) : (
          <>
            <p className="mt-2 text-sm leading-6 text-white/45">{copy.appendixHint}</p>
            <label className="mt-4 flex items-center gap-3 text-sm text-white">
              <input
                type="checkbox"
                data-field="appendix.enabled"
                checked={editor.appendixEnabled}
                onChange={(event) =>
                  onChange(setClientQuoteAppendixEnabled(editor, event.target.checked))
                }
                className="size-4 accent-[var(--athena-orange)]"
              />
              {copy.appendixEnable}
            </label>
          </>
        )}
        {editor.appendixEnabled ? (
          <div className="mt-5 space-y-4">
            {editor.appendixSections.map((section, index) => (
              <div
                key={`${index}-${section.heading}`}
                data-client-quote-appendix={index}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <TextControl
                  label={copy.appendixHeading}
                  value={section.heading}
                  readOnly={readOnly}
                  field={`appendix.${index}.heading`}
                  maxLength={CLIENT_QUOTE_FIELD_LIMITS.appendixHeading}
                  onChange={(heading) =>
                    onChange({
                      ...editor,
                      appendixSections: editor.appendixSections.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, heading } : item,
                      ),
                    })
                  }
                />
                <div className="mt-4">
                  <AreaControl
                    label={copy.appendixBody}
                    value={section.body}
                    readOnly={readOnly}
                    field={`appendix.${index}.body`}
                    rows={6}
                    maxLength={CLIENT_QUOTE_FIELD_LIMITS.appendixBody}
                    onChange={(body) =>
                      onChange({
                        ...editor,
                        appendixSections: editor.appendixSections.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, body } : item,
                        ),
                      })
                    }
                  />
                </div>
                {readOnly ? null : (
                  <button
                    type="button"
                    className="mt-3 rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/5"
                    onClick={() => onChange(removeClientQuoteAppendixSection(editor, index))}
                  >
                    {copy.removeSection}
                  </button>
                )}
              </div>
            ))}
            {readOnly ? null : (
              <button
                type="button"
                data-client-quote-add-section="true"
                disabled={
                  editor.appendixSections.length >=
                  CLIENT_QUOTE_FIELD_LIMITS.appendixSections
                }
                onClick={() => onChange(addClientQuoteAppendixSection(editor))}
                className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/5 disabled:opacity-50"
              >
                {copy.addSection}
              </button>
            )}
          </div>
        ) : null}
      </section>

      {readOnly ? (
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:justify-end">
          {downloadQuoteId ? (
            <ClientQuotePdfDownloadButton
              quoteId={downloadQuoteId}
              disabled={busy}
              messages={messages}
            />
          ) : null}
          <button
            type="button"
            data-client-quote-revise="true"
            disabled={busy}
            onClick={onRevise}
            className="w-full rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 sm:w-auto"
          >
            {pending === "revise" ? copy.creatingRevision : copy.createRevision}
          </button>
        </div>
      ) : (
        <section
          className="rounded-2xl border border-white/10 bg-[var(--athena-card)] px-4 py-4 md:px-5"
          data-client-quote-issue-panel="inline"
        >
          <h2 className="text-sm font-semibold text-white">{copy.requirementsTitle}</h2>
          <ul
            className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap"
            data-client-quote-issue-requirements="true"
          >
            {CLIENT_QUOTE_ISSUE_REQUIREMENTS.map((requirement) => {
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
              data-client-quote-save="true"
              disabled={busy}
              onClick={onSave}
              className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-60"
            >
              {pending === "save" ? copy.savingDraft : copy.saveDraft}
            </button>
            <button
              type="button"
              data-client-quote-issue="true"
              disabled={busy}
              onClick={onIssue}
              className="rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {pending === "issue" ? copy.issuingQuote : copy.issueQuote}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
