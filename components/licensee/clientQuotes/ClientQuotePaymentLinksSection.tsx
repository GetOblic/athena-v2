"use client";

import { Copy, ExternalLink } from "lucide-react";
import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import { formatClientQuoteMinorAmount } from "@/lib/licensee/clientQuoteEditorModel";
import { clientQuotePaymentLinkErrorMessage, clientQuotePaymentPurposeLabel } from "@/lib/licensee/clientQuotePaymentLinksMessages";
import type {
  ClientQuotePaymentLinkCard,
  ClientQuotePaymentLinkRecurring,
  ClientQuotePaymentLinksViewModel,
} from "@/lib/licensee/clientQuotePaymentLinksModel";

const CREATE_CLASS =
  "rounded-full bg-[var(--athena-orange)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60";
const QUIET_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-60";

function choiceClass(selected: boolean): string {
  return selected
    ? "rounded-full border border-[var(--athena-orange)] bg-[rgba(255,102,0,0.12)] px-4 py-2 text-sm font-semibold text-white"
    : "rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/5 disabled:opacity-60";
}

export function ClientQuotePaymentLinksSection({
  messages,
  view,
  depositText,
  copiedRequestId,
  copyFailed,
  onRetryLoad,
  onSelect,
  onDepositChange,
  onCreateFull,
  onCreateSplit,
  onCreateRecurring,
  onComplete,
  onRetrySame,
  onCopy,
}: {
  messages: LicenseeMessages;
  view: ClientQuotePaymentLinksViewModel;
  depositText: string;
  copiedRequestId: string | null;
  copyFailed: boolean;
  onRetryLoad?: () => void;
  onSelect?: (choice: "full" | "split") => void;
  onDepositChange?: (value: string) => void;
  onCreateFull?: () => void;
  onCreateSplit?: () => void;
  onCreateRecurring?: (frequency: ClientQuotePaymentLinkRecurring) => void;
  onComplete?: (key: "one_time_full" | "one_time_split" | ClientQuotePaymentLinkRecurring) => void;
  onRetrySame?: () => void;
  onCopy?: (requestId: string, url: string) => void;
}) {
  const copy = messages.clientQuotes.payments;
  const oneTime = view.oneTime;
  return (
    <section
      className="rounded-[28px] border border-white/10 bg-[var(--athena-card)] p-5 md:p-7"
      data-client-quote-payments="issued"
      data-client-quote-payments-phase={view.phase}
      data-client-quote-payment-pending={view.pending ? "true" : "false"}
      data-client-quote-payment-auto-retry="false"
      data-client-quote-payment-expired={view.expired ? "true" : "false"}
      data-client-quote-payment-full={
        oneTime?.fullVisible ? (oneTime.locked === "full" ? "locked" : "available") : "hidden"
      }
      data-client-quote-payment-split={
        oneTime?.splitVisible ? (oneTime.locked === "split" ? "locked" : "available") : "hidden"
      }
      data-client-quote-payment-recovery={view.recovery ?? "none"}
      data-client-quote-payment-error={view.failure?.code ?? ""}
      data-client-quote-payment-balance={
        oneTime?.showDepositEntry
          ? "pending"
          : oneTime?.serverBalanceMinor != null
            ? "server"
            : "none"
      }
      data-client-quote-payment-balance-minor={
        oneTime?.showDepositEntry ? "" : (oneTime?.serverBalanceMinor ?? "")
      }
      aria-busy={view.phase === "loading" || view.pending ? "true" : "false"}
    >
      <h2 className="text-sm font-semibold text-white">{copy.title}</h2>
      <p className="mt-2 text-sm leading-6 text-white/60">{copy.intro}</p>
      {view.phase === "loading" ? (
        <p className="mt-4 text-sm text-white/55" data-client-quote-payment-loading="true">
          {copy.loading}
        </p>
      ) : null}
      {view.phase === "load_failed" ? (
        <div className="mt-4" data-client-quote-payment-load-failed="true">
          <p className="text-sm text-red-300" role="alert">
            {clientQuotePaymentLinkErrorMessage(messages, view.failure?.code)}
          </p>
          <button type="button" className={`${QUIET_CLASS} mt-3`} onClick={onRetryLoad}>
            {copy.retryLoad}
          </button>
        </div>
      ) : null}
      {view.phase === "ready" ? (
        <div className="mt-4 space-y-4">
          {view.expired ? (
            <p className="text-sm leading-6 text-amber-100" role="status" data-client-quote-payment-expired-note="true">
              {copy.expired}
            </p>
          ) : null}
          {view.pending ? (
            <p className="text-sm text-white/70" role="status" data-client-quote-payment-creating="true">
              {copy.creating}
            </p>
          ) : null}
          {view.failure && view.recovery !== "unfulfilled" ? (
            <p className="text-sm leading-6 text-red-300" role="alert">
              {view.recovery === "uncertain"
                ? copy.uncertain
                : view.recovery === "unrecoverable"
                  ? copy.unrecoverable
                  : clientQuotePaymentLinkErrorMessage(messages, view.failure.code)}
            </p>
          ) : null}
          {view.recovery === "unfulfilled" ? (
            <p className="text-sm leading-6 text-amber-100" role="status" data-client-quote-payment-unfulfilled="true">
              {copy.unfulfilled}
            </p>
          ) : null}
          {view.canRetrySame ? (
            <button
              type="button"
              className={CREATE_CLASS}
              disabled={view.pending}
              data-client-quote-payment-retry-same="true"
              onClick={onRetrySame}
            >
              {copy.retrySame}
            </button>
          ) : null}
          {view.unavailable === "currency" ? (
            <p className="text-sm text-white/70" data-client-quote-payment-unavailable="currency">
              {copy.currencyUnsupported}
            </p>
          ) : null}
          {view.unavailable === "no_charge" ? (
            <p className="text-sm text-white/70" data-client-quote-payment-unavailable="no_charge">
              {copy.unavailable}
            </p>
          ) : null}
          {oneTime ? (
            <div data-client-quote-payment-one-time="true">
              <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-white/45">
                {copy.oneTimeTitle}
              </h3>
              {oneTime.locked === "split" ? (
                <p className="mt-2 text-sm text-white/60">{copy.splitLocked}</p>
              ) : null}
              {oneTime.locked === "full" ? (
                <p className="mt-2 text-sm text-white/60">{copy.fullLocked}</p>
              ) : null}
              {oneTime.totalMinor != null && view.currencyCode && oneTime.locked == null ? (
                <p
                  className="mt-2 text-sm text-white"
                  data-client-quote-payment-one-time-total={oneTime.totalMinor}
                >
                  {formatClientQuoteMinorAmount(oneTime.totalMinor, view.currencyCode)}
                </p>
              ) : null}
              {oneTime.showChoice ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={choiceClass(oneTime.selected === "full")}
                    disabled={view.pending}
                    data-client-quote-payment-option="full"
                    data-selected={oneTime.selected === "full" ? "true" : "false"}
                    onClick={() => onSelect?.("full")}
                  >
                    {copy.fullOption}
                  </button>
                  <button
                    type="button"
                    className={choiceClass(oneTime.selected === "split")}
                    disabled={view.pending}
                    data-client-quote-payment-option="split"
                    data-selected={oneTime.selected === "split" ? "true" : "false"}
                    onClick={() => onSelect?.("split")}
                  >
                    {copy.splitOption}
                  </button>
                </div>
              ) : null}
              {oneTime.showFullCreate ? (
                <button
                  type="button"
                  className={`${CREATE_CLASS} mt-3`}
                  disabled={view.pending}
                  data-client-quote-payment-create="one_time_full"
                  onClick={onCreateFull}
                >
                  {copy.createFull}
                </button>
              ) : null}
              {oneTime.showDepositEntry ? (
                <div className="mt-3 space-y-3" data-client-quote-payment-split-entry="true">
                  <p className="text-sm text-white/60">{copy.pairNote}</p>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-white/45">
                      {copy.depositLabel}
                      {view.currencyCode ? ` · ${view.currencyCode}` : ""}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={depositText}
                      disabled={view.pending}
                      data-client-quote-payment-deposit="true"
                      onChange={(event) => onDepositChange?.(event.target.value)}
                      className="w-full max-w-xs rounded-2xl border border-white/20 bg-[#161922] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[var(--athena-orange)] focus:ring-2 focus:ring-[var(--athena-orange)]/30"
                    />
                  </label>
                  <p className="text-xs leading-5 text-white/45">{copy.depositHint}</p>
                  {oneTime.depositStatus === "invalid" ? (
                    <p className="text-sm text-red-300" role="alert">
                      {copy.depositInvalid}
                    </p>
                  ) : null}
                  {oneTime.depositStatus === "below_minimum" ? (
                    <p className="text-sm text-red-300" role="alert">
                      {copy.depositMinimum}
                    </p>
                  ) : null}
                  <div data-client-quote-payment-purpose="one_time_balance">
                    <p className="text-sm font-medium text-white">{copy.balanceLabel}</p>
                    <p className="text-sm text-white/60" data-client-quote-payment-balance-pending="true">
                      {copy.balancePending}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={CREATE_CLASS}
                    disabled={view.pending || !oneTime.splitCreateEnabled}
                    data-client-quote-payment-create="one_time_split"
                    onClick={onCreateSplit}
                  >
                    {copy.createSplit}
                  </button>
                </div>
              ) : null}
              {oneTime.cards.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {oneTime.cards.map((card) => (
                    <PaymentLinkCard
                      key={card.requestId}
                      card={card}
                      messages={messages}
                      copied={copiedRequestId === card.requestId}
                      copyFailed={copyFailed && copiedRequestId === card.requestId}
                      onCopy={onCopy}
                    />
                  ))}
                </div>
              ) : null}
              {oneTime.completeFull ? (
                <button
                  type="button"
                  className={`${CREATE_CLASS} mt-3`}
                  disabled={view.pending}
                  data-client-quote-payment-complete="one_time_full"
                  onClick={() => onComplete?.("one_time_full")}
                >
                  {copy.completeLink}
                </button>
              ) : null}
              {oneTime.completeSplit ? (
                <button
                  type="button"
                  className={`${CREATE_CLASS} mt-3`}
                  disabled={view.pending}
                  data-client-quote-payment-complete="one_time_split"
                  onClick={() => onComplete?.("one_time_split")}
                >
                  {copy.completeLink}
                </button>
              ) : null}
            </div>
          ) : null}
          {view.recurring.length > 0 ? (
            <div data-client-quote-payment-recurring="true">
              <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-white/45">
                {copy.recurringTitle}
              </h3>
              <p className="mt-2 text-sm text-white/60">{copy.recurringNote}</p>
              <div className="mt-3 space-y-2">
                {view.recurring.map((row) => (
                  <div
                    key={row.billingFrequency}
                    className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                    data-client-quote-payment-frequency={row.billingFrequency}
                    data-client-quote-payment-frequency-amount={row.amountMinor}
                  >
                    <p className="text-sm font-medium text-white">
                      {clientQuotePaymentPurposeLabel(messages, row.billingFrequency)}
                    </p>
                    {row.card ? null : (
                      <p className="text-sm text-white/70">
                        {formatClientQuoteMinorAmount(row.amountMinor, row.currencyCode)}
                      </p>
                    )}
                    {row.card ? (
                      <div className="mt-2">
                        <PaymentLinkCard
                          card={row.card}
                          messages={messages}
                          copied={copiedRequestId === row.card.requestId}
                          copyFailed={copyFailed && copiedRequestId === row.card.requestId}
                          onCopy={onCopy}
                          hidePurpose
                        />
                      </div>
                    ) : null}
                    {row.canCreate ? (
                      <button
                        type="button"
                        className={`${CREATE_CLASS} mt-3`}
                        disabled={view.pending}
                        data-client-quote-payment-create={row.billingFrequency}
                        onClick={() => onCreateRecurring?.(row.billingFrequency)}
                      >
                        {copy.createRecurring}
                      </button>
                    ) : null}
                    {row.canComplete ? (
                      <button
                        type="button"
                        className={`${CREATE_CLASS} mt-3`}
                        disabled={view.pending}
                        data-client-quote-payment-complete={row.billingFrequency}
                        onClick={() => onComplete?.(row.billingFrequency)}
                      >
                        {copy.completeLink}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function PaymentLinkCard({
  card,
  messages,
  copied,
  copyFailed,
  hidePurpose = false,
  onCopy,
}: {
  card: ClientQuotePaymentLinkCard;
  messages: LicenseeMessages;
  copied: boolean;
  copyFailed: boolean;
  hidePurpose?: boolean;
  onCopy?: (requestId: string, url: string) => void;
}) {
  const copy = messages.clientQuotes.payments;
  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      data-client-quote-payment-link={card.purpose}
      data-client-quote-payment-amount={card.amountMinor}
      data-client-quote-payment-currency={card.currencyCode}
    >
      <div>
        {hidePurpose ? null : (
          <p className="text-sm font-medium text-white">
            {clientQuotePaymentPurposeLabel(messages, card.purpose)}
          </p>
        )}
        <p className="text-sm text-white/70">
          {formatClientQuoteMinorAmount(card.amountMinor, card.currencyCode)}
        </p>
        {card.url ? null : (
          <p className="text-xs text-white/45" data-client-quote-payment-link-missing="true">
            {copy.linkMissing}
          </p>
        )}
      </div>
      {card.url ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={QUIET_CLASS}
            data-client-quote-payment-copy="true"
            data-client-quote-payment-copy-url={card.url}
            data-client-quote-payment-copied={copied ? "true" : "false"}
            onClick={() => onCopy?.(card.requestId, card.url!)}
          >
            <Copy size={16} aria-hidden="true" />
            {copied ? copy.copiedLink : copy.copyLink}
          </button>
          <a
            href={card.url}
            target="_blank"
            rel="noopener noreferrer"
            className={QUIET_CLASS}
            data-client-quote-payment-open="true"
            data-client-quote-payment-open-url={card.url}
          >
            <ExternalLink size={16} aria-hidden="true" />
            {copy.openInStripe}
          </a>
        </div>
      ) : null}
      {copyFailed ? (
        <p className="text-sm text-red-300" role="alert" data-client-quote-payment-copy-error="true">
          {copy.copyFailed}
        </p>
      ) : null}
    </div>
  );
}
