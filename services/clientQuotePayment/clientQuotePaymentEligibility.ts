/**
 * CQ-STRIPE-1 Gate 2B — whether a quotation can start another payment request.
 * Expiry stays readable. It does not hide an intent recorded while payable.
 */

import {
  clientQuotePaymentExpiresAt,
  extractChargeableFrequencyGroups,
} from "@/services/clientQuotePayment/clientQuotePaymentDomain";
import {
  CLIENT_QUOTE_PAYMENT_COMPONENT_MINIMUM_MINOR,
  ClientQuotePaymentRequestError,
  clientQuotePaymentError,
  type ClientQuotePaymentErrorCode,
  type ClientQuotePaymentQuote,
  type ClientQuotePaymentRequest,
} from "@/services/clientQuotePayment/clientQuotePaymentTypes";

export type ClientQuotePaymentEligibility = {
  expired: boolean;
  expiresAt: string | null;
  canCreatePaymentRequest: boolean;
  /**
   * A new Stripe create may start. False after expiry even when POST can
   * still finish a dispatch that was already proved.
   */
  canInitiateStripe: boolean;
  blockedReason: ClientQuotePaymentErrorCode | null;
  oneTime: {
    amountMinor: number;
    amountSource: ClientQuotePaymentRequest["amountSource"];
    fullSelectable: boolean;
    splitSelectable: boolean;
    existingMode: "full" | "split" | null;
  } | null;
  recurring: Array<{
    billingFrequency: "monthly" | "quarterly" | "annually";
    amountMinor: number;
    amountSource: "frequency_totals";
    selectable: boolean;
  }>;
};

function blocked(reason: ClientQuotePaymentErrorCode): ClientQuotePaymentEligibility {
  return {
    expired: reason === "QUOTE_EXPIRED",
    expiresAt: null,
    canCreatePaymentRequest: false,
    canInitiateStripe: false,
    blockedReason: reason,
    oneTime: null,
    recurring: [],
  };
}

export function clientQuotePaymentQuoteExpired(
  quote: ClientQuotePaymentQuote,
  now: string,
): boolean {
  const expiresAt = clientQuotePaymentExpiresAt(quote);
  const nowMs = Date.parse(now);
  const expiryMs = Date.parse(expiresAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(expiryMs)) {
    throw clientQuotePaymentError(
      "VALIDITY_UNREADABLE",
      "The payment clock must be a canonical UTC timestamp.",
    );
  }
  return nowMs >= expiryMs;
}

export function readClientQuotePaymentEligibility(
  quote: ClientQuotePaymentQuote,
  requests: readonly ClientQuotePaymentRequest[],
  now: string,
): ClientQuotePaymentEligibility {
  try {
    const expiresAt = clientQuotePaymentExpiresAt(quote);
    const expired = clientQuotePaymentQuoteExpired(quote, now);
    const owned = requests.filter(
      (row) => row.sourceQuoteId === quote.id && row.licenseeAccountId === quote.licenseeAccountId,
    );
    const groups = extractChargeableFrequencyGroups(quote.issuedSnapshot);
    const existingFull = owned.some((row) => row.purpose === "one_time_full");
    const existingSplit = owned.some(
      (row) => row.purpose === "one_time_deposit" || row.purpose === "one_time_balance",
    );
    const existingMode: "full" | "split" | null = existingFull
      ? "full"
      : existingSplit
        ? "split"
        : null;
    const payable = !expired;
    const oneTimeGroup = groups.find((group) => group.billingFrequency === "one_time") ?? null;
    const oneTime =
      oneTimeGroup == null
        ? null
        : {
            amountMinor: oneTimeGroup.amountMinor,
            amountSource: oneTimeGroup.amountSource,
            fullSelectable:
              payable &&
              existingMode == null &&
              oneTimeGroup.amountMinor >= CLIENT_QUOTE_PAYMENT_COMPONENT_MINIMUM_MINOR,
            splitSelectable:
              payable &&
              existingMode == null &&
              oneTimeGroup.amountMinor >= CLIENT_QUOTE_PAYMENT_COMPONENT_MINIMUM_MINOR * 2,
            existingMode,
          };
    const recurring = groups
      .filter(
        (
          group,
        ): group is typeof group & {
          billingFrequency: "monthly" | "quarterly" | "annually";
          amountSource: "frequency_totals";
        } => group.billingFrequency !== "one_time" && group.amountSource === "frequency_totals",
      )
      .map((group) => {
        const requested = owned.some((row) => row.purpose === group.billingFrequency);
        return {
          billingFrequency: group.billingFrequency,
          amountMinor: group.amountMinor,
          amountSource: "frequency_totals" as const,
          selectable:
            payable &&
            !requested &&
            group.amountMinor >= CLIENT_QUOTE_PAYMENT_COMPONENT_MINIMUM_MINOR,
        };
      });
    const canCreatePaymentRequest = Boolean(
      payable && (oneTime?.fullSelectable || oneTime?.splitSelectable || recurring.some((row) => row.selectable)),
    );
    const unfulfilled = owned.some((row) => row.stripePaymentLinkUrl == null);
    return {
      expired,
      expiresAt,
      canCreatePaymentRequest,
      canInitiateStripe: payable && (canCreatePaymentRequest || unfulfilled),
      blockedReason: expired ? "QUOTE_EXPIRED" : null,
      oneTime,
      recurring,
    };
  } catch (error) {
    if (error instanceof ClientQuotePaymentRequestError) return blocked(error.code);
    throw error;
  }
}
