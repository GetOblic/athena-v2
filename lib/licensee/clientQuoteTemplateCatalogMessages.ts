/**
 * Stable template API codes and catalog field errors.
 * Master UI language only. Template descriptions are never translated here.
 */

import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import type { ClientQuoteTemplateField } from "@/lib/licensee/clientQuoteTemplateCatalogModel";
import type { ClientQuoteBillingFrequency } from "@/services/clientQuote/clientQuoteTypes";

const CLIENT_QUOTE_TEMPLATE_ERROR_KEYS = {
  UNAUTHORIZED: "unauthorized",
  LICENSEE_ACCESS_DENIED: "forbidden",
  NOT_FOUND: "notFound",
  INVALID_JSON: "validation",
  INVALID_CLIENT_QUOTE: "validation",
  INVALID_CLIENT_QUOTE_CALCULATION: "validation",
  PERSISTENCE_FAILED: "persistenceFailed",
  CLIENT_QUOTE_FAILED: "generic",
} as const satisfies Record<
  string,
  keyof LicenseeMessages["clientQuoteTemplates"]["errors"]
>;

export const CLIENT_QUOTE_TEMPLATE_STABLE_ERROR_CODES = Object.keys(
  CLIENT_QUOTE_TEMPLATE_ERROR_KEYS,
) as Array<keyof typeof CLIENT_QUOTE_TEMPLATE_ERROR_KEYS>;

export function clientQuoteTemplateErrorMessage(
  messages: LicenseeMessages,
  code: string | undefined,
): string {
  if (code && code in CLIENT_QUOTE_TEMPLATE_ERROR_KEYS) {
    const key =
      CLIENT_QUOTE_TEMPLATE_ERROR_KEYS[
        code as keyof typeof CLIENT_QUOTE_TEMPLATE_ERROR_KEYS
      ];
    return messages.clientQuoteTemplates.errors[key];
  }
  return messages.clientQuoteTemplates.errors.generic;
}

export function clientQuoteTemplateFieldMessage(
  messages: LicenseeMessages,
  field: ClientQuoteTemplateField,
): string {
  const errors = messages.clientQuoteTemplates.errors;
  switch (field) {
    case "name":
      return errors.nameRequired;
    case "description":
      return errors.descriptionRequired;
    case "quantity":
      return errors.quantityInvalid;
    case "unitPrice":
      return errors.unitPriceInvalid;
    case "currency":
      return errors.currencyInvalid;
    case "frequency":
      return errors.frequencyInvalid;
  }
}

export function clientQuoteTemplateFrequencyLabels(
  messages: LicenseeMessages,
): Record<ClientQuoteBillingFrequency, string> {
  const copy = messages.clientQuoteTemplates;
  return {
    one_time: copy.frequencyOneTime,
    monthly: copy.frequencyMonthly,
    quarterly: copy.frequencyQuarterly,
    annually: copy.frequencyAnnually,
  };
}

export function clientQuoteTemplateCurrencyLabel(
  messages: LicenseeMessages,
  currencyCode: string,
): string {
  const copy = messages.clientQuoteTemplates;
  if (currencyCode === "USD") return copy.currencyUsd;
  if (currencyCode === "EUR") return copy.currencyEur;
  return currencyCode;
}
