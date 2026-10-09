/**
 * Licensee service-template catalog form and search (EST-QUOTE-2B.4).
 * Major-unit text is converted with the quotation minor-unit rules.
 * This module does not price a quotation line and does not persist.
 */

import {
  formatClientQuoteMajorInput,
  formatClientQuoteQuantity,
  parseClientQuoteMajorAmount,
  parseClientQuoteQuantityText,
  clientQuoteCurrencyOptions,
} from "@/lib/licensee/clientQuoteEditorModel";
import { normalizeCurrencyCode } from "@/services/clientQuote/clientQuoteMoney";
import {
  CLIENT_QUOTE_BILLING_FREQUENCIES,
  CLIENT_QUOTE_FIELD_LIMITS,
  ClientQuoteCalculationError,
  isClientQuoteBillingFrequency,
  type ClientQuoteBillingFrequency,
} from "@/services/clientQuote/clientQuoteTypes";
import { CLIENT_QUOTE_TEMPLATE_NAME_MAX } from "@/services/clientQuote/clientQuoteTemplateTypes";
import type { PublicClientQuoteTemplate } from "@/services/clientQuote/clientQuoteTemplatePublic";

export const CLIENT_QUOTE_TEMPLATE_CREATE_CURRENCIES = ["USD", "EUR"] as const;

export type ClientQuoteTemplateField =
  | "name"
  | "description"
  | "quantity"
  | "unitPrice"
  | "currency"
  | "frequency";

export type ClientQuoteTemplateFormValues = {
  name: string;
  description: string;
  quantityText: string;
  unitPriceText: string;
  currencyCode: string;
  billingFrequency: string;
};

export type ClientQuoteTemplateWriteBody = {
  name: string;
  description: string;
  quantity: {
    coefficient: number;
    scale: number;
  };
  unitPriceMinor: number;
  currencyCode: string;
  billingFrequency: ClientQuoteBillingFrequency;
};

export type ClientQuoteTemplateBuildResult =
  | { ok: true; body: ClientQuoteTemplateWriteBody }
  | { ok: false; fields: ClientQuoteTemplateField[] };

export type ClientQuoteTemplateSearchLabels = {
  frequency: Record<ClientQuoteBillingFrequency, string>;
  currency: Readonly<Record<string, string>>;
};

const FIELD_ORDER: readonly ClientQuoteTemplateField[] = [
  "name",
  "description",
  "quantity",
  "unitPrice",
  "currency",
  "frequency",
];

export function emptyClientQuoteTemplateForm(): ClientQuoteTemplateFormValues {
  return {
    name: "",
    description: "",
    quantityText: "1",
    unitPriceText: "",
    currencyCode: "USD",
    billingFrequency: "one_time",
  };
}

export function clientQuoteTemplateFormFromTemplate(
  template: PublicClientQuoteTemplate,
): ClientQuoteTemplateFormValues {
  return {
    name: template.name,
    description: template.description,
    quantityText: formatClientQuoteQuantity(template.quantity),
    unitPriceText: formatClientQuoteMajorInput(
      template.unitPriceMinor,
      template.currencyCode,
    ),
    currencyCode: template.currencyCode,
    billingFrequency: template.billingFrequency,
  };
}

/**
 * New templates offer USD and EUR.
 * An existing template keeps another supported ISO code.
 * A different minor-unit scale stays on that code so the price is not reinterpreted.
 * Same-scale codes may move to USD or EUR, matching the quotation currency rule.
 */
export function clientQuoteTemplateCurrencyOptions(
  originalCurrencyCode: string | null,
): readonly string[] {
  if (!originalCurrencyCode) {
    return CLIENT_QUOTE_TEMPLATE_CREATE_CURRENCIES;
  }
  let current: string;
  try {
    current = normalizeCurrencyCode(originalCurrencyCode);
  } catch (error) {
    if (error instanceof ClientQuoteCalculationError) {
      return CLIENT_QUOTE_TEMPLATE_CREATE_CURRENCIES;
    }
    throw error;
  }
  return clientQuoteCurrencyOptions(current) ?? [current];
}

function pushField(
  fields: ClientQuoteTemplateField[],
  field: ClientQuoteTemplateField,
) {
  if (!fields.includes(field)) fields.push(field);
}

export function buildClientQuoteTemplateRequest(
  values: ClientQuoteTemplateFormValues,
  context: { originalCurrencyCode: string | null },
): ClientQuoteTemplateBuildResult {
  const fields: ClientQuoteTemplateField[] = [];
  const name = values.name.trim();
  if (
    !name ||
    name.length > CLIENT_QUOTE_TEMPLATE_NAME_MAX ||
    name.includes("\u0000")
  ) {
    pushField(fields, "name");
  }
  const description = values.description.trim();
  if (
    !description ||
    description.length > CLIENT_QUOTE_FIELD_LIMITS.lineDescription ||
    description.includes("\u0000")
  ) {
    pushField(fields, "description");
  }
  const quantity = parseClientQuoteQuantityText(values.quantityText);
  if (!quantity) pushField(fields, "quantity");

  let currencyCode = "";
  let currencyAllowed = false;
  try {
    currencyCode = normalizeCurrencyCode(values.currencyCode);
    currencyAllowed = clientQuoteTemplateCurrencyOptions(
      context.originalCurrencyCode,
    ).includes(currencyCode);
  } catch (error) {
    if (!(error instanceof ClientQuoteCalculationError)) throw error;
  }
  if (!currencyAllowed) pushField(fields, "currency");

  let unitPriceMinor: number | null = null;
  if (!values.unitPriceText.trim()) {
    pushField(fields, "unitPrice");
  } else if (currencyAllowed) {
    unitPriceMinor = parseClientQuoteMajorAmount(
      values.unitPriceText,
      currencyCode,
    );
    if (unitPriceMinor == null) pushField(fields, "unitPrice");
  }

  const billingFrequency = values.billingFrequency;
  if (!isClientQuoteBillingFrequency(billingFrequency)) {
    pushField(fields, "frequency");
  }

  if (
    fields.length > 0 ||
    !quantity ||
    unitPriceMinor == null ||
    !isClientQuoteBillingFrequency(billingFrequency)
  ) {
    return {
      ok: false,
      fields: FIELD_ORDER.filter((field) => fields.includes(field)),
    };
  }

  return {
    ok: true,
    body: {
      name,
      description,
      quantity,
      unitPriceMinor,
      currencyCode,
      billingFrequency,
    },
  };
}

export function filterClientQuoteTemplates<
  T extends {
    name: string;
    description: string;
    currencyCode: string;
    billingFrequency: ClientQuoteBillingFrequency;
  },
>(
  templates: readonly T[],
  query: string,
  labels: ClientQuoteTemplateSearchLabels,
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...templates];
  return templates.filter((template) => {
    const haystack = [
      template.name,
      template.description,
      template.currencyCode,
      labels.currency[template.currencyCode] ?? "",
      template.billingFrequency,
      labels.frequency[template.billingFrequency] ?? "",
    ]
      .join("\n")
      .toLocaleLowerCase();
    return haystack.includes(needle);
  });
}

export function clientQuoteTemplateFrequencyList(): readonly ClientQuoteBillingFrequency[] {
  return CLIENT_QUOTE_BILLING_FREQUENCIES;
}
