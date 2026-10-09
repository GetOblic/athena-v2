/**
 * Licensee service-template contracts (EST-QUOTE-2B.2).
 * Quantity, money, and billing frequency use the quotation contracts.
 * A template is not an organization record and is not a quotation line.
 */

import type {
  ClientQuoteBillingFrequency,
  ClientQuoteQuantity,
} from "@/services/clientQuote/clientQuoteTypes";

/** Catalog label. The quotation line copies description, not this name. */
export const CLIENT_QUOTE_TEMPLATE_NAME_MAX = 200;

export type ClientQuoteTemplateInput = {
  name: string;
  description: string;
  quantity: ClientQuoteQuantity;
  unitPriceMinor: number;
  currencyCode: string;
  billingFrequency: ClientQuoteBillingFrequency;
};

export type ClientQuoteTemplatePatch = {
  name?: string;
  description?: string;
  quantity?: ClientQuoteQuantity;
  unitPriceMinor?: number;
  currencyCode?: string;
  billingFrequency?: ClientQuoteBillingFrequency;
};

/** Row shape for athena_client_quote_templates. */
export type AthenaClientQuoteTemplate = {
  id: string;
  licensee_account_id: string;
  name: string;
  description: string;
  quantity_coefficient: number;
  quantity_scale: number;
  unit_price_minor: number;
  currency_code: string;
  billing_frequency: ClientQuoteBillingFrequency;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Authorized template passed to copy-on-insert.
 * licenseeAccountId is the authenticated Master's account, never a client field.
 */
export type ClientQuoteServiceTemplate = {
  id: string;
  licenseeAccountId: string;
  name: string;
  description: string;
  quantity: ClientQuoteQuantity;
  unitPriceMinor: number;
  currencyCode: string;
  billingFrequency: ClientQuoteBillingFrequency;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toClientQuoteServiceTemplate(
  row: AthenaClientQuoteTemplate,
): ClientQuoteServiceTemplate {
  return {
    id: row.id,
    licenseeAccountId: row.licensee_account_id,
    name: row.name,
    description: row.description,
    quantity: {
      coefficient: row.quantity_coefficient,
      scale: row.quantity_scale,
    },
    unitPriceMinor: row.unit_price_minor,
    currencyCode: row.currency_code,
    billingFrequency: row.billing_frequency,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
