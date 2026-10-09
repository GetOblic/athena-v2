/**
 * Pure copy-on-insert (EST-QUOTE-2B.2).
 * Copies description, quantity, unit price, and billing frequency onto a new
 * quotation line. The line does not store templateId. The template is not
 * mutated, and later line edits do not write back.
 * Currency must already match. There is no foreign-exchange conversion.
 * The quotation draft validator still rejects more than
 * CLIENT_QUOTE_FIELD_LIMITS.lineItems lines. This helper does not price them.
 */

import { ClientQuoteValidationError } from "@/services/clientQuote/clientQuoteTypes";
import type { ClientQuoteBillingFrequency, ClientQuoteQuantity } from "@/services/clientQuote/clientQuoteTypes";
import {
  parseClientQuoteTemplateBody,
  parseClientQuoteTemplateCurrency,
} from "@/services/clientQuote/clientQuoteTemplateValidation";

/**
 * Commercial fields required to copy a template.
 * A full service template satisfies this. Public catalog rows do too.
 * deletedAt is absent on an active public row and rejects a masked template.
 */
export type ClientQuoteTemplateCopySource = {
  name: string;
  description: string;
  quantity: ClientQuoteQuantity;
  unitPriceMinor: number;
  currencyCode: string;
  billingFrequency: ClientQuoteBillingFrequency;
  deletedAt?: string | null;
};

const LINE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export type ClientQuoteTemplateLineCopy = {
  id: string;
  description: string;
  quantity: ClientQuoteQuantity;
  unitPriceMinor: number;
  billingFrequency: ClientQuoteBillingFrequency;
};

function fail(details: string[]): never {
  throw new ClientQuoteValidationError(details);
}

function parseLineId(value: unknown): string {
  if (typeof value !== "string") {
    fail(["lineId must be a non-empty string."]);
  }
  const trimmed = value.trim();
  if (!LINE_ID_PATTERN.test(trimmed)) {
    fail(["lineId contains unsupported characters."]);
  }
  return trimmed;
}

export function copyClientQuoteTemplateToLine(input: {
  template: ClientQuoteTemplateCopySource;
  currencyCode: unknown;
  lineId: unknown;
}): ClientQuoteTemplateLineCopy {
  if (input.template.deletedAt) {
    fail(["Template is not active."]);
  }
  const commercial = parseClientQuoteTemplateBody({
    name: input.template.name,
    description: input.template.description,
    quantity: input.template.quantity,
    unitPriceMinor: input.template.unitPriceMinor,
    currencyCode: input.template.currencyCode,
    billingFrequency: input.template.billingFrequency,
  });
  const quotationCurrency = parseClientQuoteTemplateCurrency(input.currencyCode);
  if (quotationCurrency !== commercial.currencyCode) {
    fail(["Template currency does not match the quotation currency."]);
  }
  return {
    id: parseLineId(input.lineId),
    description: commercial.description,
    quantity: {
      coefficient: commercial.quantity.coefficient,
      scale: commercial.quantity.scale,
    },
    unitPriceMinor: commercial.unitPriceMinor,
    billingFrequency: commercial.billingFrequency,
  };
}
