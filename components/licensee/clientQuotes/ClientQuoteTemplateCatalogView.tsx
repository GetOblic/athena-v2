"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import {
  clientQuoteTemplateCurrencyOptions,
  clientQuoteTemplateFrequencyList,
  filterClientQuoteTemplates,
  type ClientQuoteTemplateField,
  type ClientQuoteTemplateFormValues,
} from "@/lib/licensee/clientQuoteTemplateCatalogModel";
import {
  clientQuoteTemplateCurrencyLabel,
  clientQuoteTemplateFrequencyLabels,
} from "@/lib/licensee/clientQuoteTemplateCatalogMessages";
import {
  formatClientQuoteMajorInput,
  formatClientQuoteQuantity,
} from "@/lib/licensee/clientQuoteEditorModel";
import {
  LICENSEE_EMPTY_STATE_CLASS,
  LICENSEE_ERROR_NOTICE_CLASS,
  LICENSEE_PRIMARY_CTA_CLASS,
  LICENSEE_SEARCH_INPUT_CLASS,
} from "@/lib/licensee/licenseeDashboardPresentation";
import type { PublicClientQuoteTemplate } from "@/services/clientQuote/clientQuoteTemplatePublic";
import type { ClientQuoteBillingFrequency } from "@/services/clientQuote/clientQuoteTypes";

const FIELD_CLASS =
  "w-full rounded-2xl border border-white/20 bg-[#161922] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[var(--athena-orange)] focus:ring-2 focus:ring-[var(--athena-orange)]/30";
const LABEL_CLASS =
  "mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-white/45";

export type ClientQuoteTemplateFormState = {
  mode: "create" | "edit";
  templateId: string | null;
  originalCurrencyCode: string | null;
  values: ClientQuoteTemplateFormValues;
  fieldErrors: Partial<Record<ClientQuoteTemplateField, string>>;
  formError: string | null;
  pending: boolean;
};

export type ClientQuoteTemplateMaskState = {
  template: PublicClientQuoteTemplate;
  pending: boolean;
  error: string | null;
};

export type ClientQuoteTemplateCatalogViewProps = {
  phase: "loading" | "error" | "ready";
  templates: readonly PublicClientQuoteTemplate[];
  error: string | null;
  notice: string | null;
  locale: string;
  messages: LicenseeMessages;
  searchQuery?: string;
  form: ClientQuoteTemplateFormState | null;
  mask: ClientQuoteTemplateMaskState | null;
  onRetry: () => void;
  onCreate: () => void;
  onEdit: (templateId: string) => void;
  onCancelForm: () => void;
  onChangeForm: (patch: Partial<ClientQuoteTemplateFormValues>) => void;
  onSubmitForm: () => void;
  onRequestMask: (templateId: string) => void;
  onCancelMask: () => void;
  onConfirmMask: () => void;
};

function frequencyLabel(
  messages: LicenseeMessages,
  frequency: ClientQuoteBillingFrequency,
): string {
  return clientQuoteTemplateFrequencyLabels(messages)[frequency];
}

export function ClientQuoteTemplateCatalogView({
  phase,
  templates,
  error,
  notice,
  locale,
  messages,
  searchQuery,
  form,
  mask,
  onRetry,
  onCreate,
  onEdit,
  onCancelForm,
  onChangeForm,
  onSubmitForm,
  onRequestMask,
  onCancelMask,
  onConfirmMask,
}: ClientQuoteTemplateCatalogViewProps) {
  const copy = messages.clientQuoteTemplates;
  const [uncontrolledQuery, setUncontrolledQuery] = useState("");
  const query = searchQuery ?? uncontrolledQuery;
  const frequencyLabels = clientQuoteTemplateFrequencyLabels(messages);
  const currencyLabels = {
    USD: copy.currencyUsd,
    EUR: copy.currencyEur,
  };
  const rows = filterClientQuoteTemplates(templates, query, {
    frequency: frequencyLabels,
    currency: currencyLabels,
  });
  const searching = query.trim().length > 0;

  function setQuery(next: string) {
    if (searchQuery == null) setUncontrolledQuery(next);
  }

  return (
    <section data-quote-template-catalog="true" data-quote-template-locale={locale}>
      <Link
        href="/licensee/client-quotes"
        data-quote-template-back="true"
        className="text-sm text-[var(--athena-orange)]"
      >
        {copy.backToQuotes}
      </Link>
      <div className="mt-6 text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        {copy.eyebrow}
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">{copy.intro}</p>

      {notice ? (
        <p className="mt-6 text-sm text-emerald-100" role="status" data-quote-template-notice="true">
          {notice}
        </p>
      ) : null}

      {phase === "loading" ? (
        <p className="mt-8 text-sm text-white/45" data-quote-template-loading="true">
          {copy.loading}
        </p>
      ) : null}

      {phase === "error" ? (
        <div className={`mt-8 ${LICENSEE_ERROR_NOTICE_CLASS}`} role="alert">
          <p>{error || copy.errors.generic}</p>
          <button
            type="button"
            onClick={onRetry}
            data-quote-template-retry="true"
            className="mt-4 rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
          >
            {messages.common.retry}
          </button>
        </div>
      ) : null}

      {phase === "ready" && error ? (
        <div className={`mt-6 ${LICENSEE_ERROR_NOTICE_CLASS}`} role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {phase === "ready" && templates.length > 0 ? (
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
              data-quote-template-search="true"
              className={LICENSEE_SEARCH_INPUT_CLASS}
            />
          </div>
          {searching ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              data-quote-template-search-clear="true"
              className="self-start rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
            >
              {copy.clearSearch}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCreate}
            data-quote-template-create="true"
            className={LICENSEE_PRIMARY_CTA_CLASS}
          >
            {copy.createAction}
          </button>
        </div>
      ) : null}

      {form ? (
        <TemplateForm
          form={form}
          messages={messages}
          onCancel={onCancelForm}
          onChange={onChangeForm}
          onSubmit={onSubmitForm}
        />
      ) : null}

      {phase === "ready" && templates.length === 0 && !form ? (
        <div className={`mt-8 ${LICENSEE_EMPTY_STATE_CLASS}`} data-quote-template-empty="true">
          <h2 className="text-xl font-semibold text-white">{copy.emptyTitle}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/50">
            {copy.emptyBody}
          </p>
          <button
            type="button"
            onClick={onCreate}
            data-quote-template-create="true"
            className={`mt-6 ${LICENSEE_PRIMARY_CTA_CLASS}`}
          >
            {copy.createAction}
          </button>
        </div>
      ) : null}

      {phase === "ready" && templates.length > 0 && rows.length === 0 ? (
        <div
          className={`mt-6 ${LICENSEE_EMPTY_STATE_CLASS}`}
          data-quote-template-search-empty="true"
        >
          <h2 className="text-xl font-semibold text-white">{copy.searchEmptyTitle}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/50">
            {copy.searchEmptyBody}
          </p>
        </div>
      ) : null}

      {phase === "ready" && rows.length > 0 ? (
        <ul className="mt-6 space-y-3">
          {rows.map((template) => (
            <li key={template.id}>
              <article
                data-quote-template-row={template.id}
                className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-white">{template.name}</h2>
                    <p className="mt-2 text-sm leading-6 text-white/70">{template.description}</p>
                    <dl className="mt-3 grid gap-2 text-sm text-white/55 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs uppercase tracking-[0.14em] text-white/35">
                          {copy.quantity}
                        </dt>
                        <dd className="mt-1 text-white/80">
                          {formatClientQuoteQuantity(template.quantity)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-[0.14em] text-white/35">
                          {copy.unitPrice}
                        </dt>
                        <dd className="mt-1 text-white/80" data-quote-template-price={template.id}>
                          {formatClientQuoteMajorInput(
                            template.unitPriceMinor,
                            template.currencyCode,
                          )}{" "}
                          {template.currencyCode}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-[0.14em] text-white/35">
                          {copy.currency}
                        </dt>
                        <dd className="mt-1 text-white/80">
                          {clientQuoteTemplateCurrencyLabel(messages, template.currencyCode)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-[0.14em] text-white/35">
                          {copy.billingFrequency}
                        </dt>
                        <dd className="mt-1 text-white/80" data-quote-template-frequency={template.id}>
                          {frequencyLabel(messages, template.billingFrequency)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      data-quote-template-delete={template.id}
                      onClick={() => onRequestMask(template.id)}
                      className="inline-flex shrink-0 rounded-full border border-white/15 px-4 py-2.5 text-sm font-medium text-white/70 hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-100"
                    >
                      {copy.deleteAction}
                    </button>
                    <button
                      type="button"
                      data-quote-template-edit={template.id}
                      onClick={() => onEdit(template.id)}
                      className="inline-flex shrink-0 rounded-full bg-[var(--athena-orange)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
                    >
                      {copy.editAction}
                    </button>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : null}

      {mask ? (
        <TemplateMaskDialog
          mask={mask}
          messages={messages}
          onCancel={onCancelMask}
          onConfirm={onConfirmMask}
        />
      ) : null}
    </section>
  );
}

function TemplateForm({
  form,
  messages,
  onCancel,
  onChange,
  onSubmit,
}: {
  form: ClientQuoteTemplateFormState;
  messages: LicenseeMessages;
  onCancel: () => void;
  onChange: (patch: Partial<ClientQuoteTemplateFormValues>) => void;
  onSubmit: () => void;
}) {
  const copy = messages.clientQuoteTemplates;
  const currencyOptions = clientQuoteTemplateCurrencyOptions(form.originalCurrencyCode);
  const frequencies = clientQuoteTemplateFrequencyList();
  const busy = form.pending;

  return (
    <form
      className="mt-8 rounded-[28px] border border-white/10 bg-[var(--athena-card)] p-5 md:p-7"
      data-quote-template-form={form.mode}
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) onSubmit();
      }}
    >
      <h2 className="text-xl font-semibold text-white">
        {form.mode === "create" ? copy.createTitle : copy.editTitle}
      </h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="md:col-span-2">
          <span className={LABEL_CLASS}>{copy.serviceName}</span>
          <input
            value={form.values.name}
            disabled={busy}
            maxLength={200}
            data-quote-template-name="true"
            aria-invalid={form.fieldErrors.name ? true : undefined}
            onChange={(event) => onChange({ name: event.target.value })}
            className={FIELD_CLASS}
          />
          {form.fieldErrors.name ? (
            <p className="mt-2 text-sm text-red-300" data-quote-template-field-error="name">
              {form.fieldErrors.name}
            </p>
          ) : null}
        </label>
        <label className="md:col-span-2">
          <span className={LABEL_CLASS}>{copy.description}</span>
          <textarea
            value={form.values.description}
            disabled={busy}
            rows={4}
            maxLength={500}
            data-quote-template-description="true"
            aria-invalid={form.fieldErrors.description ? true : undefined}
            onChange={(event) => onChange({ description: event.target.value })}
            className={FIELD_CLASS}
          />
          {form.fieldErrors.description ? (
            <p className="mt-2 text-sm text-red-300" data-quote-template-field-error="description">
              {form.fieldErrors.description}
            </p>
          ) : null}
        </label>
        <label>
          <span className={LABEL_CLASS}>{copy.quantity}</span>
          <input
            value={form.values.quantityText}
            disabled={busy}
            inputMode="decimal"
            data-quote-template-quantity="true"
            aria-invalid={form.fieldErrors.quantity ? true : undefined}
            onChange={(event) => onChange({ quantityText: event.target.value })}
            className={FIELD_CLASS}
          />
          {form.fieldErrors.quantity ? (
            <p className="mt-2 text-sm text-red-300" data-quote-template-field-error="quantity">
              {form.fieldErrors.quantity}
            </p>
          ) : null}
        </label>
        <label>
          <span className={LABEL_CLASS}>{copy.unitPrice}</span>
          <input
            value={form.values.unitPriceText}
            disabled={busy}
            inputMode="decimal"
            data-quote-template-price="true"
            aria-invalid={form.fieldErrors.unitPrice ? true : undefined}
            onChange={(event) => onChange({ unitPriceText: event.target.value })}
            className={FIELD_CLASS}
          />
          {form.fieldErrors.unitPrice ? (
            <p className="mt-2 text-sm text-red-300" data-quote-template-field-error="unitPrice">
              {form.fieldErrors.unitPrice}
            </p>
          ) : null}
        </label>
        <label>
          <span className={LABEL_CLASS}>{copy.currency}</span>
          <select
            value={form.values.currencyCode}
            disabled={busy}
            data-quote-template-currency="true"
            aria-invalid={form.fieldErrors.currency ? true : undefined}
            onChange={(event) => onChange({ currencyCode: event.target.value })}
            className={FIELD_CLASS}
          >
            {currencyOptions.map((code) => (
              <option key={code} value={code}>
                {clientQuoteTemplateCurrencyLabel(messages, code)}
              </option>
            ))}
          </select>
          {form.fieldErrors.currency ? (
            <p className="mt-2 text-sm text-red-300" data-quote-template-field-error="currency">
              {form.fieldErrors.currency}
            </p>
          ) : null}
        </label>
        <label>
          <span className={LABEL_CLASS}>{copy.billingFrequency}</span>
          <select
            value={form.values.billingFrequency}
            disabled={busy}
            data-quote-template-frequency="true"
            aria-invalid={form.fieldErrors.frequency ? true : undefined}
            onChange={(event) => onChange({ billingFrequency: event.target.value })}
            className={FIELD_CLASS}
          >
            {frequencies.map((frequency) => (
              <option key={frequency} value={frequency}>
                {frequencyLabel(messages, frequency)}
              </option>
            ))}
          </select>
          {form.fieldErrors.frequency ? (
            <p className="mt-2 text-sm text-red-300" data-quote-template-field-error="frequency">
              {form.fieldErrors.frequency}
            </p>
          ) : null}
        </label>
      </div>
      {form.formError ? (
        <p className="mt-4 text-sm text-red-300" role="alert" data-quote-template-form-error="true">
          {form.formError}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          data-quote-template-cancel="true"
          className="rounded-xl border border-[var(--athena-border)] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white disabled:opacity-60"
        >
          {copy.cancel}
        </button>
        <button
          type="submit"
          disabled={busy}
          data-quote-template-save="true"
          className="rounded-xl bg-[var(--athena-orange)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {busy ? copy.saving : copy.save}
        </button>
      </div>
    </form>
  );
}

function TemplateMaskDialog({
  mask,
  messages,
  onCancel,
  onConfirm,
}: {
  mask: ClientQuoteTemplateMaskState;
  messages: LicenseeMessages;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const copy = messages.clientQuoteTemplates;
  const template = mask.template;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 py-6 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-template-mask-title"
        className="w-full max-w-md rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 shadow-2xl shadow-black/40"
        data-quote-template-mask="true"
      >
        <h2 id="quote-template-mask-title" className="text-xl font-semibold text-white">
          {copy.deleteDialogTitle}
        </h2>
        <p className="mt-3 text-sm leading-6 text-white/55">{copy.deleteDialogBody}</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-white/35">
              {copy.serviceName}
            </dt>
            <dd className="mt-1 text-white/85" data-quote-template-mask-name="true">
              {template.name}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-white/35">
              {copy.currency}
            </dt>
            <dd className="mt-1 text-white/85" data-quote-template-mask-currency="true">
              {clientQuoteTemplateCurrencyLabel(messages, template.currencyCode)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-white/35">
              {copy.unitPrice}
            </dt>
            <dd className="mt-1 text-white/85" data-quote-template-mask-price="true">
              {formatClientQuoteMajorInput(template.unitPriceMinor, template.currencyCode)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-white/35">
              {copy.billingFrequency}
            </dt>
            <dd className="mt-1 text-white/85" data-quote-template-mask-frequency="true">
              {frequencyLabel(messages, template.billingFrequency)}
            </dd>
          </div>
        </dl>
        {mask.error ? (
          <p className="mt-3 text-sm text-red-300" role="alert">
            {mask.error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            disabled={mask.pending}
            onClick={onCancel}
            data-quote-template-mask-cancel="true"
            className="rounded-xl border border-[var(--athena-border)] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white disabled:opacity-60"
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            disabled={mask.pending}
            onClick={onConfirm}
            data-quote-template-mask-confirm="true"
            className="rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-500/25 disabled:opacity-60"
          >
            {mask.pending ? copy.deleting : copy.deleteConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
